import type { APIRoute } from "astro";
import { apiError, forward } from "../../../lib/bff";

export const prerender = false;

const STAT_RANGES = new Set(["1h", "12h", "24h", "1w", "30d"]);

const handler: APIRoute = (context) => {
  const path = context.params.path ?? "";
  const isAuthed = context.locals.auth?.isAuthed ?? false;

  if (context.request.method === "GET" && path === "overview") {
    return forward("server-status", "/api/servers/overview", context, {
      isAuthed,
      transformJson: (body) => stripServerOverview(body, isAuthed),
    });
  }

  const statsMatch = path.match(/^([A-Za-z0-9_-]+)\/stats$/);
  if (context.request.method === "GET" && statsMatch) {
    if (!isAuthed) return apiError(401, "auth-required", "server-stats");
    const range = context.url.searchParams.get("range") || "1h";
    if (!STAT_RANGES.has(range)) return apiError(400, "invalid-range");
    return forward("server-status", `/api/servers/${path}`, context, {
      isAuthed,
      searchParams: new URLSearchParams({ range }),
    });
  }

  return apiError(404, "not-found");
};

export const GET: APIRoute = handler;

/**
 * Public view of /overview: keep server presence (name/region/status flag) and
 * aggregate counts, but drop per-server detailed metrics (CPU/RAM/disk percent,
 * containers, services, GPU details).
 */
function stripServerOverview(body: unknown, isAuthed: boolean): unknown {
  if (isAuthed || !body || typeof body !== "object") return body;
  const root = body as Record<string, any>;
  if (!Array.isArray(root.servers)) return root;

  return {
    ...root,
    servers: root.servers.map((server: Record<string, any>) => ({
      id: server.id,
      name: server.name,
      location: server.location,
      region: server.region,
      flag: server.flag,
      lat: server.lat,
      lon: server.lon,
      provider: server.provider,
      status: server.status,
      // Aggregate-friendly counts kept; detailed breakdowns dropped.
      cpu: 0,
      ram: 0,
      ramUsedGb: 0,
      ramTotalGb: 0,
      disk: 0,
      diskUsedGb: 0,
      diskTotalGb: 0,
      netRxBps: 0,
      netTxBps: 0,
      uptime: "—",
      os: server.os,
      gpus: [],
      containers: [],
      services: [],
      dataUpdatedAt: server.dataUpdatedAt,
    })),
    locked: { perServerMetrics: true, containers: true, services: true, gpus: true },
  };
}
