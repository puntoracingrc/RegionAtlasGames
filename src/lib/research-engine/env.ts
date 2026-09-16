import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadWorkerEnvFile(rootDir: string): Promise<void> {
  const filename = path.join(rootDir, ".env.worker");
  const raw = await readFile(filename, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    process.env[key] = unquote(line.slice(separator + 1));
  }
}

export async function loadResearchEnvironment(rootDir = process.cwd()): Promise<void> {
  loadEnvConfig(rootDir);
  await loadWorkerEnvFile(rootDir);
}

export function researchEngineEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.RESEARCH_ENGINE_ENABLED ?? "").trim().toLowerCase());
}

export function assertResearchEngineEnabled(): void {
  if (!researchEngineEnabled()) {
    throw new Error("RESEARCH_ENGINE_DISABLED: set RESEARCH_ENGINE_ENABLED=1 in .env.worker for live research runs");
  }
}

export function researchRuntimeCapabilities(): {
  openai: boolean;
  braveSearch: boolean;
  googleSearch: boolean;
  serpApi: boolean;
  textModel: string;
  visionModel: string;
} {
  const textModel = process.env.RESEARCH_LLM_MODEL?.trim() || "gpt-4o-mini";
  return {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    braveSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    googleSearch: Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim()),
    serpApi: Boolean(process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim()),
    textModel,
    visionModel: process.env.RESEARCH_VISION_MODEL?.trim() || textModel,
  };
}
