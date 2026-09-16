# GB-01 — Dr. Mario

- Platform: gameboy
- Decision: REVIEW_REQUIRED
- Reason: At least one Engine-generated target remained partial, unresolved, blocked, or failed under the no-vision policy.
- Engine tasks: 1
- Image policy: IMAGE_URL_FOUND
- Image URLs found: 129
- Cost: $0.031468

## Initial Engine context

```json
{
  "exactCatalogRecords": [
    {
      "id": "gameboy-dr-mario",
      "title": "Dr. Mario",
      "region": "Japón",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "MUSEUM_PAL",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    },
    {
      "id": "gameboy-pal-dr-mario",
      "title": "Dr. Mario",
      "region": "PAL Europa",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "MUSEUM_MULTI",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    },
    {
      "id": "gameboy-usa-dr-mario",
      "title": "Dr. Mario",
      "region": "USA",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "MUSEUM_MULTI",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    },
    {
      "id": "gameboy-es-dr-mario",
      "title": "Dr. Mario",
      "region": "PAL España",
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
      "id": "gameboy-usa-dr-mario-player-s-choice",
      "title": "Dr. Mario [Player's Choice]",
      "region": "USA",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "SEED_PC_NTSC",
      "marketRegion": null,
      "languages": [],
      "canonicalSerials": [],
      "resolutionSerials": [],
      "sourceSerials": []
    },
    {
      "id": "gameboy-usa-dr-mario-player-s-choice-rated-e",
      "title": "Dr. Mario [Player's Choice Rated E]",
      "region": "USA",
      "edition": "standard",
      "listingStatus": "listed",
      "excludeReason": null,
      "matchConfidence": "SEED_PC_NTSC",
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
        "id": "catalog:gameboy-pal-dr-mario",
        "kind": "catalog-entry",
        "catalogId": "gameboy-pal-dr-mario",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario",
        "platformSlug": "gameboy",
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
        "confidence": "MUSEUM_MULTI",
        "evidenceCount": 0,
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
          "id": "catalog:gameboy-pal-dr-mario:resolve_market:1",
          "subjectId": "catalog:gameboy-pal-dr-mario",
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
          "createdAt": "2026-09-16T20:12:42.584Z"
        }
      ],
      "debtScore": 44
    },
    {
      "subject": {
        "id": "catalog:gameboy-dr-mario",
        "kind": "catalog-entry",
        "catalogId": "gameboy-dr-mario",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario",
        "platformSlug": "gameboy",
        "edition": "standard",
        "region": "Japón",
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
        "confidence": "MUSEUM_PAL",
        "evidenceCount": 0,
        "sourceCount": 0,
        "notes": []
      },
      "risks": [],
      "engineTasks": [],
      "debtScore": 0
    },
    {
      "subject": {
        "id": "catalog:gameboy-es-dr-mario",
        "kind": "catalog-entry",
        "catalogId": "gameboy-es-dr-mario",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario",
        "platformSlug": "gameboy",
        "edition": "standard",
        "region": "PAL España",
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
      "risks": [],
      "engineTasks": [],
      "debtScore": 0
    },
    {
      "subject": {
        "id": "catalog:gameboy-usa-dr-mario",
        "kind": "catalog-entry",
        "catalogId": "gameboy-usa-dr-mario",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario",
        "platformSlug": "gameboy",
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
        "confidence": "MUSEUM_MULTI",
        "evidenceCount": 1,
        "sourceCount": 0,
        "notes": []
      },
      "risks": [],
      "engineTasks": [],
      "debtScore": 0
    },
    {
      "subject": {
        "id": "catalog:gameboy-usa-dr-mario-player-s-choice",
        "kind": "catalog-entry",
        "catalogId": "gameboy-usa-dr-mario-player-s-choice",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario [Player's Choice]",
        "platformSlug": "gameboy",
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
        "confidence": "SEED_PC_NTSC",
        "evidenceCount": 1,
        "sourceCount": 0,
        "notes": []
      },
      "risks": [],
      "engineTasks": [],
      "debtScore": 0
    },
    {
      "subject": {
        "id": "catalog:gameboy-usa-dr-mario-player-s-choice-rated-e",
        "kind": "catalog-entry",
        "catalogId": "gameboy-usa-dr-mario-player-s-choice-rated-e",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Dr. Mario [Player's Choice Rated E]",
        "platformSlug": "gameboy",
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
        "confidence": "SEED_PC_NTSC",
        "evidenceCount": 1,
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

- Sources planned: legacy:gameboy-visual-reviewed-20260908:800612078639, legacy:gameboy-visual-reviewed-20260908:335866722818, legacy:gameboy-visual-reviewed-20260908:297478441978, legacy:gameboy-visual-reviewed-20260908:326091056529, legacy:gameboy-documentary-v3-legado:hardware, legacy:gameboy-documentary-v3-legado:flintstones, legacy:gameboy-documentary-v3-legado:asterix, legacy:gameboy-documentary-v3-legado:addams, legacy:gameboy-documentary-v3-legado:revisions, legacy:gameboy-documentary-v3-legado:pokemon-red-nesp, legacy:gameboy-documentary-v3-legado:wario-neai, legacy:gameboy-documentary-v3-legado:zelda-esp2, legacy:gameboy-documentary-v3-legado:legado-esp-list, mobygames, national-retailer, publisher-official, ubisoft-official, platform-holder-official, no-intro, datomatic, ogdb, ebay, yambalu, todocoleccion
- Sources used: candidate:www.amazon.es, legacy:gameboy-visual-reviewed-20260908:800612078639, candidate:www.retroplace.com, candidate:nostalgicvideogames.com
- Direct URLs used: 4
- Queries executed: 6
- Identifiers found: 0
- Confirmed facts: 0
- Conflicts: 0
- Unresolved fields: MARKET_REGION

### Direct URLs

- https://www.amazon.es/Dr-Mario/dp/B00002ST3E
- https://www.ebay.es/p/1444700809
- https://www.retroplace.com/es/juegos/32971--dr-mario
- https://nostalgicvideogames.com/products/dr-mario-ls-gameboy

### Queries

- "Dr. Mario" "gameboy" physical edition
- "Dr. Mario" "gameboy" product code
- "Dr. Mario" "gameboy" barcode
- site:www.ebay.es "Dr. Mario" gameboy packaging distributor "legal text"
- site:gbhwdb.gekkio.fi "Dr. Mario" gameboy packaging distributor "legal text"
- site:www.game-boy-database.com "Dr. Mario" gameboy packaging distributor "legal text"

### Image URLs (not analysed)

- https://fls-eu.amazon.es/1/batch/1/OP/A1RKKUPIHCS9HS:520-2106386-3495149:J3KGBYAAPV908Z3RCTZH$uedata=s:%2Frd%2Fuedata%3Fstaticb%26id%3DJ3KGBYAAPV908Z3RCTZH:0 — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/gno/sprites/nav-sprite-global-1x-reorg-privacy._CB546381700_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/EU-Deals-Team/2026/PBDD26/HP/SWM/es-ES_LUHP_SWMStatic_800x78._CB755760264_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://images-eu.ssl-images-amazon.com/images/G/02/omaha/images/yoda/flyout_72dpi._V270092858_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://images-eu.ssl-images-amazon.com/images/G/02/prime/yourprime/yourprime-widget-piv-fallback._V310089192_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/21a21LWJjpL.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/51MhFdenqSL._AC_SR38,50_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/51GIf7bgZpL._AC_SR38,50_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/41qXyXDNEDL._AC_SR38,50_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/41LXBpjA1jL._AC_SR38,50_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX342_SY445_QL70_ML2_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash//pLB3SkYb3bHZzHQ.svg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash//swRPyHOrgnz358_.svg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash//vfyy_4zFgJkmREP.svg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/21u+Pxt488L._SS75_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash/sfwfCa9XX12F4At.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash/Drs0Q4ykCo009TA.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash/3QtWxPDJwNfJe8s.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash/FQQMS6xydSSApTa.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://images-na.ssl-images-amazon.com/images/G/01/x-locale/common/transparent-pixel._V192234675_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://images-na.ssl-images-amazon.com/images/G/01/x-locale/common/grey-pixel.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/amazon-avatars-global/default._SX48_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/amazon-avatars-global/b8265206-2fa6-47b8-8b2b-bb26dd198d4a._CR0%2C0%2C311%2C311_UX460_SX48_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/amazon-avatars-global/ad601de5-d36e-49c1-bb44-9723e22f6a3e._CR0%2C0%2C480%2C480_SX460_SX48_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/S/sash//eve1bZY0MgtnzFB.svg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/51MhFdenqSL._AC_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/personalization/ybh/loading-4x-gray._CB485916902_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://fls-eu.amazon.es/1/batch/1/OP/A1RKKUPIHCS9HS:520-2106386-3495149:J3KGBYAAPV908Z3RCTZH$uedata=s:%2Frd%2Fuedata%3Fnoscript%26id%3DJ3KGBYAAPV908Z3RCTZH:0 — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/gno/sprites/nav-sprite-global-2x-reorg-privacy._CB546381700_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/gno/sprites/timeline_sprite_2x._CB443580960_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/x-locale/common/transparent-pixel._CB485935036_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SL1500_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX342_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX385_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX425_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX466_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX522_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX569_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91aS0k1HcwL._AC_SX679_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SL1500_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/51GIf7bgZpL._AC_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX342_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX385_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX425_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX466_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX522_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX569_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91HT4hYdqRL._AC_SX679_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SL1500_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/41qXyXDNEDL._AC_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX342_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX385_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX425_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX466_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX522_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX569_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/913hWyzmQdL._AC_SX679_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SL1500_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/41LXBpjA1jL._AC_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX342_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX385_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX425_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX466_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX522_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX569_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/I/91PlmPbuF+L._AC_SX679_.jpg — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/01/books-detail-page-table-of-contents/blackback/ToC.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/apparel/rcxgs/tile._CB483369954_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/shopbylook/shoppable-images/close_x_white._CB416326186_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/javascripts/lib/popover/images/light/sprite-vertical-popover-arrow._CB485935394_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/HomeCustomProduct/imageBlock-360-thumbnail-icon-small._CB610490299_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/Quarterdeck/en_US/images/video._CB485935549_SX38_SY50_CR,0,0,38,50_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/ui/loadIndicators/loading-large._CB485945341_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/HomeCustomProduct/360_icon_73x73v2._CB485971309_SX38_SY50_CR,0,0,38,50_.png — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://m.media-amazon.com/images/G/30/ui/loadIndicators/loading-large_labeled._CB485921391_.gif — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://redirect.prod.experiment.routing.cloudfront.aws.a2z.com/x.png?timestamp\x3d — page: https://www.amazon.es/Dr-Mario/dp/B00002ST3E — source: candidate:www.amazon.es — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/7WgAAOSwQ7haxTU1/s-l1600.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/RNMAAOSwxu5ZGXOo/s-l140.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/FXkAAOSwoX9gbA68/s-l140.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/BNwAAOSw~hZeRJf8/s-l140.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/9fAAAOSwpJReQHKo/s-l140.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/acwAAOSw3PlgExJd/s-l140.png — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/QqUAAOSwKytZGXNk/s-l140.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/RUkAAeSwgGdqgZ7i/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/wC8AAeSwiPdp0Pw6/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/87YAAeSwHVloZDSm/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/MqAAAeSwlspqqVbx/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Rz8AAeSwgQFqo9Ww/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/a80AAeSwdZtpQvLS/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/7xcAAeSwuqxqqqME/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/UmoAAeSwQMdqAAr8/s-l225.jpg — page: https://www.ebay.es/p/1444700809 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://www.facebook.com/tr?id=1419726858539829&ev=PageView&noscript=1 — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace-small.svg — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/rp.svg — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace_white.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/packshots/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/titles/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/ingames/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/us.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/eu.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/de.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/au.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/jp.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/gb.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/as.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/graded.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/new.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/perfect.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/very_good.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/good.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/acceptable.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/broken.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/offers/ — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/ — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/packshots/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/ingames/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/titles/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/ui/theme/img/logos/retroplace-fb-share.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/pics/gameboy/packshots/32971--dr-mario.png — page: https://www.retroplace.com/es/juegos/32971--dr-mario — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/nvgaLogo2024_arcadestick_150wide.png?v=1730730017&width=600 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/nvgaLogo2024_arcadestick_150wide.png?v=1730730017&width=150 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/nvgaLogo2024_arcadestick_150wide.png?v=1730730017&width=225 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/nvgaLogo2024_arcadestick_150wide.png?v=1730730017&width=300 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/16528-240.jpg?v=1734425602&width=1946 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/16528-240.jpg?v=1734425602 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/16528-240.jpg?v=1734425602&width=1445 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- http://nostalgicvideogames.com/cdn/shop/files/16528-240.jpg?v=1734425602 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/16528-240.jpg?v=1734425602&width=1920 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND
- https://nostalgicvideogames.com/cdn/shop/files/nvgaLogo2024_arcadestick_150wide.png?v=1730730017&width=500 — page: https://nostalgicvideogames.com/products/dr-mario-ls-gameboy — source: candidate:nostalgicvideogames.com — IMAGE_URL_FOUND

### Frozen task outcomes

```json
[
  {
    "taskId": "catalog:gameboy-pal-dr-mario:resolve_market:1",
    "subjectId": "catalog:gameboy-pal-dr-mario",
    "targetField": "MARKET_REGION",
    "question": "¿Qué mercado o mercados corresponden a esta caja física concreta?",
    "riskCodes": [
      "GENERIC_REGION"
    ],
    "status": "PARTIAL",
    "resolution": {
      "field": "MARKET_REGION",
      "status": "PARTIAL",
      "value": "PAL España",
      "score": 0.62,
      "claimIds": [
        "cl-22f7c5b1dd8b84904d32b2ca"
      ],
      "sourceIds": [
        "legacy:gameboy-visual-reviewed-20260908:800612078639"
      ],
      "reason": "A plausible value exists but confirmation threshold is not met."
    },
    "whyStopped": "NO_NEW_DISCRIMINATING_EVIDENCE",
    "sourcesPlanned": [
      "legacy:gameboy-visual-reviewed-20260908:800612078639",
      "legacy:gameboy-visual-reviewed-20260908:335866722818",
      "legacy:gameboy-visual-reviewed-20260908:297478441978",
      "legacy:gameboy-visual-reviewed-20260908:326091056529",
      "legacy:gameboy-documentary-v3-legado:hardware",
      "legacy:gameboy-documentary-v3-legado:flintstones",
      "legacy:gameboy-documentary-v3-legado:asterix",
      "legacy:gameboy-documentary-v3-legado:addams",
      "legacy:gameboy-documentary-v3-legado:revisions",
      "legacy:gameboy-documentary-v3-legado:pokemon-red-nesp",
      "legacy:gameboy-documentary-v3-legado:wario-neai",
      "legacy:gameboy-documentary-v3-legado:zelda-esp2",
      "legacy:gameboy-documentary-v3-legado:legado-esp-list",
      "mobygames",
      "national-retailer",
      "publisher-official",
      "ubisoft-official",
      "platform-holder-official",
      "no-intro",
      "datomatic",
      "ogdb",
      "ebay",
      "yambalu",
      "todocoleccion"
    ],
    "sourcesUsed": [
      "candidate:www.amazon.es",
      "legacy:gameboy-visual-reviewed-20260908:800612078639",
      "candidate:www.retroplace.com",
      "candidate:nostalgicvideogames.com"
    ],
    "queriesExecuted": [
      "\"Dr. Mario\" \"gameboy\" physical edition",
      "\"Dr. Mario\" \"gameboy\" product code",
      "\"Dr. Mario\" \"gameboy\" barcode",
      "site:www.ebay.es \"Dr. Mario\" gameboy packaging distributor \"legal text\"",
      "site:gbhwdb.gekkio.fi \"Dr. Mario\" gameboy packaging distributor \"legal text\"",
      "site:www.game-boy-database.com \"Dr. Mario\" gameboy packaging distributor \"legal text\""
    ],
    "directUrlsUsed": [
      "https://www.amazon.es/Dr-Mario/dp/B00002ST3E",
      "https://www.ebay.es/p/1444700809",
      "https://www.retroplace.com/es/juegos/32971--dr-mario",
      "https://nostalgicvideogames.com/products/dr-mario-ls-gameboy"
    ],
    "identifiersFound": [],
    "confirmedClaims": [],
    "candidateClaims": [
      {
        "id": "cl-7e9648847d207076600d7a8f",
        "runId": "gb-01-1-market_region",
        "taskId": "catalog:gameboy-pal-dr-mario:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-dr-mario",
        "gameId": "gameboy-pal-dr-mario",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.amazon.es",
        "sourceUrl": "https://www.amazon.es/Dr-Mario/dp/B00002ST3E",
        "evidenceId": "ev-838c8cb1ad8f545a97cddf26",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:12:46.199Z"
      },
      {
        "id": "cl-22f7c5b1dd8b84904d32b2ca",
        "runId": "gb-01-1-market_region",
        "taskId": "catalog:gameboy-pal-dr-mario:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-dr-mario",
        "gameId": "gameboy-pal-dr-mario",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "OUTER_PACKAGE_FRONT",
        "field": "MARKET_REGION",
        "value": "PAL España",
        "sourceId": "legacy:gameboy-visual-reviewed-20260908:800612078639",
        "sourceUrl": "https://www.ebay.es/p/1444700809",
        "evidenceId": "ev-8b70eb4bb57ada5d96b00462",
        "confidence": 1,
        "status": "VALIDATED",
        "validationErrors": [],
        "createdAt": "2026-09-16T20:12:48.343Z"
      },
      {
        "id": "cl-cdb071db0ccaf49ab44bbb45",
        "runId": "gb-01-1-market_region",
        "taskId": "catalog:gameboy-pal-dr-mario:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-dr-mario",
        "gameId": "gameboy-pal-dr-mario",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "OUTER_PACKAGE_BACK",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.retroplace.com",
        "sourceUrl": "https://www.retroplace.com/es/juegos/32971--dr-mario",
        "evidenceId": "ev-406842fb805dbb03fc767243",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:12:59.707Z"
      },
      {
        "id": "cl-d6e074e7e34a40d382202ef8",
        "runId": "gb-01-1-market_region",
        "taskId": "catalog:gameboy-pal-dr-mario:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-dr-mario",
        "gameId": "gameboy-pal-dr-mario",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "OUTER_PACKAGE_FRONT",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:nostalgicvideogames.com",
        "sourceUrl": "https://nostalgicvideogames.com/products/dr-mario-ls-gameboy",
        "evidenceId": "ev-6690b47d61fe433d081d1b5c",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:13:02.589Z"
      }
    ],
    "conflicts": [],
    "evidenceGaps": [
      {
        "field": "MARKET_REGION",
        "type": "MISSING_MARKET_PROOF",
        "candidateValue": "PAL España",
        "missingProof": "Additional independently bound evidence meeting the field confirmation threshold.",
        "recommendedActions": [
          "INSPECT_LEGAL_TEXT",
          "INSPECT_DISTRIBUTOR_TEXT",
          "SEARCH_EXACT_MARKET_PACKAGE"
        ],
        "recommendedSourceTypes": [
          "legacy:gameboy-visual-reviewed-20260908:800612078639",
          "legacy:gameboy-visual-reviewed-20260908:335866722818",
          "legacy:gameboy-visual-reviewed-20260908:297478441978",
          "legacy:gameboy-visual-reviewed-20260908:326091056529",
          "legacy:gameboy-documentary-v3-legado:hardware"
        ],
        "exhaustedActions": []
      }
    ],
    "imageEvidenceAvailableNotAnalyzed": false,
    "imageUrlsFound": 129,
    "technicalFailures": [],
    "providerUsage": {
      "brave-search": 6,
      "brave-images": 0
    },
    "cost": {
      "openAiUsd": 0.001468,
      "braveUsd": 0.03
    },
    "artifactDirectory": "/Users/macbookpro14/Projects/regionatlas-engine-codex-review-benchmark/artifacts/research-engine/engine-current-no-vision-16/worker/runs/gb-01-1-market_region",
    "error": null
  }
]
```
