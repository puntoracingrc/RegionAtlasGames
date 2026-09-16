# Physical-evidence recon: Brotherhood + Revelations Double Pack (Xbox 360)

Date: 2026-09-16

Scope: source-pattern reconnaissance only. The known evaluation identifiers are not reproduced here and are not runtime seeds.

## Observed listing route

### TodoColeccion

- Search/listing pattern: `https://www.todocoleccion.net/...~x<listing-id>`.
- Example listing inspected: https://www.todocoleccion.net/videojuegos-consola-xbox-360/assasin-s-creed-brotherhood-assasin-s-creed-revelations-xbox-360~x549000622
- OpenGraph exposes a cropped 230x230 image with sizing parameters.
- Search/gallery markup observed during reconnaissance also publishes `srcset` thumbnails and a `data-image-url` form without the crop query.
- The numeric suffix after `~x` is a stable listing identifier that should be stored independently of the URL.

## Binding risk

A Double Pack page may show:

- the outer bundle package;
- one or both inner standalone cases;
- discs;
- seller or retailer stickers;
- unrelated recommendation images.

The listing title alone cannot bind every photographed barcode to the outer product. Each image must be classified and attached to an explicit product/component node before an identifier becomes claim-eligible.

## Required acquisition behavior

- Parse listing ID from the page URL and keep it on every acquired image record.
- Retain `src`, `srcset`, `data-image-url`, `data-original`, `data-zoom` and enclosing image links.
- Strip known thumbnail/crop transformations only when the source publishes an explicit original URL; do not invent image URLs by heuristic rewriting.
- Prefer the explicit original URL for vision, while retaining the thumbnail URL for provenance.
- Require the closed choice OUTER_PRODUCT / INNER_GAME / ANOTHER_PRODUCT / UNREADABLE and a component classification before barcode binding.
- Treat seller stickers as separate nodes (`SELLER_STICKER` + `STICKER_ON`), never as printed package identifiers.

## Source capability

- Specific listing photos: potentially high for component-bound physical evidence when readable.
- Listing title/description: medium for product discovery, low for outer-vs-inner identifier binding.
- OpenGraph thumbnail alone: discovery-only when the original component is unreadable.
