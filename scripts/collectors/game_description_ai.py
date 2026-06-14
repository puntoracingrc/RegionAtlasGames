"""Genera descripciones originales para fichas de catálogo (referencia Wikipedia + metadatos + IA)."""

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
from collectors.price_ai_policy import batch_openai_allowed
from collectors.common import load_json, now_iso, save_json

ROOT = Path(__file__).resolve().parents[2]
CACHE_ROOT = ROOT / "data" / "descriptions" / "cache"
REPORT_FILE = ROOT / "data" / "descriptions" / "report.json"

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
USER_AGENT = "RegionAtlasGames/1.0 (catalog descriptions; contact@regionatlas.local)"
WIKI_EXTRACT_MAX = 1400
DESCRIPTION_MIN = 80
DESCRIPTION_MAX = 900
SEO_DESCRIPTION_MAX = 155
SEO_TITLE_MAX = 70
COVER_ALT_MAX = 120
JSONLD_DESCRIPTION_MAX = 320
FAQ_MAX = 4
HIGHLIGHTS_MAX = 4

PLATFORM_WIKI_HINT: dict[str, str] = {
    "nes": "NES",
    "snes": "Super Nintendo",
    "n64": "Nintendo 64",
    "gameboy": "Game Boy",
    "gamecube": "GameCube",
    "wii": "Wii",
    "ds": "Nintendo DS",
    "3ds": "Nintendo 3DS",
    "megadrive": "Mega Drive",
    "sega32x": "Sega 32X",
    "megacd": "Mega CD",
    "mastersystem": "Master System",
    "saturn": "Sega Saturn",
    "dreamcast": "Dreamcast",
    "gamegear": "Game Gear",
    "neogeo": "Neo Geo",
    "neogeocd": "Neo Geo CD",
    "neogeopocket": "Neo Geo Pocket",
    "ps1": "PlayStation",
    "ps2": "PlayStation 2",
    "ps3": "PlayStation 3",
    "ps4": "PlayStation 4",
}


def description_model() -> str:
    return os.environ.get("GAME_DESCRIPTION_MODEL", os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)).strip()


def _http_json(url: str, timeout: int = 45) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_wikipedia_title(title: str, platform_slug: str, *, lang: str) -> str | None:
    hint = PLATFORM_WIKI_HINT.get(platform_slug, platform_slug)
    query = f"{title} {hint} videojuego"
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": 3,
            "format": "json",
        }
    )
    try:
        data = _http_json(f"https://{lang}.wikipedia.org/w/api.php?{params}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    for hit in data.get("query", {}).get("search", []):
        page_title = hit.get("title")
        if page_title:
            return str(page_title)
    return None


def fetch_wikipedia_extract(page_title: str, *, lang: str) -> str | None:
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "prop": "extracts",
            "explaintext": "1",
            "exintro": "1",
            "exchars": str(WIKI_EXTRACT_MAX),
            "titles": page_title,
            "format": "json",
        }
    )
    try:
        data = _http_json(f"https://{lang}.wikipedia.org/w/api.php?{params}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        extract = str(page.get("extract") or "").strip()
        if extract and not extract.lower().startswith("redirect"):
            return extract
    return None


def fetch_reference_text(title: str, platform_slug: str) -> tuple[str | None, str | None]:
    for lang in ("es", "en"):
        page_title = search_wikipedia_title(title, platform_slug, lang=lang)
        if not page_title:
            continue
        extract = fetch_wikipedia_extract(page_title, lang=lang)
        if extract:
            return extract, f"{lang}.wikipedia.org/wiki/{urllib.parse.quote(page_title.replace(' ', '_'))}"
        time.sleep(0.15)
    return None, None


def build_fact_sheet(game: dict[str, Any], details: dict[str, Any] | None) -> dict[str, Any]:
    d = details or {}
    genres = [g.get("name") for g in d.get("genres") or [] if g.get("name")]
    return {
        "title": game.get("title"),
        "platform": PLATFORM_WIKI_HINT.get(game.get("platformSlug", ""), game.get("platformSlug")),
        "region": game.get("region"),
        "year": d.get("year"),
        "developer": (d.get("developer") or {}).get("name"),
        "publisher": (d.get("publisher") or {}).get("name"),
        "genres": genres,
        "series": (d.get("series") or {}).get("name"),
        "players": d.get("players"),
        "reference": d.get("reference"),
    }


def template_description(facts: dict[str, Any]) -> str:
    title = facts.get("title") or "Este juego"
    platform = facts.get("platform") or "su plataforma"
    region = facts.get("region") or "PAL"
    parts = [f"{title} es un título para {platform} ({region})"]

    if facts.get("year"):
        parts[0] += f" lanzado en {facts['year']}"

    extras: list[str] = []
    if facts.get("developer"):
        extras.append(f"desarrollado por {facts['developer']}")
    if facts.get("publisher") and facts.get("publisher") != facts.get("developer"):
        extras.append(f"publicado por {facts['publisher']}")
    if facts.get("genres"):
        extras.append(f" dentro del género {', '.join(facts['genres'][:3])}")
    if facts.get("series"):
        extras.append(f", perteneciente a la saga {facts['series']}")

    body = parts[0]
    if extras:
        body += ", " + ", ".join(extras) + "."
    else:
        body += "."

    body += (
        " En Region Atlas encontrarás metadatos de la edición, señales de región "
        "y referencias de precio en el mercado español cuando haya datos verificados."
    )
    return body


def _openai_chat(messages: list[dict[str, str]], *, temperature: float = 0.65) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada")

    base = os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    body = {
        "model": description_model(),
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return str(payload["choices"][0]["message"]["content"])


def _clip_sentence(text: str, max_len: int) -> str:
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(clean) <= max_len:
        return clean
    clipped = clean[:max_len]
    last_space = clipped.rfind(" ")
    if last_space > max_len // 2:
        clipped = clipped[:last_space]
    return clipped.rstrip(".,;:") + "…"


def template_seo_meta(facts: dict[str, Any], description: str) -> dict[str, Any]:
    title = str(facts.get("title") or "Este juego")
    platform = str(facts.get("platform") or "su plataforma")
    region = str(facts.get("region") or "PAL")
    seo_title = _clip_sentence(f"{title} — {platform} {region}", SEO_TITLE_MAX)
    seo_description = _clip_sentence(description, SEO_DESCRIPTION_MAX)
    cover_alt = _clip_sentence(f"Portada de {title} para {platform} ({region})", COVER_ALT_MAX)
    json_ld = _clip_sentence(description, JSONLD_DESCRIPTION_MAX)
    faqs: list[dict[str, str]] = []
    if facts.get("year"):
        faqs.append(
            {
                "question": f"¿De qué año es {title}?",
                "answer": f"{title} corresponde a la edición {region} para {platform}"
                + (f", con lanzamiento en {facts['year']}." if facts.get("year") else "."),
            }
        )
    if facts.get("genres"):
        faqs.append(
            {
                "question": f"¿Qué tipo de juego es {title}?",
                "answer": f"Según la ficha del catálogo, {title} se encuadra en "
                f"{', '.join(facts['genres'][:3])}.",
            }
        )
    highlights: list[str] = []
    if facts.get("developer"):
        highlights.append(f"Desarrollado por {facts['developer']}")
    if facts.get("publisher") and facts.get("publisher") != facts.get("developer"):
        highlights.append(f"Publicado por {facts['publisher']}")
    if facts.get("reference"):
        highlights.append(f"Referencia producto: {facts['reference']}")
    return {
        "seoTitle": seo_title,
        "seoDescription": seo_description,
        "coverAlt": cover_alt,
        "jsonLdDescription": json_ld,
        "faqs": faqs[:FAQ_MAX],
        "highlights": highlights[:HIGHLIGHTS_MAX],
    }


def generate_content_with_ai(
    facts: dict[str, Any],
    reference_text: str | None,
    reference_url: str | None,
) -> dict[str, Any]:
    facts_json = json.dumps(facts, ensure_ascii=False, indent=2)
    reference_block = reference_text or "(sin texto de referencia disponible)"
    if reference_url:
        reference_block += f"\n\nFuente consultada (solo para contexto interno): {reference_url}"

    system = (
        "Eres redactor SEO para Region Atlas, catálogo de videojuegos retro en España. "
        "Genera textos ORIGINALES en español (España): informativos, naturales y distintos del material fuente. "
        "REGLAS ESTRICTAS:\n"
        "- NO copies ni parafrasees de forma evidente el texto de referencia, Wikipedia ni Google.\n"
        "- Usa SOLO hechos presentes en la ficha; no inventes premios, ventas ni argumentos de marketing.\n"
        "- Separa desarrolladora y publicadora si ambas existen y son distintas.\n"
        "- Menciona plataforma y región/edición PAL cuando aplique.\n"
        "- Tono neutro de catálogo/coleccionismo; sin llamadas agresivas a la compra.\n"
        "- No cites Wikipedia, Google ni Region Atlas en los textos.\n"
        "- seoDescription: máximo 155 caracteres, pensado para meta description.\n"
        "- coverAlt: texto accesible para la portada (plataforma + región).\n"
        "- faqs: 2-3 preguntas sobre el juego (no precios); respuestas breves y factuales.\n"
        "- highlights: 2-4 bullets factuales muy cortos.\n"
        'Responde JSON: {"description":"...","seoTitle":"...","seoDescription":"...",'
        '"coverAlt":"...","jsonLdDescription":"...","faqs":[{"question":"...","answer":"..."}],'
        '"highlights":["..."]}'
    )
    user = (
        f"HECHOS VERIFICADOS (prioridad máxima):\n{facts_json}\n\n"
        f"TEXTO DE REFERENCIA (solo contexto factual interno; NO reutilizar redacción):\n"
        f"{reference_block[:WIKI_EXTRACT_MAX]}"
    )

    raw = _openai_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.7,
    )
    parsed = json.loads(raw)

    description = re.sub(r"\s+", " ", str(parsed.get("description") or "")).strip()
    if len(description) < DESCRIPTION_MIN:
        raise ValueError("descripción demasiado corta")
    if len(description) > DESCRIPTION_MAX:
        clipped = description[:DESCRIPTION_MAX]
        last_period = clipped.rfind(".")
        description = clipped[: last_period + 1] if last_period > DESCRIPTION_MIN else clipped.rsplit(" ", 1)[0] + "."

    seo_meta = {
        "seoTitle": _clip_sentence(parsed.get("seoTitle") or facts.get("title"), SEO_TITLE_MAX),
        "seoDescription": _clip_sentence(parsed.get("seoDescription") or description, SEO_DESCRIPTION_MAX),
        "coverAlt": _clip_sentence(
            parsed.get("coverAlt") or f"Portada de {facts.get('title')} para {facts.get('platform')}",
            COVER_ALT_MAX,
        ),
        "jsonLdDescription": _clip_sentence(parsed.get("jsonLdDescription") or description, JSONLD_DESCRIPTION_MAX),
        "faqs": [],
        "highlights": [],
    }

    faqs_raw = parsed.get("faqs") or []
    if isinstance(faqs_raw, list):
        for item in faqs_raw[:FAQ_MAX]:
            if not isinstance(item, dict):
                continue
            question = re.sub(r"\s+", " ", str(item.get("question") or "")).strip()
            answer = re.sub(r"\s+", " ", str(item.get("answer") or "")).strip()
            if question and answer:
                seo_meta["faqs"].append({"question": question, "answer": answer})

    highlights_raw = parsed.get("highlights") or []
    if isinstance(highlights_raw, list):
        for item in highlights_raw[:HIGHLIGHTS_MAX]:
            text = re.sub(r"\s+", " ", str(item or "")).strip()
            if text:
                seo_meta["highlights"].append(text)

    if not seo_meta["faqs"]:
        seo_meta["faqs"] = template_seo_meta(facts, description)["faqs"]

    return {
        "description": description,
        "seoMeta": seo_meta,
        "model": description_model(),
        "referenceUrl": reference_url,
        "generatedAt": now_iso(),
    }


def generate_description_with_ai(
    facts: dict[str, Any],
    reference_text: str | None,
    reference_url: str | None,
) -> dict[str, Any]:
    return generate_content_with_ai(facts, reference_text, reference_url)


def cache_path(catalog_id: str) -> Path:
    safe = re.sub(r"[^\w.-]+", "_", catalog_id)
    return CACHE_ROOT / f"{safe}.json"


def read_cache(catalog_id: str) -> dict[str, Any] | None:
    path = cache_path(catalog_id)
    if not path.exists():
        return None
    data = load_json(path, {})
    if data.get("description") and data.get("seoMeta"):
        return data
    return None


def write_cache(catalog_id: str, payload: dict[str, Any]) -> None:
    path = cache_path(catalog_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    save_json(path, payload)


def build_description_for_game(
    game: dict[str, Any],
    details: dict[str, Any] | None,
    *,
    force: bool = False,
    use_ai: bool = True,
) -> dict[str, Any] | None:
    catalog_id = game["id"]
    if not force:
        cached = read_cache(catalog_id)
        if cached:
            return cached

    facts = build_fact_sheet(game, details)
    reference_text, reference_url = fetch_reference_text(
        str(game.get("title") or ""),
        str(game.get("platformSlug") or ""),
    )

    if use_ai and ai_available() and batch_openai_allowed(purpose="batch"):
        try:
            result = generate_content_with_ai(facts, reference_text, reference_url)
            result["method"] = "ai"
            result["referenceUsed"] = bool(reference_text)
            result["seoMeta"] = {
                **result["seoMeta"],
                "method": "ai",
                "model": result.get("model"),
                "generatedAt": result.get("generatedAt"),
            }
            write_cache(catalog_id, result)
            return result
        except (RuntimeError, ValueError, json.JSONDecodeError, urllib.error.URLError):
            pass

    description = template_description(facts)
    seo_meta = template_seo_meta(facts, description)
    generated_at = now_iso()
    result = {
        "description": description,
        "seoMeta": {
            **seo_meta,
            "method": "template",
            "model": None,
            "generatedAt": generated_at,
        },
        "method": "template",
        "referenceUsed": bool(reference_text),
        "referenceUrl": reference_url,
        "generatedAt": generated_at,
    }
    write_cache(catalog_id, result)
    return result
