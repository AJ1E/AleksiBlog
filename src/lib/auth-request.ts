function firstHeaderValue(value: string | null): string {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

/**
 * Verify the browser Origin against the request identity established by Nginx.
 * Astro's Node adapter currently builds an internal http URL for loopback
 * requests, so auth endpoints must validate the proxy's overwritten headers.
 */
export function hasTrustedSameOrigin(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;

  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) || requestUrl.protocol.slice(0, -1);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) || request.headers.get("host") || requestUrl.host;

  return (protocol === "http" || protocol === "https") && origin.protocol === `${protocol}:` && origin.host === host;
}

export function isSecureAuthRequest(request: Request): boolean {
  return firstHeaderValue(request.headers.get("x-forwarded-proto")) === "https" || new URL(request.url).protocol === "https:";
}
