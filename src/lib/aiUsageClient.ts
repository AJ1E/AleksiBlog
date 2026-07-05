export type AiModelShare = {
  name: string;
  pct: number;
  costUsd?: number;
  totalTokens?: number;
  requests?: number;
};

export type AiQuota = {
  label: string;
  used: number;
  total: number;
  unit: string;
  note?: string;
};

export type AiRollingWindow = {
  totalTokens: number;
  requests: number;
  coversMs: number;
};

export type AiHeatmapDay = {
  date: string;
  total: number;
  claude: number;
  codex: number;
  gemini: number;
};

export type AiToolUsage = {
  id: string;
  name: string;
  icon: string;
  color: string;
  provider: string;
  plan: string;
  installed: boolean;
  costMode: "estimated" | "subscription" | "exact" | "unknown";
  status: "active" | "idle";
  lastEventAt: string | null;
  quotas: AiQuota[];
  tok7d: number;
  tok30d: number;
  cost7d: number;
  cost30d: number;
  models7d: AiModelShare[];
  models30d: AiModelShare[];
  warnings: string[];
  windows?: {
    fiveHour?: AiRollingWindow;
    sevenDay?: AiRollingWindow;
  };
};

type ToolPayload = {
  tool: string;
  name?: string;
  provider?: string;
  installed?: boolean;
  plan?: string;
  costMode?: AiToolUsage["costMode"];
  status?: string;
  lastEventAt?: string | null;
  quotas?: Array<{
    label?: string;
    used?: number;
    total?: number;
    unit?: string;
    note?: string;
  }>;
  periods?: Record<
    string,
    {
      totalTokens?: number;
      totalCostUsd?: number;
    } | undefined
  >;
  models?: Record<
    string,
    Array<{
      name?: string;
      sharePct?: number;
      costUsd?: number;
      totalTokens?: number;
      requests?: number;
    }> | undefined
  >;
  warnings?: string[];
  windows?: {
    fiveHour?: { totalTokens?: number; requests?: number; coversMs?: number };
    sevenDay?: { totalTokens?: number; requests?: number; coversMs?: number };
  };
  error?: string;
};

type OverviewResponse = {
  generatedAt: string;
  tools: ToolPayload[];
  heatmap?: {
    timezone?: string;
    days?: Array<{
      date?: string;
      total?: number;
      claude?: number;
      codex?: number;
      gemini?: number;
    }>;
  };
  locked?: { quotas?: boolean; models?: boolean; windows?: boolean };
};

export type AiUsageLocked = { quotas: boolean; models: boolean; windows: boolean };

export type AiUsageOverview = {
  generatedAt: string;
  tools: AiToolUsage[];
  heatmap: {
    timezone: string;
    days: AiHeatmapDay[];
  };
  locked?: AiUsageLocked;
};

function resolveBackendUrls(): string[] {
  // Always go through the same-origin Astro BFF endpoints — they apply the
  // login gate before forwarding to the local helper server. The PUBLIC_* env
  // override remains as an escape hatch for advanced setups but bypasses auth.
  const fromEnv = String(import.meta.env.PUBLIC_AI_USAGE_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv.length > 0) return [fromEnv];
  if (typeof window !== "undefined" && window.location?.origin) {
    return [window.location.origin];
  }
  return [];
}


export const TOOL_DISPLAY: Record<string, { name: string; icon: string; color: string }> = {
  claude: { name: "Claude Code", icon: "◆", color: "var(--accent)" },
  codex: { name: "Codex CLI", icon: "❯", color: "var(--accent-teal)" },
  gemini: { name: "Gemini", icon: "✦", color: "var(--accent-purple)" },
};

export function hasAiUsageBackend() {
  return resolveBackendUrls().length > 0;
}

export async function refreshAiTool(toolId: string): Promise<AiToolUsage | null> {
  const data = await fetchAiUsageJson<ToolPayload>(`/api/usage/${toolId}/refresh`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!data) return null;
  return normalizeTool(data);
}

export async function fetchAiUsageOverview(): Promise<AiUsageOverview | null> {
  const data = await fetchAiUsageJson<OverviewResponse>("/api/usage/overview", {
    headers: { Accept: "application/json" },
  });
  if (!data) return null;
  return {
    generatedAt: data.generatedAt || new Date().toISOString(),
    tools: data.tools.map(normalizeTool),
    heatmap: normalizeHeatmap(data.heatmap),
    locked: data.locked
      ? {
          quotas: Boolean(data.locked.quotas),
          models: Boolean(data.locked.models),
          windows: Boolean(data.locked.windows),
        }
      : undefined,
  };
}

async function fetchAiUsageJson<T>(path: string, init: RequestInit): Promise<T | null> {
  const baseUrls = resolveBackendUrls();
  if (baseUrls.length === 0) return null;

  const errors: string[] = [];
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      if (!response.ok) {
        errors.push(`${baseUrl} returned HTTP ${response.status}`);
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  throw new Error(errors.join("; ") || "AI usage backend request failed");
}

function normalizeTool(payload: ToolPayload): AiToolUsage {
  const display = TOOL_DISPLAY[payload.tool] || {
    name: payload.name || payload.tool,
    icon: "•",
    color: "var(--text-muted)",
  };
  const installed = payload.installed !== false;
  return {
    id: payload.tool,
    name: payload.name || display.name,
    icon: display.icon,
    color: display.color,
    provider: payload.provider || "",
    plan: payload.plan || (installed ? "—" : "未安装"),
    installed,
    costMode: (payload.costMode as AiToolUsage["costMode"]) || "estimated",
    status: payload.status === "active" ? "active" : "idle",
    lastEventAt: payload.lastEventAt ?? null,
    quotas: normalizeQuotas(payload.quotas),
    tok7d: numberOrZero(payload.periods?.["7d"]?.totalTokens),
    tok30d: numberOrZero(payload.periods?.["30d"]?.totalTokens),
    cost7d: numberOrZero(payload.periods?.["7d"]?.totalCostUsd),
    cost30d: numberOrZero(payload.periods?.["30d"]?.totalCostUsd),
    models7d: normalizeModels(payload.models?.["7d"]),
    models30d: normalizeModels(payload.models?.["30d"]),
    warnings: normalizeWarnings(payload),
    windows: payload.windows
      ? {
          fiveHour: normalizeWindow(payload.windows.fiveHour),
          sevenDay: normalizeWindow(payload.windows.sevenDay),
        }
      : undefined,
  };
}

function normalizeWarnings(payload: ToolPayload): string[] {
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  if (!payload.error) return warnings;
  return [...warnings, `后端错误：${payload.error}`];
}

function normalizeWindow(
  raw: { totalTokens?: number; requests?: number; coversMs?: number } | undefined,
): AiRollingWindow | undefined {
  if (!raw) return undefined;
  return {
    totalTokens: numberOrZero(raw.totalTokens),
    requests: numberOrZero(raw.requests),
    coversMs: numberOrZero(raw.coversMs),
  };
}

function normalizeHeatmap(
  raw:
    | {
        timezone?: string;
        days?: Array<{
          date?: string;
          total?: number;
          claude?: number;
          codex?: number;
          gemini?: number;
        }>;
      }
    | undefined,
) {
  return {
    timezone: String(raw?.timezone || "UTC").trim() || "UTC",
    days: Array.isArray(raw?.days)
      ? raw.days
          .map((day) => ({
            date: String(day?.date || "").trim(),
            total: numberOrZero(day?.total),
            claude: numberOrZero(day?.claude),
            codex: numberOrZero(day?.codex),
            gemini: numberOrZero(day?.gemini),
          }))
          .filter((day) => day.date)
      : [],
  };
}

function normalizeQuotas(rawQuotas: ToolPayload["quotas"]): AiQuota[] {
  if (!Array.isArray(rawQuotas)) return [];
  return rawQuotas
    .map((quota) => ({
      label: String(quota?.label || "").trim(),
      used: numberOrZero(quota?.used),
      total: numberOrZero(quota?.total),
      unit: String(quota?.unit || "").trim(),
      note: String(quota?.note || "").trim(),
    }))
    .filter((quota) => quota.label && quota.total > 0);
}

type ModelArray = NonNullable<ToolPayload["models"]>[string];

function normalizeModels(rawModels: ModelArray | undefined): AiModelShare[] {
  if (!Array.isArray(rawModels)) return [];
  return rawModels
    .map((model) => ({
      name: String(model?.name || "").trim(),
      pct: numberOrZero(model?.sharePct),
      costUsd: numberOrZero(model?.costUsd),
      totalTokens: numberOrZero(model?.totalTokens),
      requests: numberOrZero(model?.requests),
    }))
    .filter((model) => model.name);
}

function numberOrZero(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
