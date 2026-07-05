import type { APIRoute } from "astro";
import { forward } from "../../../lib/bff";

export const prerender = false;

const handler: APIRoute = (context) => {
  const path = context.params.path ?? "";
  const upstream = `/api/servers/${path}`;
  const isAuthed = context.locals.auth?.isAuthed ?? false;

  // Per-server stats (CPU/RAM/disk/containers/services time series) are
  // detail data. Block them entirely unless logged in.
  if (!isAuthed && /\/stats(?:\?|$)/.test(upstream)) {
    return new Response(
      JSON.stringify({ error: "auth-required", scope: "server-stats" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  return forward("server-status", upstream, context, {
    isAuthed,
    transformJson: (body) => stripServerOverview(body, isAuthed),
  });
};

export const GET: APIRoute = handler;
export const POST: APIRoute = handler;
export const OPTIONS: APIRoute = handler;

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
