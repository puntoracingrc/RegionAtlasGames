# GB-03 — Mole Mania

- Platform: gameboy
- Decision: REVIEW_REQUIRED
- Reason: At least one Engine-generated target remained partial, unresolved, blocked, or failed under the no-vision policy.
- Engine tasks: 1
- Image policy: IMAGE_URL_FOUND
- Image URLs found: 161
- Cost: $0.051922

## Initial Engine context

```json
{
  "exactCatalogRecords": [
    {
      "id": "gameboy-mole-mania",
      "title": "Mole Mania",
      "region": "USA",
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
      "id": "gameboy-pal-mole-mania",
      "title": "Mole Mania",
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
      "id": "gameboy-es-mole-mania",
      "title": "Mole Mania",
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
    }
  ],
  "scannerSubjects": [
    {
      "subject": {
        "id": "catalog:gameboy-pal-mole-mania",
        "kind": "catalog-entry",
        "catalogId": "gameboy-pal-mole-mania",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Mole Mania",
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
          "id": "catalog:gameboy-pal-mole-mania:resolve_market:1",
          "subjectId": "catalog:gameboy-pal-mole-mania",
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
          "createdAt": "2026-09-16T20:13:03.999Z"
        }
      ],
      "debtScore": 44
    },
    {
      "subject": {
        "id": "catalog:gameboy-es-mole-mania",
        "kind": "catalog-entry",
        "catalogId": "gameboy-es-mole-mania",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Mole Mania",
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
        "id": "catalog:gameboy-mole-mania",
        "kind": "catalog-entry",
        "catalogId": "gameboy-mole-mania",
        "guideId": null,
        "physicalEditionId": null,
        "title": "Mole Mania",
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
        "confidence": "MUSEUM_PAL",
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
- Sources used: ebay, legacy:gameboy-visual-reviewed-20260908:800612078639, candidate:www.retroplace.com, candidate:www.videogamesage.com
- Direct URLs used: 6
- Queries executed: 10
- Identifiers found: 1
- Confirmed facts: 0
- Conflicts: 0
- Unresolved fields: MARKET_REGION

### Direct URLs

- https://www.ebay.com/p/1912
- https://www.ebay.es/p/1912
- https://www.retroplace.com/en/games/33772--mole-mania
- https://www.etsy.com/listing/1429763692/mole-mania-replacement-label-dmg-amop
- https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/
- https://www.retroplace.com/es/juegos/33773--mole-mania

### Queries

- "Mole Mania" "gameboy" physical edition
- "Mole Mania" "gameboy" product code
- "DMG-AMOP-EUR"
- "DMG-AMOP-EUR" gameboy
- site:www.ebay.es "DMG-AMOP-EUR"
- "DMG-AMOP-EUR" "Mole Mania"
- "DMG-AMOP-EUR" "PAL Europa"
- site:www.ebay.es "Mole Mania" gameboy packaging distributor "legal text"
- site:gbhwdb.gekkio.fi "Mole Mania" gameboy packaging distributor "legal text"
- site:www.game-boy-database.com "Mole Mania" gameboy packaging distributor "legal text"

### Image URLs (not analysed)

- https://i.ebayimg.com/images/g/yFsAAOxygo9Q6h9j/s-l640.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l64.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l1600.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l500.webp — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/c7YAAOSwgQBmK-uc/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://www.ebay.com/p/1912 — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HroAAeSwYtNqk0Ua/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JQwAAeSwyBdpkJl7/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/R6IAAeSwLGBp65dF/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/fzMAAeSwXMpqKvaG/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/I54AAeSwfqVp9ref/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/5WwAAeSwtM1qKHmP/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HikAAeSwQotqoexi/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/xNwAAeSwsrNqHJGx/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/80wAAeSwrj5qg4Ba/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/jswAAeSwwlRqMJXe/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/3XQAAeSwxsNqMJXl/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/cekAAOSw33xnPFir/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/O1sAAOSwi7VoI-pG/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/aLMAAeSwu8RpqVYA/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/Yn0AAOSwozZoCtRg/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/thumbs/images/g/vAcAAOSwtLtoI-pX/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/LygAAOSwhgNl9wh4/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/T-kAAeSwGjJqbWL5/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/a6sAAeSwKkJqqbW5/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/yAMAAOSwuzVhnrlJ/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/ctoAAeSwnLRqqheJ/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/ZD4AAOSwXuxfNXPM/s-l225.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/NAkAAOSwDqNoNAUk/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/6YsAAOSwFA9nYHMK/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/5k0AAOSwhYRoLwsD/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/rI0AAOSw2lRf6xb-/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/QIEAAOSwYGNf6xce/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/MNMAAOSwqtJf6xcR/s-l140.jpg — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://rover.ebay.com/roverimp/0/0/9?imp=2046301&trknvp=cp%3D2349526%26ghi%3D98&1789589588641 — page: https://www.ebay.com/p/1912 — source: ebay — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/IMsAAeSwvFVqdjeg/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JDkAAeSwA6tqdjej/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/VNUAAeSwUrdqdjel/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HbQAAeSwgYVqdjen/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/GEcAAeSwMbhqdjeu/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1gAAeSwaRZqdjex/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Gx0AAeSw4vtqdjez/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/M1oAAeSwlShqdje2/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l64.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l500.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/TDgAAeSw1Ktqdje-/s-l1600.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/yFsAAOxygo9Q6h9j/s-l640.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/Ry4AAOSwMBtg1l72/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/g1QAAOSwjelg1l~W/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/mbMAAOSwbn1eRJ2Y/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/3MQAAOSwpe9g1nkX/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/~28AAOSwzvRg1qoL/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/yFsAAOxygo9Q6h9j/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HroAAeSwYtNqk0Ua/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/J~oAAeSw5glqdjed/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/JQwAAeSwyBdpkJl7/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/R6IAAeSwLGBp65dF/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/fzMAAeSwXMpqKvaG/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/I54AAeSwfqVp9ref/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/5WwAAeSwtM1qKHmP/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/HikAAeSwQotqoexi/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/xNwAAeSwsrNqHJGx/s-l225.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://i.ebayimg.com/images/g/c7YAAOSwgQBmK-uc/s-l140.jpg — page: https://www.ebay.es/p/1912 — source: legacy:gameboy-visual-reviewed-20260908:800612078639 — IMAGE_URL_FOUND
- https://www.facebook.com/tr?id=1419726858539829&ev=PageView&noscript=1 — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace-small.svg — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/rp.svg — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace_white.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/en/games/pics/gameboy/packshots/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/en/games/pics/gameboy/titles/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/en/games/pics/gameboy/ingames/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/us.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/jp.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/eu.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/graded.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/new.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/perfect.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/very_good.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/good.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/acceptable.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/broken.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/en/games/offers/ — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/ — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/packshots/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/ingames/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/titles/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/ui/theme/img/logos/retroplace-fb-share.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/pics/gameboy/packshots/33772--mole-mania.png — page: https://www.retroplace.com/en/games/33772--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://media.invisioncic.com/g290812/monthly_2026_01/VGS-LogoMascot-Final-01-compressed_less_newlkogo.png.7ef1797e0bc3407ff5c3ef1fb56ce9f1.png — page: https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/ — source: candidate:www.videogamesage.com — IMAGE_URL_FOUND
- https://vgs-media.s3.ca-central-1.amazonaws.com/monthly_2019_11/BZLGAMLISTITEMS.jpg.777db88f56f806c90a7e1e0bbca1b4e2.jpg — page: https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/ — source: candidate:www.videogamesage.com — IMAGE_URL_FOUND
- https://vgs-media.s3.ca-central-1.amazonaws.com/monthly_2023_07/de06t4f-135a438d-d9bf-408b-9d01-39676afc351f.thumb.png.7984b25d17d75a5f3b0f9fcc4a17a40c.png — page: https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/ — source: candidate:www.videogamesage.com — IMAGE_URL_FOUND
- https://www.facebook.com/tr?id=1419726858539829&ev=PageView&noscript=1 — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace-small.svg — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/rp.svg — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/logos/retroplace_white.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/packshots/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/titles/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/pics/gameboy/ingames/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/us.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/jp.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/eu.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/graded.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/new.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/perfect.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/very_good.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/good.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/acceptable.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/gradings/zelda/broken.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/es/juegos/offers/ — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/ui/theme/img/regions/ — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/packshots/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/ingames/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/pics/gameboy/titles/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- http://www.retroplace.com/ui/theme/img/logos/retroplace-fb-share.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND
- https://www.retroplace.com/pics/gameboy/packshots/33773--mole-mania.png — page: https://www.retroplace.com/es/juegos/33773--mole-mania — source: candidate:www.retroplace.com — IMAGE_URL_FOUND

### Frozen task outcomes

```json
[
  {
    "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
    "subjectId": "catalog:gameboy-pal-mole-mania",
    "targetField": "MARKET_REGION",
    "question": "¿Qué mercado o mercados corresponden a esta caja física concreta?",
    "riskCodes": [
      "GENERIC_REGION"
    ],
    "status": "PARTIAL",
    "resolution": {
      "field": "MARKET_REGION",
      "status": "PARTIAL",
      "value": "PAL Europa",
      "score": 0.738,
      "claimIds": [
        "cl-1c765e591afce3fa808cebbb",
        "cl-b1fc79a2be8c2d50c9f542de"
      ],
      "sourceIds": [
        "ebay",
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
      "ebay",
      "legacy:gameboy-visual-reviewed-20260908:800612078639",
      "candidate:www.retroplace.com",
      "candidate:www.videogamesage.com"
    ],
    "queriesExecuted": [
      "\"Mole Mania\" \"gameboy\" physical edition",
      "\"Mole Mania\" \"gameboy\" product code",
      "\"DMG-AMOP-EUR\"",
      "\"DMG-AMOP-EUR\" gameboy",
      "site:www.ebay.es \"DMG-AMOP-EUR\"",
      "\"DMG-AMOP-EUR\" \"Mole Mania\"",
      "\"DMG-AMOP-EUR\" \"PAL Europa\"",
      "site:www.ebay.es \"Mole Mania\" gameboy packaging distributor \"legal text\"",
      "site:gbhwdb.gekkio.fi \"Mole Mania\" gameboy packaging distributor \"legal text\"",
      "site:www.game-boy-database.com \"Mole Mania\" gameboy packaging distributor \"legal text\""
    ],
    "directUrlsUsed": [
      "https://www.ebay.com/p/1912",
      "https://www.ebay.es/p/1912",
      "https://www.retroplace.com/en/games/33772--mole-mania",
      "https://www.etsy.com/listing/1429763692/mole-mania-replacement-label-dmg-amop",
      "https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/",
      "https://www.retroplace.com/es/juegos/33773--mole-mania"
    ],
    "identifiersFound": [
      {
        "type": "PRODUCT_CODE",
        "value": "DMG-AMOP-EUR",
        "component": null
      }
    ],
    "confirmedClaims": [],
    "candidateClaims": [
      {
        "id": "cl-1c765e591afce3fa808cebbb",
        "runId": "gb-03-1-market_region",
        "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-mole-mania",
        "gameId": "gameboy-pal-mole-mania",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": null,
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "ebay",
        "sourceUrl": "https://www.ebay.com/p/1912",
        "evidenceId": "ev-334d4d8a8d2d89966d5b42a0",
        "confidence": 0.9,
        "status": "VALIDATED",
        "validationErrors": [],
        "createdAt": "2026-09-16T20:13:13.940Z"
      },
      {
        "id": "cl-b1fc79a2be8c2d50c9f542de",
        "runId": "gb-03-1-market_region",
        "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-mole-mania",
        "gameId": "gameboy-pal-mole-mania",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": null,
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "legacy:gameboy-visual-reviewed-20260908:800612078639",
        "sourceUrl": "https://www.ebay.es/p/1912",
        "evidenceId": "ev-58f69705a3bc580f3102bce4",
        "confidence": 0.9,
        "status": "VALIDATED",
        "validationErrors": [],
        "createdAt": "2026-09-16T20:13:17.011Z"
      },
      {
        "id": "cl-fb8c82070f2ae3afa9255170",
        "runId": "gb-03-1-market_region",
        "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-mole-mania",
        "gameId": "gameboy-pal-mole-mania",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.retroplace.com",
        "sourceUrl": "https://www.retroplace.com/en/games/33772--mole-mania",
        "evidenceId": "ev-bdd195c7d0b9f37ba086d3fe",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:13:27.561Z"
      },
      {
        "id": "cl-daf9c9ac3238e6a673a51ebe",
        "runId": "gb-03-1-market_region",
        "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-mole-mania",
        "gameId": "gameboy-pal-mole-mania",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.videogamesage.com",
        "sourceUrl": "https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/",
        "evidenceId": "ev-081b6ed20b9fdce4b3949a1a",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:13:36.266Z"
      },
      {
        "id": "cl-657dc30791efa39fcaeb497a",
        "runId": "gb-03-1-market_region",
        "taskId": "catalog:gameboy-pal-mole-mania:resolve_market:1",
        "subjectId": "catalog:gameboy-pal-mole-mania",
        "gameId": "gameboy-pal-mole-mania",
        "platformSlug": "gameboy",
        "editionId": null,
        "variantId": null,
        "component": "UNKNOWN",
        "field": "MARKET_REGION",
        "value": "PAL Europa",
        "sourceId": "candidate:www.retroplace.com",
        "sourceUrl": "https://www.retroplace.com/es/juegos/33773--mole-mania",
        "evidenceId": "ev-d92fc106d1dd427063daddf1",
        "confidence": 0.9,
        "status": "REJECTED",
        "validationErrors": [
          "SOURCE_CAPABILITY_MISMATCH"
        ],
        "createdAt": "2026-09-16T20:13:44.668Z"
      }
    ],
    "conflicts": [],
    "evidenceGaps": [
      {
        "field": "MARKET_REGION",
        "type": "MISSING_MARKET_PROOF",
        "candidateValue": "PAL Europa",
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
    "imageUrlsFound": 161,
    "technicalFailures": [
      {
        "operation": "DIRECT_FETCH",
        "target": "https://www.etsy.com/listing/1429763692/mole-mania-replacement-label-dmg-amop",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_PAGE_HTTP_403",
        "recovered": true
      },
      {
        "operation": "BROWSER",
        "target": "https://www.etsy.com/listing/1429763692/mole-mania-replacement-label-dmg-amop",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_BROWSER_HTTP_403",
        "recovered": true
      },
      {
        "operation": "DIRECT_FETCH",
        "target": "https://www.videogamesage.com/blogs/entry/432-working-list-of-world-gray-carts-part-11-europe-eur/",
        "code": "SOURCE_BLOCKED",
        "detail": "Error RESEARCH_PAGE_HTTP_403",
        "recovered": true
      }
    ],
    "providerUsage": {
      "brave-search": 10,
      "brave-images": 0
    },
    "cost": {
      "openAiUsd": 0.001922,
      "braveUsd": 0.05
    },
    "artifactDirectory": "/Users/macbookpro14/Projects/regionatlas-engine-codex-review-benchmark/artifacts/research-engine/engine-current-no-vision-16/worker/runs/gb-03-1-market_region",
    "error": null
  }
]
```
