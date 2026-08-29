import { hasFlag } from "country-flag-icons";
import getCountryFlag from "country-flag-icons/unicode";

export type AffiliateOfferLocation = {
  code: string | null;
  label: string;
  flag: string | null;
};

const REGION_ALIASES: Record<string, string> = {
  UK: "GB",
};

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });

function normalizedText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function affiliateOfferLocation(location: string | null | undefined): AffiliateOfferLocation | null {
  const raw = location?.trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const code = REGION_ALIASES[upper] ?? upper;
  if (!/^[A-Z]{2}$/.test(code) || !hasFlag(code)) {
    return { code: null, label: raw, flag: null };
  }

  return {
    code,
    label: regionNames.of(code) ?? raw,
    flag: getCountryFlag(code),
  };
}

export function affiliateConditionLabel(condition: string | null | undefined): string | null {
  const raw = condition?.trim();
  if (!raw) return null;
  const value = normalizedText(raw);

  if (["like new", "como nuevo", "wie neu", "come nuovo", "comme neuf"].includes(value)) {
    return "Como nuevo";
  }
  if (["very good", "muy bueno", "sehr gut", "ottime condizioni", "tres bon etat"].includes(value)) {
    return "Muy buen estado";
  }
  if (["good", "bueno", "gut", "buone condizioni", "bon etat"].includes(value)) {
    return "Buen estado";
  }
  if (["acceptable", "aceptable", "accettabile", "akzeptabel"].includes(value)) {
    return "Aceptable";
  }
  if (["used", "usado", "gebraucht", "preowned", "pre owned", "occasion"].includes(value)) {
    return "Segunda mano";
  }
  if (["new", "nuevo", "neu", "nuovo", "neuf", "brand new"].includes(value)) {
    return "Nuevo";
  }
  return raw;
}

export function formatAffiliateMoney(value: number | null | undefined, currency = "EUR"): string {
  if (value == null || !Number.isFinite(value)) return "Ver precio";
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function affiliateShippingLabel(
  shippingPrice: number | null | undefined,
  currency = "EUR",
): string {
  if (shippingPrice == null || !Number.isFinite(shippingPrice)) return "Consultar envío";
  if (shippingPrice === 0) return "Envío gratis";
  return `+ ${formatAffiliateMoney(shippingPrice, currency)} de envío`;
}
