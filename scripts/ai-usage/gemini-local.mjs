import fs from "node:fs/promises";
import { detectGemini } from "./detect.mjs";
import { GEMINI_PRICING, priceUsage } from "./pricing.mjs";
import {
  addUsage,
  emptyTotals,
  ensureModelBucket,
  listFilesRecursive,
  rankModels,
  roundCost,
  startOfMonth,
  startOfRange,
  walkJsonl,
} from "./util.mjs";

const CACHE_TTL_MS = 60_000;
let cache = null;

export function clearGeminiCache() { cache = null; }

export async function buildGeminiOverview({ now = new Date(), monthlyBudgetUsd } = {}) {
  if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const detect = await detectGemini();
  if (!detect.installed) {
    return { ...stubPayload(), installed: false };
  }

  // New format (Gemini CLI ≥ 0.40): chats/session-*.jsonl under tmp/**
  const chatFiles = await listFilesRecursive(detect.paths.tmp, (name) =>
    name.startsWith("session-") && name.endsWith(".jsonl"),
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
  const recentCutoffMs = now.getTime() - 24 * 60 * 60 * 1000;

  for (const file of chatFiles) {
    try {
      for await (const entry of walkJsonl(file)) {
        if (!entry || typeof entry !== "object") continue;
        if (entry.type !== "gemini") continue;

        const tok = entry.tokens;
        if (!tok || typeof tok !== "object") continue;

        const inputTokens = Number(tok.input) || 0;
        const cachedInputTokens = Number(tok.cached) || 0;
        // thoughts tokens are billed as output tokens
        const outputTokens = (Number(tok.output) || 0) + (Number(tok.thoughts) || 0);
        const totalTokens = inputTokens + cachedInputTokens + outputTokens;
        if (totalTokens <= 0) continue;

        const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
        const timestampMs = Number.isFinite(ts) ? ts : Date.now();

        const usage = {
          model: typeof entry.model === "string" ? entry.model : "gemini-unknown",
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
      }
    } catch {
      // skip unreadable file
    }
  }

  // Old logs.json: no token data, but use for lastEventAt if chatFiles are empty
  if (lastEventAtMs === 0) {
    const logFiles = await listFilesRecursive(detect.paths.tmp, (name) => name === "logs.json");
    for (const file of logFiles) {
      try {
        const raw = await fs.readFile(file, "utf8");
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const ts = entry?.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (Number.isFinite(ts) && ts > lastEventAtMs) lastEventAtMs = ts;
          if (Number.isFinite(ts) && ts >= recentCutoffMs) recentDayTokens += 1;
        }
      } catch {
        // skip
      }
    }
  }

  const authSettings = await readAuthSettings(detect.paths.settings);
  // Personal OAuth (Google account) = subscription, API key = estimated
  const isSubscription = authSettings.authType?.startsWith("oauth") ?? detect.hasAuth;
  const costMode = isSubscription ? "subscription" : "estimated";

  const cost7d = estimateCost(buckets["7d"].models);
  const cost30d = estimateCost(buckets["30d"].models);
  const costMonth = estimateCost(buckets.month.models);

  const hasTokenData = buckets["7d"].totals.totalTokens > 0 || buckets["30d"].totals.totalTokens > 0;
  const warnings = [];
  if (!hasTokenData && chatFiles.length === 0) {
    warnings.push("未找到 Gemini CLI 会话文件（chats/session-*.jsonl），请确认 Gemini CLI 版本 ≥ 0.40。");
  }

  const quotas = buildGeminiQuotas({
    monthlyBudgetUsd: isSubscription ? null : monthlyBudgetUsd,
    monthCostUsd: costMonth.total,
  });

  const payload = {
    tool: "gemini",
    name: detect.name,
    provider: "Google",
    installed: true,
    plan: detect.hasAuth ? "Gemini (OAuth 已登录)" : "Gemini (未登录)",
    costMode,
    status: recentDayTokens > 0 ? "active" : "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: lastEventAtMs > 0 ? new Date(lastEventAtMs).toISOString() : null,
    quotas,
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
    sources: { chatFiles: chatFiles.length },
    warnings,
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
    const cost = priceUsage(GEMINI_PRICING, model, usage);
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

function buildGeminiQuotas({ monthlyBudgetUsd, monthCostUsd }) {
  const quotas = [];
  if (Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0) {
    quotas.push({
      label: "月度预算",
      used: Math.round(monthCostUsd * 100) / 100,
      total: Math.round(monthlyBudgetUsd * 100) / 100,
      unit: "$",
    });
  }
  return quotas;
}

async function readAuthSettings(settingsPath) {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const data = JSON.parse(raw);
    return { authType: typeof data?.selectedAuthType === "string" ? data.selectedAuthType : null };
  } catch {
    return { authType: null };
  }
}

function stubPayload() {
  return {
    tool: "gemini",
    name: "Gemini CLI",
    provider: "Google",
    plan: "未安装",
    costMode: "unknown",
    status: "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: null,
    quotas: [],
    periods: {
      "7d": { ...emptyTotals(), totalCostUsd: 0 },
      "30d": { ...emptyTotals(), totalCostUsd: 0 },
      month: { ...emptyTotals(), totalCostUsd: 0 },
    },
    models: { "7d": [], "30d": [] },
    sources: { chatFiles: 0 },
    warnings: ["未在本地检测到 Gemini CLI 数据。"],
  };
}
