#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pc_sftp_worker
from collectors.catalog_match import CatalogMatchResult
from collectors.price_review_queue import _reason as review_reason
from collectors.price_review_queue import _row_to_item
from collectors.price_review_queue import merge_price_review_queue_documents
from collectors.reference_match import extract_references_from_text, is_valid_gtin
from collectors.tcns_match import (
    canonical_tcns_title as canonical_tcns_match_title,
    infer_tcns_region_product,
    match_tcns_product,
    tcns_display_title,
    tcns_is_game_key_card,
    tcns_listing_metadata,
    tcns_region_suffix_code,
)
from collectors.tcns_policy import (
    POLICY_VERSION,
    canonical_tcns_title,
    tcns_auto_match_decision,
    tcns_row_is_auto_approved,
)
from collectors.tcns_review_triage import (
    approved_tcns_ingest_row,
    build_tcns_triage_index,
    triage_tcns_product,
)
from sync_es_prices import apply_tcns_row, collect_condition_observations
from daily_price_ingest import LIST_KEYS
from pc_sftp_worker import upload_price_review_queue_verified


def game(**overrides):
    return {
        "id": "ps4-life-is-strange-2",
        "title": "Life is Strange 2",
        "platformSlug": "ps4",
        "region": "PAL España",
        **overrides,
    }


def product(**overrides):
    return {
        "title": "Life Is Strange 2 PS4 (SP)",
        "priceEur": 11.95,
        "conditionRaw": "Segunda mano",
        "productUrl": "https://www.todoconsolas.com/juegos-ps4/1-life-is-strange-2-5021290082134.html",
        **overrides,
    }


def result(target=None, **overrides):
    return CatalogMatchResult(
        game=target or game(),
        match_method="title",
        match_score=0.714,
        margin=0.714,
        **overrides,
    )


def approved_row(**overrides):
    return {
        "catalogId": "ps4-life-is-strange-2",
        "source": "todoconsolas",
        "title": "Life Is Strange 2 PS4 (SP)",
        "priceEur": 11.95,
        "retailPriceEur": 11.95,
        "condition": "preowned",
        "listingRegion": "PAL España",
        "regionVerified": True,
        "regionEvidence": ["listing_title_region", "catalog_title_exact"],
        "matchMethod": "title",
        "matchScore": 0.714,
        "matchMargin": 0.714,
        "autoApproved": True,
        "acceptancePolicy": POLICY_VERSION,
        **overrides,
    }


def main() -> None:
    assert "regionalCandidates" in LIST_KEYS
    assert canonical_tcns_title("Life Is Strange 2 PS4 (SP)", "ps4") == "life is strange 2"
    assert canonical_tcns_title("Life Is Strange 2 PS4 (ES)", "ps4") == "life is strange 2"
    assert infer_tcns_region_product(product(title="Life Is Strange 2 PS4 (ES)")) == "PAL España"
    assert canonical_tcns_title("Life is Strange 2", "ps4") == "life is strange 2"
    key_card_title = "Final Fantasy VII Remake Intergrade KC Switch 2 (SP)"
    assert tcns_display_title(key_card_title, "switch2") == "Final Fantasy VII Remake Intergrade"
    assert canonical_tcns_match_title(key_card_title, "switch2") == "final fantasy vii remake intergrade"
    assert tcns_is_game_key_card(key_card_title, "switch2") is True
    assert tcns_region_suffix_code(key_card_title) == "SP"
    assert infer_tcns_region_product(product(title=key_card_title)) == "PAL España"
    assert tcns_listing_metadata(key_card_title, "switch2") == {
        "displayTitle": "Final Fantasy VII Remake Intergrade",
        "sourceRegionCode": "SP",
        "sourceRegionLabel": "PAL España",
        "gameKeyCard": True,
        "fullySpanishVersion": True,
    }
    assert tcns_display_title("KC Returns PS5 (SP)", "ps5") == "KC Returns"
    assert tcns_is_game_key_card("KC Returns PS5 (SP)", "ps5") is False
    assert canonical_tcns_match_title("Astro Bot PS5 (PS)", "ps5") == "astro bot"
    assert infer_tcns_region_product(product(title="Astro Bot PS5 (PS)")) == "PAL España"
    assert infer_tcns_region_product(product(title="Astro Bot PS5 (ESP)")) == "PAL España"
    assert tcns_listing_metadata("Astro Bot PS5 (PS)", "ps5")["fullySpanishVersion"] is True
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (EU)")) == "PAL Europa"
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (FR)")) == "PAL Francia"
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (IT)")) == "PAL Italia"
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (PL)")) == "PAL Portugal"
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (AS)")) == "Asia"
    assert infer_tcns_region_product(product(title="Metaphor ReFantazio PS5 (JAP)")) == "Japón"
    assert canonical_tcns_match_title("Metaphor ReFantazio PS5 (PL)", "ps5") == "metaphor refantazio"
    assert is_valid_gtin("8436016711890") is True
    assert is_valid_gtin("8436016711891") is False
    assert extract_references_from_text("EAN 8436016711890") == {"8436016711890"}

    switch2_game = {
        "id": "switch2-final-fantasy-vii-remake-intergrade",
        "title": "Final Fantasy VII Remake Intergrade",
        "platformSlug": "switch2",
        "region": "PAL España",
    }
    switch2_product = product(title=key_card_title, priceEur=34.95)
    switch2_match = match_tcns_product(switch2_product, [switch2_game], "switch2")
    assert switch2_match.game and switch2_match.game["id"] == switch2_game["id"]
    assert switch2_match.match_score == 1.0
    switch2_index = build_tcns_triage_index([switch2_game], {})
    switch2_decision = triage_tcns_product(switch2_product, "switch2", switch2_index)
    assert switch2_decision.bucket == "safe_exact"
    switch2_row = approved_tcns_ingest_row(
        switch2_product,
        switch2_decision,
        switch2_index,
        "2026-08-29T10:00:00Z",
    )
    assert switch2_row["gameKeyCard"] is True
    assert switch2_row["sourceRegionCode"] == "SP"
    assert switch2_row["sourceRegionLabel"] == "PAL España"
    assert switch2_row["fullySpanishVersion"] is True
    assert switch2_row["displayTitle"] == "Final Fantasy VII Remake Intergrade"
    assert "tcns_suffix_sp" in switch2_row["regionEvidence"]
    switch2_queue_item = _row_to_item(
        {
            **switch2_row,
            "autoApproved": False,
            "regionReviewNeeded": True,
            "regionReviewReason": "catalog_match_not_unique",
        },
        "todoconsolas",
        "switch2",
        {"region": "PAL España"},
    )
    assert switch2_queue_item is not None
    assert switch2_queue_item["evidence"]["gameKeyCard"] is True
    assert switch2_queue_item["evidence"]["sourceRegionCode"] == "SP"
    assert switch2_queue_item["evidence"]["sourceRegionLabel"] == "PAL España"
    assert switch2_queue_item["evidence"]["fullySpanishVersion"] is True
    assert switch2_queue_item["evidence"]["displayTitle"] == "Final Fantasy VII Remake Intergrade"

    asian_game = {
        "id": "ps5-metaphor-refantazio-asia",
        "title": "Metaphor ReFantazio",
        "platformSlug": "ps5",
        "region": "Asia",
    }
    asian_index = build_tcns_triage_index([asian_game], {})
    assert triage_tcns_product(
        product(title="Metaphor ReFantazio PS5 (AS)"),
        "ps5",
        asian_index,
    ).bucket == "safe_exact"
    european_game = {**asian_game, "id": "ps5-metaphor-refantazio-eu", "region": "PAL Europa"}
    european_index = build_tcns_triage_index([european_game], {})
    assert triage_tcns_product(
        product(title="Metaphor ReFantazio PS5 (IT)"),
        "ps5",
        european_index,
    ).bucket == "regional_variant"

    title_match = match_tcns_product(product(), [game()], "ps4")
    assert title_match.game and title_match.game["id"] == game()["id"]
    assert title_match.match_method == "title"
    assert title_match.match_score == 1.0

    ean_match = match_tcns_product(
        product(_referenceText="8436016711890"),
        [game(title="Título localizado distinto")],
        "ps4",
        ref_to_ids={"8436016711890": [game()["id"]]},
    )
    assert ean_match.game and ean_match.game["id"] == game()["id"]
    assert ean_match.match_method == "reference"
    assert ean_match.matched_reference == "8436016711890"

    conflicting_eans = match_tcns_product(
        product(title="Nombre comercial sin coincidencia PS4 (SP)", _referenceText="8436016711890 4006381333931"),
        [
            game(id="ps4-ean-a", title="Título A"),
            game(id="ps4-ean-b", title="Título B"),
        ],
        "ps4",
        ref_to_ids={
            "8436016711890": ["ps4-ean-a"],
            "4006381333931": ["ps4-ean-b"],
        },
    )
    assert conflicting_eans.match_method != "reference"

    triage_index = build_tcns_triage_index(
        [
            game(),
            game(id="ps4-life-is-strange-2-eu", region="PAL Europa"),
            game(id="ps4-duplicado", title="Juego Duplicado"),
            game(id="ps4-duplicado-2", title="Juego Duplicado"),
            game(id="ps4-ean-only", title="Título de catálogo distinto"),
        ],
        {"ps4-ean-only": {"ean": "8436016711890"}},
    )
    exact_decision = triage_tcns_product(product(), "ps4", triage_index)
    assert exact_decision.bucket == "safe_exact"
    assert exact_decision.catalog_id == game()["id"]
    assert exact_decision.match_method == "title"

    ean_decision = triage_tcns_product(
        product(
            title="Nombre comercial PS4 (SP)",
            productUrl="https://www.todoconsolas.com/juego-8436016711890.html",
        ),
        "ps4",
        triage_index,
    )
    assert ean_decision.bucket == "safe_exact"
    assert ean_decision.catalog_id == "ps4-ean-only"
    assert ean_decision.match_method == "reference"

    assert triage_tcns_product(
        product(title="Life Is Strange 2 PS4 (JP)"), "ps4", triage_index
    ).bucket == "regional_variant"
    assert triage_tcns_product(
        product(title="Juego sin ficha PS4 (SP)"), "ps4", triage_index
    ).bucket == "catalog_gap"
    assert triage_tcns_product(
        product(title="Juego Duplicado PS4 (SP)"), "ps4", triage_index
    ).bucket == "manual_match"
    assert triage_tcns_product(
        product(priceEur=1.0), "ps4", triage_index
    ).bucket == "price_anomaly"

    ok, reason = tcns_auto_match_decision(product(), result(), "ps4")
    assert ok is True
    assert reason == POLICY_VERSION

    ok, reason = tcns_auto_match_decision(
        product(title="Life Is Strange 2 PS4 (EU)"),
        result(),
        "ps4",
    )
    assert ok is False
    assert reason == "catalog_region_not_exact"

    ok, reason = tcns_auto_match_decision(
        product(title="Life Is Strange 2 Collector Edition PS4 (SP)"),
        result(),
        "ps4",
    )
    assert ok is False
    assert reason == "catalog_title_not_exact"

    changed_game = game(tcnsRetailPrice=10.0)
    ok, reason = tcns_auto_match_decision(product(priceEur=30.0), result(changed_game), "ps4")
    assert ok is False
    assert reason == "price_change_requires_review"

    target = game()
    row = approved_row()
    assert review_reason(row) is None
    assert tcns_row_is_auto_approved(row, target) is True
    assert apply_tcns_row(target, row, "2026-08-29T10:00:00Z") is True
    assert target["tcnsRetailPrice"] == 11.95

    observations = collect_condition_observations(
        target["id"],
        target["region"],
        "ps4",
        grouped={},
        cex_by_id={},
        jgo_by_id={},
        chollo_by_id={},
        kaoto_by_id={},
        tcns_by_id={target["id"]: {**row, "conditionRaw": "Segunda mano"}},
        tc_by_id={},
        catalog_game=target,
        use_vision=False,
    )
    assert observations == []

    merged_queue = merge_price_review_queue_documents(
        {
            "items": [
                {"id": "decided", "status": "accepted", "listingTitle": "Anterior"},
                {"id": "remote-only", "status": "pending", "listingTitle": "Remoto"},
            ],
            "decisions": [{"id": "decision-1"}],
        },
        {
            "items": [
                {"id": "decided", "status": "pending", "listingTitle": "No sobrescribir"},
                {"id": "local-only", "status": "pending", "listingTitle": "Nuevo"},
            ],
            "decisions": [],
        },
    )
    queue_by_id = {item["id"]: item for item in merged_queue["items"]}
    assert set(queue_by_id) == {"decided", "remote-only", "local-only"}
    assert queue_by_id["decided"]["status"] == "accepted"

    large_queue = merge_price_review_queue_documents(
        {"items": [{"id": f"remote-{index}", "status": "pending"} for index in range(800)]},
        {"items": [{"id": f"local-{index}", "status": "pending"} for index in range(500)]},
    )
    assert len(large_queue["items"]) == 1300

    rejected_target = game()
    assert apply_tcns_row(rejected_target, {**row, "autoApproved": False}, "test") is False
    assert "tcnsRetailPrice" not in rejected_target

    class FakeQueue:
        payload = {"items": [{"id": "remote-review", "status": "pending"}], "decisions": []}

        def remote(self, *parts):
            return "/".join(parts)

        def upload_file(self, _remote, local_path):
            self.payload = json.loads(local_path.read_text(encoding="utf-8"))

        def exists(self, _remote):
            return True

        def read_json(self, _remote):
            return self.payload

    original_root = pc_sftp_worker.ROOT
    with tempfile.TemporaryDirectory() as tmp:
        pc_sftp_worker.ROOT = Path(tmp)
        review_file = Path(tmp) / "data" / "admin" / "price-review-queue.json"
        review_file.parent.mkdir(parents=True)
        review_file.write_text(json.dumps({"items": [{"id": "review-1"}]}), encoding="utf-8")
        try:
            assert upload_price_review_queue_verified(FakeQueue()) == 2
        finally:
            pc_sftp_worker.ROOT = original_root
    print("OK TodoConsolas exact price policy")


if __name__ == "__main__":
    main()
