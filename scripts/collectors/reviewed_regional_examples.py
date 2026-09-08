"""Versioned, user-authorized observations; never a substitute for a new listing."""

from functools import lru_cache
import json
from pathlib import Path

REVIEWED_FILE = Path(__file__).resolve().parents[2] / "data/region-research/gameboy-reviewed-listings.json"


@lru_cache(maxsize=4)
def _read(path, mtime):
    del mtime
    return json.loads(Path(path).read_text(encoding="utf-8"))


def reviewed_batch():
    if not REVIEWED_FILE.exists():
        return {}
    return _read(str(REVIEWED_FILE), REVIEWED_FILE.stat().st_mtime_ns)


def same_reviewed_regional_family(left_id, right_id):
    return any(left_id in group and right_id in group
               for group in reviewed_batch().get("regionalFamilies", []))


def reviewed_examples(catalog_id):
    approved, rejected = [], []
    for row in reviewed_batch().get("reviews", []):
        previous_id = row["originalRow"].get("searchedCatalogId") or row["originalRow"].get("catalogId")
        same_target = row.get("targetCatalogId") == catalog_id
        # A resolved sequel is a negative example for the original, not an alias.
        wrong_game = (row["ebayId"] == "800612078639" and catalog_id == "gameboy-es-super-mario-land")
        is_reject = (row["action"] == "reject" and previous_id == catalog_id) or wrong_game
        if not ((same_target and row["action"] == "accept") or is_reject):
            continue
        pieces = "; ".join(
            f"{piece['component']}: {', '.join(piece['codes'])}; idiomas impresos {', '.join(piece['languages'])}; {piece['text']}"
            for piece in row["observations"]
        )
        example = {
            "region": row.get("region"), "regionEvidence": ["user_authorized_visual_review"],
            "note": f"{row['title']}. {pieces}. {row['finding']} {row['doNotInfer']} Idioma jugable no verificado.",
            "imageUrls": row["imagesReviewed"], "decidedAt": row["reviewedAt"],
            "sourceUrl": row["listingUrl"], "externalId": f"v1|{row['ebayId']}|0",
            "associationStatus": "observed_listing_not_factory_certified",
        }
        if is_reject:
            example["reasonCode"] = "wrong_game" if wrong_game else "non_game"
            rejected.append(example)
        else:
            approved.append(example)
    return approved, rejected
