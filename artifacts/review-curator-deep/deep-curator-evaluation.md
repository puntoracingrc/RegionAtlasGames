# Deep Curator end-to-end evaluation

- Generated: 2026-09-16T16:31:26.333Z
- Authoritative queue revision: `79212e336b82bb62efa2456a76e12bf05fd2a5b14dbb5bade72fc980e2c7fde0`
- Cases: 25
- Stage A external requests: 0
- Escalated: 25
- Deep completed: 25
- Batch stop: QUEUE_EXHAUSTED
- Total measured cost: $1.081465
- Knowledge packs consumed: 25/25; direct URLs consulted: 25; required route sets completed: 25/25.
- Generic-search cases: 0; routing violations: 0.
- Technical retrieval events: 46; recovered: 45; unrecovered: 1.

## Funnel

Worker evidence layer → 25 auditable cases
First-Pass Curator → 0 resolved; 25 escalated
Deep Curator → 0 newly resolved; 25 remain deferred

## Platform comparison

| Platform | Stage A resolves | Deep resolves | Final defer | Critical errors |
|---|---:|---:|---:|---:|
| PS4 | 0 | 0 | 4 | 0 |
| N64 | 0 | 0 | 4 | 0 |
| PS5 | 0 | 0 | 4 | 0 |

## Case matrix

### Dave Mirra BMX Challenge Wii Nintendo Wii PAL Alemania Español EMBALAJE ORIGINAL Completo

- Review item: `00f149364083176e98b3`
- Platform: other
- Listing: https://www.ebay.es/itm/377370832247?_skw=Dave+Mirra+BMX+Challenge&hash=item57dd0ded77:g:IpQAAeSwqn9qjtNW
- Price: 6.99 EUR
- Worker detected: identity=Dave Mirra BMX Challenge Wii Nintendo Wii PAL Alemania Español EMBALAJE ORIGINAL Completo; platform=wii; edition=unknown; region=PAL Alemania; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-dave-mirra-bmx-challenge; regions=PAL España, PAL Alemania; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Dave Mirra BMX Challenge" "wii" "standard" | site:todocoleccion.net "Dave Mirra BMX Challenge" "wii" "standard" | site:ebay.com "Dave Mirra BMX Challenge" "wii" "standard" | site:regionatlas.games "Dave Mirra BMX Challenge" "wii" "standard" | site:mobygames.com "Dave Mirra BMX Challenge" "wii" "standard" | "Dave Mirra BMX Challenge" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Dave Mirra BMX Challenge" wii | site:ebay.es "Dave Mirra BMX Challenge" wii.
- Useful new sources: none.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/377370832247?_skw=Dave+Mirra+BMX+Challenge&hash=item57dd0ded77:g:IpQAAeSwqn9qjtNW (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/177021245400 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/394659746620 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/itm/126057588285 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/p/1304302215 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: none. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### DREAMWORKS SUPERSTAR KARTZ . Pal España . Envio Certificado

- Review item: `01637866b794ae795eb9`
- Platform: other
- Listing: https://www.ebay.es/itm/225877051908?_skw=DreamWorks+Super+Star+Kartz&hash=item3497524a04:g:6AUAAOSwx-ZlWNgc
- Price: 26.9 EUR
- Worker detected: identity=DREAMWORKS SUPERSTAR KARTZ . Pal España . Envio Certificado; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-dreamworks-super-star-kartz; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "DreamWorks Super Star Kartz" "wii" "standard" | site:todocoleccion.net "DreamWorks Super Star Kartz" "wii" "standard" | site:ebay.com "DreamWorks Super Star Kartz" "wii" "standard" | site:regionatlas.games "DreamWorks Super Star Kartz" "wii" "standard" | site:mobygames.com "DreamWorks Super Star Kartz" "wii" "standard" | "DreamWorks Super Star Kartz" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "DreamWorks Super Star Kartz" wii | site:ebay.es "DreamWorks Super Star Kartz" wii.
- Useful new sources: https://retroravengames.com/products/dreamworks-super-star-kartz-nintendo-wii.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/225877051908?_skw=DreamWorks+Super+Star+Kartz&hash=item3497524a04:g:6AUAAOSwx-ZlWNgc (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/266799857872 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/357466007116 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:retroravengames.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Fast Food Panic para Nintendo Wii Pal España Completo en excelente estado

- Review item: `02d2a44bf900bcc26dcf`
- Platform: other
- Listing: https://www.ebay.es/itm/125379744212?_skw=Fast+Food+Panic&hash=item1d313711d4:g:qU0AAOSw4JxisZ83
- Price: 7.9 EUR
- Worker detected: identity=Fast Food Panic para Nintendo Wii Pal España Completo en excelente estado; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-fast-food-panic; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Fast Food Panic" "wii" "standard" | site:todocoleccion.net "Fast Food Panic" "wii" "standard" | site:ebay.com "Fast Food Panic" "wii" "standard" | site:regionatlas.games "Fast Food Panic" "wii" "standard" | site:mobygames.com "Fast Food Panic" "wii" "standard" | "Fast Food Panic" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Fast Food Panic" wii | site:ebay.es "Fast Food Panic" wii.
- Useful new sources: none.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/125379744212?_skw=Fast+Food+Panic&hash=item1d313711d4:g:qU0AAOSw4JxisZ83 (Error RESEARCH_BROWSER_HTTP_403), https://www.mobygames.com/game/wii/fast-food-panic_ (RESEARCH_BROWSER_HTTP_403), https://www.todocoleccion.net/videojuegos-consola-wii/fast-food-panic-nintendo-wii-completo-pal-espana~x246246135 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/itm/133380001832 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: none. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Fishing Master (selects) Juego Nintendo Wii

- Review item: `04a5a691752b7c689b9b`
- Platform: other
- Listing: https://www.ebay.es/itm/127748927580?_skw=Fishing+Master&hash=item1dbe6df05c:g:7tgAAeSwD7RpuDY9
- Price: 23.87 EUR
- Worker detected: identity=Fishing Master (selects) Juego Nintendo Wii; platform=wii; edition=unknown; region=USA; condition=unknown.
- Worker evidence: platform_candidate, market_region; gaps=MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-fishing-master; regions=PAL España, USA; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: CANONICAL_IDENTITY.
- Queries: site:ubisoft.com "Fishing Master" "wii" "standard" | site:redump.org "Fishing Master" "wii" "standard" | site:ogdb.eu "Fishing Master" "wii" "standard" | site:mobygames.com "Fishing Master" "wii" "standard" | site:yambalu.com "Fishing Master" "wii" "standard" | "Fishing Master" "wii" "standard" canonical identity | site:news.ubisoft.com "Fishing Master" wii | site:redump.org "Fishing Master" wii.
- Useful new sources: https://bitjumpgames.com/products/fishing-master-wii, https://www.walmart.com/ip/Fishing-Master-Wii/7080042, http://forum.redump.org/viewtopic.php?pid=131113.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/127748927580?_skw=Fishing+Master&hash=item1dbe6df05c:g:7tgAAeSwD7RpuDY9 (Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:bitjumpgames.com, candidate:www.walmart.com, redump. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### No incluye Motion Plus➡️Grand Slam Tennis Nintendo Wii PAL España COMPLETO/LEE👇

- Review item: `054df8e1147efbc38b49`
- Platform: other
- Listing: https://www.ebay.es/itm/195097511021?_skw=Grand+Slam+Tennis&hash=item2d6cb7c46d:g:vzgAAOSwpgdile4t&amdata=enc%3AAQALAAAA8ACCtXRWQnOEpyOqnQQ8KGbYZKe%2B%2Bmp3%2BYn0kD3eqchOiYWqmbfaWvlKCOnEzWmcfJIVHhKbFcT0jR%2BROqdOt4ad8RpMZuGN1w6uCLsw6fbgPRlaZuFHqUqP7oPmfm2W4x4qYSBCL%2F8eg4aEfzVk2kb9PFXQPyXJp7EXeiQ602ODwtn9kFnLUhBTPtfc4NFmx%2ByLnaYqsUe4MPdsr33Tl7w10aUrW8FHM126KNH3SKfIZzSz7A4xAYUWD%2BFGpNt0Q0RK8OLVBjhK8koRqljVenv7ozP%2BJUkrYsENkWd7P5k5WjT7Se0iiQKGv1NsnQjKUQ%3D%3D
- Price: 13.9 EUR
- Worker detected: identity=No incluye Motion Plus➡️Grand Slam Tennis Nintendo Wii PAL España COMPLETO/LEE👇; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-grand-slam-tennis; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Grand Slam Tennis" "wii" "standard" | site:todocoleccion.net "Grand Slam Tennis" "wii" "standard" | site:ebay.com "Grand Slam Tennis" "wii" "standard" | site:regionatlas.games "Grand Slam Tennis" "wii" "standard" | site:mobygames.com "Grand Slam Tennis" "wii" "standard" | "Grand Slam Tennis" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Grand Slam Tennis" wii | site:ebay.es "Grand Slam Tennis" wii.
- Useful new sources: https://www.nintendolife.com/reviews/2009/06/grand_slam_tennis_wii.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/195097511021?_skw=Grand+Slam+Tennis&hash=item2d6cb7c46d:g:vzgAAOSwpgdile4t&amdata=enc%3AAQALAAAA8ACCtXRWQnOEpyOqnQQ8KGbYZKe%2B%2Bmp3%2BYn0kD3eqchOiYWqmbfaWvlKCOnEzWmcfJIVHhKbFcT0jR%2BROqdOt4ad8RpMZuGN1w6uCLsw6fbgPRlaZuFHqUqP7oPmfm2W4x4qYSBCL%2F8eg4aEfzVk2kb9PFXQPyXJp7EXeiQ602ODwtn9kFnLUhBTPtfc4NFmx%2ByLnaYqsUe4MPdsr33Tl7w10aUrW8FHM126KNH3SKfIZzSz7A4xAYUWD%2BFGpNt0Q0RK8OLVBjhK8koRqljVenv7ozP%2BJUkrYsENkWd7P5k5WjT7Se0iiQKGv1NsnQjKUQ%3D%3D (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/291645184076 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/135349264780 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://forumsold.operationsports.com/previews/70/grand-slam-tennis-whats-hot-and-whats-not/ (RESEARCH_PAGE_HTTP_403), https://www.todocoleccion.net/videojuegos-consola-wii/grand-slam-tennis-nintendo-wii-kreaten~x524881492 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.todocoleccion.net/videojuegos-pc/grand-slam-tennis-wii-5030934073691~x512937117 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/itm/196070638930 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/itm/267320088556 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.nintendolife.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### GORMITI THE LORDS OF NATURE! + FIGURA .  Pal España.. Envio Certificado..Paypal

- Review item: `0560743eaf0bc388c28c`
- Platform: other
- Listing: https://www.ebay.es/itm/331989403702?_skw=Gormiti+The+Lords+of+Nature&hash=item4d4c1c4836:g:ZA4AAOSwmLlX8p0A
- Price: 44.9 EUR
- Worker detected: identity=GORMITI THE LORDS OF NATURE! + FIGURA .  Pal España.. Envio Certificado..Paypal; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-gormiti-the-lords-of-nature; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Gormiti: The Lords of Nature" "wii" "standard" | site:todocoleccion.net "Gormiti: The Lords of Nature" "wii" "standard" | site:ebay.com "Gormiti: The Lords of Nature" "wii" "standard" | site:regionatlas.games "Gormiti: The Lords of Nature" "wii" "standard" | site:mobygames.com "Gormiti: The Lords of Nature" "wii" "standard" | "Gormiti: The Lords of Nature" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Gormiti: The Lords of Nature" wii | site:ebay.es "Gormiti: The Lords of Nature" wii.
- Useful new sources: https://www.amazon.ca/Gormiti-Lords-Nature-Wii-Standard/dp/B003TJTV40.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/331989403702?_skw=Gormiti+The+Lords+of+Nature&hash=item4d4c1c4836:g:ZA4AAOSwmLlX8p0A (Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.amazon.ca. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### HOT WHEELS - TRACK ATTACK - NINTENDO WII - PAL - COMPLETO - VERY GOOD - WIIU

- Review item: `0568c4a9117a9d000b0e`
- Platform: other
- Listing: https://www.ebay.es/itm/185413966546?_skw=Hot+Wheels+Track+Attack&hash=item2b2b889ad2:g:sXwAAeSwvVxpCxVV
- Price: 14.95 EUR
- Worker detected: identity=HOT WHEELS - TRACK ATTACK - NINTENDO WII - PAL - COMPLETO - VERY GOOD - WIIU; platform=wii; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-hot-wheels-track-attack; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=1; identifiers=1; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: "4005209139434" | "4005209139434" "Hot Wheels Track Attack" | site:game.es "Hot Wheels Track Attack" "wii" "standard" | site:todocoleccion.net "Hot Wheels Track Attack" "wii" "standard" | site:ebay.com "Hot Wheels Track Attack" "wii" "standard" | site:regionatlas.games "Hot Wheels Track Attack" "wii" "standard" | site:mobygames.com "Hot Wheels Track Attack" "wii" "standard" | "Hot Wheels Track Attack" "wii" "standard" back cover distributor legal text | "4005209139434" wii | site:game.es "4005209139434".
- Useful new sources: https://www.budgetgaming.nl/wii/hot+wheels:+track+attack.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/185413966546?_skw=Hot+Wheels+Track+Attack&hash=item2b2b889ad2:g:sXwAAeSwvVxpCxVV (Error RESEARCH_BROWSER_HTTP_403), https://gameshop-twente.nl/hot-wheels-track-attack.html (RESEARCH_BROWSER_HTTP_429), https://www.ebay.com/shop/hot-wheels-wii?_nkw=hot+wheels+wii (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.com/shop/hot-wheels-wii-u?_nkw=hot+wheels+wii+u (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.justanswer.com/game-systems/4h0pg-wii-xmas-received-game-hot-wheels-track.html (RESEARCH_PAGE_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.budgetgaming.nl. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Driver San Francisco

- Review item: `061f8b43601c71726400`
- Platform: other
- Listing: https://www.ebay.es/itm/127600533900?_skw=Driver+San+Francisco&hash=item1db595a18c:g:YdYAAeSwDUFpWFud
- Price: 16.66 EUR
- Worker detected: identity=Driver San Francisco; platform=wii; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-driver-san-francisco; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=2; identifiers=1; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: "3307217929153" | "3307217929153" "Driver: San Francisco" | site:game.es "Driver: San Francisco" "wii" "standard" | site:todocoleccion.net "Driver: San Francisco" "wii" "standard" | site:ebay.com "Driver: San Francisco" "wii" "standard" | site:regionatlas.games "Driver: San Francisco" "wii" "standard" | site:mobygames.com "Driver: San Francisco" "wii" "standard" | "Driver: San Francisco" "wii" "standard" back cover distributor legal text | "3307217929153" wii | site:game.es "3307217929153".
- Useful new sources: https://www.smartoys.be/catalog/retro-gaming-wii-driver-san-francisco-p-3307217929153.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/127600533900?_skw=Driver+San+Francisco&hash=item1db595a18c:g:YdYAAeSwDUFpWFud (Error RESEARCH_BROWSER_HTTP_403), https://www.fnac.com/a8530965/Driver-San-Francisco-Wii-Jeu-video-Retrogaming (RESEARCH_PAGE_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.smartoys.be. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Inazuma Eleven Strikers Wii Nintendo Wii PAL España Español Completo Caja 2011

- Review item: `0653feb8d8bc2db37e97`
- Platform: other
- Listing: https://www.ebay.es/itm/377370832448?_skw=Inazuma+Eleven+Strikers&hash=item57dd0dee40:g:zb0AAeSwau1qjtRX&amdata=enc%3AAQALAAAA8ACCtXRWQnOEpyOqnQQ8KGZj98RtiezjmIA0btTTrmFtJhb7y9%2FFR9lf3c3GMixFOclPG%2BLpTAPncMg%2BKjfAE9Snzy%2BzDdvqvEYZ9VjWW6p7q1klE%2FO%2BvR%2BgHl4iV6pG2WBTEEAkplIi6B4gsXIxZerlxMbQw7K5GSIMutlNKARNNrAhwRWxAVODd4ImHtHYKc%2B0xCudnh%2FedAPQyIVKAtKRjh01K%2BOWdB%2FEh%2F7q%2FNzXxtCJ9xD2%2Fqv932zI6ktj30Oq6H6Yruzh%2Fes1Vyhlhn%2BqaYNaOOFd73Fy6C%2BjHs9OVCjMUa5eJdvwQz707%2BPKdw%3D%3D
- Price: 28.99 EUR
- Worker detected: identity=Inazuma Eleven Strikers Wii Nintendo Wii PAL España Español Completo Caja 2011; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-inazuma-eleven-strikers; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Inazuma Eleven Strikers" "wii" "standard" | site:todocoleccion.net "Inazuma Eleven Strikers" "wii" "standard" | site:ebay.com "Inazuma Eleven Strikers" "wii" "standard" | site:regionatlas.games "Inazuma Eleven Strikers" "wii" "standard" | site:mobygames.com "Inazuma Eleven Strikers" "wii" "standard" | "Inazuma Eleven Strikers" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Inazuma Eleven Strikers" wii | site:ebay.es "Inazuma Eleven Strikers" wii.
- Useful new sources: none.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/377370832448?_skw=Inazuma+Eleven+Strikers&hash=item57dd0dee40:g:zb0AAeSwau1qjtRX&amdata=enc%3AAQALAAAA8ACCtXRWQnOEpyOqnQQ8KGZj98RtiezjmIA0btTTrmFtJhb7y9%2FFR9lf3c3GMixFOclPG%2BLpTAPncMg%2BKjfAE9Snzy%2BzDdvqvEYZ9VjWW6p7q1klE%2FO%2BvR%2BgHl4iV6pG2WBTEEAkplIi6B4gsXIxZerlxMbQw7K5GSIMutlNKARNNrAhwRWxAVODd4ImHtHYKc%2B0xCudnh%2FedAPQyIVKAtKRjh01K%2BOWdB%2FEh%2F7q%2FNzXxtCJ9xD2%2Fqv932zI6ktj30Oq6H6Yruzh%2Fes1Vyhlhn%2BqaYNaOOFd73Fy6C%2BjHs9OVCjMUa5eJdvwQz707%2BPKdw%3D%3D (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/256576436493 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/295301620729 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.mobygames.com/game/50929/inazuma-eleven/ (RESEARCH_PAGE_HTTP_403), https://www.todocoleccion.net/videojuegos-consola-wii/inazuma-eleven-strikers-wii-2-mano-bueno~x287191493 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.todocoleccion.net/videojuegos-consola-wii/antiguo-juego-para-wii-inazuma-eleven-strikers~x421596304 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/p/12031245060 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/b/Inazuma-eleven-strikers/139973/bn_7005617356 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: none. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Family Trainer Treasure Adv.+ Extreme Challenge Juego para Nintendo Wii [PAL ES]

- Review item: `07aac5ae7dc1b2ef39f3`
- Platform: other
- Listing: https://www.ebay.es/itm/336494606882?_skw=Family+Trainer+Treasure+Adventure&hash=item4e58a43a22:g:VaIAAeSw87ZpWwib
- Price: 75.21 EUR
- Worker detected: identity=Family Trainer Treasure Adv.+ Extreme Challenge Juego para Nintendo Wii [PAL ES]; platform=wii; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-family-trainer-treasure-adventure; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Family Trainer: Treasure Adventure" "wii" "standard" | site:todocoleccion.net "Family Trainer: Treasure Adventure" "wii" "standard" | site:ebay.com "Family Trainer: Treasure Adventure" "wii" "standard" | site:regionatlas.games "Family Trainer: Treasure Adventure" "wii" "standard" | site:mobygames.com "Family Trainer: Treasure Adventure" "wii" "standard" | "Family Trainer: Treasure Adventure" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Family Trainer: Treasure Adventure" wii | site:ebay.es "Family Trainer: Treasure Adventure" wii.
- Useful new sources: none.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/336494606882?_skw=Family+Trainer+Treasure+Adventure&hash=item4e58a43a22:g:VaIAAeSw87ZpWwib (Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: none. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Family Ski & Snowboard (Balance Board) Version PAL NINTENDO Wii / Wii U RAREZA!!

- Review item: `08b70515182237c17235`
- Platform: other
- Listing: https://www.ebay.es/itm/133380001737?_skw=Family+Ski&hash=item1f0e114fc9:g:hIwAAOSwlw1dr0s2
- Price: 99 EUR
- Worker detected: identity=Family Ski & Snowboard (Balance Board) Version PAL NINTENDO Wii / Wii U RAREZA!!; platform=wii; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-family-ski; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=1; identifiers=1; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: "045496365868,045496365875" | "045496365868,045496365875" "Family Ski" | site:game.es "Family Ski" "wii" "standard" | site:todocoleccion.net "Family Ski" "wii" "standard" | site:ebay.com "Family Ski" "wii" "standard" | site:regionatlas.games "Family Ski" "wii" "standard" | site:mobygames.com "Family Ski" "wii" "standard" | "Family Ski" "wii" "standard" back cover distributor legal text | "045496365868,045496365875" wii | site:game.es "045496365868,045496365875".
- Useful new sources: https://thegameworld.co.uk/family-ski-wii, https://bordersdown.net/forum/gaming/first-play/36415-family-ski-we-ski-wii.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/133380001737?_skw=Family+Ski&hash=item1f0e114fc9:g:hIwAAOSwlw1dr0s2 (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/226876895567 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/376909427596 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:thegameworld.co.uk, candidate:bordersdown.net. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### DONKEY KONG JET RACE - NINTENDO WII - PAL ESPAÑA

- Review item: `0a3ac4ca518f4220b2ba`
- Platform: other
- Listing: https://www.ebay.es/itm/389162726108?_skw=Donkey+Kong+Jet+Race&hash=item5a9be7f2dc:g:wyYAAeSwXp5pAxsG
- Price: 25 EUR
- Worker detected: identity=DONKEY KONG JET RACE - NINTENDO WII - PAL ESPAÑA; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-donkey-kong-jet-race; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Donkey Kong Jet Race" "wii" "standard" | site:todocoleccion.net "Donkey Kong Jet Race" "wii" "standard" | site:ebay.com "Donkey Kong Jet Race" "wii" "standard" | site:regionatlas.games "Donkey Kong Jet Race" "wii" "standard" | site:mobygames.com "Donkey Kong Jet Race" "wii" "standard" | "Donkey Kong Jet Race" "wii" "standard" back cover distributor legal text | site:todocoleccion.net "Donkey Kong Jet Race" wii | site:ebay.es "Donkey Kong Jet Race" wii.
- Useful new sources: none.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/389162726108?_skw=Donkey+Kong+Jet+Race&hash=item5a9be7f2dc:g:wyYAAeSwXp5pAxsG (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/164180048713 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/167070805438 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/p/810890671 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.es/itm/381489221290 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: none. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Ghost Squad Wii Pal España

- Review item: `0b9827473683ab13e354`
- Platform: other
- Listing: https://www.ebay.es/itm/389161090498?_skw=Ghost+Squad&hash=item5a9bcefdc2:g:LU4AAeSwVzhpApdQ
- Price: 15 EUR
- Worker detected: identity=Ghost Squad Wii Pal España; platform=wii; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — Reused identical evidence-only result from shadow-20-live.
- Knowledge reuse: catalog=wii-ghost-squad; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=2; identifiers=1; direct URLs=1; source plans=58.
- Deep gap: MARKET_REGION.
- Queries: "5060138434370,5060138435155" | "5060138434370,5060138435155" "Ghost Squad" | site:game.es "Ghost Squad" "wii" "standard" | site:todocoleccion.net "Ghost Squad" "wii" "standard" | site:ebay.com "Ghost Squad" "wii" "standard" | site:regionatlas.games "Ghost Squad" "wii" "standard" | site:mobygames.com "Ghost Squad" "wii" "standard" | "Ghost Squad" "wii" "standard" back cover distributor legal text | "5060138434370,5060138435155" wii | site:game.es "5060138434370,5060138435155".
- Useful new sources: https://moegamer.net/2018/11/23/wii-essentials-ghost-squad/.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/389161090498?_skw=Ghost+Squad&hash=item5a9bcefdc2:g:LU4AAeSwVzhpApdQ (Error RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/256055706787 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/134727399753 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE), https://www.ebay.com/itm/404471633224 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:moegamer.net. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### The Order 1886 Limited Edition PS4 (EU)

- Review item: `9eb77b589f8eed7f7b1c`
- Platform: ps4
- Listing: https://www.todoconsolas.com/juegos-ps4/5416-the_order_1886_limited_edition_ps4_eu_po32789-711719823933.html
- Price: 29.95 EUR
- Worker detected: identity=The Order 1886 [Limited Edition]; platform=ps4; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=ps4-the-order-1886-limited-edition; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=1; identifiers=1; direct URLs=1; source plans=63.
- Deep gap: MARKET_REGION.
- Queries: "711719806011" | "711719806011" "The Order 1886 [Limited Edition]" | site:game.es "The Order 1886 [Limited Edition]" "ps4" "standard" | site:todocoleccion.net "The Order 1886 [Limited Edition]" "ps4" "standard" | site:ebay.com "The Order 1886 [Limited Edition]" "ps4" "standard" | site:regionatlas.games "The Order 1886 [Limited Edition]" "ps4" "standard" | site:mobygames.com "The Order 1886 [Limited Edition]" "ps4" "standard" | "The Order 1886 [Limited Edition]" "ps4" "standard" back cover distributor legal text | "711719806011" "PlayStation 4" | site:game.es "711719806011".
- Useful new sources: https://www.todoconsolas.com/juegos-ps4/5416-the_order_1886_limited_edition_ps4_eu_po32789-711719823933.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.com/itm/116321584030 (RESEARCH_BROWSER_HTTP_403), https://geedie.lv/ru/ps4-order-1886-limited-steelbook-edition (RESEARCH_BROWSER_HTTP_404).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Batman Arkham Knight Special Edition PS4 (SP)

- Review item: `a7e6c0f114ca5848b46c`
- Platform: ps4
- Listing: https://www.todoconsolas.com/juegos-ps4/13268-batman_arkham_knight_special_edition_ps4_sp_po36111-5051893221008.html
- Price: 16.95 EUR
- Worker detected: identity=Batman Arkham Knight [Special Edition]; platform=ps4; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=ps4-batman-arkham-knight-special-edition; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=63.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Batman Arkham Knight [Special Edition]" "ps4" "standard" | site:todocoleccion.net "Batman Arkham Knight [Special Edition]" "ps4" "standard" | site:ebay.com "Batman Arkham Knight [Special Edition]" "ps4" "standard" | site:regionatlas.games "Batman Arkham Knight [Special Edition]" "ps4" "standard" | site:mobygames.com "Batman Arkham Knight [Special Edition]" "ps4" "standard" | "Batman Arkham Knight [Special Edition]" "ps4" "standard" back cover distributor legal text | site:todocoleccion.net "Batman Arkham Knight [Special Edition]" PlayStation 4 | site:ebay.es "Batman Arkham Knight [Special Edition]" PlayStation 4.
- Useful new sources: https://www.todoconsolas.com/juegos-ps4/13268-batman_arkham_knight_special_edition_ps4_sp_po36111-5051893221008.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: none.
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Pantsu Hunter: Back to the 90s PS4 (EU)

- Review item: `5a9b9160ca1816f8d07c`
- Platform: ps4
- Listing: https://www.todoconsolas.com/juegos-ps4/176261-pantsu_hunter__back_to_the_90s_ps4_eu_po214024-3770011615575.html
- Price: 59.95 EUR
- Worker detected: identity=Pantsu Hunter: Back to the 90s; platform=ps4; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=ps4-pantsu-hunter-back-to-the-90s; regions=PAL España, PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=66; variants=1; identifiers=1; direct URLs=1; source plans=63.
- Deep gap: MARKET_REGION.
- Queries: "3770011615575" | "3770011615575" "Pantsu Hunter: Back to the 90s" | site:game.es "Pantsu Hunter: Back to the 90s" "ps4" "standard" | site:todocoleccion.net "Pantsu Hunter: Back to the 90s" "ps4" "standard" | site:ebay.com "Pantsu Hunter: Back to the 90s" "ps4" "standard" | site:regionatlas.games "Pantsu Hunter: Back to the 90s" "ps4" "standard" | site:mobygames.com "Pantsu Hunter: Back to the 90s" "ps4" "standard" | "Pantsu Hunter: Back to the 90s" "ps4" "standard" back cover distributor legal text | "3770011615575" "PlayStation 4" | site:game.es "3770011615575".
- Useful new sources: https://www.todoconsolas.com/juegos-ps4/176261-pantsu_hunter__back_to_the_90s_ps4_eu_po214024-3770011615575.html, https://tokyogamestory.com/en/red-art-games-/2681-pantsu-hunter-back-to-the-90s-with-sleeve999sony-ps4-fr-game-in-de-en-es-fr-ru-newsealed-red-art-games-aventurereflexiondv-fc1-3770011615575.html, https://ecommerce.datablitz.com.ph/products/ps4-pantsu-hunter-back-to-the-90s-reg-2.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.tradergames.fr/fr/playstation-4/109485-pantsu-hunter-ps4-fr-new-3770011615575.html (RESEARCH_BROWSER_HTTP_404).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com, candidate:tokyogamestory.com, candidate:ecommerce.datablitz.com.ph. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Black Hole PS4 (DE)

- Review item: `bb177450aff4b98e9ecf`
- Platform: ps4
- Listing: https://www.todoconsolas.com/juegos-ps4/206873-black_hole_ps4_de_po243244-8718591185540.html
- Price: 3.95 EUR
- Worker detected: identity=Black Hole; platform=ps4; edition=unknown; region=PAL Alemania; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=ps4-usa-black-hole; regions=USA, PAL Alemania; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=63.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Black Hole" "ps4" "standard" | site:todocoleccion.net "Black Hole" "ps4" "standard" | site:ebay.com "Black Hole" "ps4" "standard" | site:regionatlas.games "Black Hole" "ps4" "standard" | site:mobygames.com "Black Hole" "ps4" "standard" | "Black Hole" "ps4" "standard" back cover distributor legal text | site:todocoleccion.net "Black Hole" PlayStation 4 | site:ebay.es "Black Hole" PlayStation 4.
- Useful new sources: https://www.todoconsolas.com/juegos-ps4/206873-black_hole_ps4_de_po243244-8718591185540.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.com/itm/386868328319 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.com/itm/154737419727 (RESEARCH_BROWSER_HTTP_403), https://www.ebay.es/itm/133113653016 (DIRECT_FETCH_NOT_ALLOWED_FOR_SOURCE).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Blast Corps (cartucho) N64

- Review item: `n64-worker-933ba89565a5cc2437d3`
- Platform: n64
- Listing: https://retroplayzone.com/29876-blast-corps-cartucho-n64.html
- Price: 11 EUR
- Worker detected: identity=Blast Corps; platform=n64; edition=unknown; region=USA; condition=loose.
- Worker evidence: identity, platform_candidate, condition; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=n64-blast-corps; regions=USA; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=98.
- Deep gap: PRODUCT_CODE.
- Queries: site:no-intro.org "Blast Corps" "n64" "standard" | site:datomatic.no-intro.org "Blast Corps" "n64" "standard" | site:ogdb.eu "Blast Corps" "n64" "standard" | site:gamesdb.launchbox-app.com "Blast Corps" "n64" "standard" | site:todocoleccion.net "Blast Corps" "n64" "standard" | "Blast Corps" "n64" "standard" cartridge disc product code | "29876" | "Blast Corps" "n64" "USA" cartridge label "product code".
- Useful new sources: https://retroplayzone.com/29876-blast-corps-cartucho-n64.html, https://www.ebay.es/p/1126, https://www.ebay.es/p/1126, https://www.ebay.es/p/1126.
- Images inspected: 3; identifiers found: PRODUCT_CODE:29876:UNKNOWN.
- Rejected evidence: https://ebay.com/itm/206191526933?hash=item3001f90415%3Ag%3As%7EUAAeSwtLtp0n0s&itmmeta=01KNFDTQXQYWS7QVHB30HHX9HY&itmprp=enc%3AAQALAAAA4DKQclQvzFwZQpmMrsO4LuqlkX3%2F99YUYp4E1RxtGgc4lR3ZnApigcsKHN%2FmBTmGCMehWYW835iZTZxNNS46pKRup68WQ0Pp0y0gkkqvKJTkIKFxjleiJmxYW%2FOp45G0TwZVCeXVNg1gT3CvQhk0BDQDUP9BAsqvU53VTk+JGGJuzuMwiLCrh179C%2FfzGmpaK34D74ibmari4iGn9+0Hu3i48U9DbWIDktekEkE66xeEjmwlhj9AHYgsQ+YvesVUI08DgXr0mATyMzhyGuBt3jZXoZppO3j%2FlWwTTv5tFJ45%7Ctkp%3ABk9SR4L_6u2rZw (GALLERY_PAGE_UNAVAILABLE: Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:retroplayzone.com, ebay. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### International Superstar Soccer 64 (cartucho) - N64

- Review item: `n64-worker-e3ea6ec812269321a695`
- Platform: n64
- Listing: https://retroplayzone.com/28789-international-superstar-soccer-64-cartuchoi-n64.html
- Price: 9 EUR
- Worker detected: identity=International Superstar Soccer 64; platform=n64; edition=unknown; region=USA; condition=loose.
- Worker evidence: identity, platform_candidate, condition; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=n64-international-superstar-soccer-64; regions=USA; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=98.
- Deep gap: PRODUCT_CODE.
- Queries: site:no-intro.org "International Superstar Soccer 64" "n64" "standard" | site:datomatic.no-intro.org "International Superstar Soccer 64" "n64" "standard" | site:ogdb.eu "International Superstar Soccer 64" "n64" "standard" | site:gamesdb.launchbox-app.com "International Superstar Soccer 64" "n64" "standard" | site:todocoleccion.net "International Superstar Soccer 64" "n64" "standard" | "International Superstar Soccer 64" "n64" "standard" cartridge disc product code | "28789" | "International Superstar Soccer 64" "n64" "USA" cartridge label "product code".
- Useful new sources: https://retroplayzone.com/28789-international-superstar-soccer-64-cartuchoi-n64.html, https://www.ebay.com/itm/International-superstar-soccer-98-N64-cartridge-replacement-label-sticker-precut-/183816675231.
- Images inspected: 1; identifiers found: PRODUCT_CODE:28789:UNKNOWN.
- Rejected evidence: https://www.ebay.com/itm/International-superstar-soccer-98-N64-cartridge-replacement-label-sticker-precut-/183816675231 (GALLERY_PAGE_UNAVAILABLE: Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:retroplayzone.com, ebay. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### International Superstar Soccer 98 (cartucho) N64

- Review item: `n64-worker-2f9bc9308421264d849f`
- Platform: n64
- Listing: https://retroplayzone.com/25645-internation-superstar-soccer-98-sin-caja-n64.html
- Price: 12 EUR
- Worker detected: identity=International Superstar Soccer 98; platform=n64; edition=unknown; region=USA; condition=loose.
- Worker evidence: identity, platform_candidate, condition; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=n64-international-superstar-soccer-98; regions=USA; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=1; source plans=98.
- Deep gap: PRODUCT_CODE.
- Queries: site:no-intro.org "International Superstar Soccer 98" "n64" "standard" | site:datomatic.no-intro.org "International Superstar Soccer 98" "n64" "standard" | site:ogdb.eu "International Superstar Soccer 98" "n64" "standard" | site:gamesdb.launchbox-app.com "International Superstar Soccer 98" "n64" "standard" | site:todocoleccion.net "International Superstar Soccer 98" "n64" "standard" | "International Superstar Soccer 98" "n64" "standard" cartridge disc product code | "25645" | "International Superstar Soccer 98" "n64" "USA" cartridge label "product code".
- Useful new sources: https://retroplayzone.com/25645-internation-superstar-soccer-98-sin-caja-n64.html, https://www.ebay.com/itm/International-superstar-soccer-98-N64-cartridge-replacement-label-sticker-precut-/183816675231.
- Images inspected: 1; identifiers found: PRODUCT_CODE:25645:UNKNOWN.
- Rejected evidence: https://www.ebay.com/itm/International-superstar-soccer-98-N64-cartridge-replacement-label-sticker-precut-/183816675231 (GALLERY_PAGE_UNAVAILABLE: Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:retroplayzone.com, ebay. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Star Wars racer Episode I (cartucho) N64

- Review item: `n64-worker-06b68c49b7795dc8aed5`
- Platform: n64
- Listing: https://retroplayzone.com/29632-star-wars-racer-episode-i-cartucho-n64.html
- Price: 20 EUR
- Worker detected: identity=Star Wars Episode I: Racer; platform=n64; edition=unknown; region=Japón; condition=loose.
- Worker evidence: identity, platform_candidate, condition; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=n64-japon-star-wars-episode-i-racer; regions=Japón; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=2; identifiers=0; direct URLs=1; source plans=98.
- Deep gap: PRODUCT_CODE.
- Queries: site:no-intro.org "Star Wars Episode I: Racer" "n64" "standard" | site:datomatic.no-intro.org "Star Wars Episode I: Racer" "n64" "standard" | site:ogdb.eu "Star Wars Episode I: Racer" "n64" "standard" | site:gamesdb.launchbox-app.com "Star Wars Episode I: Racer" "n64" "standard" | site:todocoleccion.net "Star Wars Episode I: Racer" "n64" "standard" | "Star Wars Episode I: Racer" "n64" "standard" cartridge disc product code | "29632" | "Star Wars Episode I: Racer" "n64" "Japón" cartridge label "product code".
- Useful new sources: https://retroplayzone.com/29632-star-wars-racer-episode-i-cartucho-n64.html, https://www.ebay.com/itm/Nintendo-64-Star-Wars-Racer-Cartridge-Replacement-Game-Label-Sticker-/223486365468, https://www.etsy.com/market/episode_1_racer.
- Images inspected: 2; identifiers found: PRODUCT_CODE:29632:unbound, PRODUCT_CODE:29632:UNKNOWN.
- Rejected evidence: https://www.ebay.com/itm/Nintendo-64-Star-Wars-Racer-Cartridge-Replacement-Game-Label-Sticker-/223486365468 (GALLERY_PAGE_UNAVAILABLE: Error RESEARCH_BROWSER_HTTP_403), https://www.etsy.com/market/episode_1_racer (GALLERY_PAGE_UNAVAILABLE: Error RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:retroplayzone.com, ebay, candidate:www.etsy.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Uncharted Coleccion Legado de los Ladrones...

- Review item: `b61040fc7f57ac796e67`
- Platform: ps5
- Listing: https://www.todoconsolas.com/juegos-ps5/78864-uncharted_coleccion_legado_de_los_ladrones_remasterizado_ps5_sp_po127833-711719791690.html
- Price: 19.95 EUR
- Worker detected: identity=Uncharted: Colección Legado de los Ladrones; platform=ps5; edition=unknown; region=unknown; condition=unknown.
- Worker evidence: candidate_identity, platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=ps5-uncharted-coleccion-legado-de-los-ladrones; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=1; identifiers=0; direct URLs=2; source plans=70.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" | site:todocoleccion.net "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" | site:ebay.com "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" | site:regionatlas.games "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" | site:mobygames.com "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" | "Uncharted: Colección Legado de los Ladrones" "ps5" "standard" back cover distributor legal text | site:todocoleccion.net "Uncharted: Colección Legado de los Ladrones" PlayStation 5 | site:ebay.es "Uncharted: Colección Legado de los Ladrones" PlayStation 5.
- Useful new sources: https://www.todoconsolas.com/juegos-ps5/78864-uncharted_coleccion_legado_de_los_ladrones_remasterizado_ps5_sp_po127833-711719791690.html, https://www.game.es/uncharted-coleccion-legado-de-los-ladrones-playstation-5-198021.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.ebay.es/itm/176406754678 (RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: national-retailer.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com, national-retailer. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Yakuza Kiwami 3 & Dark Ties Steelbook Edition PS5 (EU)

- Review item: `99d439633b5311c4960c`
- Platform: ps5
- Listing: https://www.todoconsolas.com/juegos-ps5/194444-yakuza_kiwami_3___dark_ties_steelbook_edition_ps5_eu_po231513-5052770123453.html
- Price: 45.95 EUR
- Worker detected: identity=Yakuza Kiwami 3 & Dark Ties Steelbook Edition; platform=ps5; edition=unknown; region=PAL Europa; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=none; regions=PAL Europa; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=0; identifiers=0; direct URLs=1; source plans=70.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" | site:todocoleccion.net "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" | site:ebay.com "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" | site:regionatlas.games "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" | site:mobygames.com "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" | "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" "ps5" "standard" back cover distributor legal text | site:todocoleccion.net "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" PlayStation 5 | site:ebay.es "Yakuza Kiwami 3 & Dark Ties Steelbook Edition" PlayStation 5.
- Useful new sources: https://www.todoconsolas.com/juegos-ps5/194444-yakuza_kiwami_3___dark_ties_steelbook_edition_ps5_eu_po231513-5052770123453.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: none.
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Invincible VS Collectors Edition PS5 (SP)

- Review item: `39b0f01b400e4cb034d4`
- Platform: ps5
- Listing: https://www.todoconsolas.com/juegos-ps5/210455-invincible_vs_collectors_edition_ps5_sp_po246925-810161631780.html
- Price: 89.95 EUR
- Worker detected: identity=Invincible VS Collectors Edition; platform=ps5; edition=unknown; region=PAL España; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=none; regions=PAL España; identifiers=none.
- Knowledge Pack supplied: facts=55; variants=0; identifiers=0; direct URLs=1; source plans=70.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Invincible VS Collectors Edition" "ps5" "standard" | site:todocoleccion.net "Invincible VS Collectors Edition" "ps5" "standard" | site:ebay.com "Invincible VS Collectors Edition" "ps5" "standard" | site:regionatlas.games "Invincible VS Collectors Edition" "ps5" "standard" | site:mobygames.com "Invincible VS Collectors Edition" "ps5" "standard" | "Invincible VS Collectors Edition" "ps5" "standard" back cover distributor legal text | site:todocoleccion.net "Invincible VS Collectors Edition" PlayStation 5 | site:ebay.es "Invincible VS Collectors Edition" PlayStation 5.
- Useful new sources: https://www.todoconsolas.com/juegos-ps5/210455-invincible_vs_collectors_edition_ps5_sp_po246925-810161631780.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: https://www.argos.co.uk/product/7950139 (RESEARCH_BROWSER_HTTP_403).
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

### Banishers Ghosts Of New Eden Collector's Edition PS5...

- Review item: `9c0ea8059d4a40f29399`
- Platform: ps5
- Listing: https://www.todoconsolas.com/juegos-ps5/210461-banishers_ghosts_of_new_eden_collector_s_edition_ps5_uk_po246970-3512899967021.html
- Price: 99.95 EUR
- Worker detected: identity=Banishers Ghosts Of New Eden Collector's Edition ...; platform=ps5; edition=unknown; region=unknown; condition=unknown.
- Worker evidence: platform_candidate; gaps=MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- First Pass: **DEFER** — High-value evidence gaps remain; preserve the case for a later eligible attempt.
- Knowledge reuse: catalog=none; regions=none; identifiers=none.
- Knowledge Pack supplied: facts=44; variants=0; identifiers=0; direct URLs=1; source plans=70.
- Deep gap: MARKET_REGION.
- Queries: site:game.es "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" | site:todocoleccion.net "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" | site:ebay.com "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" | site:regionatlas.games "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" | site:mobygames.com "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" | "Banishers Ghosts Of New Eden Collector's Edition ..." "ps5" "standard" back cover distributor legal text | site:todocoleccion.net "Banishers Ghosts Of New Eden Collector's Edition ..." PlayStation 5 | site:ebay.es "Banishers Ghosts Of New Eden Collector's Edition ..." PlayStation 5.
- Useful new sources: https://www.todoconsolas.com/juegos-ps5/210461-banishers_ghosts_of_new_eden_collector_s_edition_ps5_uk_po246970-3512899967021.html.
- Images inspected: 0; identifiers found: none.
- Rejected evidence: none.
- What changed: No safety-eligible decision change.
- Final decision: **DEFER** (0.50).
- Decisive evidence: none.
- Still missing: MISSING_MARKET_PROOF, MISSING_COMPONENT_PHOTO, MISSING_COMPONENT_BINDING.
- Stop reason: HIGH_VALUE_ROUTES_EXHAUSTED.
- Sources actually consulted: candidate:www.todoconsolas.com. Generic search used: no. Could generic search have been avoided: no. Routing violations: none.

## Layer strengths and weaknesses

- Worker strengths: preserves listing URL, source, price, detected regional clues and condition without mutating authoritative data.
- Worker weaknesses: many source rows reach review without component observations or original-resolution galleries; those gaps cannot safely be reconstructed from a title.
- First-Pass strengths: deterministic, zero external requests, conservative market/condition/component binding and reusable identical baselines.
- First-Pass weaknesses: it correctly defers when the worker bundle lacks listing-specific physical proof.
- Deep Curator strengths: gap-led independent Research Engine runs, full catalog context, auditable queries and component-aware evidence.
- Deep Curator weaknesses: product-level web evidence cannot replace missing listing-specific component/condition evidence; provider failures remain safe DEFERs.

## Platform readiness

- PS4: NOT READY — regional matching stayed safe; readiness additionally requires demonstrated safe closure, not only deferral.
- N64: NOT READY — no cross-component attribution was allowed; closure still depends on cartridge/box/manual-specific photos.
- PS5: NOT READY — editions and markets stayed separate; readiness additionally requires demonstrated safe closure.
