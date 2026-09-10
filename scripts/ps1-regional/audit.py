"""Resolve every existing PS1 row and enumerate documented missing releases.

The audit is deterministic and read-only with respect to production data.
Exact normalized titles are a controlled fallback; fuzzy titles never assign.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict

from reference import ART, load_gzip, normalized, qualifiers, serial, serials, title_key

FAMILY = {"PAL España": "PAL", "PAL Europa": "PAL", "USA": "NTSC-U/C", "Japón": "NTSC-J"}


def edition_labels(values):
    out = set()
    for value in values:
        key = normalized(value)
        key = re.sub(r"\bplay station\b", "playstation", key)
        key = key.replace("psone books", "psone books").replace("playstation the best", "playstation the best")
        if key not in {"original", "standard", "normal"}:
            out.add(key)
    return sorted(out)


def source_identity(page):
    code_identity = ",".join(page["serials"]) or "NO_SERIAL:" + title_key(page["title"])
    return "|".join([page["family"], page["market"]["code"] if page["market"] else "REVIEW", code_identity, ",".join(edition_labels(page["editionLabels"]))])


def group_sources(pages):
    grouped = defaultdict(list)
    for p in pages:
        grouped[source_identity(p)].append(p)
    out = {}
    for identity, members in grouped.items():
        sid = "ps1-release-" + hashlib.sha256(identity.encode()).hexdigest()[:16]
        first = sorted(members, key=lambda p: p["sourceUrl"])[0]
        out[sid] = {"releaseId": sid, "identity": identity, "title": first["title"], "family": first["family"], "market": first["market"], "serials": first["serials"], "labels": edition_labels(first["editionLabels"]), "sourceIds": sorted(p["sourceId"] for p in members), "titleKeys": sorted({k for p in members for k in p["titleKeys"] + p["redumpTitleKeys"]}), "workTitleKeys": sorted({k for p in members for k in p["titleKeys"]}), "reviewReasons": sorted({r for p in members for r in p["reviewReasons"]}), "sourceWarnings": sorted({r for p in members for r in p["sourceWarnings"]})}
        retail = [r for p in members for r in p["redump"] if r["category"] in {"Games", "Educational", "Applications"}]
        preferred = [r for r in retail if r["source"] == "redump-org"] or retail
        disc_titles = sorted({title_key(r["title"]) for r in preferred})
        out[sid]["containsMultipleWorks"] = len(first["serials"]) > 1 and len(disc_titles) > 1
        out[sid]["discWorkTitleKeys"] = disc_titles
    return out


def main():
    baseline = json.load(gzip.open(ART / "baseline-ps1.json.gz", "rt"))
    pages = json.loads((ART / "source-resolution.json").read_text())
    groups = group_sources(pages)
    by_id = {p["sourceId"]: p for p in pages}
    by_title = defaultdict(set)
    by_serial = defaultdict(set)
    by_ean = defaultdict(set)
    for rid, group in groups.items():
        for key in group["titleKeys"]:
            by_title[key].add(rid)
        for code in group["serials"]:
            by_serial[code].add(rid)
        for sid in group["sourceIds"]:
            for b in by_id[sid].get("barcodes", []):
                digits = b.get("digits") or b.get("value")
                if digits and b.get("checksumValid"):
                    by_ean[str(digits)].add(rid)

    decisions = []
    for game in baseline["catalog"]:
        details = baseline["details"].get(game["id"], {})
        family = FAMILY.get(game["region"])
        keys = {title_key(game["title"]), title_key(game.get("titlePc"))} - {""}
        labels = edition_labels(qualifiers(game["title"]))
        if not labels and game.get("edition") not in {None, "standard", "original"}:
            labels = edition_labels([game["edition"]])
        reference = details.get("reference")
        codes = serials(reference)
        invalid_reference = bool(reference and not codes)
        title_matches = set().union(*(by_title[k] for k in keys))
        candidates = {rid for rid in title_matches if groups[rid]["family"] == family and groups[rid]["labels"] == labels}
        serial_matches = set().union(*(by_serial[c] for c in codes)) if codes else set()
        related_serial_matches = {rid for rid in serial_matches if groups[rid]["family"] == family and groups[rid]["labels"] == labels and any(keys & set(by_id[sid].get("relatedTitleKeys", [])) for sid in groups[rid]["sourceIds"])}
        candidates |= related_serial_matches
        exact = candidates & serial_matches
        method = None
        chosen = None
        reasons = []
        if len(exact) == 1:
            chosen = next(iter(exact)); method = "exact_serial_title_edition"
        elif len(exact) > 1:
            reasons.append("exact_serial_has_multiple_physical_variants")
        elif codes and serial_matches:
            reasons.append("catalog_serial_conflicts_with_title_or_edition")
        elif len(candidates) == 1:
            chosen = next(iter(candidates)); method = "unique_exact_title_family_edition"
        elif len(candidates) > 1:
            eans = re.findall(r"\b\d{12,14}\b", str(details.get("ean") or ""))
            barcode_candidates = candidates & set().union(*(by_ean[e] for e in eans)) if eans else set()
            if len(barcode_candidates) == 1:
                chosen = next(iter(barcode_candidates)); method = "exact_title_edition_documented_barcode"
            else:
                reasons.append("legacy_row_does_not_identify_a_single_regional_release")
        else:
            reasons.append("no_exact_title_family_edition_reference")
        if invalid_reference:
            reasons.append("legacy_reference_is_not_a_ps1_serial")
        if chosen:
            release = groups[chosen]
            if release["reviewReasons"]:
                reasons.extend(release["reviewReasons"])
            if not release["market"]:
                reasons.append("market_requires_additional_evidence")
        else:
            release = None
        # Bad legacy codes are retained in the snapshot and review log, not used
        # to prevent an otherwise unambiguous, independently documented repair.
        blockers = [r for r in reasons if r != "legacy_reference_is_not_a_ps1_serial"]
        state = "RESOLVED" if release and release["market"] and not blockers else "REVIEW"
        decisions.append({"catalogId": game["id"], "title": game["title"], "oldRegion": game["region"], "oldReference": reference, "invalidReference": invalid_reference, "labels": labels, "family": family, "releaseId": chosen, "candidateReleaseIds": sorted(candidates), "serialCandidateReleaseIds": sorted(serial_matches), "status": state, "method": method, "market": release["market"] if state == "RESOLVED" else None, "reviewReasons": reasons})

    # Build a work layer from exact title aliases; relations preserve existing
    # regional catalog IDs, so company/person/franchise records are not rewritten.
    parents = {rid: rid for rid in groups}
    def find(rid):
        while parents[rid] != rid:
            parents[rid] = parents[parents[rid]]; rid = parents[rid]
        return rid
    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parents[max(a, b)] = min(a, b)
    by_work_title = defaultdict(set)
    for rid, group in groups.items():
        for key in group["workTitleKeys"]:
            # Identical names across families are not sufficient: King's Field
            # was renumbered abroad. A reciprocal regional link is required.
            signature = tuple(group["discWorkTitleKeys"]) if group["containsMultipleWorks"] else ()
            by_work_title[(group["family"], key, signature)].add(rid)
    # A compilation may contain discs from multiple works. Shared disc serials
    # and Redump disc titles must not join those works into one logical game.
    for ids in by_work_title.values():
        ids = sorted(ids)
        for rid in ids[1:]:
            union(ids[0], rid)
    # Localized names (e.g. Biohazard / Resident Evil) may describe one work.
    # Require reciprocal source links, exact target title and target serial.
    # Disc overlap alone never joins a compilation with one of its games.
    source_group = {sid: rid for rid, g in groups.items() for sid in g["sourceIds"]}
    directed = defaultdict(set)
    relationship_evidence = []
    for page in pages:
        origin = source_group[page["sourceId"]]
        if groups[origin]["reviewReasons"]:
            continue
        for related in page.get("relatedReleases", []):
            for target in sorted(set().union(*(by_serial[c] for c in related["serials"]))):
                if target != origin and not groups[target]["reviewReasons"] and related["titleKey"] in groups[target]["workTitleKeys"]:
                    directed[origin].add(target)
    for origin, targets in sorted(directed.items()):
        for target in sorted(targets):
            if origin < target and origin in directed.get(target, set()):
                left, right = groups[origin], groups[target]
                if left["containsMultipleWorks"] or right["containsMultipleWorks"]:
                    if not (left["containsMultipleWorks"] and right["containsMultipleWorks"] and left["discWorkTitleKeys"] == right["discWorkTitleKeys"]):
                        continue
                union(origin, target)
                relationship_evidence.append({"fromReleaseId":origin,"toReleaseId":target,"basis":"reciprocal_psx_regional_links_exact_target_title_and_serial","sourceUrls":[by_id[s]["sourceUrl"] for r in [origin,target] for s in groups[r]["sourceIds"]]})
    components = defaultdict(list)
    for rid in groups:
        components[find(rid)].append(rid)
    work_for_release = {}
    works = {}
    for release_ids in components.values():
        release_ids.sort()
        wid = "ps1-work-" + hashlib.sha256("|".join(release_ids).encode()).hexdigest()[:16]
        works[wid] = {"id": wid, "platformSlug": "ps1", "title": groups[release_ids[0]]["title"], "releaseIds": release_ids, "catalogIds": [], "relationshipBasis": "documented_exact_title_aliases_and_reciprocal_regional_links", "creditsInherited": False}
        for rid in release_ids:
            work_for_release[rid] = wid
    for d in decisions:
        ids = [d["releaseId"]] if d["releaseId"] else d["candidateReleaseIds"]
        ids = {work_for_release[r] for r in ids}
        if len(ids) == 1:
            d["workId"] = next(iter(ids))
            works[d["workId"]]["catalogIds"].append(d["catalogId"])

    represented = defaultdict(list)
    for d in decisions:
        if d["status"] == "RESOLVED":
            represented[d["releaseId"]].append(d["catalogId"])
    duplicates = {r: ids for r, ids in represented.items() if len(ids) > 1}
    # Do not silently merge rows with different histories or unknown components.
    for d in decisions:
        if d["releaseId"] in duplicates:
            d["status"] = "REVIEW"
            d["reviewReasons"].append("multiple_catalog_rows_for_same_documented_release")
    eligible = [rid for rid, g in groups.items() if g["market"] and not g["reviewReasons"]]
    missing = [rid for rid in eligible if rid not in represented]
    result = {"baselineCommit": baseline["commit"], "decisions": decisions, "releases": groups, "works": works, "workForRelease": work_for_release, "missingReleaseIds": sorted(missing), "duplicateCandidates": duplicates}
    (ART / "catalog-resolution.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ART / "work-relationship-evidence.json").write_text(json.dumps(relationship_evidence, ensure_ascii=False, indent=2) + "\n")
    summary = {"catalogRowsAudited": len(decisions), "status": dict(Counter(d["status"] for d in decisions)), "methods": dict(Counter(d["method"] for d in decisions)), "regionsResolved": dict(Counter(d["market"]["label"] for d in decisions if d["status"] == "RESOLVED")), "reviewReasons": dict(Counter(r for d in decisions if d["status"] == "REVIEW" for r in d["reviewReasons"])), "sourceReleaseGroups": len(groups), "eligibleReleaseGroups": len(eligible), "missingDocumentedReleaseGroups": len(missing), "duplicateCandidates": len(duplicates)}
    (ART / "audit-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
