"""Versionado de cachés de decisiones del ingest de precios."""

from __future__ import annotations

from typing import Any

PRICE_INGEST_POLICY_VERSION = 3


def attach_policy_version(payload: dict[str, Any]) -> dict[str, Any]:
    payload["policyVersion"] = PRICE_INGEST_POLICY_VERSION
    return payload


def cache_policy_matches(payload: dict[str, Any]) -> bool:
    return int(payload.get("policyVersion") or 0) == PRICE_INGEST_POLICY_VERSION


__all__ = [
    "PRICE_INGEST_POLICY_VERSION",
    "attach_policy_version",
    "cache_policy_matches",
]
