export class EbayAuthError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "EbayAuthError";
    this.code = code;
    this.details = details;
  }
}

export class EbayApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "EbayApiError";
    this.code = code;
    this.details = details;
  }
}
