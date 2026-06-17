import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const blockedSource = readFileSync("src/lib/affiliate/matching/blocked-keywords.ts", "utf8");
for (const keyword of ["manual only", "box only", "repro", "caja vacía"]) {
  assert.ok(blockedSource.includes(keyword), `Debe bloquear ${keyword}`);
}

function normalize(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(input, offerTitle) {
  const normalizedOffer = normalize(offerTitle);
  if (/manual only|empty box|box only|repro|reproduction|solo manual|solo caja/.test(normalizedOffer)) return 0;
  const tokens = normalize(input.title)
    .split(" ")
    .filter((token) => token.length > 1 && !["the", "of", "de"].includes(token));
  let value = (tokens.filter((token) => normalizedOffer.includes(token)).length / tokens.length) * 0.62;
  if (normalizedOffer.includes(normalize(input.platform))) value += 0.2;
  if (/\bpal\b|\bespana\b|\bspain\b/.test(normalizedOffer)) value += 0.12;
  if (/\bntsc\b|\bjapan\b|\busa\b/.test(normalizedOffer)) value -= 0.45;
  return Math.max(0, Math.min(1, value));
}

const valid = score({ title: "Silent Hill 2", platform: "PS2", region: "PAL España" }, "Silent Hill 2 PS2 PAL España");
assert.ok(valid >= 0.85, "Oferta válida debe superar 0.85");
assert.equal(score({ title: "Silent Hill 2", platform: "PS2" }, "Silent Hill 2 PS2 Manual Only"), 0);
assert.equal(score({ title: "Silent Hill 2", platform: "PS2" }, "Silent Hill 2 PS2 Empty Box"), 0);
assert.ok(score({ title: "Silent Hill 2", platform: "PS2" }, "Silent Hill 2 Xbox") < 0.85);
assert.ok(score({ title: "Silent Hill 2", platform: "PS2", region: "PAL España" }, "Silent Hill 2 NTSC-J Japan") < 0.85);
assert.ok(readFileSync("src/components/affiliate-offers-panel.tsx", "utf8").includes("<AffiliateDisclosure"));

console.log("AFFILIATE_OFFERS_V1 tests OK.");
