import type { APIRoute } from "astro";
import { checkPassword, setAuthCookie } from "../../../lib/auth";

export const prerender = false;

function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("\u0000")) return "/";
  return raw;
}

export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  let password = "";
  let next = "/";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    password = String(body.password ?? "");
    next = safeNextPath(typeof body.next === "string" ? body.next : null);
  } else {
    const form = await request.formData();
    password = String(form.get("password") ?? "");
    next = safeNextPath(String(form.get("next") ?? ""));
  }

  let ok = false;
  try {
    ok = checkPassword(password);
  } catch {
    return redirect(`/login?error=missing-config&next=${encodeURIComponent(next)}`, 303);
  }

  if (!ok) {
    return redirect(`/login?error=bad-password&next=${encodeURIComponent(next)}`, 303);
  }

  setAuthCookie(cookies, url.protocol === "https:");
  return redirect(next, 303);
};

export const GET: APIRoute = () => new Response("Method Not Allowed", { status: 405 });
