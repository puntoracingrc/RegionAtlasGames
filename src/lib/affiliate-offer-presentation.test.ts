import assert from "node:assert/strict";
import test from "node:test";
import {
  affiliateConditionLabel,
  affiliateOfferLocation,
  affiliateShippingLabel,
  formatAffiliateMoney,
} from "./affiliate-offer-presentation";

test("presents eBay country codes with a Spanish name and flag", () => {
  assert.deepEqual(affiliateOfferLocation("US"), {
    code: "US",
    label: "Estados Unidos",
    flag: "🇺🇸",
  });
  assert.deepEqual(affiliateOfferLocation("IT"), {
    code: "IT",
    label: "Italia",
    flag: "🇮🇹",
  });
  assert.equal(affiliateOfferLocation("UK")?.code, "GB");
  assert.deepEqual(affiliateOfferLocation("Ubicación desconocida"), {
    code: null,
    label: "Ubicación desconocida",
    flag: null,
  });
});

test("normalizes common localized eBay conditions", () => {
  assert.equal(affiliateConditionLabel("Like New"), "Como nuevo");
  assert.equal(affiliateConditionLabel("Neu"), "Nuevo");
  assert.equal(affiliateConditionLabel("Sehr gut"), "Muy buen estado");
  assert.equal(affiliateConditionLabel("Acceptable"), "Aceptable");
});

test("keeps exact cents and separates shipping from the item price", () => {
  assert.match(formatAffiliateMoney(34.95, "EUR"), /34,95/);
  assert.equal(affiliateShippingLabel(0), "Envío gratis");
  assert.match(affiliateShippingLabel(15, "EUR"), /^\+ 15/);
  assert.equal(affiliateShippingLabel(null), "Consultar envío");
});
