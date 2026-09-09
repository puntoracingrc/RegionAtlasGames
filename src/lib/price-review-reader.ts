import { validateReviewDocument } from "./price-review-store";

type ReadFailure = {
  transport: "http" | "sftp";
  code: string;
};

export const REVIEW_HTTP_TIMEOUT_MS = 10_000;

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN";
  const cause = error.cause as { code?: unknown } | undefined;
  const code = cause?.code ?? error.name;
  return typeof code === "string" && /^[A-Z_a-z0-9]{1,64}$/.test(code) ? code : "UNKNOWN";
}

// Both transports read the live authoritative document. Never substitute a bundled/local queue.
export async function readAuthoritativeReviewDocument(options: {
  url: string;
  readSftp: () => Promise<unknown>;
  fetcher?: typeof fetch;
  onFailure?: (failure: ReadFailure) => void;
}): Promise<unknown> {
  const failures: ReadFailure[] = [];
  const fail = (transport: ReadFailure["transport"], code: string) => {
    const failure = { transport, code };
    failures.push(failure);
    options.onFailure?.(failure);
  };
  try {
    const response = await (options.fetcher ?? fetch)(options.url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REVIEW_HTTP_TIMEOUT_MS),
    });
    if (!response.ok) {
      fail("http", `HTTP_${response.status}`);
    } else {
      const document: unknown = await response.json();
      validateReviewDocument(document);
      return document;
    }
  } catch (error) {
    fail("http", errorCode(error));
  }
  try {
    const document = await options.readSftp();
    validateReviewDocument(document);
    return document;
  } catch (error) {
    fail("sftp", errorCode(error));
    throw new Error(`No se pudo leer la cola del servidor (${failures.map((failure) => `${failure.transport}: ${failure.code}`).join("; ")}). No se utiliza una copia local incompleta; vuelve a actualizar.`);
  }
}
