# Listing Evidence Acquisition V2 closure

- Base HEAD: `9882d6e2c31e7f862ebff5783061ec2e2f12e1b6`
- Validation HEAD: `3a343eeb265c5b67498d623e8678a5fb7ace44a2`
- Cases: 20
- Cost: $0.430392
- OpenAI calls: 56
- Decisions: ACCEPT_EXISTING=2, REROUTE_EXISTING=1, REJECT=2, DEFER=15, PROPOSE_NEW_VARIANT=0, NEEDS_HUMAN=0
- Holdout: 2/5 exact; false accepts=0

## Per case

| Case | Platform | Source photos | Preserved | Original | Components | Market | Condition | Worker | First pass | Deep/final | Holdout |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|
| ps5-biomutant | ps5 | 3 | 3 | 3 | 3 | UNBOUND | sealed | DEFER | DEFER | DEFER | — |
| ps4-hoa | ps4 | 7 | 7 | 7 | 1 | UNBOUND | unknown | DEFER | DEFER | DEFER | — |
| ps5-hoa | ps5 | 7 | 7 | 7 | 1 | UNBOUND | unknown | DEFER | DEFER | DEFER | — |
| ps4-horizon-zero-dawn | ps4 | 3 | 3 | 3 | 2 | LANGUAGE_ONLY | unknown | DEFER | DEFER | DEFER | — |
| gameboy-74f1b486ba2398b1d771 | gameboy | 3 | 3 | 3 | 0 | UNBOUND | unknown | REJECT | REJECT | REJECT | REJECT |
| n64-super-mario-64 | n64 | 14 | 14 | 14 | 8 | MARKET_BOUND | complete | DEFER | DEFER | DEFER | — |
| gameboy-3e5cf57f4a78743f4a89 | gameboy | 3 | 3 | 3 | 3 | UNBOUND | loose | DEFER | DEFER | DEFER | REROUTE_EXISTING |
| ps4-horizon-forbidden-west | ps4 | 6 | 6 | 6 | 6 | UNBOUND | complete | DEFER | DEFER | DEFER | — |
| n64-diddy-kong-racing | n64 | 8 | 8 | 8 | 8 | MARKET_BOUND | unknown | DEFER | DEFER | DEFER | — |
| ps5-ikai | ps5 | 12 | 12 | 12 | 1 | UNBOUND | unknown | DEFER | DEFER | DEFER | — |
| ps4-god-eater-3 | ps4 | 4 | 4 | 4 | 2 | UNBOUND | loose | DEFER | DEFER | DEFER | — |
| ps5-tales-of-arise | ps5 | 3 | 3 | 3 | 3 | LANGUAGE_ONLY | unknown | DEFER | DEFER | DEFER | — |
| n64-pokemon-snap | n64 | 3 | 3 | 3 | 3 | MARKET_BOUND | loose | DEFER | ACCEPT_EXISTING | ACCEPT_EXISTING | — |
| ps4-gran-turismo-7 | ps4 | 12 | 12 | 12 | 1 | UNBOUND | unknown | DEFER | DEFER | DEFER | — |
| gameboy-d7f572a1f0c11eea4e20 | gameboy | 3 | 3 | 3 | 2 | MARKET_BOUND | unknown | DEFER | DEFER | DEFER | REROUTE_EXISTING |
| gameboy-2e7645bc3a0305d6661c | gameboy | 7 | 7 | 7 | 7 | LANGUAGE_ONLY | unknown | DEFER | DEFER | DEFER | REROUTE_EXISTING |
| ps5-bramble-the-mountain-king | ps5 | 6 | 6 | 6 | 1 | UNBOUND | unknown | DEFER | DEFER | DEFER | — |
| n64-mario-kart-64 | n64 | 4 | 4 | 4 | 0 | UNBOUND | unknown | DEFER | REJECT | REJECT | — |
| n64-mario-party | n64 | 14 | 14 | 14 | 12 | MARKET_BOUND | complete | DEFER | ACCEPT_EXISTING | ACCEPT_EXISTING | — |
| gameboy-2a15931917249023d109 | gameboy | 4 | 4 | 4 | 4 | MARKET_BOUND | loose | DEFER | REROUTE_EXISTING | REROUTE_EXISTING | REROUTE_EXISTING |

## Platform gate

| Platform | Original gallery | Component classification | Component binding | Market binding | Condition |
|---|---|---|---|---|---|
| ps4 | PASS | PASS | PASS | FAIL | PASS |
| n64 | PASS | PASS | PASS | PASS | PASS |
| ps5 | PASS | PASS | PASS | FAIL | PASS |
| gameboy | PASS | PASS | PASS | PASS | PASS |

## Final gate

LISTING EVIDENCE ACQUISITION: READY
ORIGINAL IMAGE ACQUISITION: READY
COMPONENT CLASSIFICATION: READY
COMPONENT BINDING: READY
MARKET BINDING: NOT READY
CONDITION RESOLUTION: READY

DEEP CURATOR WITH PHYSICAL LISTING EVIDENCE: NOT READY

No catalog, price or authoritative queue mutations were performed. Listing photographs remain internal evidence references and were not added as public RegionAtlas assets.
