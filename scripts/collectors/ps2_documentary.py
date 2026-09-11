"""PS2 V2 read-only documentary adapter. Never writes prices or listing decisions."""
from functools import lru_cache
import gzip
import json
from pathlib import Path
import re

DATA = Path(__file__).resolve().parents[2] / "data"


def normalize_code(value):
    return re.sub(r"^(S[A-Z]{3})[-_. ]?(?=\d)", r"\1-", str(value).strip().upper())


@lru_cache(maxsize=1)
def source_knowledge():
    with gzip.open(DATA / "ps2-source-knowledge.json.gz", "rt", encoding="utf-8") as source:
        return json.load(source)


@lru_cache(maxsize=1)
def editions():
    with gzip.open(DATA / "ps2-edition-evidence.json.gz", "rt", encoding="utf-8") as source:
        return json.load(source)


def references_for_code(value):
    code = normalize_code(value)
    result = []
    for record in source_knowledge()["records"]:
        if code in {normalize_code(c) for c in record["codes"]}:
            result.append({"role": "edition_code", "record": record})
        elif code in {b["digits"] for b in record["barcodeReferences"]}:
            result.append({"role": "barcode_reference", "record": record})
        elif code in {normalize_code(c["value"]) for c in record["accessoryCodes"]}:
            result.append({"role": "accessory_code", "record": record})
    return result


def catalog_documentary_prompt(catalog_id):
    if not catalog_id or not str(catalog_id).startswith("ps2-"):
        return ""
    try:
        edition = editions().get(catalog_id)
    except FileNotFoundError:
        return "PS2 REGIONAL V2: paquete documental local no disponible. No usar la región o portada heredadas como verificación del anuncio; mantener los detalles regionales pendientes de contraste."
    if not edition:
        return ""
    lines = ["PS2 REGIONAL V2: referencia documental, no observaciones del anuncio ni aceptación automática.",
             "Separar familia, mercado del software, papel, disco, manual, textos y voces. Un código puede tener varias cajas; conservar sufijos. Periférico compatible no significa incluido."]
    if edition["status"] != "resolved":
        lines.append("La ficha de catálogo está pendiente: no usar su antigua región ni su portada como verificación del anuncio.")
        return "\n".join(lines)
    lines.append("Mercado documental del software: " + json.dumps(edition.get("fieldProvenance", {}).get("market", {}), ensure_ascii=False))
    lines.append("Identidad documental: " + json.dumps({k: edition.get(k) for k in ["components", "languages", "editionLabels", "regionalReleaseDate", "sourceWarnings"]}, ensure_ascii=False))
    for finding in edition.get("findings", []):
        lines.append(f"Observación documental: {finding['observation']} {finding['engineRule']}")
    lines.append("Fuentes: " + ", ".join(s["url"] for s in edition["sources"]))
    return "\n".join(lines)
