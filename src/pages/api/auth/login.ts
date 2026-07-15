import type { APIRoute } from "astro";
import { checkPassword, setAuthCookie } from "../../../lib/auth";
import { hasTrustedSameOrigin, isSecureAuthRequest } from "../../../lib/auth-request";

export const prerender = false;

function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("\u0000")) return "/";
  return raw;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ error: "unsupported-content-type" }, 415);
  }
  if (!hasTrustedSameOrigin(request)) {
    return json({ error: "origin-forbidden" }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const password = String(body.password ?? "");
  const next = safeNextPath(typeof body.next === "string" ? body.next : null);

  let ok = false;
  try {
    ok = checkPassword(password);
  } catch {
    return json({ error: "missing-config" }, 503);
  }

  if (!ok) {
    return json({ error: "bad-password" }, 401);
  }

  setAuthCookie(cookies, isSecureAuthRequest(request));
  return json({ ok: true, next });
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
