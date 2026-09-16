# Review Curator holdout report

- Run: `curator-mu467zfo`
- Cases: 11
- Queue version: `2026-09-09T17:51:46Z`
- Brave requests: 0
- OpenAI calls: 0
- Total cost: $0.000000
- Catalog mutations: 0
- Price mutations: 0
- Authoritative queue mutations: 0

## Decisions

- ACCEPT_EXISTING: 0
- REROUTE_EXISTING: 0
- REJECT: 3
- DEFER: 8
- PROPOSE_NEW_VARIANT: 0
- NEEDS_HUMAN: 0

## Holdout

- Cases: 11
- Reconstructable pre-decision evidence: false
- Accuracy including defers: 27.3%
- Reject precision: 100.0%
- Defer rate: 72.7%
- Critical false accepts: 0
- Limitation: Historical rows retain post-review catalog fields; decisions and human notes were blinded, but a true pre-decision snapshot is unavailable.

## Cases

| Review item | Platform | Listing | Original reason | Proposed decision | Original catalog | Resolved catalog | Region | Edition | Condition | Reused evidence | New evidence | Brave | Vision | Cost | Confidence | Remaining gaps |
|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|---|
| 76231edf85c2a7beca2e | gameboy | MONSTER MAX NINTENDO GAME BOY FRIDGE MAGNET IMAN NEVERA | estado_desconocido | REJECT | gameboy-monster-max | — | PAL Europa | — | unknown | candidate_identity, platform_candidate |  | 0 | 0 | $0.000000 | 0.99 | MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING |
| 4bf4e0b7299441413507 | gameboy | Manual Super Mario Land 2 6 Golden Coins Nintendo Gameboy Game Boy Dmg-Mq-Fah-1 | non_game | REJECT | gameboy-es-super-mario-land-2 | — | PAL España | — | game_manual | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.99 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 2a6afc6eda62de70cc2e | gameboy | GAME BOY Super Hunchback. Starring Quasimodo. PAL UKV. Como Nuevo | estado_desconocido | DEFER | gameboy-uk-super-hunchback | — | PAL UK/ENG | — | complete | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 6c35ef46ae7b1c1a62ae | gameboy | Nintendo Game Boy Tetris Attack DMG-AYLP-EUR España | estado_desconocido | DEFER | gameboy-pal-tetris-attack | — | PAL Europa | — | loose | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 74f1b486ba2398b1d771 | gameboy | Waterworld Kevin Costner - VHS Cinta Tape Español T2 | estado_desconocido | REJECT | gameboy-es-waterworld | — | PAL España | — | unknown | candidate_identity, platform_candidate |  | 0 | 0 | $0.000000 | 0.99 | MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING |
| 015abdf8d0b2447508d4 | gameboy | ★ Nintendo Game Boy Quarth ★ PAL | regional_confirmation_missing | DEFER | gameboy-es-quarth | — | USA | — | loose | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| d7f572a1f0c11eea4e20 | gameboy | Snoopy’s Magic Show Gameboy | regional_variant_missing | DEFER | gameboy-es-snoopy-s-magic-show | — | PAL Alemania | — | complete | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 994405522fc7b76a0a33 | gameboy | GAMEBOY - SUPER MARIO LAND 2 , PAL ESPAÑOL , SOLO CARTUCHO , ORIGINAL | regional_confirmation_missing | DEFER | gameboy-es-super-mario-land | — | PAL España | — | loose | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 2e7645bc3a0305d6661c | gameboy | TETRIS GIOCO NINTENDO GAME BOY PAL ITALIANO CIB SUPER COMPLETO RARO GIG ITA | regional_signal_conflict | DEFER | gameboy-es-tetris | — | PAL Italia | — | complete | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 3e5cf57f4a78743f4a89 | gameboy | TARA Pegatina: Wario Land: Super Mario Land 3 GB (SP) [PO247047] | regional_variant_missing | DEFER | gameboy-es-wario-land-super-mario-land-3 | — | PAL Europa | — | loose | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
| 2a15931917249023d109 | gameboy | Legend of Zelda Link's Awakening Nintendo Game boy PAL - original! | regional_variant_missing | DEFER | gameboy-es-zelda-link-s-awakening | — | PAL Europa | — | loose | candidate_identity, platform_candidate, condition |  | 0 | 0 | $0.000000 | 0.50 | MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING |
