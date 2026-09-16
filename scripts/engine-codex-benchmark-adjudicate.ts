#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any -- reads immutable benchmark JSON. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { curatorHash } from "../src/lib/review-curator";

const ROOT = path.resolve(process.cwd(), process.argv[2] || "artifacts/engine-codex-review-benchmark");
const queue = JSON.parse(readFileSync(path.join(ROOT, "codex-review-queue.json"), "utf8")) as {
  entries: Array<{ caseId: string; engineResultHash: string }>;
};

type NewEvidence = {
  evidenceId: string;
  claim: string;
  source: string;
  sourceUrl: string;
  query: string;
  component: string | null;
  listingId: string | null;
  imageIndex: number | null;
  identifier: string[];
  origin: "CODEX";
  decisive: boolean;
};

type Adjudication = {
  decision: "ACCEPT_EXISTING" | "REROUTE_EXISTING" | "REJECT" | "PROPOSE_NEW_VARIANT" | "DEFER";
  confidence: number;
  resolvedCatalogId: string | null;
  newEvidence: NewEvidence[];
  newIdentifiers: string[];
  newRelationships: string[];
  repeatedEngineRoutes: string[];
  remainingEvidenceGaps: string[];
  decisiveEngineEvidenceIds: string[];
  reason: string;
  whatChangedTheDecision: string;
  discoveryAttribution: "ENGINE_DISCOVERED_CODEX_ADJUDICATED" | "JOINT_DISCOVERY" | "CODEX_DISCOVERED" | "UNRESOLVED";
};

function ev(id: string, claim: string, source: string, sourceUrl: string, query: string, identifier: string[] = []): NewEvidence {
  return {
    evidenceId: id,
    claim,
    source,
    sourceUrl,
    query,
    component: "OUTER_PACKAGE",
    listingId: null,
    imageIndex: null,
    identifier,
    origin: "CODEX",
    decisive: false,
  };
}

const decisions: Record<string, Adjudication> = {
  "PS4-02": {
    decision: "DEFER",
    confidence: 0.99,
    resolvedCatalogId: null,
    newEvidence: [
      ev(
        "codex-ps4-02-videooca-ean",
        "A Spanish retailer product record maps EAN 5055277046874 to Soul Hackers 2 for PS4; it does not prove the selected listing specimen's packaging market or visible condition.",
        "videooca",
        "https://tienda.videooca.com/playstation-5/294251-soul-hackers-2-ps4-5055277046874.html",
        "\"5055277046874\" CUSA Soul Hackers 2 PS4",
        ["EAN:5055277046874"],
      ),
    ],
    newIdentifiers: ["EAN:5055277046874"],
    newRelationships: ["EAN 5055277046874 -> Soul Hackers 2 PS4 retail product record"],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["LISTING_BOUND_MARKET_PROOF", "LISTING_BOUND_CONDITION_PROOF", "BACK_OR_DISC_PHOTO"],
    decisiveEngineEvidenceIds: [],
    reason: "The exact EAN improves product-family identity, but the selected listing still lacks listing-bound back, disc, or seal evidence. Seller country/title is not market or condition proof.",
    whatChangedTheDecision: "Nothing safely closed the handoff gaps; exact-identifier research narrowed the family but could not bind market and condition to this specimen.",
    discoveryAttribution: "UNRESOLVED",
  },
  "PS4-04": {
    decision: "DEFER",
    confidence: 0.99,
    resolvedCatalogId: null,
    newEvidence: [
      ev(
        "codex-ps4-04-retroloco-ean-cusa",
        "A photographed Spanish specimen record maps EAN 3391891995962 to CUSA-10246, PAL Spain, with Spanish/Portuguese cover and manual.",
        "retroloco",
        "https://www.retroloco.es/producto/code-vein-esp/",
        "\"3391891995962\" Code Vein PS4",
        ["EAN:3391891995962", "CUSA:CUSA-10246"],
      ),
      ev(
        "codex-ps4-04-pccomponentes-ean",
        "A second Spanish retailer maps product number 3391891995962 to Code Vein for PS4.",
        "pccomponentes",
        "https://www.pccomponentes.com/code-vein-ps4",
        "\"3391891995962\" Code Vein PS4",
        ["EAN:3391891995962"],
      ),
    ],
    newIdentifiers: ["EAN:3391891995962", "CUSA:CUSA-10246"],
    newRelationships: ["EAN 3391891995962 <-> CUSA-10246 <-> PAL Spain specimen"],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["LISTING_BOUND_CONDITION_PROOF", "ACTUAL_LISTING_IMAGE_NOT_CONTRACTUAL", "DISC_OR_CONTENTS_PHOTO"],
    decisiveEngineEvidenceIds: [],
    reason: "Codex corrected the Engine's OCR candidate and established the Spanish product family, but the selected Cash Converters image is non-contractual and cannot prove this unit's condition or contents.",
    whatChangedTheDecision: "The regional product identity became much clearer, but the final decision remains DEFER because evidence from a different specimen cannot certify the selected unit.",
    discoveryAttribution: "UNRESOLVED",
  },
  "PS5-01": {
    decision: "DEFER",
    confidence: 0.99,
    resolvedCatalogId: null,
    newEvidence: [
      ev(
        "codex-ps5-01-lamee-ean",
        "A Spanish specialist retailer maps EAN 0711719812920 to Demon's Souls PS5 and states Spanish box language.",
        "lamee-software",
        "https://www.lameesoftware.com/demon-s-souls-ps5sdsr.html",
        "\"0711719812920\" PPSA Demon's Souls PS5",
        ["EAN:0711719812920"],
      ),
      ev(
        "codex-ps5-01-elcorteingles-ean",
        "El Corte Inglés maps EAN 0711719812920 and model 9812920 to the standard PS5 release.",
        "el-corte-ingles",
        "https://www.elcorteingles.es/videojuegos/A37286384-demons-souls-remake-ps5/",
        "\"0711719812920\" Demon's Souls PS5",
        ["EAN:0711719812920", "MODEL:9812920"],
      ),
    ],
    newIdentifiers: ["EAN:0711719812920", "MODEL:9812920"],
    newRelationships: ["EAN 0711719812920 -> Spanish-box Demon's Souls PS5 retail family"],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["LISTING_BOUND_SEAL_PROOF", "LISTING_BOUND_BACK_OR_DISC_PHOTO", "EXACT_MARKET_SET"],
    decisiveEngineEvidenceIds: [],
    reason: "The EAN is corroborated for a Spanish-box retail family, but the selected listing has only a front image and no visible seal, back, or disc. A seller's 'nuevo precintado' claim is not physical condition proof.",
    whatChangedTheDecision: "Exact EAN research improved regional identity but did not close listing-bound condition and component gaps.",
    discoveryAttribution: "UNRESOLVED",
  },
  "PS5-02": {
    decision: "DEFER",
    confidence: 0.99,
    resolvedCatalogId: null,
    newEvidence: [
      ev(
        "codex-ps5-02-rfg-ean-ppsa",
        "RF Generation maps EAN 5055060954133 and PPSA-09664 to a Nordic DK/FI/NO/SE PS5 release.",
        "rf-generation",
        "https://www.rfgeneration.com/cgi-bin/getinfo.pl?ID=E-240-S-01100-A",
        "\"5055060954133\" \"PPSA-09664\"",
        ["EAN:5055060954133", "PPSA:PPSA-09664"],
      ),
      ev(
        "codex-ps5-02-eroski-ean",
        "A Spanish retailer uses the same EAN 5055060954133 for Dragon's Dogma 2 PS5, showing that seller/retailer locale alone cannot identify the packaging market.",
        "eroski",
        "https://supermercado.eroski.es/es/productdetail/mp139442-juego-dragons-dogma-2-para-playstation-5--ps5/",
        "\"5055060954133\" Dragon's Dogma 2 PS5",
        ["EAN:5055060954133"],
      ),
    ],
    newIdentifiers: ["EAN:5055060954133", "PPSA:PPSA-09664"],
    newRelationships: ["EAN 5055060954133 <-> PPSA-09664; Nordic database record conflicts with Spanish-marketplace assumptions"],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["LISTING_BOUND_BACK_PHOTO", "EXACT_MARKET_SET", "LISTING_BOUND_SEAL_PROOF"],
    decisiveEngineEvidenceIds: [],
    reason: "The exact EAN is real, but available sources do not safely bind the selected specimen to Spain; one specialist record assigns a Nordic market set. The listing also lacks physical seal/back proof.",
    whatChangedTheDecision: "Codex exposed a regional conflict rather than closing it, so DEFER is the only safe outcome.",
    discoveryAttribution: "UNRESOLVED",
  },
  "PS5-03": {
    decision: "DEFER",
    confidence: 1,
    resolvedCatalogId: null,
    newEvidence: [
      ev(
        "codex-ps5-03-retroloco-ean-ppsa",
        "A photographed Spanish specimen record maps EAN 5021290096851 to PPSA-10665, standard PAL Spain Final Fantasy XVI.",
        "retroloco",
        "https://www.retroloco.es/producto/final-fantasy-xvi-esp-precintado/",
        "\"5021290096851\" Final Fantasy XVI PS5",
        ["EAN:5021290096851", "PPSA:PPSA-10665"],
      ),
      ev(
        "codex-ps5-03-gamefaqs-ean",
        "GameFAQs release data independently maps EAN 5021290096851 to the Spanish EU standard release and PPSA-10665.",
        "gamefaqs",
        "https://gamefaqs.gamespot.com/ps5/300958-final-fantasy-xvi/data",
        "\"5021290096851\" Final Fantasy XVI PS5",
        ["EAN:5021290096851", "PPSA:PPSA-10665"],
      ),
    ],
    newIdentifiers: ["EAN:5021290096851", "PPSA:PPSA-10665"],
    newRelationships: ["EAN 5021290096851 <-> PPSA-10665 <-> Spanish standard release"],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["NO_ACTUAL_LISTING_PHOTO", "LISTING_BOUND_CONDITION_PROOF", "DISC_OR_CONTENTS_PHOTO"],
    decisiveEngineEvidenceIds: [],
    reason: "The product family is well mapped, but the seller explicitly says its image is illustrative and not the actual product. The exact used unit cannot be certified.",
    whatChangedTheDecision: "Codex resolved the product-family mapping but could not turn a stock image into specimen evidence.",
    discoveryAttribution: "UNRESOLVED",
  },
  "PS5-04": {
    decision: "DEFER",
    confidence: 1,
    resolvedCatalogId: null,
    newEvidence: [],
    newIdentifiers: [],
    newRelationships: [],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: ["NO_EXACT_IDENTIFIER", "LISTING_BOUND_MARKET_PROOF", "LISTING_BOUND_SEAL_PROOF", "BACK_OR_DISC_PHOTO"],
    decisiveEngineEvidenceIds: [],
    reason: "The selected listing exposes no exact EAN/PPSA and only a front image. Seller claims of PAL Spain and sealed condition cannot safely bind market or condition.",
    whatChangedTheDecision: "No non-repeated exact route was available after the Engine handoff; the original gaps remain.",
    discoveryAttribution: "UNRESOLVED",
  },
  "GB-01": {
    decision: "REROUTE_EXISTING",
    confidence: 0.99,
    resolvedCatalogId: "gameboy-japon-lock-n-chase",
    newEvidence: [],
    newIdentifiers: [],
    newRelationships: ["The catalog's Japanese Lock N' Chase entry is the regional sibling matching the specimen marked for Japan only."],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: [],
    decisiveEngineEvidenceIds: ["listing-obs-09ba161c48ad67d1", "listing-obs-279dd38ca4ce14cf", "listing-obs-d8ca962a71aecbcf", "listing-obs-d703ab790f95d464"],
    reason: "Box, cartridge, and manual are visibly present; the shared DMG-LCA family code binds the components and the manual states 'FOR SALE AND USE IN JAPAN ONLY'. The current PAL candidate must be rerouted to the existing Japanese catalog entry.",
    whatChangedTheDecision: "No new external evidence was needed. Codex applied the existing catalog sibling relationship to evidence already discovered by the Engine.",
    discoveryAttribution: "ENGINE_DISCOVERED_CODEX_ADJUDICATED",
  },
  "GB-02": {
    decision: "REROUTE_EXISTING",
    confidence: 0.99,
    resolvedCatalogId: "gameboy-nail-n-scale",
    newEvidence: [],
    newIdentifiers: [],
    newRelationships: ["The catalog's USA Nail 'n' Scale entry is the regional sibling matching the USA-distributed outer package."],
    repeatedEngineRoutes: [],
    remainingEvidenceGaps: [],
    decisiveEngineEvidenceIds: ["listing-obs-3f5968bc7158299b", "listing-obs-b4063f81bd2a475b", "listing-obs-da6e14beb811557c", "listing-obs-b5c1fec11cae5ba9"],
    reason: "The visible box, cartridge, and manual support complete condition. The box back binds UPC 013252002548 to Data East USA, Inc.; the OCR-only DMG-P-DR reading is not used. The PAL candidate must be rerouted to the existing USA entry.",
    whatChangedTheDecision: "No new external evidence was needed. Codex adjudicated the market from the Engine's component-bound box evidence.",
    discoveryAttribution: "ENGINE_DISCOVERED_CODEX_ADJUDICATED",
  },
};

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const results: any[] = [];
for (const handoff of queue.entries) {
  const enginePath = path.join(ROOT, "cases", handoff.caseId, "engine-result.json");
  const engineBytes = readFileSync(enginePath);
  const engine = JSON.parse(engineBytes.toString("utf8")) as any;
  if (engine.engineResultHash !== handoff.engineResultHash) throw new Error(`ENGINE_FREEZE_HASH_MISMATCH ${handoff.caseId}`);
  const expectedHash = engine.engineResultHash;
  const engineFileHashAtReview = createHash("sha256").update(engineBytes).digest("hex");
  const review = decisions[handoff.caseId];
  if (!review) throw new Error(`MISSING_CODEX_ADJUDICATION ${handoff.caseId}`);
  const evidenceUsed = [
    ...engine.evidenceUsed.map((row: any) => ({ ...row, decisive: review.decisiveEngineEvidenceIds.includes(row.evidenceId) })),
    ...review.newEvidence,
  ];
  const result: any = {
    schemaVersion: 1,
    benchmark: "PILOT_16",
    caseId: handoff.caseId,
    game: engine.game,
    platform: engine.platform,
    listingId: engine.listingId,
    reviewedEngineResultHash: expectedHash,
    engineFileHashAtReview,
    codexDecision: review.decision,
    codexConfidence: review.confidence,
    resolvedCatalogId: review.resolvedCatalogId,
    evidenceUsed,
    engineAlreadyKnew: engine.evidenceUsed.map((row: any) => row.evidenceId),
    codexNewEvidence: review.newEvidence.map((row) => row.evidenceId),
    codexNewSources: [...new Set(review.newEvidence.map((row) => row.source))],
    codexNewIdentifiers: review.newIdentifiers,
    codexNewImages: [],
    codexNewRelationships: review.newRelationships,
    queriesExecuted: [...new Set(review.newEvidence.map((row) => row.query))],
    repeatedEngineRoutes: review.repeatedEngineRoutes,
    remainingEvidenceGaps: review.remainingEvidenceGaps,
    reason: review.reason,
    whatChangedTheDecision: review.whatChangedTheDecision,
    discoveryAttribution: review.discoveryAttribution,
    cost: {
      retrievalUsd: 0,
      aiUsd: 0,
      totalUsd: 0,
      pricingBasis: "Codex integrated web/reasoning was not billed to the repository's Brave or OpenAI API accounts.",
    },
    frozenAt: new Date().toISOString(),
    codexResultImmutable: true,
  };
  result.codexResultHash = curatorHash(result);
  writeJson(path.join(ROOT, "cases", handoff.caseId, "codex-result.json"), result);
  results.push(result);
  process.stdout.write(`CODEX_CASE_FROZEN ${handoff.caseId} ${result.codexDecision} ${result.codexResultHash}\n`);
}

const resolved = results.filter((row) => row.codexDecision !== "DEFER");
writeJson(path.join(ROOT, "codex-review-scorecard.json"), {
  schemaVersion: 1,
  benchmark: "PILOT_16",
  createdAfterEngineFreeze: true,
  reviewed: results.length,
  resolved: resolved.length,
  deferred: results.length - resolved.length,
  decisions: Object.fromEntries(["ACCEPT_EXISTING", "REROUTE_EXISTING", "REJECT", "PROPOSE_NEW_VARIANT", "DEFER"].map((decision) => [decision, results.filter((row) => row.codexDecision === decision).length])),
  repeatedEngineRoutes: results.reduce((sum, row) => sum + row.repeatedEngineRoutes.length, 0),
  newEvidenceItems: results.reduce((sum, row) => sum + row.codexNewEvidence.length, 0),
  costs: { retrievalUsd: 0, aiUsd: 0, totalUsd: 0 },
  cases: results.map((row) => ({
    caseId: row.caseId,
    codexDecision: row.codexDecision,
    resolvedCatalogId: row.resolvedCatalogId,
    discoveryAttribution: row.discoveryAttribution,
    codexResultHash: row.codexResultHash,
    newEvidenceCount: row.codexNewEvidence.length,
    repeatedEngineRoutes: row.repeatedEngineRoutes.length,
  })),
});
