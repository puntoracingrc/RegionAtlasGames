"""PS1 evidence resolution. A serial identifies candidates, never a unique box."""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "artifacts/ps1-region-migration"
SOURCES = ART / "sources"
AT = "2026-09-10"
MARKETS = {
    "Europe": ("EU", "Europa", "PAL"), "Spain": ("ES", "España", "PAL"),
    "UK": ("GB", "Reino Unido", "PAL"), "France": ("FR", "Francia", "PAL"),
    "Germany": ("DE", "Alemania", "PAL"), "Italy": ("IT", "Italia", "PAL"),
    "Portugal": ("PT", "Portugal", "PAL"), "Netherlands": ("NL", "Países Bajos", "PAL"),
    "Sweden": ("SE", "Suecia", "PAL"), "Denmark": ("DK", "Dinamarca", "PAL"),
    "Norway": ("NO", "Noruega", "PAL"), "Finland": ("FI", "Finlandia", "PAL"),
    "Scandinavia": ("SCAND", "Escandinavia", "PAL"), "Australia": ("AU", "Australia", "PAL"),
    "Belgium": ("BE", "Bélgica", "PAL"), "Austria": ("AT", "Austria", "PAL"),
    "Greece": ("GR", "Grecia", "PAL"), "Ireland": ("IE", "Irlanda", "PAL"),
    "Russia": ("RU", "Rusia", "PAL"), "Poland": ("PL", "Polonia", "PAL"),
    "Israel": ("IL", "Israel", "PAL"), "USA": ("US", "USA", "NTSC-U/C"),
    "Canada": ("CA", "Canadá", "NTSC-U/C"), "Japan": ("JP", "Japón", "NTSC-J"),
    "Asia": ("ASIA", "Asia", "NTSC-J"), "Korea": ("KR", "Corea", "NTSC-J"),
    "Taiwan": ("TW", "Taiwán", "NTSC-J"), "China": ("CN", "China", "NTSC-J"),
    "Singapore": ("SG", "Singapur", "NTSC-J"), "World": ("WORLD", "Mundial", "MULTI"),
}
LANG_TAGS = {"E": "en", "S": "es", "F": "fr", "G": "de", "I": "it", "P": "pt", "Du": "nl", "Sw": "sv", "D": "da", "Da": "da", "Fi": "fi", "No": "no", "J": "ja", "K": "ko", "C": "zh", "R": "ru", "Gr": "el", "A": "ar"}
LANG_WORDS = {"English": "en", "Spanish": "es", "French": "fr", "German": "de", "Italian": "it", "Portuguese": "pt", "Dutch": "nl", "Swedish": "sv", "Danish": "da", "Danks": "da", "Finnish": "fi", "Norwegian": "no", "Japanese": "ja", "Korean": "ko", "Chinese": "zh", "Russian": "ru", "Greek": "el", "Arabic": "ar", "Polish": "pl"}
LANG_CODES = {"en", "es", "fr", "de", "it", "pt", "nl", "sv", "da", "fi", "no", "ja", "ko", "zh", "ru", "el", "ar", "pl"}
RELEASE_CATEGORIES = {"Games", "Educational", "Applications"}
EDITION_WORDS = re.compile(r"best|books?|rerelease|reprint|platinum|hits|edition|limited|collection|series|version|pack|1500|2000|2500|2800|price|renka|fukkoku|superlite|pokkiri|teiban|not for resale|rental|demo", re.I)
SERIAL_RE = re.compile(r"\b(S[A-Z]{3}|LSP)[-_ .]?(\d{5,6}(?:[A-Z0-9#]|[-/][A-Z0-9.#]+)*)(?![A-Z0-9#])", re.I)


def load_gzip(name):
    return json.load(gzip.open(SOURCES / name, "rt"))


def serial(value):
    """Normalize separators only; preserve suffixes, leading zeros and long numbers."""
    value = str(value).strip().upper()
    return re.sub(r"^(S[A-Z]{3}|LSP)[-_ .]?(?=\d)", r"\1-", value)


def serials(value):
    return list(dict.fromkeys(serial(m.group(0)) for m in SERIAL_RE.finditer(str(value or ""))))


def normalized(value):
    text = str(value or "")
    for _ in range(3):
        text = html.unescape(text)
    text = unicodedata.normalize("NFKD", text).casefold()
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"['’`´]", "", text.replace("&", " and ").replace("+", " plus "))
    text = " ".join(re.sub(r"[^\w]+", " ", text).split())
    text = re.sub(r"^the\s+|\s+the$", "", text)
    return text


def qualifiers(value):
    text = html.unescape(str(value))
    found = re.findall(r"\[([^]]+)\]", text)
    found += [m for m in re.findall(r"\(([^)]+)\)", text) if EDITION_WORDS.search(m)]
    return sorted({normalized(x) for x in found if not re.fullmatch(r"\s*(?:\d+\s*(?:discs?|cds?)|(?:disc|cd)\s*\d+(?:\s*of\s*\d+)?)\s*", x, re.I)})


def title_key(value):
    text = re.sub(r"\[[^]]+\]", "", html.unescape(str(value or "")))
    text = re.sub(r"\(([^)]+)\)", lambda m: "" if EDITION_WORDS.search(m[1]) else m[0], text)
    text = normalized(text.replace("%", " percent "))
    text = re.sub(r"^(?:disneys?(?: s)?(?: pixar)?|walt disney|nickelodeon|tom clancys|terry pratchetts) ", "", text)
    text = re.sub(r"\bthe\b", "", text)
    roman = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9"}
    text = " ".join(roman.get(w, w) for w in text.split())
    text = re.sub(r"^madden nfl ", "madden ", text)
    text = re.sub(r"^fifa (?:football|soccer) ", "fifa ", text)
    return text.replace(" ", "")


def market(value):
    parts = value.split(", ")
    if not all(p in MARKETS for p in parts):
        return None
    entries = [MARKETS[p] for p in parts]
    families = set(x[2] for x in entries)
    family = next(iter(families)) if len(families) == 1 else "MULTI"
    code = "-".join(x[0] for x in entries)
    name = "United Kingdom" if value == "UK" else value
    prefix = {"PAL": "PAL", "NTSC-U/C": "NTSC", "NTSC-J": "NTSC-J", "MULTI": "Multirregión"}[family]
    return {"family": family, "market": name, "code": code, "label": prefix + " " + " / ".join(x[1] for x in entries), "flagCode": code if len(parts) == 1 else "UNKNOWN"}


def read_redump(filename, name):
    z = zipfile.ZipFile(SOURCES / filename)
    xml = ET.fromstring(z.read(z.namelist()[0]))
    out = []
    for game in xml.findall("game"):
        title = game.attrib["name"]
        groups = list(re.finditer(r"\(([^()]*)\)", title))
        region = next((g for g in groups if market(g[1])), None)
        if region is None:
            continue
        languages = next(([c.lower() for c in g[1].split(",")] for g in groups if all(c.lower() in LANG_CODES for c in g[1].split(","))), [])
        disc = re.search(r"\(Disc (\d+)(?:\)|,)", title)
        out.append({"id": name + ":" + game.attrib.get("id", hashlib.sha256(title.encode()).hexdigest()[:16]), "name": title, "title": title[:region.start()].strip(), "market": market(region[1]), "languages": languages, "sourceSerial": game.findtext("serial") or "", "serials": serials(game.findtext("serial")), "category": game.findtext("category"), "discNumber": int(disc[1]) if disc else 1, "version": game.findtext("version"), "source": name, "sourceUrl": "https://redump.info/disc/" + game.attrib["id"] + "/" if game.attrib.get("id") else "http://redump.org/datfile/psx/serial,version"})
    return out


def evidence(source, url, confidence, **extra):
    return {"source": source, "sourceUrl": url, "verifiedAt": AT, "confidence": confidence, **extra}


def language_words(text):
    return sorted({code for word, code in LANG_WORDS.items() if re.search(r"\b" + word + r"\b", text, re.I)})


def page_languages(page, redump):
    text = page.get("languageEvidenceRaw", "")
    tags = sorted({LANG_TAGS[t] for i in page.get("indexReferences", []) for t in i.get("languageTags", []) if t in LANG_TAGS})
    # PSX prose differentiates gameplay/menu text from voice language.
    voice_match = re.search(r"(?:\(([^()]*voices?[^()]*)\)|voices?\s+(?:are\s+)?(?:in\s+)?([^.]+))", text, re.I)
    audio = language_words(voice_match.group(0)) if voice_match else []
    menu_match = re.search(r"(?:Menus(?: and gameplay)?|Gameplay)\s+(?:are|is)\s+in\s+([^.]+)", text, re.I)
    menu_text = re.sub(r"\([^()]*voices?[^()]*\)", "", menu_match[1], flags=re.I) if menu_match else ""
    menus = language_words(menu_text)
    detailed = language_words(text)
    rd = sorted({x for r in redump for x in r["languages"]})
    all_languages = sorted(set(menus + audio) or set(detailed) or set(rd) or set(tags))
    claims = [{"value": tags, **evidence("psxdatacenter-index", "https://psxdatacenter.com/plist.html" if "pal" in page["sourceRegionFamilies"] else page["url"], "documented")}, {"value": detailed, "raw": text, **evidence("psxdatacenter-detail", page["url"], "documented")}]
    if rd:
        claims.append({"value": rd, **evidence(redump[0]["source"], redump[0]["sourceUrl"], "high")})
    return {"all": all_languages, "text": menus, "audio": audio, "index": tags, "discrepancy": bool(tags and all_languages and set(tags) != set(all_languages)) or bool(rd and set(all_languages) != set(rd)), "claims": claims}


def build_reference():
    official = read_redump("redump-org.xml.zip", "redump-org")
    current = read_redump("redump-info.xml.zip", "redump-info")
    code_index = defaultdict(list)
    for row in official + current:
        for code in row["serials"]:
            code_index[code].append(row)
    suffix_index = defaultdict(list)
    for code, rows in code_index.items():
        base = re.sub(r"(?<=\d)(?:#\d*|[-/](?:P|T|COLL\.?|GER|RUS|\d+)|GH|CE|D)$", "", code)
        if base != code:
            suffix_index[base].extend(rows)
    pages = load_gzip("psx-facts.json.gz")
    # Some list entries have no detail page. Preserve their actual index evidence
    # and require an exact Redump title AND code before they can become releases.
    for row in load_gzip("psx-index.json.gz"):
        if row["infoUrls"]:
            continue
        codes = serials(row["serialText"])
        pages.append({"sourceId": f"psxdc-index-{row['family']}-{row['row']}", "url": row["sourceUrl"],
            "sourceTitle": row["title"], "commonTitles": [], "sourceRegionFamilies": [row["family"]],
            "serialEvidence": {"headerTokens": [], "printedDiscTokens": [], "internalDiscTokens": [], "indexTokens": codes, "rawHeader": []},
            "indexReferences": [row], "factualFields": {}, "languageEvidenceRaw": "",
            "releaseDateCandidate": {"raw": "", "iso": None, "precision": "unknown", "independentlyVerified": False},
            "barcodes": [], "retrieval": {"sha256": row["sourceHash"]}, "indexOnly": True})
    relationships = {r["sourceId"]: r.get("relatedEditionsRaw", "") for r in load_gzip("psx-relationships.json.gz")}
    # Explicit label/internal equivalence for the bundled reissue; no suffix rule.
    aliases = [{"sourceSerial": "SLES-03137-T", "canonicalSerial": "SLES-03137", "relation": "printed_label_to_internal_serial", **evidence("serialstation", "https://www.serialstation.com/titles/SLES/03137", "high")}]
    alias_to = {a["canonicalSerial"]: a["sourceSerial"] for a in aliases}
    adjudications = json.loads((SOURCES / "adjudications.json").read_text())
    resolved = []
    for page in pages:
        roles = page["serialEvidence"]
        codes = sorted({serial(c) for role in ["headerTokens", "printedDiscTokens", "internalDiscTokens", "indexTokens"] for c in roles[role]})
        main_sets = [set(serial(c) for c in roles[role]) for role in ["headerTokens", "printedDiscTokens", "indexTokens"]]
        primary_codes = sorted(c for c in codes if sum(c in s for s in main_sets) >= 2)
        primary_codes = primary_codes or sorted(main_sets[1] or main_sets[2] or main_sets[0])
        matches = {r["id"]: r for code in primary_codes for r in code_index.get(code, [])}
        for code in primary_codes:
            for r in code_index.get(alias_to.get(code, ""), []):
                matches[r["id"]] = r
        names = [page["sourceTitle"], *page["commonTitles"], *(x["title"] for x in page["indexReferences"])]
        adjudication = adjudications.get(primary_codes[0]) if len(primary_codes) == 1 else None
        if adjudication:
            names += adjudication.get("documentedTitleAliases", [])
        titles = sorted({title_key(n) for n in names if n})
        # Suffix relations require independently agreeing title and literal base
        # serial in the page's printed/header/index evidence. Never strip blindly.
        if not any(r["category"] in RELEASE_CATEGORIES for r in matches.values()):
            for code in primary_codes:
                candidates = [r for r in suffix_index.get(code, []) if title_key(r["title"]) in titles and r["category"] in RELEASE_CATEGORIES]
                if candidates and len({r["market"]["code"] for r in candidates}) == 1:
                    for r in candidates:
                        matches[r["id"]] = r
                        for raw in r["serials"]:
                            if raw.startswith(code) and raw != code:
                                aliases.append({"sourceSerial": raw, "canonicalSerial": code, "relation": "same_title_serial_revision_candidate", "physicalVariantResolved": False, "corroboratingUrl": page["url"], **evidence(r["source"], r["sourceUrl"], "documented")})
        rd = list(matches.values())
        retail = [r for r in rd if r["category"] in RELEASE_CATEGORIES]
        preferred = [r for r in retail if r["source"] == "redump-org"] or retail
        markets = {r["market"]["code"] for r in preferred}
        source_family = {"pal": "PAL", "ntsc-u": "NTSC-U/C", "ntsc-j": "NTSC-J"}[page["sourceRegionFamilies"][0]]
        reasons = []
        warnings = []
        if page.get("indexOnly"):
            warnings.append("index_only_no_detail_or_component_images")
            if not preferred or any(title_key(r["title"]) not in titles for r in preferred):
                reasons.append("index_only_title_and_serial_not_corroborated")
        if set(codes) != set(primary_codes):
            warnings.append("conflicting_internal_or_single_field_serial_preserved")
        if {r["market"]["code"] for r in retail} != markets:
            warnings.append("regional_difference_between_redump_snapshots")
        chosen = None
        if len(markets) == 1:
            chosen = preferred[0]["market"]
            if chosen["family"] != source_family:
                reasons.append("redump_source_family_conflict")
                chosen = None
        elif len(markets) > 1:
            reasons.append("serial_resolves_to_multiple_markets")
        else:
            reasons.append("no_exact_redump_serial")
        if rd and not retail:
            reasons.append("non_retail_disc_category")
        elif len(retail) < len(rd):
            warnings.append("serial_reused_by_demo_or_prerelease")
        if any(re.search(r"not released|never released|unreleased", " ".join(v), re.I) for k, v in page["factualFields"].items() if k in {"Publisher", "Date Released"}):
            reasons.append("source_reports_unreleased")
        market_evidence = None
        if chosen:
            market_evidence = evidence(preferred[0]["source"], preferred[0]["sourceUrl"], "high", scope="disc_release_not_country_of_every_box")
        if adjudication and adjudication.get("packagingMarket") and not chosen and set(reasons) <= {"no_exact_redump_serial"}:
            chosen = market(adjudication["packagingMarket"])
            market_evidence = evidence("physical-packaging", adjudication["sourceUrl"], "documented", scope="packaging_market_disc_serial_unverified", imageSha256=adjudication["imageSha256"])
            reasons.remove("no_exact_redump_serial")
            warnings.append("packaging_code_has_no_verified_disc_serial_equivalence")
        if adjudication and adjudication.get("additionalReviewReason"):
            reasons.append(adjudication["additionalReviewReason"])
        redump_titles = sorted({title_key(r["title"]) for r in rd})
        # "Party Edition" or "Special Edition" can be part of a game's title.
        # Only explicit bracketed edition qualifiers define a physical variant.
        labels = qualifiers(page["sourceTitle"])
        related_names = []
        related_releases = []
        for chunk, codes_raw in re.findall(r"([^\[\]]+)\[([^\[\]]+)\]", relationships.get(page["sourceId"], "")):
            if serials(codes_raw):
                name = re.split(r"(?:PAL|NTSC-[JU]):", chunk)[-1].strip()
                related_names.append(name)
                related_releases.append({"titleKey": title_key(name), "serials": serials(codes_raw)})
        resolved.append({"sourceId": page["sourceId"], "sourceUrl": page["url"], "sourceHash": page["retrieval"]["sha256"], "title": page["sourceTitle"], "titleKeys": titles, "redumpTitleKeys": redump_titles, "relatedTitleKeys": sorted({title_key(n) for n in related_names}), "relatedReleases": related_releases, "names": list(dict.fromkeys(names)), "family": source_family, "market": chosen, "marketEvidence": market_evidence, "serialScope": "packaging" if market_evidence and market_evidence["source"] == "physical-packaging" else "disc", "serials": primary_codes, "allSourceSerials": codes, "serialEvidence": roles, "editionLabels": labels, "redump": rd, "languages": page_languages(page, preferred), "reviewReasons": reasons, "sourceWarnings": warnings, "fields": page["factualFields"], "release": page["releaseDateCandidate"], "barcodes": page["barcodes"]})
    return resolved, aliases, official, current


if __name__ == "__main__":
    from collections import Counter
    pages, aliases, official, current = build_reference()
    (ART / "source-resolution.json").write_text(json.dumps(pages, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ART / "serial-aliases.json").write_text(json.dumps(aliases, indent=2) + "\n")
    print(json.dumps({"pages": len(pages), "resolvedMarkets": dict(Counter(p["market"]["label"] for p in pages if p["market"])), "review": dict(Counter(r for p in pages for r in p["reviewReasons"])), "redumpOfficial": len(official), "redumpCurrent": len(current)}, ensure_ascii=False))
