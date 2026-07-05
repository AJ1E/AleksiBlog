import fs from "node:fs/promises";
import path from "node:path";
import { detectCodex } from "./detect.mjs";
import { OPENAI_PRICING, priceUsage } from "./pricing.mjs";
import {
  addUsage,
  emptyTotals,
  ensureModelBucket,
  listFilesRecursive,
  rankModels,
  roundCost,
  roundPercent,
  startOfMonth,
  startOfRange,
  walkJsonl,
} from "./util.mjs";

const CACHE_TTL_MS = 60_000;
let cache = null;

export function clearCodexCache() { cache = null; }

export async function buildCodexOverview({ now = new Date(), monthlyBudgetUsd } = {}) {
  if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const detect = await detectCodex();
  if (!detect.installed) {
    return { ...stubPayload(), installed: false };
  }

  const rolloutFiles = await listFilesRecursive(detect.paths.sessions, (name) =>
    name.startsWith("rollout-") && name.endsWith(".jsonl"),
  );

  const range7 = startOfRange(now, 7);
  const range30 = startOfRange(now, 30);
  const rangeMonth = startOfMonth(now);

  const buckets = {
    "7d": { totals: emptyTotals(), models: new Map() },
    "30d": { totals: emptyTotals(), models: new Map() },
    month: { totals: emptyTotals(), models: new Map() },
  };
  let lastEventAtMs = 0;
  let recentDayTokens = 0;
  let latestRateLimits = null;
  let latestPlanType = null;
  const recentCutoffMs = now.getTime() - 24 * 60 * 60 * 1000;

  for (const file of rolloutFiles) {
    let currentModel = null;
    let lastTotalTokens = 0;
    try {
      for await (const entry of walkJsonl(file)) {
        if (!entry || typeof entry !== "object") continue;

        // turn_context carries the active model for the upcoming turn
        if (entry.type === "turn_context" && typeof entry.payload?.model === "string") {
          currentModel = entry.payload.model;
        }
        if (entry.type === "session_meta" && typeof entry.payload?.model === "string") {
          currentModel = entry.payload.model;
        }
        if (entry.type !== "event_msg") continue;
        const payload = entry.payload || {};
        if (payload.type !== "token_count") continue;

        const info = payload.info || {};
        const last = info.last_token_usage || info.total_token_usage || null;
        if (!last) continue;

        const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
        const timestampMs = Number.isFinite(ts) ? ts : Date.now();

        // Codex emits cumulative + last-turn deltas. We use last-turn so each
        // bucket reflects activity inside that window rather than the running
        // session total.
        const inputTokens = Number(last.input_tokens) || 0;
        const cachedInputTokens = Number(last.cached_input_tokens) || 0;
        const outputTokens =
          (Number(last.output_tokens) || 0) + (Number(last.reasoning_output_tokens) || 0);
        const totalTokens =
          Number(last.total_tokens) || inputTokens + cachedInputTokens + outputTokens;
        if (totalTokens <= 0) continue;

        const usage = {
          model: currentModel || "codex-unknown",
          timestampMs,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens,
          requests: 1,
        };

        if (timestampMs > lastEventAtMs) lastEventAtMs = timestampMs;
        if (timestampMs >= recentCutoffMs) recentDayTokens += totalTokens;

        applyToBucket(buckets["30d"], range30, usage);
        applyToBucket(buckets["7d"], range7, usage);
        applyToBucket(buckets.month, rangeMonth, usage);

        if (payload.rate_limits) {
          if (
            !latestRateLimits ||
            timestampMs > latestRateLimits.timestampMs
          ) {
            latestRateLimits = {
              timestampMs,
              ...payload.rate_limits,
            };
          }
        }

        if (typeof payload.rate_limits?.plan_type === "string") {
          latestPlanType = payload.rate_limits.plan_type;
        }

        lastTotalTokens = Number(info.total_token_usage?.total_tokens) || lastTotalTokens;
      }
    } catch {
      // skip unreadable file
    }
  }

  const cost7d = estimateCost(buckets["7d"].models);
  const cost30d = estimateCost(buckets["30d"].models);
  const costMonth = estimateCost(buckets.month.models);

  const authInfo = await readAuthInfo(detect.paths.auth);
  const effectivePlan = latestPlanType || authInfo.planType;
  const planLabel = buildPlanLabel(effectivePlan, authInfo.authMode);
  // ChatGPT-plan users don't pay per-token; usage drains the rate windows
  // instead. We surface that as costMode="subscription" and zero out the cost
  // line so the UI doesn't show misleading dollar figures.
  const isSubscription = authInfo.authMode === "chatgpt";
  const costMode = isSubscription ? "subscription" : "estimated";
  const quotas = buildQuotas({
    rateLimits: latestRateLimits,
    monthlyBudgetUsd: isSubscription ? null : monthlyBudgetUsd,
    monthCostUsd: costMonth.total,
    nowMs: now.getTime(),
  });

  const payload = {
    tool: "codex",
    name: detect.name,
    provider: "OpenAI",
    installed: true,
    plan: planLabel,
    costMode,
    status: recentDayTokens > 0 ? "active" : "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: lastEventAtMs > 0 ? new Date(lastEventAtMs).toISOString() : null,
    quotas,
    rateLimits: normalizeRateLimits(latestRateLimits),
    periods: {
      "7d": {
        ...buckets["7d"].totals,
        totalCostUsd: roundCost(cost7d.total),
      },
      "30d": {
        ...buckets["30d"].totals,
        totalCostUsd: roundCost(cost30d.total),
      },
      month: {
        ...buckets.month.totals,
        totalCostUsd: roundCost(costMonth.total),
      },
    },
    models: {
      "7d": finalizeModels(buckets["7d"].models, buckets["7d"].totals.totalTokens, cost7d.byModel),
      "30d": finalizeModels(buckets["30d"].models, buckets["30d"].totals.totalTokens, cost30d.byModel),
    },
    sources: {
      rolloutFiles: rolloutFiles.length,
    },
    warnings: [],
  };

  cache = { builtAt: Date.now(), payload };
  return payload;
}

function applyToBucket(bucket, range, usage) {
  if (usage.timestampMs < range.startMs || usage.timestampMs > range.endMs) return;
  addUsage(bucket.totals, usage);
  const modelBucket = ensureModelBucket(bucket.models, usage.model);
  addUsage(modelBucket, usage);
}

function estimateCost(modelMap) {
  const byModel = new Map();
  let total = 0;
  for (const [model, usage] of modelMap.entries()) {
    const cost = priceUsage(OPENAI_PRICING, model, usage);
    byModel.set(model, cost);
    total += cost;
  }
  return { total, byModel };
}

function finalizeModels(modelMap, totalTokens, costMap) {
  return rankModels(modelMap, totalTokens).map((model) => ({
    ...model,
    costUsd: roundCost(costMap.get(model.name) || 0),
  }));
}

async function readAuthInfo(authPath) {
  try {
    const raw = await fs.readFile(authPath, "utf8");
    const data = JSON.parse(raw);
    const idToken = data?.tokens?.id_token;
    const accessToken = data?.tokens?.access_token;
    return {
      authMode: typeof data?.auth_mode === "string" ? data.auth_mode : null,
      planType: extractPlanType(idToken) || extractPlanType(accessToken) || null,
    };
  } catch {
    return { authMode: null, planType: null };
  }
}

function extractPlanType(jwt) {
  if (typeof jwt !== "string" || jwt.split(".").length < 2) return null;
  try {
    const [, payload] = jwt.split(".");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const claim = JSON.parse(json);
    const auth = claim?.["https://api.openai.com/auth"];
    if (!auth || typeof auth !== "object") return null;
    return typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : null;
  } catch {
    return null;
  }
}

function buildPlanLabel(planType, authMode) {
  if (authMode === "chatgpt" || planType) {
    if (planType === "pro") return "ChatGPT Pro";
    if (planType === "plus") return "ChatGPT Plus";
    if (planType === "free") return "ChatGPT Free";
    if (planType) return `ChatGPT ${planType.charAt(0).toUpperCase()}${planType.slice(1)}`;
    return "ChatGPT";
  }
  return "OpenAI API";
}

function normalizeRateLimits(rateLimits) {
  if (!rateLimits) return null;
  return {
    primary: normalizeWindow(rateLimits.primary),
    secondary: normalizeWindow(rateLimits.secondary),
    planType: rateLimits.plan_type ?? null,
    rateLimitReachedType: rateLimits.rate_limit_reached_type ?? null,
  };
}

function normalizeWindow(window) {
  if (!window || typeof window !== "object") return null;
  return {
    usedPercent: Number.isFinite(window.used_percent) ? window.used_percent : null,
    windowMinutes: Number.isFinite(window.window_minutes) ? window.window_minutes : null,
    resetsAt: typeof window.resets_at === "number" ? window.resets_at : null,
  };
}

function buildQuotas({ rateLimits, monthlyBudgetUsd, monthCostUsd, nowMs }) {
  const now = nowMs ?? Date.now();
  const quotas = [];
  if (Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0) {
    quotas.push({
      label: "月度预算",
      used: roundPercent(monthCostUsd),
      total: roundPercent(monthlyBudgetUsd),
      unit: "$",
    });
  }
  const primary = rateLimits?.primary;
  if (primary && primary.used_percent != null) {
    const resetsAtMs = toResetsAtMs(primary.resets_at);
    const hasReset = resetsAtMs !== null && now > resetsAtMs;
    quotas.push({
      label: `主额度窗口 (${formatWindow(primary.window_minutes)})`,
      used: hasReset ? 0 : roundPercent(primary.used_percent),
      total: 100,
      unit: "%",
      note: hasReset ? "窗口已重置" : formatResetsAt(resetsAtMs),
    });
  }
  const secondary = rateLimits?.secondary;
  if (secondary && secondary.used_percent != null) {
    const resetsAtMs = toResetsAtMs(secondary.resets_at);
    const hasReset = resetsAtMs !== null && now > resetsAtMs;
    quotas.push({
      label: `次额度窗口 (${formatWindow(secondary.window_minutes)})`,
      used: hasReset ? 0 : roundPercent(secondary.used_percent),
      total: 100,
      unit: "%",
      note: hasReset ? "窗口已重置" : formatResetsAt(resetsAtMs),
    });
  }
  return quotas;
}

function toResetsAtMs(resetsAt) {
  if (!Number.isFinite(resetsAt) || resetsAt <= 0) return null;
  // resets_at is a Unix timestamp in seconds
  return resetsAt * 1000;
}

function formatResetsAt(resetsAtMs) {
  if (resetsAtMs === null) return "";
  const date = new Date(resetsAtMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute} 重置`;
}

function formatWindow(minutes) {
  if (!Number.isFinite(minutes)) return "?";
  if (minutes >= 60 * 24 * 7) return `${Math.round(minutes / (60 * 24 * 7))}w`;
  if (minutes >= 60 * 24) return `${Math.round(minutes / (60 * 24))}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

function stubPayload() {
  return {
    tool: "codex",
    name: "Codex CLI",
    provider: "OpenAI",
    plan: "未安装",
    costMode: "estimated",
    status: "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: null,
    quotas: [],
    rateLimits: null,
    periods: {
      "7d": { ...emptyTotals(), totalCostUsd: 0 },
      "30d": { ...emptyTotals(), totalCostUsd: 0 },
      month: { ...emptyTotals(), totalCostUsd: 0 },
    },
    models: { "7d": [], "30d": [] },
    sources: { rolloutFiles: 0 },
    warnings: ["未在本地检测到 Codex CLI 数据。"],
  };
}
