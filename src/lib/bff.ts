import type { APIContext } from "astro";

export type BackendId = "ai-usage" | "ip-risk" | "server-status" | "notes-sync";

const BACKEND_DEFAULTS: Record<BackendId, string> = {
  "ai-usage": "http://127.0.0.1:8787",
  "ip-risk": "http://127.0.0.1:8788",
  "server-status": "http://127.0.0.1:8789",
  "notes-sync": "http://127.0.0.1:8790",
};

const ENV_KEY: Record<BackendId, string> = {
  "ai-usage": "AI_USAGE_BACKEND_URL",
  "ip-risk": "IP_RISK_BACKEND_URL",
  "server-status": "SERVER_STATUS_BACKEND_URL",
  "notes-sync": "NOTES_SYNC_BACKEND_URL",
};

export function getBackendBase(id: BackendId): string {
  const fromEnv = process.env[ENV_KEY[id]]?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return BACKEND_DEFAULTS[id];
}

export type ForwardOptions = {
  /** When true, body is dropped and only auth-stripped fields returned */
  isAuthed: boolean;
  /** Optional response transform (e.g., field stripping) */
  transformJson?: (body: unknown, isAuthed: boolean) => unknown;
  /** Explicitly allowlisted query parameters for the selected upstream path. */
  searchParams?: URLSearchParams;
};

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "content-encoding",
  "content-length",
]);

export async function forward(
  backend: BackendId,
  upstreamPath: string,
  context: APIContext,
  options: ForwardOptions,
): Promise<Response> {
  const base = getBackendBase(backend);
  const url = new URL(upstreamPath, base + "/");
  for (const [key, value] of options.searchParams ?? []) {
    url.searchParams.append(key, value);
  }

  const init: RequestInit = {
    method: context.request.method,
    headers: filterRequestHeaders(context.request.headers),
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body as BodyInit | null;
    // @ts-expect-error duplex required when streaming a body in Node fetch
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "backend-unreachable",
        backend,
        message: "The requested service is temporarily unavailable.",
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!isJson || !options.transformJson) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: filterResponseHeaders(upstream.headers),
    });
  }

  const json = (await upstream.json().catch(() => null)) as unknown;
  const transformed = options.transformJson(json, options.isAuthed);
  return new Response(JSON.stringify(transformed), {
    status: upstream.status,
    headers: jsonResponseHeaders(upstream.headers),
  });
}

function filterRequestHeaders(headers: Headers): Headers {
  const out = new Headers();
  // Helpers do not need browser identity, cookies, forwarding headers, or
  // arbitrary client supplied metadata. Only forward content negotiation.
  const accept = headers.get("accept");
  if (accept) out.set("accept", accept);
  const contentType = headers.get("content-type");
  if (contentType) out.set("content-type", contentType);
  return out;
}

function filterResponseHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of headers) {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
    out.set(key, value);
  }
  // Dashboard responses can contain account and infrastructure summaries.
  // Never allow an intermediary cache to retain them.
  out.set("cache-control", "no-store");
  return out;
}

function jsonResponseHeaders(source: Headers): Headers {
  const out = filterResponseHeaders(source);
  out.set("content-type", "application/json; charset=utf-8");
  return out;
}

export function apiError(status: number, error: string, scope?: string): Response {
  return new Response(JSON.stringify({ error, ...(scope ? { scope } : {}) }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Mask an IP for the unauthed view: keep first two octets, replace the
 * remaining octets with a wildcard. IPv6 only keeps the first hextet.
 */
export function maskIp(ip: string | undefined | null): string {
  if (!ip || typeof ip !== "string") return "";
  if (ip.includes(":")) {
    const head = ip.split(":")[0];
    return `${head}:****`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return "***";
  return `${parts[0]}.${parts[1]}.*.*`;
}
