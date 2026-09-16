import type { ResearchRetrievalFailureCode } from "./v2-types";

const QUOTA_PATTERN = /(?:quota|credits? exhausted|plan limit|monthly searches|run out of searches|account.*limit)/i;
const TIMEOUT_PATTERN = /(?:timeout|timed out|aborterror|etimedout)/i;

export class ResearchRetrievalError extends Error {
  constructor(
    public readonly code: ResearchRetrievalFailureCode,
    message: string,
    public readonly causeValue?: unknown,
  ) {
    super(message, causeValue === undefined ? undefined : { cause: causeValue });
    this.name = "ResearchRetrievalError";
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error ?? "UNKNOWN_RETRIEVAL_FAILURE");
}

export function classifyRetrievalFailure(error: unknown): ResearchRetrievalFailureCode {
  if (error instanceof ResearchRetrievalError) return error.code;
  const message = errorText(error);
  if (QUOTA_PATTERN.test(message)) return "PROVIDER_QUOTA_EXHAUSTED";
  if (TIMEOUT_PATTERN.test(message)) return "SOURCE_TIMEOUT";
  if (/HTTP_(?:401|403)|PAGE_HTTP_(?:401|403)|BROWSER_HTTP_(?:401|403)|blocked|forbidden/i.test(message)) return "SOURCE_BLOCKED";
  if (/HTTP_404|PAGE_HTTP_404|BROWSER_HTTP_404|not found/i.test(message)) return "SOURCE_NOT_FOUND";
  if (/HTTP_429|rate.?limit|too many requests/i.test(message)) return "SOURCE_RATE_LIMITED";
  if (/HTTP_5\d\d|ECONNRESET|ENETUNREACH|EAI_AGAIN|temporar/i.test(message)) return "PROVIDER_TEMPORARILY_UNAVAILABLE";
  if (/browser required/i.test(message)) return "BROWSER_REQUIRED";
  if (/image.*unavailable|unsupported.*image/i.test(message)) return "IMAGE_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

export function isRetryableRetrievalFailure(code: ResearchRetrievalFailureCode): boolean {
  return code === "SOURCE_TIMEOUT"
    || code === "SOURCE_RATE_LIMITED"
    || code === "PROVIDER_TEMPORARILY_UNAVAILABLE";
}

export function isInfrastructureRetrievalFailure(code: ResearchRetrievalFailureCode): boolean {
  return code !== "INTERNAL_ERROR";
}

export function safeRetrievalDetail(error: unknown): string {
  return errorText(error).replace(/(?:api_key|key|token|secret)=([^&\s]+)/gi, "$1=[REDACTED]").slice(0, 300);
}

export async function boundedBackoff(attempt: number): Promise<void> {
  const baseMs = Math.max(0, Math.min(2_000, Number(process.env.RESEARCH_RETRY_BASE_MS ?? 100)));
  const jitterMs = Math.floor(Math.random() * Math.max(1, Math.min(250, baseMs || 1)));
  const delayMs = Math.min(5_000, baseMs * (2 ** Math.max(0, attempt - 1)) + jitterMs);
  if (!delayMs) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
