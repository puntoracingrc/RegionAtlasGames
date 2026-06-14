"""Normalización de nombres de compañías para deduplicación semi-automática."""

from __future__ import annotations

import html
import re
import unicodedata

LEGAL_SUFFIXES = (
    r"inc\.?",
    r"ltd\.?",
    r"llc\.?",
    r"limited",
    r"corporation",
    r"corp\.?",
    r"\bco\.?",
    r"gmbh",
    r"s\.?a\.?s\.?",
    r"plc",
    r"europe",
    r"international",
    r"japan",
    r"america",
)

JOINT_NAME_RE = re.compile(
    r"(?:,|\s/\s|\s&\s|\sand\s|\s\+\s|\s\|\s|\+)",
    re.IGNORECASE,
)


def decode_entity_text(text: str) -> str:
    return html.unescape(text or "").strip()


def normalize_company_key(name: str) -> str:
    text = decode_entity_text(name).lower()
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    for suffix in LEGAL_SUFFIXES:
        text = re.sub(rf"\b{suffix}\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"\s+", " ", text)


def is_joint_company_name(name: str) -> bool:
    clean = decode_entity_text(name)
    if not clean:
        return False
    if JOINT_NAME_RE.search(clean):
        return True
    if " &amp; " in clean.lower() or "&" in clean:
        return True
    return False


def slugs_share_prefix_cluster(slugs: set[str]) -> bool:
    items = sorted({s for s in slugs if s}, key=len)
    if len(items) <= 1:
        return True
    root = items[0]
    return all(slug == root or slug.startswith(f"{root}-") for slug in items)


def pick_display_name(names: set[str]) -> str:
    scored: list[tuple[int, int, str]] = []
    for name in names:
        clean = decode_entity_text(name)
        if not clean:
            continue
        upper_ratio = sum(1 for c in clean if c.isupper()) / max(len(clean), 1)
        penalty = 2 if clean.isupper() else 0
        penalty += 1 if upper_ratio > 0.8 else 0
        scored.append((penalty, -len(clean), clean))
    if not scored:
        return next(iter(names), "")
    scored.sort()
    return scored[0][2]
