export const SCANNER_DEFAULT_MODEL = "gpt-4o-mini";
export const SCANNER_MODEL_PRICING_DATE = "2026-09-08";
export const SCANNER_MODEL_PRICING_URL = "https://developers.openai.com/api/docs/pricing";

// Capability tiers from OpenAI's model catalog, not an OCR benchmark on game packaging.
// Standard, short-context USD per million tokens; image tokenization differs by model.
export const SCANNER_MODELS = [
  { id: "gpt-6-astra", name: "GPT-6 Astra", tier: "Máxima capacidad", inputRate: 10, outputRate: 50, reasoning: "medium", maxOutputTokens: 8000 },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", tier: "Alta capacidad", inputRate: 4, outputRate: 20, reasoning: "medium", maxOutputTokens: 8000 },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", tier: "Equilibrado", inputRate: 2, outputRate: 12, reasoning: "medium", maxOutputTokens: 8000 },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", tier: "Ligero", inputRate: 0.2, outputRate: 1.2, reasoning: "medium", maxOutputTokens: 8000 },
  { id: "gpt-4o-mini", name: "GPT-4o mini", tier: "Referencia del worker", inputRate: 0.15, outputRate: 0.6, reasoning: null, maxOutputTokens: 3500 },
] as const;
export type ScannerModelId = typeof SCANNER_MODELS[number]["id"];

export function scannerModel(value: unknown) {
  return SCANNER_MODELS.find((model) => model.id === value);
}

export function scannerModelsForAccess(advanced: boolean) {
  return SCANNER_MODELS.filter((model) => advanced || model.id === SCANNER_DEFAULT_MODEL);
}
