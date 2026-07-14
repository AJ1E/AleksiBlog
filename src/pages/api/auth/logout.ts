import type { APIRoute } from "astro";
import { clearAuthCookie } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = ({ cookies, redirect }) => {
  clearAuthCookie(cookies);
  return redirect("/", 303);
};

export const GET: APIRoute = () => new Response("Method Not Allowed", { status: 405 });
