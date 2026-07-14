import fs from "node:fs/promises";
import { detectQoder, detectWorkBuddy } from "./detect.mjs";
import { getUsdToCnyRate } from "./exchange-rate.mjs";
import { priceUsage } from "./pricing.mjs";
import {
  addUsage,
  emptyTotals,
  ensureModelBucket,
  rankModels,
  roundCost,
  startOfMonth,
  startOfRange,
  walkJsonl,
} from "./util.mjs";

const CACHE_TTL_MS = 60_000;
const cache = new Map();

const CONFIG = {
  qoder: {
    envFile: "QODER_USAGE_FILE",
    name: "Qoder",
    provider: "Alibaba Qoder",
    plan: "本地结构化用量",
    pricingEnv: "QODER_PRICING_JSON",
  },
  workbuddy: {
    envFile: "WORKBUDDY_USAGE_FILE",
    name: "WorkBuddy",
    provider: "Tencent WorkBuddy",
    plan: "本地结构化用量",
    pricingEnv: "WORKBUDDY_PRICING_JSON",
  },
};

export function clearStructuredUsageCache(tool) {
  if (tool) cache.delete(tool);
  else cache.clear();
}

export function buildQoderOverview(options = {}) {
  return buildStructuredUsageOverview({ tool: "qoder", ...options });
}

export function buildWorkBuddyOverview(options = {}) {
  return buildStructuredUsageOverview({ tool: "workbuddy", ...options });
}

export async function readStructuredUsageEvents(tool) {
  const detect = tool === "qoder" ? await detectQoder() : await detectWorkBuddy();
  if (!detect.paths.usageFile) return [];
  const records = await readRecords(detect.paths.usageFile);
  return records.map(normalizeUsage).filter(Boolean);
}

async function buildStructuredUsageOverview({ tool, now = new Date() }) {
  const config = CONFIG[tool];
  if (!config) throw new Error(`Unsupported structured usage tool: ${tool}`);

  const cached = cache.get(tool);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) return cached.payload;

  const detect = tool === "qoder" ? await detectQoder() : await detectWorkBuddy();
  if (!detect.installed) {
    return { ...stubPayload(tool, config), installed: false };
  }

  const records = detect.paths.usageFile ? await readRecords(detect.paths.usageFile) : [];
  const usageRecords = records.map(normalizeUsage).filter(Boolean);
  const ranges = {
    "7d": { totals: emptyTotals(), models: new Map() },
    "30d": { totals: emptyTotals(), models: new Map() },
    month: { totals: emptyTotals(), models: new Map() },
  };
  const range7 = startOfRange(now, 7);
  const range30 = startOfRange(now, 30);
  const rangeMonth = startOfMonth(now);
  let lastEventAtMs = 0;
  let recentDayTokens = 0;

  for (const usage of usageRecords) {
    if (usage.timestampMs > lastEventAtMs) lastEventAtMs = usage.timestampMs;
    if (usage.timestampMs >= now.getTime() - 24 * 60 * 60 * 1000) {
      recentDayTokens += usage.totalTokens;
    }
    applyToBucket(ranges["7d"], range7, usage);
    applyToBucket(ranges["30d"], range30, usage);
    applyToBucket(ranges.month, rangeMonth, usage);
  }

  const pricing = readPricing(config.pricingEnv);
  const fx = pricing ? await getUsdToCnyRate() : { rate: 0, source: "not-needed" };
  const costs = {
    "7d": estimateCost(ranges["7d"].models, pricing),
    "30d": estimateCost(ranges["30d"].models, pricing),
    month: estimateCost(ranges.month.models, pricing),
  };
  const hasCredits = Object.values(ranges).some((bucket) => bucket.totals.credits > 0);
  const hasTokens = Object.values(ranges).some((bucket) => bucket.totals.totalTokens > 0);
  const warnings = [];
  if (!detect.paths.usageFile) {
    warnings.push("未找到结构化用量文件；为避免泄露提示词和本地路径，不读取普通运行日志。");
  }
  if (hasTokens && !pricing) {
    warnings.push("已读取 Token，但未配置该工具的官方模型单价，费用暂不显示。");
  }
  if (hasCredits && !hasTokens) {
    warnings.push("当前数据只有 Credits，官方规则不支持直接换算为 Token。");
  }

  const payload = {
    tool,
    name: config.name,
    provider: config.provider,
    installed: true,
    plan: config.plan,
    billingUnit: hasCredits && !hasTokens ? "credits" : hasTokens ? "tokens" : "unknown",
    costMode: pricing && hasTokens ? "estimated" : "unknown",
    status: recentDayTokens > 0 ? "active" : "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: lastEventAtMs > 0 ? new Date(lastEventAtMs).toISOString() : null,
    quotas: [],
    periods: {
      "7d": {
        ...ranges["7d"].totals,
        totalCostUsd: roundCost(costs["7d"].total),
        totalCostCny: roundCost(costs["7d"].total * fx.rate),
      },
      "30d": {
        ...ranges["30d"].totals,
        totalCostUsd: roundCost(costs["30d"].total),
        totalCostCny: roundCost(costs["30d"].total * fx.rate),
      },
      month: {
        ...ranges.month.totals,
        totalCostUsd: roundCost(costs.month.total),
        totalCostCny: roundCost(costs.month.total * fx.rate),
      },
    },
    models: {
      "7d": finalizeModels(ranges["7d"].models, ranges["7d"].totals.totalTokens, costs["7d"].byModel),
      "30d": finalizeModels(ranges["30d"].models, ranges["30d"].totals.totalTokens, costs["30d"].byModel),
    },
    sources: { structuredUsage: Boolean(detect.paths.usageFile), pricingConfigured: Boolean(pricing) },
    warnings,
  };

  cache.set(tool, { builtAt: Date.now(), payload });
  return payload;
}

function applyToBucket(bucket, range, usage) {
  if (usage.timestampMs < range.startMs || usage.timestampMs > range.endMs) return;
  addUsage(bucket.totals, usage);
  const modelBucket = ensureModelBucket(bucket.models, usage.model);
  addUsage(modelBucket, usage);
}

function estimateCost(modelMap, pricing) {
  const byModel = new Map();
  let total = 0;
  for (const [model, usage] of modelMap.entries()) {
    const cost = pricing ? priceUsage(pricing, model, usage) : 0;
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

function readPricing(envName) {
  const raw = process.env[envName]?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function readRecords(filePath) {
  try {
    if (filePath.endsWith(".jsonl")) {
      const records = [];
      for await (const entry of walkJsonl(filePath)) records.push(entry);
      return records;
    }
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.records)) return parsed.records;
    if (Array.isArray(parsed?.events)) return parsed.events;
    return [];
  } catch {
    return [];
  }
}

function normalizeUsage(record) {
  if (!record || typeof record !== "object") return null;
  const timestampMs = parseTimestamp(record.timestamp ?? record.createdAt ?? record.created_at);
  if (!Number.isFinite(timestampMs)) return null;
  const usage = record.usage && typeof record.usage === "object" ? record.usage : record;
  const inputTokens = numberFrom(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens);
  const cachedInputTokens = numberFrom(usage.cachedInputTokens ?? usage.cached_input_tokens ?? usage.cache_read_input_tokens);
  const outputTokens = numberFrom(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens);
  const suppliedTotal = numberFrom(usage.totalTokens ?? usage.total_tokens ?? usage.total);
  const totalTokens = suppliedTotal > 0 ? suppliedTotal : inputTokens + cachedInputTokens + outputTokens;
  const credits = numberFrom(record.credits ?? usage.credits ?? record.creditCost ?? usage.credit_cost);
  if (totalTokens <= 0 && credits <= 0) return null;
  return {
    model: String(record.model ?? usage.model ?? "unknown-model").trim() || "unknown-model",
    timestampMs,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    credits,
    requests: 1,
  };
}

function parseTimestamp(value) {
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  if (typeof value !== "string") return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function numberFrom(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function stubPayload(tool, config) {
  return {
    tool,
    name: config.name,
    provider: config.provider,
    plan: "未检测到本地用量",
    billingUnit: "unknown",
    costMode: "unknown",
    status: "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: null,
    quotas: [],
    periods: {
      "7d": { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
      "30d": { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
      month: { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
    },
    models: { "7d": [], "30d": [] },
    sources: { structuredUsage: false, pricingConfigured: false },
    warnings: ["未在本地检测到结构化用量数据。"],
  };
}
