#!/usr/bin/env python3
"""Validate and import the reviewed company-logo package by exact slug."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import shutil
import tempfile
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
COMPANIES_PATH = ROOT / "data" / "index" / "companies.json"
ASSETS_PATH = ROOT / "public" / "company-logos"
REGISTRY_PATH = ROOT / "data" / "company-logo-assets.json"
RESEARCH_PATH = ROOT / "data" / "research" / "company-logos"
EXPECTED_COUNT = 4_326
REQUIRED_COLUMNS = {
    "slug",
    "company_name",
    "logo_file",
    "logo_type",
    "authentic_logo",
    "confidence",
    "requires_manual_review",
    "selected_qid",
    "entity_resolution_method",
    "source_page_url",
    "source_license",
    "source_license_url",
    "source_credit",
    "source_artist",
    "sha256",
}
FORBIDDEN_SVG_TAGS = {"script", "foreignobject", "iframe", "object", "embed"}
EVIDENCE_FILES = {
    "data/company-logo-manifest.csv": "manifest.csv",
    "data/company-logo-import.json": "source-import-map.json",
    "data/company-history-routes.json": "history-routes.json",
    "data/licenses.csv": "licenses.csv",
    "data/validation-report.json": "source-validation-report.json",
    "docs/INSTRUCCIONES-PARA-CODEX.md": "SOURCE-INSTRUCTIONS.md",
    "README.md": "PACKAGE-README.md",
}
PLACEHOLDER_NAME_OVERRIDES = {
    "i-t-linc": "I.T.L Inc.",
    "tranges-libellules": "Étranges Libellules",
    "zo-mode": "Zoë Mode",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_bool(value: str) -> bool:
    return value.strip().upper() == "TRUE"


def safe_package_file(package_root: Path, relative: str) -> Path:
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"Ruta insegura en el manifiesto: {relative}")
    resolved = (package_root / relative_path).resolve()
    if package_root.resolve() not in resolved.parents:
        raise ValueError(f"Ruta fuera del paquete: {relative}")
    if not resolved.is_file():
        raise ValueError(f"No existe el archivo declarado: {relative}")
    return resolved


def validate_svg(path: Path) -> None:
    tree = ET.parse(path)
    for element in tree.iter():
        tag = element.tag.rsplit("}", 1)[-1].lower()
        if tag in FORBIDDEN_SVG_TAGS:
            raise ValueError(f"SVG activo no permitido en {path.name}: <{tag}>")
        for raw_key, raw_value in element.attrib.items():
            key = raw_key.rsplit("}", 1)[-1].lower()
            value = raw_value.strip().lower()
            if key.startswith("on"):
                raise ValueError(f"Evento SVG no permitido en {path.name}: {key}")
            if value.startswith(("javascript:", "data:text/html")):
                raise ValueError(f"URI activa no permitida en {path.name}")
            if key in {"href", "src"} and "://" in value:
                raise ValueError(f"Recurso remoto no permitido en {path.name}: {raw_value}")


def balanced_lines(name: str) -> list[str]:
    normalized = " ".join(html.unescape(name).split())
    if len(normalized) <= 28:
        return [normalized]
    requested_lines = 2 if len(normalized) <= 62 else 3
    width = max(18, math.ceil(len(normalized) / requested_lines))
    lines = textwrap.wrap(
        normalized,
        width=width,
        break_long_words=True,
        break_on_hyphens=False,
        max_lines=requested_lines,
        placeholder="...",
    )
    return lines or [normalized]


def placeholder_svg(name: str, slug: str) -> bytes:
    lines = balanced_lines(name)
    longest = max(len(line) for line in lines)
    maximum = {1: 72, 2: 58, 3: 44}[len(lines)]
    font_size = max(25, min(maximum, int(1_700 / max(longest, 1))))
    line_height = int(font_size * 1.2)
    first_y = 295 - ((len(lines) - 1) * line_height) // 2
    name_lines = "\n".join(
        f'    <tspan x="600" y="{first_y + index * line_height}">{html.escape(line)}</tspan>'
        for index, line in enumerate(lines)
    )
    title = html.escape(html.unescape(name))
    safe_slug = html.escape(slug)
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600" role="img" aria-labelledby="title desc">
  <title id="title">Imagen provisional para {title}</title>
  <desc id="desc">Marcador neutral; no es un logotipo oficial.</desc>
  <rect width="1200" height="600" rx="16" fill="#101827"/>
  <rect x="18" y="18" width="1164" height="564" rx="10" fill="none" stroke="#475569" stroke-width="4"/>
  <text x="600" y="82" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" fill="#94A3B8">REGIONATLAS</text>
  <text text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="{font_size}" font-weight="700" fill="#F8FAFC">
{name_lines}
  </text>
  <text x="600" y="500" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#F59E0B">IMAGEN PROVISIONAL</text>
  <text x="600" y="540" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="18" fill="#94A3B8">LOGO NO DOCUMENTADO · {safe_slug}</text>
</svg>
'''
    return svg.encode("utf-8")


def normalize_raster(source: Path, target: Path) -> None:
    with Image.open(source) as image:
        image.seek(0)
        frame = ImageOps.exif_transpose(image).convert("RGBA")
        frame.thumbnail((1_600, 900), Image.Resampling.LANCZOS)
        frame.save(target, format="WEBP", lossless=True, method=6)


def load_manifest(package_root: Path) -> list[dict[str, str]]:
    manifest_path = package_root / "data" / "company-logo-manifest.csv"
    with manifest_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing_columns = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing_columns:
            raise ValueError(f"Faltan columnas: {', '.join(sorted(missing_columns))}")
        return list(reader)


def validate_package(package_root: Path) -> tuple[list[dict[str, str]], dict[str, dict]]:
    rows = load_manifest(package_root)
    companies = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_COUNT:
        raise ValueError(f"Esperadas {EXPECTED_COUNT} filas; recibidas {len(rows)}")
    slugs = [row["slug"] for row in rows]
    if len(set(slugs)) != len(slugs):
        raise ValueError("El manifiesto contiene slugs duplicados")
    catalog_slugs = set(companies)
    manifest_slugs = set(slugs)
    if catalog_slugs != manifest_slugs:
        missing = sorted(catalog_slugs - manifest_slugs)
        extra = sorted(manifest_slugs - catalog_slugs)
        raise ValueError(f"Los slugs no coinciden. Faltan={missing[:10]} sobran={extra[:10]}")

    import_rows = json.loads((package_root / "data" / "company-logo-import.json").read_text())
    import_by_slug = {row["slug"]: row for row in import_rows}
    if set(import_by_slug) != manifest_slugs:
        raise ValueError("company-logo-import.json no coincide con el manifiesto")

    for row in rows:
        source = safe_package_file(package_root, row["logo_file"])
        if sha256(source) != row["sha256"]:
            raise ValueError(f"Checksum incorrecto: {row['logo_file']}")
        if source.suffix.lower() == ".svg":
            validate_svg(source)
        else:
            with Image.open(source) as image:
                image.verify()
        minimal = import_by_slug[row["slug"]]
        if minimal["logoPath"] != row["logo_file"]:
            raise ValueError(f"Ruta contradictoria para {row['slug']}")
        if bool(minimal["authentic"]) != parse_bool(row["authentic_logo"]):
            raise ValueError(f"Autenticidad contradictoria para {row['slug']}")
        is_composite = "COMPOSITE_CREDIT" in row["entity_resolution_method"]
        if is_composite and parse_bool(row["authentic_logo"]):
            raise ValueError(f"Un crédito compuesto recibió logo auténtico: {row['slug']}")

    return rows, companies


def import_package(package_root: Path) -> dict[str, object]:
    rows, companies = validate_package(package_root)
    authentic = sum(parse_bool(row["authentic_logo"]) for row in rows)
    placeholders = len(rows) - authentic

    with tempfile.TemporaryDirectory(prefix="regionatlas-company-logos-") as temporary:
        staging = Path(temporary) / "company-logos"
        staging.mkdir()
        registry: dict[str, dict] = {}
        output_checksums: dict[str, str] = {}

        for row in rows:
            slug = row["slug"]
            source = safe_package_file(package_root, row["logo_file"])
            is_authentic = parse_bool(row["authentic_logo"])
            is_placeholder = row["logo_type"] == "PLACEHOLDER_GENERADO"
            output_suffix = ".svg" if source.suffix.lower() == ".svg" else ".webp"
            output_name = f"{slug}{output_suffix}"
            output = staging / output_name

            if is_placeholder:
                display_name = PLACEHOLDER_NAME_OVERRIDES.get(slug, companies[slug]["name"])
                output.write_bytes(placeholder_svg(display_name, slug))
            elif source.suffix.lower() == ".svg":
                shutil.copyfile(source, output)
            else:
                normalize_raster(source, output)

            registry[slug] = {
                "logoUrl": f"/company-logos/{output_name}",
                "logoType": row["logo_type"],
                "authentic": is_authentic,
                "provisional": not is_authentic,
                "requiresManualReview": parse_bool(row["requires_manual_review"]),
                "compositeCredit": "COMPOSITE_CREDIT" in row["entity_resolution_method"],
            }
            output_checksums[slug] = sha256(output)

        if ASSETS_PATH.exists():
            shutil.rmtree(ASSETS_PATH)
        shutil.copytree(staging, ASSETS_PATH)

    REGISTRY_PATH.write_text(
        json.dumps(dict(sorted(registry.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    RESEARCH_PATH.mkdir(parents=True, exist_ok=True)
    for source_rel, target_name in EVIDENCE_FILES.items():
        shutil.copyfile(package_root / source_rel, RESEARCH_PATH / target_name)
    (RESEARCH_PATH / "output-checksums.json").write_text(
        json.dumps(dict(sorted(output_checksums.items())), indent=2) + "\n",
        encoding="utf-8",
    )

    report = {
        "status": "PASS",
        "matching": "EXACT_SLUG_ONLY",
        "companies": len(rows),
        "authenticLogos": authentic,
        "provisionalImages": placeholders,
        "compositeCreditsKeptProvisional": sum(
            "COMPOSITE_CREDIT" in row["entity_resolution_method"] for row in rows
        ),
        "missingFiles": 0,
        "fuzzyAssignments": 0,
    }
    (RESEARCH_PATH / "import-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package_root", type=Path)
    parser.add_argument("--apply", action="store_true", help="Escribe assets, registro y evidencia")
    args = parser.parse_args()
    package_root = args.package_root.expanduser().resolve()
    rows, _ = validate_package(package_root)
    print(f"Validación: {len(rows)} slugs exactos, cero coincidencias difusas")
    if not args.apply:
        print("Dry-run completado; usa --apply para importar")
        return
    print(json.dumps(import_package(package_root), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
