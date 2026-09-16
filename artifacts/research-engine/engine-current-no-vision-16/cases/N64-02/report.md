# N64-02 — Mystical Ninja Starring Goemon

- Platform: n64
- Decision: REVIEW_REQUIRED
- Reason: At least one Engine-generated target remained partial, unresolved, blocked, or failed under the no-vision policy.
- Engine tasks: 1
- Image policy: IMAGE_URL_FOUND
- Image URLs found: 62
- Cost: $0.061461

## Initial Engine context

```json
{
  "exactCatalogRecords": [
    {
      "id": "n64-mystical-ninja-starring-goemon",
      "title": "Mystical Ninja Starring Goemon",
      "region": "USA",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "SEED_PC",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    },
    {
      "id": "n64-pal-eu-mystical-ninja-starring-goemon",
      "title": "Mystical Ninja Starring Goemon",
      "region": "PAL Europa",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "SEED_PC",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    }
  ],
  "scannerSubjects": [
    {
      "subject": {
        "id": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
        "kind": "catalog-entry",
        "catalogId": "n64-pal-eu-mystical-ninja-starring-goemon",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Mystical Ninja Starring Goemon",
        "platformSlug": "n64",
        "edition": "standard",
        "region": "PAL Europa",
        "barcode": null,
        "productCodes": [],
        "serials": [],
        "marketRegions": [],
        "evidenceMarkets": [],
        "packagingLanguages": [],
        "softwareLanguages": [],
        "releaseStatus": null,
        "physicalProductType": null,
        "containsDisc": null,
        "countsAsNativePhysicalRelease": null,
        "confidence": "SEED_PC",
        "evidenceCount": 1,
        "sourceCount": 0,
        "notes": []
      },
      "risks": [
        {
          "code": "GENERIC_REGION",
          "priority": "P1",
          "weight": 14,
          "reason": "La ficha usa una región amplia (PAL Europa) y puede ocultar cajas nacionales distintas.",
          "targetField": "market"
        }
      ],
      "engineTasks": [
        {
          "id": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
          "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
          "kind": "RESOLVE_MARKET",
          "priority": "P1",
          "question": "¿Qué mercado o mercados corresponden a esta caja física concreta?",
          "requiredEvidence": [
            "PHYSICAL_SCAN",
            "RETAILER",
            "COLLECTOR_DATABASE"
          ],
          "riskCodes": [
            "GENERIC_REGION"
          ],
          "status": "queued",
          "createdAt": "2026-09-16T20:11:03.744Z"
        }
      ],
      "debtScore": 44
    },
    {
      "subject": {
        "id": "catalog:n64-mystical-ninja-starring-goemon",
        "kind": "catalog-entry",
        "catalogId": "n64-mystical-ninja-starring-goemon",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Mystical Ninja Starring Goemon",
        "platformSlug": "n64",
        "edition": "standard",
        "region": "USA",
        "barcode": null,
        "productCodes": [],
        "serials": [],
        "marketRegions": [],
        "evidenceMarkets": [],
        "packagingLanguages": [],
        "softwareLanguages": [],
        "releaseStatus": null,
        "physicalProductType": null,
        "containsDisc": null,
        "countsAsNativePhysicalRelease": null,
        "confidence": "SEED_PC",
        "evidenceCount": 0,
        "sourceCount": 0,
        "notes": []
      },
      "risks": [],
      "engineTasks": [],
      "debtScore": 0
    }
  ],
  "scannerGeneratedTaskCount": 1
}
```

## Research

- Sources planned: spinecard, rfgeneration, ogdb, nintendo64ever, mobygames, retroloco, ebay, national-retailer, gamefaqs, todocoleccion, no-intro, datomatic, publisher-official, ubisoft-official, nesworld, platform-holder-official, 64scener, bulbapedia, retroplace, crimson-ceremony, emulation64, vgcollect, micro64, pricecharting, yambalu, launchbox-images
- Sources used: ebay, retroplace, candidate:www.gameplaystores.es
- Direct URLs used: 8
- Queries executed: 12
- Identifiers found: 3
- Confirmed facts: 0
- Conflicts: 0
- Unresolved fields: MARKET_REGION

### Direct URLs

- https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/credits/n64/
- https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/screenshots/n64/169600/
- https://www.ebay.es/p/581039857
- https://www.ebay.com/itm/116508358537
- https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2
- https://www.gameplaystores.es/juegos-n64/43045-mystical-ninja-2-starring-goemon-n64.html
- https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon
- https://videojuegos.fandom.com/es/wiki/Mystical_Ninja_Starring_Goemon_(N64)

### Queries

- site:ogdb.eu "Mystical Ninja Starring Goemon" n64
- site:mobygames.com "Mystical Ninja Starring Goemon" n64
- site:ebay.es "Mystical Ninja Starring Goemon" n64
- "4988602602487"
- "NUS-NGMP-EUR"
- "4988602602487" n64
- "NUS-NGMP-EUR" n64
- site:www.nintendo64ever.com "4988602602487"
- site:www.nintendo64ever.com "NUS-NGMP-EUR"
- "4988602602487" "Mystical Ninja Starring Goemon"
- "NUS-NGMP-EUR" "Mystical Ninja Starring Goemon"
- site:game.es "4988602602487"

### Image URLs (not analysed)

- https://i.ebayimg.com/images/g/-EcAAeSwcEtpKk~T/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/wHkAAeSwTctqqfLN/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/OeUAAeSwyqZpRbc~/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/ge0AAOSw541jfo~9/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/SFsAAeSw87BqgTvS/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/mAoAAeSwiX5qfRF~/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/rxEAAOSwmHtnGP7w/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/5yQAAeSwplVqL8j3/s-l225.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/nvMAAOSwr8BeQIel/s-l140.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/8y8AAOSwQWhgZc2R/s-l140.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/FXkAAOSwoX9gbA68/s-l140.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/yYYAAOSwZKJekujT/s-l140.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/UJYAAOSwNd1eRJ2e/s-l140.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://rover.ebay.com/roverimp/0/0/9?imp=2046301&trknvp=cp%3D2349526%26ghi%3D98&1789589477016 — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/7WgAAOSwQ7haxTU1/s-l1600.jpg — page: https://www.ebay.es/p/581039857 — source: ebay — IMAGE_URL_FOUND
- https://www.facebook.com/tr?id=1419726858539829&ev=PageView&noscript=1 — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace-small.svg — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/rp.svg — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace_white.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/packshots/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/titles/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/ingames/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/us.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/eu.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/graded.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/new.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/perfect.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/very_good.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/good.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/acceptable.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/broken.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/offers/ — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/ — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/packshots/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/ingames/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/titles/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/ui/theme/img/logos/retroplace-fb-share.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/pics/n64/packshots/48906--mystical-ninja-starring-goemon-2.png — page: https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2 — source: retroplace — IMAGE_URL_FOUND
- https://www.facebook.com/tr?id=1419726858539829&ev=PageView&noscript=1 — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace-small.svg — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/rp.svg — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace_white.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/packshots/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/titles/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/n64/ingames/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/us.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/jp.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/eu.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/graded.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/new.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/perfect.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/very_good.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/good.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/acceptable.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/broken.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/offers/ — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/ — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/packshots/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/ingames/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/n64/titles/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- http://www.retroplace.com/ui/theme/img/logos/retroplace-fb-share.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND
- https://www.retroplace.com/pics/n64/packshots/48914--mystical-ninja-starring-goemon.png — page: https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon — source: retroplace — IMAGE_URL_FOUND

### Frozen task outcomes

```json
[
  {
    "taskId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
    "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
    "targetField": "MARKET_REGION",
    "question": "¿Qué mercado o mercados corresponden a esta caja física concreta?",
    "riskCodes": [
      "GENERIC_REGION"
    ],
    "status": "UNRESOLVED",
    "resolution": {
      "field": "MARKET_REGION",
      "status": "UNRESOLVED",
      "value": null,
      "score": 0.3,
      "claimIds": [
        "cl-d688da5ee16b81cba29f63fb"
      ],
      "sourceIds": [
        "ebay"
      ],
      "reason": "Evidence remains too weak."
    },
    "whyStopped": "SEARCH_BUDGET_EXHAUSTED",
    "sourcesPlanned": [
      "spinecard",
      "rfgeneration",
      "ogdb",
      "nintendo64ever",
      "mobygames",
      "retroloco",
      "ebay",
      "national-retailer",
      "gamefaqs",
      "todocoleccion",
      "no-intro",
      "datomatic",
      "publisher-official",
      "ubisoft-official",
      "nesworld",
      "platform-holder-official",
      "64scener",
      "bulbapedia",
      "retroplace",
      "crimson-ceremony",
      "emulation64",
      "vgcollect",
      "micro64",
      "pricecharting",
      "yambalu",
      "launchbox-images"
    ],
    "sourcesUsed": [
      "ebay",
      "retroplace",
      "candidate:www.gameplaystores.es"
    ],
    "queriesExecuted": [
      "site:ogdb.eu \"Mystical Ninja Starring Goemon\" n64",
      "site:mobygames.com \"Mystical Ninja Starring Goemon\" n64",
      "site:ebay.es \"Mystical Ninja Starring Goemon\" n64",
      "\"4988602602487\"",
      "\"NUS-NGMP-EUR\"",
      "\"4988602602487\" n64",
      "\"NUS-NGMP-EUR\" n64",
      "site:www.nintendo64ever.com \"4988602602487\"",
      "site:www.nintendo64ever.com \"NUS-NGMP-EUR\"",
      "\"4988602602487\" \"Mystical Ninja Starring Goemon\"",
      "\"NUS-NGMP-EUR\" \"Mystical Ninja Starring Goemon\"",
      "site:game.es \"4988602602487\""
    ],
    "directUrlsUsed": [
      "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/credits/n64/",
      "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/screenshots/n64/169600/",
      "https://www.ebay.es/p/581039857",
      "https://www.ebay.com/itm/116508358537",
      "https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2",
      "https://www.gameplaystores.es/juegos-n64/43045-mystical-ninja-2-starring-goemon-n64.html",
      "https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon",
      "https://videojuegos.fandom.com/es/wiki/Mystical_Ninja_Starring_Goemon_(N64)"
    ],
    "identifiersFound": [
      {
        "type": "BARCODE",
        "value": "4988602602487",
        "component": null
      },
      {
        "type": "BARCODE",
        "value": "4988602602487",
        "component": "UNKNOWN"
      },
      {
        "type": "PRODUCT_CODE",
        "value": "NUS-NGMP-EUR",
        "component": "UNKNOWN"
      }
    ],
    "confirmedClaims": [],
    "candidateClaims": [
      {
        "id": "cl-d688da5ee16b81cba29f63fb",
        "runId": "n64-02-1-market_region",
        "taskId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
        "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
        "gameId": "n64-pal-eu-mystical-ninja-starring-goemon",
        "platformSlug": "n64",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "ebay",
        "sourceUrl": "https://www.ebay.es/p/581039857",
        "evidenceId": "ev-17a4625f18889ade0742b1e6",
        "confidence": 1,
        "status": "CANDIDATE",
        "validationErrors": [],
        "createdAt": "2026-09-16T20:11:21.916Z"
      },
      {
        "id": "cl-01533e7f317c93ba9687a3c5",
        "runId": "n64-02-1-market_region",
        "taskId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
        "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
        "gameId": "n64-pal-eu-mystical-ninja-starring-goemon",
        "platformSlug": "n64",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "retroplace",
        "sourceUrl": "https://www.retroplace.com/es/juegos/48906--mystical-ninja-starring-goemon-2",
        "evidenceId": "ev-d9f616aa00e6b5ba8b3e573f",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:11:38.711Z"
      },
      {
        "id": "cl-0ad17ec8ee05885c13055b5a",
        "runId": "n64-02-1-market_region",
        "taskId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
        "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
        "gameId": "n64-pal-eu-mystical-ninja-starring-goemon",
        "platformSlug": "n64",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.gameplaystores.es",
        "sourceUrl": "https://www.gameplaystores.es/juegos-n64/43045-mystical-ninja-2-starring-goemon-n64.html",
        "evidenceId": "ev-d76dac3d9de1f969b403f136",
        "confidence": 0.95,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:11:49.156Z"
      },
      {
        "id": "cl-1697ab80bdee1b194d673eaa",
        "runId": "n64-02-1-market_region",
        "taskId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon:resolve_market:1",
        "subjectId": "catalog:n64-pal-eu-mystical-ninja-starring-goemon",
        "gameId": "n64-pal-eu-mystical-ninja-starring-goemon",
        "platformSlug": "n64",
        "editionId": null,
        "variantId": null,
        "component": "OUTER_PACKAGE_FRONT",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "retroplace",
        "sourceUrl": "https://www.retroplace.com/es/juegos/48914--mystical-ninja-starring-goemon",
        "evidenceId": "ev-65c79ad46225b80af8ed6610",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:12:00.827Z"
      }
    ],
    "conflicts": [],
    "evidenceGaps": [
      {
        "field": "MARKET_REGION",
        "type": "MISSING_MARKET_PROOF",
        "candidateValue": null,
        "missingProof": "Additional independently bound evidence meeting the field confirmation threshold.",
        "recommendedActions": [
          "INSPECT_LEGAL_TEXT",
          "INSPECT_DISTRIBUTOR_TEXT",
          "SEARCH_EXACT_MARKET_PACKAGE"
        ],
        "recommendedSourceTypes": [
          "nintendo64ever",
          "rfgeneration",
          "ogdb",
          "spinecard",
          "retroloco"
        ],
        "exhaustedActions": []
      }
    ],
    "imageEvidenceAvailableNotAnalyzed": false,
    "imageUrlsFound": 62,
    "technicalFailures": [
      {
        "operation": "DIRECT_FETCH",
        "target": "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/credits/n64/",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_PAGE_HTTP_403",
        "recovered": true
      },
      {
        "operation": "BROWSER",
        "target": "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/credits/n64/",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_BROWSER_HTTP_403",
        "recovered": true
      },
      {
        "operation": "DIRECT_FETCH",
        "target": "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/screenshots/n64/169600/",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_PAGE_HTTP_403",
        "recovered": true
      },
      {
        "operation": "BROWSER",
        "target": "https://www.mobygames.com/game/21284/mystical-ninja-starring-goemon/screenshots/n64/169600/",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_BROWSER_HTTP_403",
        "recovered": true
      },
      {
        "operation": "BROWSER",
        "target": "https://www.ebay.com/itm/116508358537",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_BROWSER_HTTP_403",
        "recovered": true
      },
      {
        "operation": "DIRECT_FETCH",
        "target": "https://videojuegos.fandom.com/es/wiki/Mystical_Ninja_Starring_Goemon_(N64)",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_PAGE_HTTP_403",
        "recovered": true
      }
    ],
    "providerUsage": {
      "brave-search": 12,
      "brave-images": 0
    },
    "cost": {
      "openAiUsd": 0.001461,
      "braveUsd": 0.06
    },
    "artifactDirectory": "/Users/macbookpro14/Projects/regionatlas-engine-codex-review-benchmark/artifacts/research-engine/engine-current-no-vision-16/worker/runs/n64-02-1-market_region",
    "error": null
  }
]
```
