#!/usr/bin/env python3
"""Audita entidades HTML/URL escapadas en campos delicados del catálogo."""

from __future__ import annotations

import html
import json
import re
import argparse
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "data" / "catalog.json"
DETAILS_FILE = ROOT / "data" / "game-details.json"
PRICE_REVIEW_FILE = ROOT / "data" / "admin" / "price-review-queue.json"
REPORT_FILE = ROOT / "data" / "admin" / "catalog-html-entity-audit.json"

HTML_ENTITY_RE = re.compile(r"&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);")
URL_ESCAPE_RE = re.compile(r"%[0-9a-fA-F]{2}")

TEXT_FIELDS = {
    "title",
    "titlePc",
    "name",
    "description",
    "reference",
}

CATALOG_CRITICAL_FIELDS = {
    "id",
    "slug",
    "pcPath",
    "coverUrl",
}

REVIEW_CRITICAL_FIELDS = {
    "catalogId",
    "candidateCatalogId",
    "matchedCatalogId",
    "resolvedCatalogId",
}

IDENTIFIER_FIELDS = {
    "id",
    "slug",
    "$key",
    "catalogId",
    "candidateCatalogId",
    "matchedCatalogId",
    "resolvedCatalogId",
}

SOURCE_PATH_FIELDS = {"pcPath", "coverUrl", "museumPath"}


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def decode_repeated(value: str) -> str:
    current = value
    for _ in range(5):
        decoded = html.unescape(unquote(current))
        if decoded == current:
            break
        current = decoded
    return current


def slugify(value: str) -> str:
    value = decode_repeated(value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "juego"


def has_encoded_noise(value: str) -> bool:
    return bool(HTML_ENTITY_RE.search(value) or URL_ESCAPE_RE.search(value))


def issue_kind(value: str) -> str:
    parts: list[str] = []
    if HTML_ENTITY_RE.search(value):
        parts.append("html_entity")
    if URL_ESCAPE_RE.search(value):
        parts.append("url_escape")
    return "+".join(parts) or "encoded"


def decision_for_issue(issue: dict[str, Any]) -> str:
    if issue.get("suggestedIdExists") and issue.get("suggestedId") != issue.get("value"):
        return "manual_collision"
    field = re.sub(r"\[\d+\]", "", str(issue.get("field") or "")).rsplit(".", 1)[-1]
    if field in IDENTIFIER_FIELDS:
        return "preserve_identifier"
    if field in SOURCE_PATH_FIELDS:
        return "preserve_source_path"
    if field in TEXT_FIELDS or issue.get("severity") == "text":
        return "runtime_decode"
    return "manual_review"


def add_issue(
    issues: list[dict[str, Any]],
    *,
    source: str,
    record_id: str,
    field: str,
    value: str,
    severity: str,
    kind: str,
    platform_slug: str | None = None,
    title: str | None = None,
    catalog_ids: set[str] | None = None,
) -> None:
    decoded = decode_repeated(value)
    issue: dict[str, Any] = {
        "source": source,
        "severity": severity,
        "kind": kind,
        "recordId": record_id,
        "field": field,
        "value": value,
        "decodedValue": decoded,
    }
    if title:
        issue["title"] = decode_repeated(title)
    field_tail = field.rsplit(".", 1)[-1]
    if platform_slug and (
        field in {"$key", "id", "slug"}
        or field_tail in {"catalogId", "candidateCatalogId", "matchedCatalogId", "resolvedCatalogId"}
    ):
        raw_slug = decoded
        prefix = f"{platform_slug}-"
        if raw_slug.startswith(prefix):
            raw_slug = raw_slug[len(prefix) :]
        clean_slug = slugify(raw_slug)
        suggested_id = f"{platform_slug}-{clean_slug}"
        issue["suggestedSlug"] = clean_slug
        issue["suggestedId"] = suggested_id
        if catalog_ids is not None and suggested_id != value:
            issue["suggestedIdExists"] = suggested_id in catalog_ids
    issues.append(issue)


def scan_catalog(catalog: list[dict[str, Any]], catalog_ids: set[str]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for game in catalog:
        record_id = str(game.get("id") or "?")
        platform_slug = str(game.get("platformSlug") or "")
        title = str(game.get("title") or "")
        for field, raw in game.items():
            if not isinstance(raw, str) or not has_encoded_noise(raw):
                continue
            if field in CATALOG_CRITICAL_FIELDS:
                if field in {"pcPath", "coverUrl"} and not HTML_ENTITY_RE.search(raw):
                    continue
                add_issue(
                    issues,
                    source="catalog",
                    record_id=record_id,
                    field=field,
                    value=raw,
                    severity="critical" if field in {"id", "slug"} else "warning",
                    kind=issue_kind(raw),
                    platform_slug=platform_slug,
                    title=title,
                    catalog_ids=catalog_ids,
                )
            elif field in TEXT_FIELDS:
                add_issue(
                    issues,
                    source="catalog",
                    record_id=record_id,
                    field=field,
                    value=raw,
                    severity="text",
                    kind=issue_kind(raw),
                    platform_slug=platform_slug,
                    title=title,
                    catalog_ids=catalog_ids,
                )
    return issues


def scan_details(details: dict[str, Any], catalog_ids: set[str]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for key, detail in details.items():
        if isinstance(key, str) and has_encoded_noise(key):
            platform_slug = key.split("-", 1)[0] if "-" in key else None
            add_issue(
                issues,
                source="game-details",
                record_id=key,
                field="$key",
                value=key,
                severity="critical",
                kind=issue_kind(key),
                platform_slug=platform_slug,
                catalog_ids=catalog_ids,
            )
        if not isinstance(detail, dict):
            continue
        for field in ("description", "reference"):
            raw = detail.get(field)
            if isinstance(raw, str) and has_encoded_noise(raw):
                add_issue(
                    issues,
                    source="game-details",
                    record_id=key,
                    field=field,
                    value=raw,
                    severity="text",
                    kind=issue_kind(raw),
                    catalog_ids=catalog_ids,
                )
    return issues


def walk_review_item(
    issues: list[dict[str, Any]],
    value: Any,
    *,
    path: str,
    record_id: str,
    platform_slug: str | None,
    catalog_ids: set[str],
) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            walk_review_item(
                issues,
                child,
                path=f"{path}.{key}" if path else key,
                record_id=record_id,
                platform_slug=platform_slug,
                catalog_ids=catalog_ids,
            )
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            walk_review_item(
                issues,
                child,
                path=f"{path}[{index}]",
                record_id=record_id,
                platform_slug=platform_slug,
                catalog_ids=catalog_ids,
            )
        return
    if not isinstance(value, str) or not has_encoded_noise(value):
        return
    field_name = path.rsplit(".", 1)[-1]
    is_critical = field_name in REVIEW_CRITICAL_FIELDS or field_name == "catalogId"
    add_issue(
        issues,
        source="price-review-queue",
        record_id=record_id,
        field=path,
        value=value,
        severity="critical" if is_critical else "text",
        kind=issue_kind(value),
        platform_slug=platform_slug,
        catalog_ids=catalog_ids,
    )


def scan_price_reviews(queue: dict[str, Any], catalog_ids: set[str]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    items = queue.get("items") if isinstance(queue, dict) else []
    if not isinstance(items, list):
        return issues
    for item in items:
        if not isinstance(item, dict):
            continue
        record_id = str(item.get("id") or "?")
        platform_slug = item.get("platformSlug")
        walk_review_item(
            issues,
            item,
            path="",
            record_id=record_id,
            platform_slug=str(platform_slug) if platform_slug else None,
            catalog_ids=catalog_ids,
        )
    return issues


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default=str(CATALOG_FILE), help="Ruta de catalog.json a auditar")
    parser.add_argument("--details", default=str(DETAILS_FILE), help="Ruta de game-details.json a auditar")
    parser.add_argument("--price-review", default=str(PRICE_REVIEW_FILE), help="Ruta de price-review-queue.json")
    parser.add_argument("--output", default=str(REPORT_FILE), help="Ruta donde escribir el informe JSON")
    args = parser.parse_args()

    catalog_path = Path(args.catalog)
    details_path = Path(args.details)
    price_review_path = Path(args.price_review)
    report_path = Path(args.output)

    catalog = load_json(catalog_path, [])
    details = load_json(details_path, {})
    queue = load_json(price_review_path, {})
    catalog_ids = {str(game.get("id")) for game in catalog if isinstance(game, dict) and game.get("id")}

    issues = []
    issues.extend(scan_catalog(catalog, catalog_ids))
    issues.extend(scan_details(details, catalog_ids))
    issues.extend(scan_price_reviews(queue, catalog_ids))
    for issue in issues:
        issue["decision"] = decision_for_issue(issue)

    counts = Counter((issue["source"], issue["severity"], issue["kind"]) for issue in issues)
    by_source = Counter(issue["source"] for issue in issues)
    by_severity = Counter(issue["severity"] for issue in issues)
    by_decision = Counter(issue["decision"] for issue in issues)
    unique_records = {f"{issue['source']}:{issue['recordId']}" for issue in issues}
    unique_catalog_records = {
        issue["recordId"] for issue in issues if issue["source"] == "catalog"
    }

    report = {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "summary": {
            "totalIssues": len(issues),
            "totalRecords": len(unique_records),
            "catalogRecords": len(unique_catalog_records),
            "bySource": dict(sorted(by_source.items())),
            "bySeverity": dict(sorted(by_severity.items())),
            "byDecision": dict(sorted(by_decision.items())),
            "bySourceSeverityKind": {
                "|".join(key): count for key, count in sorted(counts.items())
            },
        },
        "examples": issues[:50],
        "issues": issues,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    try:
        report_label = str(report_path.relative_to(ROOT))
    except ValueError:
        report_label = str(report_path)
    print(f"Informe escrito: {report_label}")
    print(f"Total incidencias: {len(issues)}")
    for source, count in sorted(by_source.items()):
        print(f"- {source}: {count}")
    for severity, count in sorted(by_severity.items()):
        print(f"- {severity}: {count}")
    if issues:
        print("\nPrimeros ejemplos:")
        for issue in issues[:10]:
            suggestion = f" -> {issue.get('suggestedId')}" if issue.get("suggestedId") else ""
            print(f"- [{issue['severity']}] {issue['source']} {issue['recordId']} {issue['field']}{suggestion}")


if __name__ == "__main__":
    main()
