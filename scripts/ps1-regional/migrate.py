"""Apply the frozen PS1 audit in an isolated checkout, preserving all old URLs."""
from __future__ import annotations

import copy
import csv
import gzip
import hashlib
import html
import json
import re
import subprocess
import unicodedata
from collections import Counter, defaultdict
from urllib.parse import unquote, urlparse

from reference import ART, AT, ROOT, RELEASE_CATEGORIES, evidence, load_gzip, normalized

BASE_COVERS = "https://www.puntoracing.net/MEDIAREGIONATLAS/covers/"
FLAGS = {"europe": "EU", "spain": "ES", "usa": "US", "japan": "JP", "uk": "GB", "france": "FR", "french": "FR", "germany": "DE", "italy": "IT", "portugal": "PT", "netherlands": "NL", "sweden": "SE", "denmark": "DK", "finland": "FI", "australia": "AU", "china": "CN", "korean": "KR", "greece": "GR", "russia": "RU", "israel": "IL", "poland": "PL"}
UNKNOWN_LABEL = {"PAL": "PAL · Mercado por determinar", "NTSC-U/C": "NTSC-U/C · Mercado por determinar", "NTSC-J": "NTSC-J · Mercado por determinar"}
PRICE_FIELDS = {"marketMin", "marketMax", "recommendedPrice", "pcRefPrice", "deltaEsVsPc", "priceSource", "priceDataSources", "pcId", "pcPath", "pcRegion", "pcCondition", "matchConfidence", "gameRetailPrice", "gameCondition", "gameMatchedAt"}


def is_price_field(key):
    return key in PRICE_FIELDS or key.startswith(("estimatedPrice", "estimatedShippingToSpain", "estimatedTotalToSpain", "priceCharting", "gameEs", "cex", "jgo", "chollo", "kaoto", "tcListing", "tcProduct", "tcMatched", "tcns"))


def slug(value):
    text = html.unescape(str(value or ""))
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "juego"


def old_slug(game):
    code = {"PAL España": "es", "USA": "us", "Japón": "jp", "PAL Europa": "eu"}[game["region"]]
    return slug(unquote(game["slug"])) + "-" + game["platformSlug"] + "-pal-" + code


def dump(path, value):
    temporary = path.with_name(path.name + ".ps1-v2-tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def dump_gzip(path, value):
    temporary = path.with_name(path.name + ".ps1-v2-tmp")
    with temporary.open("wb") as output:
        with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as compressed:
            compressed.write((json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    temporary.replace(path)


def empty_details():
    return {"year": None, "releaseDate": None, "reference": None, "players": None, "support": None, "developer": None, "publisher": None, "genres": [], "series": None, "fetchedAt": AT}


def clean_field(page, label):
    return " ".join(x for x in page["fields"].get(label, []) if x).strip()


def main():
    baseline = json.load(gzip.open(ART / "baseline-ps1.json.gz", "rt"))
    audit = json.loads((ART / "catalog-resolution.json").read_text())
    pages = {p["sourceId"]: p for p in json.loads((ART / "source-resolution.json").read_text())}
    groups = audit["releases"]
    decisions = {d["catalogId"]: d for d in audit["decisions"]}
    current_catalog = json.loads((ROOT / "data/catalog.json").read_text())
    current_details = json.loads((ROOT / "data/game-details.json").read_text())
    # Re-runs replace only this migration's PS1 projection from the immutable
    # baseline. Any unrelated PS1 edit causes a refusal, never silent clobbering.
    previous = ART / "applied-hashes.json"
    expected = json.loads(previous.read_text()) if previous.exists() else baseline["sourceHashes"]
    for name in ["catalog.json", "game-details.json"]:
        actual = hashlib.sha256((ROOT / "data" / name).read_bytes()).hexdigest()
        if actual != expected[name]:
            raise SystemExit("Precondition changed: " + name)
    catalog = [g for g in current_catalog if g["platformSlug"] != "ps1"]
    old_ids = {g["id"] for g in current_catalog if g["platformSlug"] == "ps1"}
    details = {k: v for k, v in current_details.items() if k not in old_ids}
    ps1 = copy.deepcopy(baseline["catalog"])
    details.update(copy.deepcopy(baseline["details"]))
    original_details = json.loads(subprocess.check_output(["git", "show", baseline["commit"] + ":data/game-details.json"], cwd=ROOT))
    by_game = {g["id"]: g for g in ps1}
    works = copy.deepcopy(audit["works"])
    assets_by_source = defaultdict(list)
    for asset in load_gzip("psx-assets.json.gz"):
        for ref in asset["pageReferences"]:
            assets_by_source[ref["sourceId"]].append((asset, ref))
    rows = []
    asset_review = []
    approved_assets = []
    region_registry = {}
    local_reference_path = ART / "sources/local-reference-assets.json"
    local_reference_assets = json.loads(local_reference_path.read_text()) if local_reference_path.exists() else {}
    adjudications = json.loads((ART / "sources/adjudications.json").read_text())

    def graphic_references(group):
        refs = []
        for sid in group["sourceIds"]:
            for asset, ref in assets_by_source[sid]:
                if not set(asset["types"]) & {"front_cover", "back_cover", "disc_label", "manual_page", "interior_or_inlay", "spine_card"}:
                    continue
                flags = sorted({FLAGS.get(urlparse(f).path.split("/")[-1].split(".")[0], "UNKNOWN") for f in ref.get("flagHints", [])})
                archive = asset.get("archive")
                value = {"assetId": asset["assetId"], "roles": asset["types"], "sourceUrl": ref["sourceUrl"], "sourceImageReference": asset["referenceUrl"], "label": ref.get("sourceLabel"), "group": ref.get("groupLabel"), "marketHints": flags, "physicalPairingVerified": False}
                if archive and archive.get("publicArchiveUrl", "").startswith(BASE_COVERS):
                    value.update({"url": "/covers/" + archive["publicArchiveUrl"][len(BASE_COVERS):], "sha256": archive["sha256"], "bytes": archive["bytes"], "width": archive["width"], "height": archive["height"], "stored": True})
                else:
                    value["stored"] = False
                if asset["assetId"] in local_reference_assets:
                    value.update(local_reference_assets[asset["assetId"]])
                for adjudication in adjudications.values():
                    if value.get("sha256") == adjudication.get("imageSha256") and adjudication.get("packagingMarket"):
                        value["marketHints"] = ["FR" if adjudication["packagingMarket"] == "France" else "DE"]
                        value["visuallyInspected"] = True
                        value["marketAssignmentBasis"] = "reviewed_back_inlay_and_source_gallery"
                refs.append(value)
        return list({(a["assetId"], a["group"], ",".join(a["marketHints"])): a for a in refs}.values())

    def enrich(game, decision, action):
        region = decision.get("market")
        rid = decision.get("releaseId")
        group = groups.get(rid)
        resolved = decision["status"] == "RESOLVED"
        game.update({"regionFamily": decision["family"], "marketRegion": region["market"] if resolved else None, "regionCode": region["code"] if resolved else None, "regionalStatus": "resolved" if resolved else "review", "workId": decision.get("workId"), "languages": [], "canonicalSerials": [], "sourceSerials": [], "regionVerified": resolved})
        if resolved:
            game["region"] = region["label"]
            region_registry[region["code"]] = region
        else:
            game["region"] = UNKNOWN_LABEL.get(decision["family"], "Mercado por determinar")
        game["resolutionSerials"] = []
        d = details.setdefault(game["id"], empty_details())
        profile = {"schemaVersion": 2, "status": "resolved" if resolved else "review", "releaseId": rid, "workId": game.get("workId"), "identityScope": "regional_software_release", "physicalVariantResolved": False, "legacyRegion": decision.get("oldRegion"), "legacyReference": decision.get("oldReference"), "reviewReasons": decision["reviewReasons"], "matchMethod": decision.get("method"), "sources": [], "fieldProvenance": {}, "graphics": [], "serialAliases": [], "components": []}
        if not resolved or decision.get("invalidReference"):
            d["reference"] = None
            d.get("fieldSources", {}).pop("reference", None)
        # Reject metadata attached through the same proven wrong title/serial
        # match. Otherwise a cleared reference could still carry wrong credits.
        if (decision.get("invalidReference") or "catalog_serial_conflicts_with_title_or_edition" in decision["reviewReasons"]) and d.get("sources", {}).get("serialstation", {}).get("matchMethod") == "title":
            profile["rejectedLegacyMetadata"] = {}
            for field, source in list(d.get("fieldSources", {}).items()):
                if source == "serialstation":
                    profile["rejectedLegacyMetadata"][field] = d.get(field)
                    d[field] = [] if field in {"genres", "subgenres", "facets", "tags", "companyCredits", "individualCredits"} else None
                    d["fieldSources"].pop(field, None)
        if group and resolved:
            page_list = [pages[s] for s in group["sourceIds"]]
            page = sorted(page_list, key=lambda p: p["sourceUrl"])[0]
            rd = [r for r in page["redump"] if r["market"]["code"] == region["code"] and r["category"] in RELEASE_CATEGORIES]
            primary = next((r for r in rd if r["source"] == "redump-org"), rd[0] if rd else None)
            profile["sources"] = [{"label": "PSX Datacenter", "url": p["sourceUrl"], "sha256": p["sourceHash"]} for p in page_list]
            profile["sources"] += [{"label": "Redump", "url": u} for u in sorted({r["sourceUrl"] for r in rd})]
            profile["fieldProvenance"]["market"] = {"value": region["market"], **page["marketEvidence"]}
            profile["identityScope"] = "regional_physical_edition" if page["serialScope"] == "packaging" else "regional_software_release"
            profile["serialScope"] = page["serialScope"]
            profile["containsMultipleWorks"] = group["containsMultipleWorks"]
            profile["softwareCategory"] = sorted({r["category"] for r in rd})
            languages = page["languages"]
            game["languages"] = languages["all"]
            game["canonicalSerials"] = group["serials"]
            game["sourceSerials"] = sorted({s for p in page_list for s in p["allSourceSerials"]} | {s for r in rd for s in r["serials"]})
            game["resolutionSerials"] = sorted(set(group["serials"]) | {s for r in rd for s in r["serials"]})
            game["edition"] = " / ".join(group["labels"]) if group["labels"] else "standard"
            d["reference"] = " / ".join(game["canonicalSerials"])
            d.setdefault("fieldSources", {})["reference"] = "research"
            profile.update({"languages": languages, "editionLabels": group["labels"], "sourceWarnings": group["sourceWarnings"], "sourceSerialEvidence": page["serialEvidence"], "serialAliases": [a for a in aliases if a["canonicalSerial"] in group["serials"]], "barcodes": page["barcodes"], "regionalReleaseDate": page["release"], "softwareMetadata": {k: clean_field(page, k) for k in ["Developer", "Publisher", "Genre / Style", "Number Of Players", "Number Of Memory Card Blocks", "Vibration Function Compatible", "Multi-Tap Function Compatible", "Link Cable Function Compatibile", "Compatible Controllers Tested ( Official Gamepads Only )", "Compatible Light Guns ( Official Light Guns Only )"] if clean_field(page, k)}})
            profile["fieldProvenance"]["languages"] = languages["claims"]
            profile["fieldProvenance"]["serials"] = {"value": group["serials"], **evidence("physical-packaging" if page["serialScope"] == "packaging" else "psxdatacenter-and-redump", page["sourceUrl"], "documented" if page["serialScope"] == "packaging" else "high"), "scope": page["serialScope"]}
            for number, code in enumerate(group["serials"], 1):
                disc_rows = [r for r in rd if code in r["serials"]]
                index = disc_rows[0]["discNumber"] if disc_rows and not group["containsMultipleWorks"] else number
                component = {"kind": "back_cover" if page["serialScope"] == "packaging" else "disc", "number": index, "serial": code, "sourceUrl": page["sourceUrl"]}
                if group["containsMultipleWorks"] and disc_rows:
                    component["title"] = disc_rows[0]["title"]
                    component["numberSource"] = "list_order_not_printed_disc_number"
                profile["components"].append(component)
            profile["graphics"] = graphic_references(group)
            # Attach only source-declared market + exact serial + edition images.
            # A Spanish gallery image cannot become the front of an EU release.
            front = []
            for a in profile["graphics"]:
                filename = unquote(urlparse(a["sourceImageReference"]).path.rsplit("/", 1)[-1]).upper()
                code_in_filename = any(filename.startswith(code + "-F") for code in group["serials"])
                same_market = a["marketHints"] == [region["code"]]
                clean_group = bool(a["group"] and "jewel case" in a["group"].lower())
                if "front_cover" in a["roles"] and code_in_filename and same_market and clean_group and a["stored"]:
                    front.append(a)
            if len(front) == 1:
                candidate = front[0]
                game["coverUrl"] = candidate["url"]
                profile["fieldProvenance"]["cover"] = {"assetId": candidate["assetId"], "sha256": candidate["sha256"], "value": candidate["url"], **evidence("psxdatacenter-gallery", candidate["sourceUrl"], "documented"), "assignmentBasis": "exact_serial_source_market_and_edition", "visuallyInspected": False}
                approved_assets.append({"catalogId": game["id"], **candidate})
            else:
                old_code = {"PAL España": "ES", "USA": "US", "Japón": "JP", "PAL Europa": "EU"}.get(decision.get("oldRegion"))
                if old_code != region["code"] and game.get("coverUrl"):
                    profile["legacyCoverUrl"] = game["coverUrl"]
                    game["coverUrl"] = None
                profile["coverStatus"] = "legacy_unverified" if game.get("coverUrl") else "missing_matching_archive"
                asset_review.append({"catalogId": game["id"], "releaseId": rid, "reason": "no_unique_stored_front_for_exact_market_and_edition", "candidates": profile["graphics"]})
            # Fill genuinely missing facts. Conflicting historic values remain
            # auditable and source observations are displayed independently.
            fields = {"support": "CD-ROM"}
            count = re.match(r"(?:1\s*[-–]\s*)?(\d{1,2})\s*(?:Players?|Player)", clean_field(page, "Number Of Players"), re.I)
            if count and 1 <= int(count[1]) <= 16:
                fields["players"] = int(count[1])
            for field, label in [("developer", "Developer"), ("publisher", "Publisher")]:
                value = clean_field(page, label).rstrip(". ")
                if value and len(value) < 120 and not re.search(r"N\s*/\s*A|unknown|not released|CONTRIBUTE|missing", value, re.I):
                    fields[field] = {"name": value, "slug": slug(value), "source": "research"}
            date = page["release"].get("iso")
            if date and re.fullmatch(r"(?:199[4-9]|20[0-2]\d)-\d\d-\d\d", date) and not group["labels"]:
                fields["releaseDate"] = date
                fields["year"] = int(date[:4])
            for field, value in fields.items():
                if d.get(field) is None:
                    d[field] = value
                    d.setdefault("fieldSources", {})[field] = "research"
                    profile["fieldProvenance"][field] = {"value": value, **evidence("psxdatacenter", page["sourceUrl"], "documented")}
        if not resolved and game.get("coverUrl"):
            profile["legacyCoverUrl"] = game["coverUrl"]
            game["coverUrl"] = None
            profile["coverStatus"] = "quarantined_until_edition_resolved"
        d["ps1Edition"] = profile
        if action in {"MOVED", "REVIEW", "CREATED"} or decision.get("invalidReference"):
            if action != "CREATED":
                profile["legacyPricing"] = {k: v for k, v in game.items() if is_price_field(k) and v is not None}
                for key in list(game):
                    if is_price_field(key): game[key] = False if key.endswith(("InStock", "Verified")) else None
            game["priceRegionVerified"] = False
            game["cexRegionVerified"] = False
            game["hasEsPrice"] = False
        row = {"game_id": game["id"], "title": game["title"], "old_region": decision.get("oldRegion") or "", "new_region_family": game["regionFamily"], "new_market_region": game["marketRegion"] or "", "region_code": game["regionCode"] or "", "serial": " / ".join(game["canonicalSerials"]), "languages": "|".join(game["languages"]), "classification_source": profile["fieldProvenance"].get("market", {}).get("source", "review"), "confidence": profile["fieldProvenance"].get("market", {}).get("confidence", "unresolved"), "action": action, "source_urls": "|".join(s["url"] for s in profile["sources"]), "review_reasons": "|".join(profile["reviewReasons"]), "url": "/catalogo/" + game["canonicalSeoSlug"]}
        rows.append(row)

    aliases = json.loads((ART / "serial-aliases.json").read_text())
    for game in ps1:
        decision = decisions[game["id"]]
        game["canonicalSeoSlug"] = old_slug(game)
        action = "REVIEW" if decision["status"] != "RESOLVED" else "UNCHANGED" if decision["oldRegion"] in {decision["market"]["label"], "USA" if decision["market"]["code"] == "US" else "", "Japón" if decision["market"]["code"] == "JP" else ""} else "MOVED"
        enrich(game, decision, action)
    for rid in audit["missingReleaseIds"]:
        group = groups[rid]
        region = group["market"]
        wid = audit["workForRelease"][rid]
        first_serial = group["serials"][0] if group["serials"] else rid[-8:]
        suffix = "-" + slug(" ".join(group["labels"])) if group["labels"] else ""
        gid = "ps1-" + region["code"].lower() + "-" + first_serial.lower() + suffix
        if gid in by_game:
            gid += "-" + rid[-8:]
        assert gid not in by_game
        game = {"id": gid, "slug": slug(group["title"]) + "-" + first_serial.lower() + suffix, "title": group["title"], "titlePc": None, "platformSlug": "ps1", "region": region["label"], "edition": "standard", "listingStatus": "listed", "coverUrl": None, "pcId": None, "pcPath": None, "pcRegion": None, "pcCondition": None, "matchConfidence": "DOCUMENTED_PS1_REGIONAL_RELEASE", "marketMin": None, "marketMax": None, "recommendedPrice": None, "pcRefPrice": None, "deltaEsVsPc": None, "priceSource": None, "updatedAt": AT, "hasEsPrice": False, "seedSource": "ps1-regional-v2"}
        game["canonicalSeoSlug"] = game["slug"] + "-ps1-" + ("pal" if group["family"] == "PAL" else "ntsc") + "-" + region["code"].lower()
        decision = {"family": group["family"], "market": region, "releaseId": rid, "workId": wid, "status": "RESOLVED", "reviewReasons": [], "method": "documented_source_release_missing_from_catalog"}
        enrich(game, decision, "CREATED")
        works[wid]["catalogIds"].append(gid)
        ps1.append(game); by_game[gid] = game
    catalog.extend(ps1)
    # Preserve the original catalog ordering; append only new regional records.
    rank = {g["id"]: n for n, g in enumerate(current_catalog)}
    catalog.sort(key=lambda g: (rank.get(g["id"], len(rank)), g["id"]))
    active_works = {k: v for k, v in works.items() if v["catalogIds"]}
    for work in active_works.values():
        work["catalogIds"] = sorted(set(work["catalogIds"]))
        work["legacyContextCatalogIds"] = [cid for cid in work["catalogIds"] if cid in baseline["details"]]
        # Store common classification once, at work level. Reuse only unanimous
        # legacy values; regional publishers, dates, people/credits and prices
        # remain attached to their original catalog records.
        work["commonDetails"] = {}
        work["commonDetailsSources"] = {}
        for field in ["genres", "series"]:
            claims = [(cid, details[cid].get(field)) for cid in work["legacyContextCatalogIds"] if details[cid].get(field)]
            signatures = {json.dumps(value, sort_keys=True, ensure_ascii=False) for _, value in claims}
            if len(signatures) == 1:
                work["commonDetails"][field] = claims[0][1]
                work["commonDetailsSources"][field] = [cid for cid, _ in claims]
    profiles = {g["id"]: details[g["id"]]["ps1Edition"] for g in ps1}
    # Keep documentary evidence out of the general metadata JSON and client
    # catalog. It is loaded only by detail/reference consumers.
    for gid, profile in profiles.items():
        details[gid]["ps1Edition"] = {"schemaVersion": 2, "status": profile["status"], "releaseId": profile["releaseId"], "workId": profile["workId"]}
    dump(ROOT / "data/catalog.json", catalog)
    detail_rank = {gid: n for n, gid in enumerate(original_details)}
    details = dict(sorted(details.items(), key=lambda row: (detail_rank.get(row[0], len(detail_rank)), row[0])))
    dump(ROOT / "data/game-details.json", details)
    dump_gzip(ROOT / "data/ps1-edition-evidence.json.gz", profiles)
    dump_gzip(ROOT / "data/ps1-works.json.gz", {"schemaVersion": 1, "works": active_works})
    dump(ROOT / "data/ps1-region-markets.json", {"schemaVersion": 1, "markets": region_registry})
    with (ART / "PS1-REGION-MAP.csv").open("w", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    dump(ART / "review-queue.json", [d for d in audit["decisions"] if d["status"] == "REVIEW"])
    dump(ART / "assigned-cover-evidence.json", approved_assets)
    dump(ART / "cover-review-queue.json", asset_review)
    summary = {"before": dict(Counter(g["region"] for g in baseline["catalog"])), "after": dict(Counter(g["region"] for g in ps1)), "actions": dict(Counter(r["action"] for r in rows)), "afterTotal": len(ps1), "sourcedCovers": len(approved_assets), "withLanguages": sum(bool(g["languages"]) for g in ps1), "withMultipleLanguages": sum(len(g["languages"]) > 1 for g in ps1), "multidiscEditions": sum(len(profiles[g["id"]]["components"]) > 1 for g in ps1), "works": len(active_works), "preservedUrls": len(baseline["catalog"]), "urlChanges": 0}
    dump(ART / "migration-summary.json", summary)
    dump(previous, {name: hashlib.sha256((ROOT / "data" / name).read_bytes()).hexdigest() for name in ["catalog.json", "game-details.json"]})
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
