import type { APIRoute } from "astro";
import { clearAuthCookie } from "../../../lib/auth";
import { hasTrustedSameOrigin } from "../../../lib/auth-request";

export const prerender = false;

export const POST: APIRoute = ({ request, cookies }) => {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "unsupported-content-type" }, 415);
  }
  if (!hasTrustedSameOrigin(request)) {
    return json({ error: "origin-forbidden" }, 403);
  }
  clearAuthCookie(cookies);
  return json({ ok: true });
};

export const GET: APIRoute = () => new Response("Method Not Allowed", { status: 405 });

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
