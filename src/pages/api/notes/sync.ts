import type { APIRoute } from "astro";
import { hasTrustedSameOrigin } from "../../../lib/auth-request";
import { apiError, forward } from "../../../lib/bff";

export const prerender = false;

export const POST: APIRoute = (context) => {
  if (!context.locals.auth?.isAuthed) {
    return apiError(401, "auth-required", "notes-sync");
  }
  if (!hasTrustedSameOrigin(context.request)) {
    return apiError(403, "origin-forbidden", "notes-sync");
  }

  return forward("notes-sync", "/api/notes/sync", context, { isAuthed: true });
};

export const GET: APIRoute = () => apiError(405, "method-not-allowed", "notes-sync");
