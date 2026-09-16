import type { ResearchCatalogContext, ResearchComponent, ResearchSubjectBinding } from "./v2-types";

function comparable(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchText(expected: string[], observed: string | null | undefined): ResearchSubjectBinding["game"] {
  if (!observed) return "UNKNOWN";
  const candidate = comparable(observed);
  if (!candidate) return "UNKNOWN";
  return expected.map(comparable).some((value) => value === candidate || value.includes(candidate) || candidate.includes(value)) ? "MATCH" : "MISMATCH";
}

function canonicalPlatform(value: string | null | undefined): string {
  const normalized = comparable(value);
  const aliases: Record<string, string> = {
    "nintendo 64": "n64",
    "nintendo ds": "ds",
    "nintendo 3ds": "3ds",
    "nintendo switch": "switch",
    "nintendo switch 2": "switch2",
    "wii u": "wiiu",
    "xbox 360": "xbox360",
    "xbox one": "xboxone",
    "xbox series": "xboxseries",
    "playstation 1": "ps1",
    "playstation 2": "ps2",
    "playstation 3": "ps3",
    "playstation 4": "ps4",
    "playstation 5": "ps5",
    "playstation portable": "psp",
    "playstation vita": "psvita",
  };
  return aliases[normalized] ?? normalized.replace(/\s+/g, "");
}

export function bindEvidenceSubject(input: {
  context: ResearchCatalogContext;
  observedTitle?: string | null;
  observedPlatform?: string | null;
  observedEdition?: string | null;
  observedVariant?: string | null;
  observedComponent?: ResearchComponent | null;
  expectedComponent?: ResearchComponent | null;
}): ResearchSubjectBinding {
  const game = matchText([input.context.title, ...input.context.aliases], input.observedTitle);
  const platform = !input.observedPlatform
    ? "UNKNOWN"
    : canonicalPlatform(input.observedPlatform) === canonicalPlatform(input.context.platformSlug) ? "MATCH" : "MISMATCH";
  const edition = matchText([input.context.edition], input.observedEdition);
  const variant = !input.observedVariant
    ? "UNKNOWN"
    : matchText([input.context.physicalVariant ?? ""].filter(Boolean), input.observedVariant);
  const component = !input.expectedComponent || !input.observedComponent
    ? "UNKNOWN"
    : input.expectedComponent === input.observedComponent ? "MATCH" : "MISMATCH";
  const risks: string[] = [];
  if (game === "MISMATCH") risks.push("WRONG_GAME");
  if (platform === "MISMATCH") risks.push("WRONG_PLATFORM");
  if (edition === "MISMATCH") risks.push("WRONG_EDITION");
  if (variant === "MISMATCH") risks.push("WRONG_VARIANT");
  if (component === "MISMATCH") risks.push("WRONG_COMPONENT");
  if (risks.length) risks.push("CROSS_ATTRIBUTION_RISK");
  return { game, platform, edition, variant, component, risks };
}

export function evidenceBindingAcceptable(binding: ResearchSubjectBinding): boolean {
  return binding.game === "MATCH"
    && binding.platform === "MATCH"
    && ![binding.edition, binding.variant, binding.component].includes("MISMATCH");
}
