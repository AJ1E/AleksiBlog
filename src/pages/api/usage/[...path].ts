import type { APIRoute } from "astro";
import { forward } from "../../../lib/bff";

export const prerender = false;

const handler: APIRoute = (context) => {
  const path = context.params.path ?? "";
  const upstream = `/api/usage/${path}`;
  const isAuthed = context.locals.auth?.isAuthed ?? false;

  return forward("ai-usage", upstream, context, {
    isAuthed,
    transformJson: (body) => stripAiUsage(body, isAuthed),
  });
};

export const GET: APIRoute = handler;
export const POST: APIRoute = handler;
export const OPTIONS: APIRoute = handler;

/**
 * Public view keeps the high-level totals (per-period totalTokens / totalCostUsd
 * and the heatmap), but locks per-window quotas and per-model breakdowns.
 */
function stripAiUsage(body: unknown, isAuthed: boolean): unknown {
  if (isAuthed || !body || typeof body !== "object") return body;
  const root = body as Record<string, any>;

  if (Array.isArray(root.tools)) {
    return { ...root, tools: root.tools.map(stripTool), locked: { quotas: true, models: true, windows: true } };
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
