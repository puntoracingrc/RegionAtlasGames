"""Compat: re-export fase 2 entity resolver."""

from company_entity import (
    build_company_entity_registry,
    canonicalize_entity,
    get_company_entity,
    resolve_canonical_company,
    resolve_canonical_company_slug,
    save_company_entity_registry,
)

__all__ = [
    "build_company_entity_registry",
    "canonicalize_entity",
    "get_company_entity",
    "resolve_canonical_company",
    "resolve_canonical_company_slug",
    "save_company_entity_registry",
]
