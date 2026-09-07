"""Documentary inspection guidance, separate from human listing decisions."""

from __future__ import annotations

import json
from pathlib import Path

RESEARCH_FILE = Path(__file__).resolve().parents[2] / "data/region-research/gameboy.json"


def region_research_prompt(platform_slug: str, catalog_id: str | None) -> str:
    if platform_slug != "gameboy" or not RESEARCH_FILE.exists():
        return ""
    document = json.loads(RESEARCH_FILE.read_text(encoding="utf-8"))
    if document.get("schemaVersion") != 1 or document.get("platformSlug") != platform_slug:
        return ""
    lines = [
        "Investigacion documental Game Boy: guia de inspeccion, NO decisiones humanas ni pruebas del anuncio.",
        f"Lote {document['batch']}; revisado {document['reviewedAt']}.",
        "No autoriza precios, regiones ni idiomas. Mantiene los umbrales existentes. Ante evidencia insuficiente, unknown.",
    ]
    entries = list(document["inspectionRules"])
    entries.extend(
        entry for entry in document["gameReferences"]
        if catalog_id and catalog_id in entry["catalogIds"]
    )
    sources = document["sources"]
    for entry in entries:
        urls = [sources[key]["url"] for key in entry["sourceIds"]]
        lines.append(f"- {entry['text']} Fuente: {', '.join(urls)}")
    return "\n".join(lines)
