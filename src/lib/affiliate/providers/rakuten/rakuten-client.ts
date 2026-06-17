import { clearRakutenCachedToken, getRakutenAccessToken } from "./rakuten-auth";
import { RakutenApiError } from "./rakuten-errors";

function mergeHeaders(existing: HeadersInit | undefined, token: string): HeadersInit {
  return {
    ...(existing as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export async function rakutenFetch<T>(pathOrUrl: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await getRakutenAccessToken();
  const response = await fetch(pathOrUrl, {
    ...options,
    headers: mergeHeaders(options.headers, accessToken),
  });

  if (response.status === 401) {
    clearRakutenCachedToken();
    const retryToken = await getRakutenAccessToken();
    const retry = await fetch(pathOrUrl, {
      ...options,
      headers: mergeHeaders(options.headers, retryToken),
    });
    if (!retry.ok) throw new RakutenApiError("RAKUTEN_API_RETRY_FAILED", { status: retry.status });
    return retry.json() as Promise<T>;
  }

  if (!response.ok) throw new RakutenApiError("RAKUTEN_API_REQUEST_FAILED", { status: response.status });
  return response.json() as Promise<T>;
}
