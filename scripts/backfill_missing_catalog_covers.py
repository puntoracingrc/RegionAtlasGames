#!/usr/bin/env python3
"""Busca y valida portadas ausentes sin mezclar ediciones regionales.

El proceso es deliberadamente conservador:
1. Reutiliza candidatos regionales preparados en artifacts.
2. Busca imágenes con SerpApi Google Images.
3. Pide a visión que compruebe título, plataforma, edición, frontal y región.
4. Rasteriza el resultado como JPEG 1000x1400 sin EXIF ni nombre del proveedor.

No modifica el catálogo salvo con --apply. El informe se guarda fuera del repo.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from collectors.covers_storage import save_cover_jpeg, slugify_title  # noqa: E402
from import_pricecharting_software_list import cover_is_clean, save_clean_cover  # noqa: E402

CATALOG_FILE = ROOT / "data" / "catalog.json"
META_FILE = ROOT / "data" / "meta.json"
DEFAULT_ARTIFACTS_ROOT = Path(os.environ.get("REGION_ATLAS_ARTIFACTS_ROOT", ROOT / "artifacts")).expanduser()
DEFAULT_OUTPUT_ROOT = Path(
    os.environ.get(
        "REGION_ATLAS_COVER_BACKFILL_ROOT",
        DEFAULT_ARTIFACTS_ROOT / "region-atlas-missing-covers",
    )
).expanduser()
USER_AGENT = "RegionAtlasGames/1.0 (missing cover review)"
MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
MAX_VISION_IMAGES = 6
MIN_ACCEPT_CONFIDENCE = 0.82
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

EDITION_WORDS = (
    "platinum",
    "greatest hits",
    "classics",
    "essentials",
    "limited",
    "collector",
    "collectors",
    "promo",
    "not for resale",
    "demo",
    "bundle",
    "classic edition",
    "soundtrack variant",
    "rp-m",
    "kixx",
    "kiss",
)


@dataclass
class Candidate:
    image_url: str
    page_url: str
    label: str
    source: str
    local_path: str | None = None
    width: int | None = None
    height: int | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_env_file(path: Path | None) -> None:
    if not path or not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&amp;", " and ").replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def title_tokens(value: str) -> set[str]:
    return {token for token in normalize(value).split() if len(token) > 1 or token.isdigit()}


def base_title(value: str) -> str:
    text = re.sub(r"\s*[\[(].*?[\])]\s*", " ", value)
    return re.sub(r"\s+", " ", text).strip()


def has_edition_marker(value: str) -> bool:
    normalized = normalize(value)
    return any(marker in normalized for marker in EDITION_WORDS)


def region_family(region: str) -> str:
    normalized = normalize(region)
    if "alemania" in normalized or "germany" in normalized:
        return "GERMANY"
    if normalized in {"usa", "ntsc", "ntsc u"} or "usa" in normalized:
        return "USA"
    if "japon" in normalized or "japan" in normalized:
        return "JAPAN"
    return "PAL"


def region_search_terms(game: dict[str, Any]) -> str:
    family = region_family(str(game.get("region") or ""))
    if family == "USA":
        return "USA NTSC ESRB cover box art"
    if family == "JAPAN":
        return "Japan NTSC-J Japanese cover box art"
    if family == "GERMANY":
        return "Germany PAL USK cover box art"
    return "PAL Europe PEGI cover box art"


def cover_filename(game: dict[str, Any]) -> str:
    prefix = {"USA": "usa-", "JAPAN": "japon-", "GERMANY": "alemania-"}.get(
        region_family(str(game.get("region") or "")),
        "",
    )
    return f"{prefix}{slugify_title(str(game['title']))}.jpg"


def artifact_family(path: Path) -> str | None:
    normalized = normalize(path.as_posix())
    filename = normalize(path.stem)
    if " usa " in f" {normalized} " or filename.startswith("usa ") or "ntsc usa" in normalized:
        return "USA"
    if any(word in normalized for word in (" japon ", " japan ", " japanese ", " jp ")):
        return "JAPAN"
    if any(word in normalized for word in (" pal ", "pal eu", "pal europa")) or filename.startswith("es "):
        return "PAL"
    return None


def artifact_candidates(game: dict[str, Any], root: Path) -> list[Candidate]:
    if not root.is_dir():
        return []
    platform = str(game.get("platformSlug") or "")
    family = region_family(str(game.get("region") or ""))
    target = normalize(str(game["title"]))
    target_base = normalize(base_title(str(game["title"])))
    exact: list[tuple[int, Path]] = []
    for path in root.glob(f"**/covers/{platform}/*"):
        if path.suffix.lower() not in IMAGE_SUFFIXES or len(path.stem) < 3:
            continue
        candidate_family = artifact_family(path)
        if candidate_family and candidate_family != family:
            continue
        name = normalize(re.sub(r"^(?:usa|es|japon|japan|jp)[-_]", "", path.stem, flags=re.I))
        score = 0
        if name == target:
            score = 100
        elif name == target_base and not has_edition_marker(str(game["title"])):
            score = 90
        if score:
            exact.append((score, path))
    exact.sort(key=lambda item: (-item[0], len(item[1].as_posix())))
    return [
        Candidate(
            image_url=path.resolve().as_uri(),
            page_url=path.resolve().as_uri(),
            label=path.stem,
            source="prepared_artifact",
            local_path=str(path.resolve()),
        )
        for _, path in exact[:3]
    ]


def fetch_json(url: str, timeout: int = 35) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def search_candidates(game: dict[str, Any], api_key: str) -> tuple[str, list[Candidate]]:
    query = f'"{game["title"]}" {game.get("platformName") or game.get("platformSlug")} {region_search_terms(game)}'
    params = urllib.parse.urlencode(
        {
            "engine": "google_images",
            "api_key": api_key,
            "q": query,
            "google_domain": "google.es",
            "gl": "es",
            "hl": "es",
            "safe": "active",
        }
    )
    payload = fetch_json(f"https://serpapi.com/search.json?{params}")
    if payload.get("error"):
        raise RuntimeError(str(payload["error"]))
    candidates: list[Candidate] = []
    seen: set[str] = set()
    target_tokens = title_tokens(str(game["title"]))
    base_tokens = title_tokens(base_title(str(game["title"])))
    for item in payload.get("images_results") or []:
        image_url = str(item.get("original") or "").strip()
        page_url = str(item.get("link") or "").strip()
        label = str(item.get("title") or "").strip()
        if not image_url.startswith(("https://", "http://")) or image_url in seen:
            continue
        width = int(item.get("original_width") or 0)
        height = int(item.get("original_height") or 0)
        if width and height and (width < 240 or height < 240):
            continue
        label_tokens = title_tokens(label)
        coverage_tokens = base_tokens or target_tokens
        coverage = len(coverage_tokens & label_tokens) / max(1, len(coverage_tokens))
        if coverage < 0.45:
            continue
        seen.add(image_url)
        candidates.append(
            Candidate(
                image_url=image_url,
                page_url=page_url,
                label=label,
                source=str(item.get("source") or urllib.parse.urlparse(page_url).hostname or "web"),
                width=width or None,
                height=height or None,
            )
        )
        if len(candidates) >= 12:
            break
    return query, candidates


def fetch_image_bytes(candidate: Candidate) -> bytes:
    if candidate.local_path:
        return Path(candidate.local_path).read_bytes()
    request = urllib.request.Request(
        candidate.image_url,
        headers={"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/*"},
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        raw = response.read(MAX_DOWNLOAD_BYTES + 1)
    if len(raw) > MAX_DOWNLOAD_BYTES:
        raise ValueError("image_too_large")
    return raw


def vision_data_uri(raw: bytes) -> tuple[str, tuple[int, int]]:
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGB")
    if image.width < 180 or image.height < 180:
        raise ValueError("image_too_small")
    image.thumbnail((900, 900), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=82, optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}", image.size


def usable_candidates(candidates: list[Candidate]) -> tuple[list[Candidate], list[bytes]]:
    usable: list[Candidate] = []
    raws: list[bytes] = []
    hashes: set[str] = set()
    for candidate in candidates:
        try:
            raw = fetch_image_bytes(candidate)
            data_uri, size = vision_data_uri(raw)
        except Exception:
            continue
        digest = hashlib.sha1(data_uri.encode("ascii")).hexdigest()
        if digest in hashes:
            continue
        hashes.add(digest)
        candidate.width, candidate.height = size
        usable.append(candidate)
        raws.append(raw)
        if len(usable) >= MAX_VISION_IMAGES:
            break
    return usable, raws


def save_candidate_previews(
    game: dict[str, Any], candidates: list[Candidate], raws: list[bytes], output_root: Path
) -> list[str]:
    paths: list[str] = []
    preview_dir = output_root / "candidates" / str(game["id"])
    for index, raw in enumerate(raws, start=1):
        destination = preview_dir / f"{index}.jpg"
        if save_cover_jpeg(raw, destination):
            candidates[index - 1].local_path = str(destination)
            paths.append(str(destination))
    return paths


def openai_json(messages: list[dict[str, Any]], api_key: str) -> dict[str, Any]:
    model = os.environ.get("OPENAI_VISION_MODEL") or "gpt-4o-mini"
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return json.loads(payload["choices"][0]["message"]["content"])


def select_candidate(
    game: dict[str, Any], candidates: list[Candidate], raws: list[bytes], api_key: str
) -> dict[str, Any]:
    family = region_family(str(game.get("region") or ""))
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Producto objetivo: {game['title']}\n"
                f"Plataforma: {game.get('platformName') or game.get('platformSlug')}\n"
                f"Región de catálogo: {game.get('region')}\n"
                f"Familia regional exigida: {family}\n\n"
                "Elige como máximo una imagen. Debe mostrar la portada frontal o una caja donde el frontal sea claramente utilizable; "
                "no aceptes contraportadas, discos/cartuchos sueltos, capturas, pósteres, key art ni otro juego. "
                "Título, plataforma y edición comercial (Platinum, Greatest Hits, Promo, Demo, Limited, Collector, bundle, etc.) "
                "deben coincidir. Puede variar el país concreto dentro de PAL, pero no la familia regional. "
                "Para PAL moderno, PEGI es la señal habitual y USK identifica Alemania; para USA, ESRB; para Japón moderno, CERO. "
                "En sistemas anteriores a esos organismos, acepta empaquetado histórico inequívoco PAL/NTSC-U/NTSC-J aunque no lleve sello moderno. "
                "Una portada PAL francesa, italiana o británica es compatible con una ficha PAL España/PAL Europa; una USK solo es compatible "
                "con Alemania salvo que también sea una caja PAL multirregional clara. No adivines texto ilegible.\n\n"
                "Responde JSON con: chosenIndex (1..N o null), isTargetProduct, platformMatch, editionMatch, frontCover, "
                "regionFamily (PAL|USA|JAPAN|GERMANY|UNKNOWN), regionFamilyMatch, ratingSystems (lista), "
                "matchLevel (exact|same_title_region_variant|no_match), confidence (0..1), reason."
            ),
        }
    ]
    for index, (candidate, raw) in enumerate(zip(candidates, raws), start=1):
        uri, _ = vision_data_uri(raw)
        content.append(
            {
                "type": "text",
                "text": f"Candidato {index}: {candidate.label}; origen {candidate.source}.",
            }
        )
        content.append({"type": "image_url", "image_url": {"url": uri, "detail": "high"}})
    return openai_json(
        [
            {"role": "system", "content": "Especialista en carátulas físicas regionales. Devuelve solo JSON."},
            {"role": "user", "content": content},
        ],
        api_key,
    )


def accepted_verdict(verdict: dict[str, Any], candidate_count: int) -> bool:
    index = verdict.get("chosenIndex")
    try:
        numeric_index = int(index)
    except (TypeError, ValueError):
        return False
    return bool(
        1 <= numeric_index <= candidate_count
        and verdict.get("isTargetProduct") is True
        and verdict.get("platformMatch") is True
        and verdict.get("editionMatch") is True
        and verdict.get("frontCover") is True
        and verdict.get("regionFamilyMatch") is True
        and verdict.get("matchLevel") in {"exact", "same_title_region_variant"}
        and float(verdict.get("confidence") or 0) >= MIN_ACCEPT_CONFIDENCE
    )


def update_meta(catalog: list[dict[str, Any]]) -> None:
    if not META_FILE.is_file():
        return
    meta = json.loads(META_FILE.read_text(encoding="utf-8"))
    listed = [game for game in catalog if game.get("listingStatus") != "excluded"]
    with_cover = sum(bool(game.get("coverUrl")) for game in listed)
    meta["catalogWithCover"] = sum(bool(game.get("coverUrl")) for game in catalog)
    meta["catalogWithLocalCover"] = sum(
        str(game.get("coverUrl") or "").startswith(("/covers/", "/catalog-covers/"))
        for game in catalog
    )
    meta["coversListed"] = with_cover
    meta["coversLocal"] = sum(
        str(game.get("coverUrl") or "").startswith(("/covers/", "/catalog-covers/"))
        for game in listed
    )
    meta["coversListedPct"] = round(with_cover * 100 / len(listed), 1) if listed else 0
    meta["lastCoversBackfillAt"] = now_iso()
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_report(path: Path, report: dict[str, Any]) -> None:
    report["stats"] = {
        "processed": len(report["results"]),
        "accepted": sum(item.get("status") == "accepted" for item in report["results"]),
        "unresolved": sum(item.get("status") != "accepted" for item in report["results"]),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def crop_image_bytes(raw: bytes, crop: list[float] | None) -> bytes:
    if not crop:
        return raw
    if len(crop) != 4:
        raise ValueError("crop debe contener [left, top, right, bottom]")
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGB")
    values = [float(value) for value in crop]
    if all(0 <= value <= 1 for value in values):
        left, top, right, bottom = (
            round(values[0] * image.width),
            round(values[1] * image.height),
            round(values[2] * image.width),
            round(values[3] * image.height),
        )
    else:
        left, top, right, bottom = (round(value) for value in values)
    if left < 0 or top < 0 or right > image.width or bottom > image.height:
        raise ValueError("crop fuera de los límites de la imagen")
    if right - left < 180 or bottom - top < 180:
        raise ValueError("crop demasiado pequeño")
    output = io.BytesIO()
    image.crop((left, top, right, bottom)).save(output, format="JPEG", quality=94)
    return output.getvalue()


def apply_manual_decisions(
    report: dict[str, Any],
    catalog: list[dict[str, Any]],
    decisions: dict[str, dict[str, Any]],
    output_root: Path,
) -> int:
    games_by_id = {str(game["id"]): game for game in catalog}
    results_by_id = {str(item["catalogId"]): item for item in report.get("results") or []}
    accepted = 0
    for catalog_id, decision in decisions.items():
        game = games_by_id.get(str(catalog_id))
        result = results_by_id.get(str(catalog_id))
        if not game or not result:
            raise ValueError(f"Decisión sin ficha o resultado: {catalog_id}")
        candidate_index: int | None = None
        if decision.get("candidateIndex") is not None:
            try:
                candidate_index = int(decision["candidateIndex"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"candidateIndex no válido para {catalog_id}") from exc
            previews = result.get("previewPaths") or []
            if candidate_index < 1 or candidate_index > len(previews):
                raise ValueError(f"Candidato {candidate_index} no disponible para {catalog_id}")
            raw = Path(previews[candidate_index - 1]).read_bytes()
        elif decision.get("imageUrl"):
            candidate = Candidate(
                image_url=str(decision["imageUrl"]),
                page_url=str(decision.get("sourcePage") or decision["imageUrl"]),
                label=str(decision.get("note") or game["title"]),
                source=str(decision.get("source") or "manual_web_search"),
            )
            raw = fetch_image_bytes(candidate)
            preview_dir = output_root / "candidates" / str(catalog_id)
            preview_path = preview_dir / "manual.jpg"
            if not save_cover_jpeg(raw, preview_path):
                raise ValueError(f"No se pudo preparar el candidato manual: {catalog_id}")
            result.setdefault("candidates", []).append(asdict(candidate))
            result.setdefault("previewPaths", []).append(str(preview_path))
        else:
            raise ValueError(f"La decisión no tiene candidateIndex ni imageUrl: {catalog_id}")
        raw = crop_image_bytes(raw, decision.get("crop"))
        filename = cover_filename(game)
        destination = output_root / "covers" / str(game["platformSlug"]) / filename
        save_clean_cover(raw, destination)
        if not cover_is_clean(destination):
            destination.unlink(missing_ok=True)
            raise ValueError(f"La portada final no supera la validación: {catalog_id}")
        result.update(
            {
                "status": "accepted",
                "reason": "manual_regional_review_accepted",
                "selectedCandidate": candidate_index or "manual_web_search",
                "manualDecision": decision,
                "outputPath": str(destination),
                "coverUrl": f"/covers/{game['platformSlug']}/{filename}",
            }
        )
        accepted += 1
    report["manualReviewedAt"] = now_iso()
    return accepted


def process_game(
    game: dict[str, Any],
    artifacts_root: Path,
    output_root: Path,
    serp_key: str,
    openai_key: str,
    review_mode: str,
) -> dict[str, Any]:
    prepared = artifact_candidates(game, artifacts_root)
    query = ""
    searched: list[Candidate] = []
    try:
        query, searched = search_candidates(game, serp_key)
    except Exception as exc:
        search_error = f"{type(exc).__name__}: {exc}"
    else:
        search_error = None
    candidates, raws = usable_candidates(prepared + searched)
    result: dict[str, Any] = {
        "catalogId": game["id"],
        "title": game["title"],
        "platform": game.get("platformSlug"),
        "region": game.get("region"),
        "regionFamily": region_family(str(game.get("region") or "")),
        "query": query,
        "searchError": search_error,
        "candidates": [asdict(candidate) for candidate in candidates],
        "status": "unresolved",
    }
    if not candidates:
        result["reason"] = "no_usable_candidates"
        return result
    if review_mode == "manual":
        result["previewPaths"] = save_candidate_previews(game, candidates, raws, output_root)
        result["candidates"] = [asdict(candidate) for candidate in candidates]
        result["status"] = "review_required"
        result["reason"] = "manual_regional_review"
        return result
    try:
        verdict = select_candidate(game, candidates, raws, openai_key)
    except Exception as exc:
        result["reason"] = f"vision_error: {type(exc).__name__}: {exc}"
        return result
    result["verdict"] = verdict
    if not accepted_verdict(verdict, len(candidates)):
        result["reason"] = "vision_rejected"
        return result
    selected_index = int(verdict["chosenIndex"]) - 1
    filename = cover_filename(game)
    destination = output_root / "covers" / str(game["platformSlug"]) / filename
    save_clean_cover(raws[selected_index], destination)
    if not cover_is_clean(destination):
        result["reason"] = "clean_output_validation_failed"
        destination.unlink(missing_ok=True)
        return result
    result.update(
        {
            "status": "accepted",
            "selectedCandidate": selected_index + 1,
            "outputPath": str(destination),
            "coverUrl": f"/covers/{game['platformSlug']}/{filename}",
        }
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill regional de portadas ausentes")
    parser.add_argument("--catalog", type=Path, default=CATALOG_FILE)
    parser.add_argument("--artifacts-root", type=Path, default=DEFAULT_ARTIFACTS_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--id", action="append", dest="ids")
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--decisions", type=Path)
    parser.add_argument("--review-mode", choices=("vision", "manual"), default="vision")
    args = parser.parse_args()

    load_env_file(args.env_file)
    serp_key = (os.environ.get("SERPAPI_API_KEY") or os.environ.get("SERPAPI_KEY") or "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    targets = [
        game
        for game in catalog
        if game.get("listingStatus") != "excluded" and not game.get("coverUrl")
    ]
    if args.ids:
        requested = set(args.ids)
        targets = [game for game in targets if str(game.get("id")) in requested]
    report_path = args.output_root / "report.json"
    if report_path.is_file() and not args.retry:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    else:
        report = {
            "generatedAt": now_iso(),
            "policy": "regional_cover_backfill_v1",
            "initialMissing": len(targets),
            "results": [],
        }
    processed_ids = {str(item.get("catalogId")) for item in report.get("results") or []}
    pending = [game for game in targets if str(game["id"]) not in processed_ids]
    if args.limit:
        pending = pending[: args.limit]
    print(f"Sin portada: {len(targets)}; pendientes de esta ejecución: {len(pending)}")

    if pending and not serp_key:
        raise SystemExit("Falta SERPAPI_API_KEY")
    if pending and args.review_mode == "vision" and not openai_key:
        raise SystemExit("Falta OPENAI_API_KEY para --review-mode vision")

    for index, game in enumerate(pending, start=1):
        result = process_game(
            game,
            args.artifacts_root,
            args.output_root,
            serp_key,
            openai_key,
            args.review_mode,
        )
        report["results"].append(result)
        save_report(report_path, report)
        print(
            f"[{index}/{len(pending)}] {game['id']}: {result['status']} "
            f"({result.get('reason') or result.get('verdict', {}).get('matchLevel') or 'ok'})",
            flush=True,
        )
        time.sleep(0.15)

    if args.decisions:
        decisions = json.loads(args.decisions.read_text(encoding="utf-8"))
        if not isinstance(decisions, dict):
            raise SystemExit("El archivo de decisiones debe ser un objeto JSON")
        accepted_count = apply_manual_decisions(report, catalog, decisions, args.output_root)
        save_report(report_path, report)
        print(f"Decisiones manuales aceptadas: {accepted_count}")

    if args.apply:
        accepted = {
            str(item["catalogId"]): str(item["coverUrl"])
            for item in report["results"]
            if item.get("status") == "accepted" and item.get("coverUrl")
        }
        changed = 0
        for game in catalog:
            cover_url = accepted.get(str(game.get("id")))
            if cover_url and not game.get("coverUrl"):
                game["coverUrl"] = cover_url
                changed += 1
        args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if args.catalog.resolve() == CATALOG_FILE.resolve():
            update_meta(catalog)
        report["appliedAt"] = now_iso()
        report["applied"] = changed
        save_report(report_path, report)
        print(f"Aplicadas al catálogo: {changed}")

    print(f"Informe: {report_path}")
    print(json.dumps(report.get("stats") or {}, ensure_ascii=False))


if __name__ == "__main__":
    main()
