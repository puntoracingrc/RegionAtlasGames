# Brave controlled retrieval validation

Checked at: 2026-09-16T13:00:46Z

## Provider result

- `BRAVE_SEARCH_API_KEY`: detected locally; value not recorded.
- Web provider: operational.
- Image provider: operational.
- Preflight: `HEALTHY`.
- Calls: 4 web requests, including preflight, and 1 image request.
- Brave errors or retries: 0.

## Query samples

### General web query

Query: `Nintendo DS physical game Spain back cover`

Returned five results. The leading results were Etsy and Amazon accessory/category pages. This proves general web retrieval, but relevance is weak for physical-edition certification and reinforces the need for source-specific or identifier-led routing.

### Exact-title web query

Query: `"Assassin's Creed II: Discovery" Nintendo DS`

Returned five results. The first three included Spanish Wikipedia, Vandal and an eBay Spain product page. This is useful for discovery, but the editorial pages do not establish a Spanish physical specimen.

### Exact-identifier web query

Query: `"SLES-00969" PlayStation`

Returned five results. The identifier was found, but the leading results included ROM-download sites. Exact-identifier retrieval works; source quality still requires the engine's capability and authority filters.

### Image query

Query: `"Assassin's Creed II: Discovery" Nintendo DS back cover`

Returned five results with source-page provenance. The leading results included an eBay listing and two LaunchBox back-cover images. Brave preserved both the original image URL and the containing page URL, making the results usable by the staged physical-evidence pipeline.

## Decision

Brave retrieval is sufficiently functional to run the single Discovery DS pilot. General queries remain noisy, while exact-title, identifier and image queries provide materially better evidence candidates.
