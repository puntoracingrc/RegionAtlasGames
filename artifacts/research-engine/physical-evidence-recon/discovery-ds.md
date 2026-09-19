# Physical-evidence recon: Assassin's Creed II Discovery (Nintendo DS)

Date: 2026-09-16

Scope: source-shape reconnaissance only. This document does not seed runtime answers and intentionally omits the pilot's final identifiers.

## Observed source routes

### LaunchBox Games Database

- URL: https://gamesdb.launchbox-app.com/games/images/10783-assassins-creed-ii-discovery
- The image gallery labels records by component and region (for example Box Front, Box Back and Cart Front; Europe and other markets).
- The gallery page commonly wraps an `<img>` thumbnail in an `<a>` whose `href` points at a different, larger LaunchBox image URL.
- Retrieval consequence: treating only `img.src` as the evidence image can inspect the thumbnail and miss the original. The extractor must retain the thumbnail, original link and gallery label as separate fields.
- Evidence consequence: a gallery label is useful acquisition metadata, not proof. Vision still has to classify the photographed subject and component.

### GAME España

- URL: https://www.game.es/VIDEOJUEGOS/AVENTURA/NINTENDO-DS/ASSASSINS-CREED-II-DISCOVERY/094335
- Static HTML exposes the product identity, retailer SKU and the same 3D cover render through OpenGraph and JSON-LD.
- No observed rear-package or cartridge gallery was exposed in the static page.
- Capability: useful for retailer/product identity and Spanish-market sale context; insufficient by itself for rear barcode, packaging language or cartridge code.

### Retroplace

- URL: https://www.retroplace.com/en/games/126338--assassins-creed-ii-discovery
- The page has semantic catalog fields for EAN, box identity, medium identity and country/version rows.
- The inspected page exposed carousel structure but placeholder image content for this specimen.
- Capability: candidate identifier discovery and source-specific follow-up. A row must remain bound to its exact regional variant; the aggregate page must not collapse several variants into one product.

### Ephemeral marketplaces

- A specific TodoColeccion result found during reconnaissance was no longer available when opened.
- Capability: listing photos can be high-value physical evidence, but listing availability and gallery extraction must fail closed and remain auditable.

## Demonstrated evidence gaps

1. A page can identify the product but not expose the required physical component.
2. A page can expose a gallery original only through an enclosing link or a non-`src` attribute.
3. A technical catalog can list identifiers for several variants while lacking a matching specimen photo.
4. Spain retailer context does not prove Spanish packaging.

## Required acquisition behavior

- Preserve page URL, listing/gallery record ID, thumbnail URL, resolved original URL, label and extraction mechanism.
- Prefer a resolved original over a thumbnail for vision.
- Classify subject before component; extract identifiers only after both are accepted.
- Keep box, cartridge and manual nodes separate even if their printed code families resemble one another.
- Do not promote an aggregate regional row without exact variant binding.
