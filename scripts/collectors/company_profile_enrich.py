"""Enriquecimiento de fichas de compañía: Wikidata, Wikipedia y contenido original (IA)."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from collectors.catalog_ai_match import ai_available
from collectors.common import now_iso
from collectors.game_description_ai import _clip_sentence, _openai_chat

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIPEDIA_API = "https://es.wikipedia.org/w/api.php"
USER_AGENT = "RegionAtlasGames/1.0 (company profiles; contact via regionatlas)"
REQUEST_DELAY = 0.3
HISTORY_MIN = 120
HISTORY_MAX = 900
SEO_DESCRIPTION_MAX = 160
SEO_TITLE_MAX = 70
ROOT = Path(__file__).resolve().parents[2]
WIKIDATA_OVERRIDES_FILE = ROOT / "data" / "company-wikidata-overrides.json"


def _api_get(url: str, params: dict[str, Any]) -> dict[str, Any] | None:
    query = dict(params)
    query.setdefault("format", "json")
    full = f"{url}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def _parse_wikidata_year(time_value: str | None) -> int | None:
    if not time_value:
        return None
    match = re.search(r"([+-]?\d{4})", time_value)
    if not match:
        return None
    year = int(match.group(1))
    return year if 1800 <= year <= 2100 else None


def _commons_file_url(filename: str) -> str:
    clean = filename.replace(" ", "_")
    encoded = urllib.parse.quote(clean, safe="")
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{encoded}"


def _wikidata_override(slug: str) -> str | None:
    if not WIKIDATA_OVERRIDES_FILE.exists():
        return None
    data = json.loads(WIKIDATA_OVERRIDES_FILE.read_text(encoding="utf-8"))
    qid = data.get(slug)
    return str(qid) if qid else None


def search_wikidata_company(name: str) -> str | None:
    payload = _api_get(
        WIKIDATA_API,
        {
            "action": "wbsearchentities",
            "search": name,
            "language": "es",
            "type": "item",
            "limit": 5,
        },
    )
    if not payload:
        return None
    for item in payload.get("search") or []:
        qid = item.get("id")
        if qid:
            return str(qid)
    return None


def fetch_wikidata_company(qid: str) -> dict[str, Any] | None:
    payload = _api_get(
        WIKIDATA_API,
        {
            "action": "wbgetentities",
            "ids": qid,
            "props": "labels|claims|sitelinks",
            "languages": "es|en",
        },
    )
    if not payload:
        return None
    entity = (payload.get("entities") or {}).get(qid)
    if not entity or entity.get("missing"):
        return None

    labels = entity.get("labels") or {}
    label = None
    for lang in ("es", "en"):
        if lang in labels:
            label = str(labels[lang].get("value") or "").strip() or None
            if label:
                break

    claims = entity.get("claims") or {}
    founded = None
    closed = None
    logo = None
    for time_value in claims.get("P571", []):
        value = time_value.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        founded = _parse_wikidata_year(value.get("time"))
        if founded:
            break
    for time_value in claims.get("P576", []):
        value = time_value.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        closed = _parse_wikidata_year(value.get("time"))
        if closed:
            break
    for claim in claims.get("P154", []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, str) and value.strip():
            logo = _commons_file_url(value.strip())
            break

    wikipedia_url = None
    wikipedia_title = None
    sitelinks = entity.get("sitelinks") or {}
    for key in ("eswiki", "enwiki"):
        if key in sitelinks:
            title = str(sitelinks[key].get("title") or "").strip()
            if title:
                wikipedia_title = title
                lang = "es" if key.startswith("es") else "en"
                wikipedia_url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"
                break

    return {
        "wikidataId": qid,
        "name": label,
        "foundedYear": founded,
        "closedYear": closed,
        "logoUrl": logo,
        "wikipediaUrl": wikipedia_url,
        "wikipediaTitle": wikipedia_title,
        "status": "defunct" if closed else "active",
    }


def fetch_wikipedia_extract(title: str, *, lang: str = "es", max_chars: int = 1400) -> str | None:
    payload = _api_get(
        WIKIPEDIA_API if lang == "es" else f"https://{lang}.wikipedia.org/w/api.php",
        {
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "exintro": 1,
            "titles": title,
        },
    )
    if not payload:
        return None
    pages = (payload.get("query") or {}).get("pages") or {}
    for page in pages.values():
        text = str(page.get("extract") or "").strip()
        if text:
            return text[:max_chars]
    return None


def template_company_history(facts: dict[str, Any]) -> str:
    name = facts.get("name") or "Esta compañía"
    parts = [f"{name} está presente en el catálogo retro de Region Atlas"]
    if facts.get("gameCount"):
        parts.append(f"con {facts['gameCount']} juegos indexados")
    roles = []
    if facts.get("developerCount"):
        roles.append(f"{facts['developerCount']} como desarrolladora")
    if facts.get("publisherCount"):
        roles.append(f"{facts['publisherCount']} como publicadora")
    if roles:
        parts.append(" (" + " y ".join(roles) + ")")
    if facts.get("foundedYear"):
        parts.append(f". Fundada en {facts['foundedYear']}")
    if facts.get("closedYear"):
        parts.append(f" y activa hasta {facts['closedYear']}")
    parts.append(".")
    if facts.get("topPlatforms"):
        parts.append(
            " Sus plataformas más representadas en el catálogo son "
            + ", ".join(facts["topPlatforms"][:4])
            + "."
        )
    return _clip_sentence("".join(parts), HISTORY_MAX)


def generate_company_content_with_ai(
    facts: dict[str, Any],
    reference_text: str | None,
) -> dict[str, Any]:
    facts_json = json.dumps(facts, ensure_ascii=False, indent=2)
    reference_block = reference_text or "(sin referencia externa disponible)"
    system = (
        "Eres redactor SEO para Region Atlas, catálogo de videojuegos retro en España. "
        "Genera textos ORIGINALES en español (España) sobre una compañía del sector videojuegos. "
        "REGLAS:\n"
        "- NO copies Wikipedia ni otras fuentes.\n"
        "- Usa SOLO hechos del JSON; no inventes adquisiciones, cifras ni fechas.\n"
        "- Tono enciclopédico breve orientado a coleccionistas.\n"
        "- Devuelve JSON con keys: history, seoTitle, seoDescription."
    )
    user = (
        f"Ficha factual:\n{facts_json}\n\n"
        f"Referencia interna (no citar ni copiar):\n{reference_block}\n\n"
        "history: 2-4 párrafos cortos. seoTitle <= 70 chars. seoDescription <= 155 chars."
    )
    raw = _openai_chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.45,
    )
    parsed = json.loads(raw)
    return {
        "history": _clip_sentence(str(parsed.get("history") or ""), HISTORY_MAX),
        "seoMeta": {
            "seoTitle": _clip_sentence(str(parsed.get("seoTitle") or ""), SEO_TITLE_MAX),
            "seoDescription": _clip_sentence(str(parsed.get("seoDescription") or ""), SEO_DESCRIPTION_MAX),
        },
    }


def build_company_profile(
    *,
    slug: str,
    name: str,
    stats: dict[str, Any],
    wikidata_id: str | None = None,
    use_ai: bool = True,
) -> dict[str, Any]:
    wd = None
    qid = wikidata_id or _wikidata_override(slug)
    if not qid:
        time.sleep(REQUEST_DELAY)
        qid = search_wikidata_company(name)
    if qid:
        time.sleep(REQUEST_DELAY)
        wd = fetch_wikidata_company(qid)

    reference_text = None
    wikipedia_source = None
    if wd and wd.get("wikipediaTitle"):
        time.sleep(REQUEST_DELAY)
        reference_text = fetch_wikipedia_extract(str(wd["wikipediaTitle"]), lang="es")
        if not reference_text and wd.get("wikipediaUrl") and "en.wikipedia.org" in wd["wikipediaUrl"]:
            reference_text = fetch_wikipedia_extract(str(wd["wikipediaTitle"]), lang="en")
        if wd.get("wikipediaUrl"):
            wikipedia_source = {
                "url": wd["wikipediaUrl"],
                "title": wd.get("wikipediaTitle"),
                "fetchedAt": now_iso(),
            }

    facts = {
        "name": wd.get("name") if wd and wd.get("name") else name,
        "slug": slug,
        "gameCount": stats.get("gameCount"),
        "developerCount": stats.get("developerCount"),
        "publisherCount": stats.get("publisherCount"),
        "foundedYear": wd.get("foundedYear") if wd else None,
        "closedYear": wd.get("closedYear") if wd else None,
        "topPlatforms": stats.get("topPlatforms") or [],
        "alsoKnownAs": stats.get("alsoKnownAs") or [],
    }

    profile: dict[str, Any] = {
        "slug": slug,
        "name": facts["name"],
        "wikidataId": wd.get("wikidataId") if wd else qid,
        "logoUrl": wd.get("logoUrl") if wd else None,
        "foundedYear": facts["foundedYear"],
        "closedYear": facts["closedYear"],
        "status": wd.get("status") if wd else ("defunct" if facts["closedYear"] else "active"),
        "generatedAt": now_iso(),
    }

    if wd and wd.get("wikidataId"):
        profile["sources"] = {
            "wikidata": {
                "wikidataId": wd["wikidataId"],
                "fetchedAt": now_iso(),
                "url": f"https://www.wikidata.org/wiki/{wd['wikidataId']}",
            }
        }
        if wikipedia_source:
            profile["sources"]["wikipedia"] = wikipedia_source

    if use_ai and ai_available() and len(str(reference_text or "")) >= 80:
        ai_content = generate_company_content_with_ai(facts, reference_text)
        profile["history"] = ai_content["history"]
        profile["seoMeta"] = ai_content["seoMeta"]
        profile["method"] = "ai"
    else:
        profile["history"] = template_company_history(facts)
        profile["seoMeta"] = {
            "seoTitle": _clip_sentence(
                f"{facts['name']} · juegos retro y catálogo PAL | Region Atlas",
                SEO_TITLE_MAX,
            ),
            "seoDescription": _clip_sentence(template_company_history(facts), SEO_DESCRIPTION_MAX),
        }
        profile["method"] = "template" if not use_ai or not ai_available() else "wikidata"

    if len(str(profile.get("history") or "")) < HISTORY_MIN:
        profile["history"] = template_company_history(facts)

    return profile
