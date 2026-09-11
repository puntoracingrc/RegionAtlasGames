"""Documentary inspection guidance, separate from human listing decisions."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

RESEARCH_FILE = Path(__file__).resolve().parents[2] / "data/region-research/gameboy.json"
SNES_RESEARCH_FILE = RESEARCH_FILE.with_name("snes.json")
MEGADRIVE_RESEARCH_FILE = RESEARCH_FILE.with_name("megadrive.json")
NES_RESEARCH_FILE = RESEARCH_FILE.with_name("nes.json")
PS2_RESEARCH_FILE = RESEARCH_FILE.with_name("ps2.json")
SNES_DISTRIBUTIONS_FILE = RESEARCH_FILE.with_name("snes-distributions.json")
GAMEBOY_REVIEWED_FILE = RESEARCH_FILE.with_name("gameboy-reviewed-guidance.json")


def _documents(platform_slug):
    files = {"gameboy": [RESEARCH_FILE, GAMEBOY_REVIEWED_FILE], "snes": [SNES_RESEARCH_FILE, SNES_DISTRIBUTIONS_FILE],
             "megadrive": [MEGADRIVE_RESEARCH_FILE], "nes": [NES_RESEARCH_FILE],
             "ps2": [PS2_RESEARCH_FILE]}
    for path in files.get(platform_slug, []):
        if path.exists():
            document = json.loads(path.read_text(encoding="utf-8"))
            if document.get("schemaVersion") == 1 and document.get("platformSlug") == platform_slug:
                yield document


def distribution_variants(platform_slug, catalog_id):
    return [variant for document in _documents(platform_slug)
            for entry in document.get("gameReferences", []) if catalog_id in entry["catalogIds"]
            for variant in entry.get("distributionVariants", [])]


def _normalized(value):
    raw = unicodedata.normalize("NFKD", str(value))
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in raw if not unicodedata.combining(c)).lower()).strip()


def observed_distribution_region(platform_slug, catalog_id, observations):
    """A reference tells us what to recognize; an observed distribution mark activates it."""
    observed = {_normalized(name) for item in observations if item.get("role") in {"front", "back", "manual"}
                for name in item.get("distributors", [])}
    regions = set()
    for variant in distribution_variants(platform_slug, catalog_id):
        if variant.get("associationStatus") not in {"community_documented_distribution", "observed_regional_specimen"}:
            continue
        manual_language = variant.get("manualLanguageForRecognition")
        if manual_language and not any(item.get("role") == "manual" and manual_language in item.get("languages", [])
                                       for item in observations):
            continue
        expected = {_normalized(name) for name in variant.get("recognitionDistributors", [])}
        if any(re.search(r"\b" + re.escape(name) + r"\b", actual) for name in expected for actual in observed):
            regions.add(variant["marketRegion"])
    return next(iter(regions)) if len(regions) == 1 else None


def region_research_prompt(platform_slug: str, catalog_id: str | None) -> str:
    documents = list(_documents(platform_slug))
    if not documents:
        return ""
    lines = [
        f"Investigacion documental {platform_slug}: guia de inspeccion, NO decisiones humanas ni pruebas del anuncio.",
        "No autoriza precios, regiones ni idiomas sin evidencia actual. Usar las referencias para resolver señales antes desconocidas; no añadir requisitos universales. Ante evidencia insuficiente, unknown.",
    ]
    for document in documents:
        lines.append(f"Lote {document['batch']}; revisado {document['reviewedAt']}.")
        entries = list(document["inspectionRules"])
        entries.extend(entry for entry in document["gameReferences"]
                       if catalog_id and catalog_id in entry["catalogIds"])
        sources = document["sources"]
        for entry in entries:
            if entry.get("status", "reviewed_guidance") != "reviewed_guidance":
                continue
            urls = [sources[key]["url"] for key in entry["sourceIds"]]
            lines.append(f"- {entry['text']} Fuente: {', '.join(urls)}")
            if platform_slug == "ps2" and entry in document["gameReferences"]:
                lines.append("  Contexto histórico de un ejemplar PAL España: el ID era provisional. Esta observación no confirma que pertenezca a la edición V2 actual ni habilita un emparejamiento.")
            for variant in entry.get("distributionVariants", []):
                lines.append("  Combinacion documental independiente: " + json.dumps(variant, ensure_ascii=False))
    if platform_slug == "ps2":
        from .ps2_documentary import catalog_documentary_prompt
        lines.append(catalog_documentary_prompt(catalog_id))
    return "\n".join(lines)
