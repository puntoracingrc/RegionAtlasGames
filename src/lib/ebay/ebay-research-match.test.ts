import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateEbayResearchMatch,
  parseGameGtins,
  type EbayResearchEvidence,
  type EbayResearchTarget,
} from "./ebay-research-match";

const target: EbayResearchTarget = {
  title: "Silent Hill 2",
  platformSlug: "ps2",
  region: "PAL España",
  gtins: ["4012927024011"],
  reference: "SLES-50382",
};

function evidence(overrides: Partial<EbayResearchEvidence>): EbayResearchEvidence {
  return {
    title: "Silent Hill 2 PS2 PAL España completo",
    searchBasis: { kind: "keyword", value: "Silent Hill 2 PS2 PAL España" },
    ...overrides,
  };
}

test("routes an explicit US listing to another regional variant", () => {
  const match = evaluateEbayResearchMatch(
    target,
    evidence({ title: "Silent Hill 2 PS2 NTSC-U USA complete ESRB" }),
  );
  assert.equal(match.decision, "other_variant");
  assert.equal(match.regionMatch, "conflict");
  assert.equal(match.suggestedRegion, "USA");
});

test("accepts an exact GTIN when region is not printed in the title", () => {
  const match = evaluateEbayResearchMatch(
    target,
    evidence({
      title: "Silent Hill 2 Sony PlayStation 2",
      gtin: "4012927024011",
      searchBasis: { kind: "gtin", value: "4012927024011" },
    }),
  );
  assert.equal(match.exactIdentifier, true);
  assert.equal(match.regionMatch, "identifier");
  assert.equal(match.decision, "accept");
});

test("accepts an ePID obtained from an exact catalog identifier", () => {
  const match = evaluateEbayResearchMatch(
    { ...target, epids: ["123456789"] },
    evidence({
      title: "Silent Hill 2 Sony PlayStation 2",
      epid: "123456789",
      searchBasis: { kind: "epid", value: "123456789" },
    }),
  );
  assert.equal(match.exactIdentifier, true);
  assert.equal(match.decision, "accept");
});

test("treats joined title words as the same game", () => {
  const match = evaluateEbayResearchMatch(
    { ...target, title: "Chu Chu Rocket", platformSlug: "dreamcast", gtins: ["5060004760343"] },
    evidence({
      title: "ChuChu Rocket Sega Dreamcast PAL EU completo",
      gtin: "5060004760343",
      searchBasis: { kind: "gtin", value: "5060004760343" },
    }),
  );
  assert.equal(match.titleCoverage, 1);
  assert.equal(match.decision, "accept");
});

test("keeps a translated exact-reference listing when identifiers agree", () => {
  const match = evaluateEbayResearchMatch(
    { ...target, title: "Chu Chu Rocket", platformSlug: "dreamcast", region: "PAL Europa", gtins: ["5060004760343"], reference: "MK-51049-50" },
    evidence({
      title: "Cohete ChuChu Sega Dreamcast PAL MK-51049-50 sellado",
      gtin: "5060004760343",
      searchBasis: { kind: "gtin", value: "5060004760343" },
    }),
  );
  assert.equal(match.exactIdentifier, true);
  assert.equal(match.exactReference, true);
  assert.equal(match.decision, "accept");
});

test("rejects artwork-only listings even when the identifier was used for the search", () => {
  const match = evaluateEbayResearchMatch(
    { ...target, title: "Chu Chu Rocket", platformSlug: "dreamcast", region: "PAL Europa", gtins: ["5060004760343"] },
    evidence({
      title: "Solo incrustación trasera ChuChu Rocket Dreamcast",
      gtin: "5060004760343",
      searchBasis: { kind: "gtin", value: "5060004760343" },
    }),
  );
  assert.equal(match.decision, "reject");
});

test("rejects machine-translated custom artwork listings", () => {
  const match = evaluateEbayResearchMatch(
    target,
    evidence({
      title: "Incrustación de ilustraciones personalizadas Silent Hill 2 solo PS2",
      gtin: "4012927024011",
      searchBasis: { kind: "gtin", value: "4012927024011" },
    }),
  );
  assert.equal(match.decision, "reject");
});

test("keeps generic PAL listings under review for a Spain-specific edition", () => {
  const match = evaluateEbayResearchMatch(
    target,
    evidence({ title: "Silent Hill 2 PS2 PAL complete" }),
  );
  assert.equal(match.regionMatch, "unknown");
  assert.equal(match.decision, "review");
});

test("accepts a strong platform and Spain-region match", () => {
  const match = evaluateEbayResearchMatch(target, evidence({}));
  assert.equal(match.platformMatch, "exact");
  assert.equal(match.regionMatch, "exact");
  assert.equal(match.conditionBucket, "complete");
  assert.equal(match.decision, "accept");
});

test("rejects box-only listings even with a matching title", () => {
  const match = evaluateEbayResearchMatch(
    target,
    evidence({ title: "Silent Hill 2 PS2 PAL España box only" }),
  );
  assert.equal(match.decision, "reject");
});

test("rejects a collector listing for the standard physical edition", () => {
  const match = evaluateEbayResearchMatch(
    {
      title: "1971 Project Helios",
      edition: "standard",
      platformSlug: "ps4",
      region: "PAL Europa",
      gtins: [],
    },
    evidence({ title: "1971 Project Helios Collector's Edition PS4 PAL EU precintado" }),
  );
  assert.equal(match.decision, "reject");
  assert.ok(match.reasons.includes("edición física distinta"));
});

test("recognizes Collector's Ed. as the collector physical edition", () => {
  const match = evaluateEbayResearchMatch(
    {
      title: "1971 Project Helios Collector's Edition",
      edition: "collector",
      platformSlug: "ps4",
      region: "PAL España",
      gtins: ["8437015294131"],
    },
    evidence({
      title: "1971 Project Helios Collector's Ed. PS4 PAL España precintado",
      gtin: "8437015294131",
      searchBasis: { kind: "gtin", value: "8437015294131" },
    }),
  );
  assert.equal(match.decision, "accept");
  assert.equal(match.conditionBucket, "sealed");
});

test("distinguishes NEOGEO AES+ reissues from classic AES listings", () => {
  const aesPlusTarget: EbayResearchTarget = {
    title: "Metal Slug",
    edition: "Reedición AES+ 2026",
    platformSlug: "neogeo-aes-plus",
    region: "Internacional",
    gtins: [],
  };
  const aesPlusEvidence = evidence({
    title: "Metal Slug NEOGEO AES+ international sealed",
  });

  assert.equal(evaluateEbayResearchMatch(aesPlusTarget, aesPlusEvidence).platformMatch, "exact");
  assert.equal(
    evaluateEbayResearchMatch(
      { ...aesPlusTarget, platformSlug: "neogeo", edition: "standard" },
      aesPlusEvidence,
    ).platformMatch,
    "conflict",
  );
});

test("parses and deduplicates EAN values from catalog details", () => {
  assert.deepEqual(parseGameGtins("4012927024011, 4012927024011 / 0045496730529"), [
    "4012927024011",
    "0045496730529",
  ]);
});
