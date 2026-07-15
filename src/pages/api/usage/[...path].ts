import type { APIRoute } from "astro";
import { apiError, forward } from "../../../lib/bff";

export const prerender = false;

const TOOLS = new Set(["claude", "codex-desktop", "codex-cli", "gemini"]);
const VISIBLE_TOOLS = new Set(["codex-desktop", "codex-cli"]);

const handler: APIRoute = (context) => {
  const path = context.params.path ?? "";
  const isAuthed = context.locals.auth?.isAuthed ?? false;

  if (context.request.method === "GET" && path === "overview") {
    return forward("ai-usage", "/api/usage/overview", context, {
      isAuthed,
      transformJson: (body) => stripAiUsage(body, isAuthed),
    });
  }

  if (context.request.method === "GET" && TOOLS.has(path)) {
    if (!isAuthed) return apiError(401, "auth-required", "ai-usage-details");
    return forward("ai-usage", `/api/usage/${path}`, context, { isAuthed });
  }

  if (context.request.method === "POST" && path === "refresh") {
    if (!isAuthed) return apiError(401, "auth-required", "ai-usage-refresh");
    return forward("ai-usage", "/api/usage/refresh", context, {
      isAuthed,
      transformJson: (body) => stripAiUsage(body, true),
    });
  }

  const refreshTool = path.match(/^([^/]+)\/refresh$/)?.[1];
  if (context.request.method === "POST" && refreshTool && TOOLS.has(refreshTool)) {
    if (!isAuthed) return apiError(401, "auth-required", "ai-usage-refresh");
    return forward("ai-usage", `/api/usage/${path}`, context, { isAuthed });
  }

  return apiError(404, "not-found");
};

export const GET: APIRoute = handler;
export const POST: APIRoute = handler;

/**
 * Public view keeps the high-level totals (per-period totalTokens / totalCostUsd
 * and the heatmap), but locks per-window quotas and per-model breakdowns.
 */
function stripAiUsage(body: unknown, isAuthed: boolean): unknown {
  if (!body || typeof body !== "object") return body;
  const root = body as Record<string, any>;

  if (Array.isArray(root.tools)) {
    const visibleTools = root.tools.filter((tool: any) => VISIBLE_TOOLS.has(tool?.tool));
    return {
      ...root,
      tools: isAuthed ? visibleTools : visibleTools.map(stripTool),
      locked: isAuthed ? undefined : { quotas: true, models: true, windows: true },
    };
  }
  if (typeof root.tool === "string") {
    return stripTool(root);
  }
  return root;
}

function stripTool(tool: Record<string, any>): Record<string, any> {
  return {
    ...tool,
    quotas: [],
    models: undefined,
    windows: undefined,
    warnings: tool.warnings ? tool.warnings.filter((w: unknown) => typeof w === "string" && !/quota|window|model/i.test(w as string)) : tool.warnings,
    locked: { quotas: true, models: true, windows: true },
  };
}
