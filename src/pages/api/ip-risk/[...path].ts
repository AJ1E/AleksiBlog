import type { APIRoute } from "astro";
import { forward, maskIp } from "../../../lib/bff";

export const prerender = false;

const ALL = ["GET", "POST", "OPTIONS"] as const;

const handler: APIRoute = (context) => {
  const path = context.params.path ?? "";
  const upstream = `/api/ip-risk/${path}`;
  const isAuthed = context.locals.auth?.isAuthed ?? false;

  return forward("ip-risk", upstream, context, {
    isAuthed,
    transformJson: (body) => stripIpRisk(body, isAuthed),
  });
};

export const GET: APIRoute = handler;
export const POST: APIRoute = handler;
export const OPTIONS: APIRoute = handler;
export const ALL_METHODS = ALL;

function stripIpRisk(body: unknown, isAuthed: boolean): unknown {
  if (isAuthed || !body || typeof body !== "object") return body;
  const snap = body as Record<string, any>;

  // The /api/ip-risk/health response has no PII to strip beyond observedIp.
  if ("observedIp" in snap && !("egress" in snap)) {
    return { ...snap, observedIp: snap.observedIp ? maskIp(snap.observedIp) : null };
  }

  return {
    ...snap,
    egress: snap.egress
      ? {
          ...snap.egress,
          ip: maskIp(snap.egress.ip),
        }
      : snap.egress,
    network: snap.network
      ? {
          ...snap.network,
          rdns: null,
          cidr: null,
        }
      : snap.network,
    traces: snap.traces
      ? {
          claude: snap.traces.claude
            ? { ...snap.traces.claude, ip: maskIp(snap.traces.claude.ip) }
            : snap.traces.claude,
          cloudflare: snap.traces.cloudflare
            ? { ...snap.traces.cloudflare, ip: maskIp(snap.traces.cloudflare.ip) }
            : snap.traces.cloudflare,
        }
      : snap.traces,
    locked: { fullIp: true, rdns: true, cidr: true },
  };
}
