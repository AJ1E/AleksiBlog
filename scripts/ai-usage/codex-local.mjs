import fs from "node:fs/promises";
import { detectCodex } from "./detect.mjs";
import { getUsdToCnyRate } from "./exchange-rate.mjs";
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
const SEGMENTS = new Set(["desktop", "cli"]);
let cache = new Map();

export function clearCodexCache() { cache.clear(); }

export async function buildCodexOverview({ now = new Date(), monthlyBudgetUsd, segment = "cli" } = {}) {
  const selectedSegment = SEGMENTS.has(segment) ? segment : "cli";
  const cached = cache.get(selectedSegment);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  const detect = await detectCodex();
  if (!detect.installed) {
    return { ...stubPayload(selectedSegment), installed: false };
  }

  const authInfo = await readAuthInfo(detect.paths.auth);

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
  let unclassifiedEvents = 0;
  const recentCutoffMs = now.getTime() - 24 * 60 * 60 * 1000;

  for (const file of rolloutFiles) {
    let currentModel = null;
    let currentSource = null;
    let currentProvider = null;
    let lastTotalTokens = 0;
    try {
      for await (const entry of walkJsonl(file)) {
        if (!entry || typeof entry !== "object") continue;

        // turn_context carries the active model for the upcoming turn
        if (entry.type === "turn_context" || entry.type === "session_meta") {
          if (typeof entry.payload?.model === "string") currentModel = entry.payload.model;
          currentSource = normalizeSource(entry.payload?.source) || currentSource;
          currentProvider = normalizeSource(entry.payload?.model_provider) || currentProvider;
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

        const eventSegment = classifyCodexEvent({
          source: currentSource,
          provider: currentProvider,
          model: currentModel,
          authMode: authInfo.authMode,
        });
        if (!eventSegment) {
          unclassifiedEvents += 1;
          continue;
        }
        if (eventSegment !== selectedSegment) continue;

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

  const fx = await getUsdToCnyRate();
  const cost7d = estimateCost(buckets["7d"].models, selectedSegment, fx.rate);
  const cost30d = estimateCost(buckets["30d"].models, selectedSegment, fx.rate);
  const costMonth = estimateCost(buckets.month.models, selectedSegment, fx.rate);

  const effectivePlan = latestPlanType || authInfo.planType;
  const planLabel = selectedSegment === "desktop"
    ? buildPlanLabel(effectivePlan, authInfo.authMode)
    : "Volcengine Coding Plan · GLM-5.2";
  const costMode = "estimated";
  const quotas = buildQuotas({
    rateLimits: latestRateLimits,
    monthlyBudgetUsd: selectedSegment === "desktop" ? monthlyBudgetUsd : null,
    monthCostUsd: costMonth.total,
    nowMs: now.getTime(),
  });

  const payload = {
    tool: selectedSegment === "desktop" ? "codex-desktop" : "codex-cli",
    name: selectedSegment === "desktop" ? "ChatGPT Codex" : "Codex CLI",
    provider: selectedSegment === "desktop" ? "OpenAI" : "Volcengine Ark",
    installed: true,
    plan: planLabel,
    costMode,
    status: recentDayTokens > 0 ? "active" : "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: lastEventAtMs > 0 ? new Date(lastEventAtMs).toISOString() : null,
    quotas: selectedSegment === "desktop" ? quotas : [],
    rateLimits: normalizeRateLimits(latestRateLimits),
    periods: {
      "7d": {
        ...buckets["7d"].totals,
        totalCostUsd: roundCost(cost7d.total),
        totalCostCny: roundCost(cost7d.total * fx.rate),
      },
      "30d": {
        ...buckets["30d"].totals,
        totalCostUsd: roundCost(cost30d.total),
        totalCostCny: roundCost(cost30d.total * fx.rate),
      },
      month: {
        ...buckets.month.totals,
        totalCostUsd: roundCost(costMonth.total),
        totalCostCny: roundCost(costMonth.total * fx.rate),
      },
    },
    models: {
      "7d": finalizeModels(buckets["7d"].models, buckets["7d"].totals.totalTokens, cost7d.byModel, fx.rate),
      "30d": finalizeModels(buckets["30d"].models, buckets["30d"].totals.totalTokens, cost30d.byModel, fx.rate),
    },
    sources: {
      rolloutFiles: rolloutFiles.length,
      segment: selectedSegment,
      exchangeRate: fx,
    },
    warnings: [
      ...(unclassifiedEvents > 0 ? [`${unclassifiedEvents} 条 Token 事件无法可靠判断来源，未计入当前模块。`] : []),
      ...new Set([...cost7d.warnings, ...cost30d.warnings, ...costMonth.warnings]),
      ...(selectedSegment === "cli" ? ["Coding Plan 费用为 GLM-5.2 等价估算，不代表实际套餐扣费。"] : ["ChatGPT Codex 费用为 GPT 官方价格等价估算，不代表订阅真实扣费。"]),
    ],
  };

  cache.set(selectedSegment, { builtAt: Date.now(), payload });
  return payload;
}

function applyToBucket(bucket, range, usage) {
  if (usage.timestampMs < range.startMs || usage.timestampMs > range.endMs) return;
  addUsage(bucket.totals, usage);
  const modelBucket = ensureModelBucket(bucket.models, usage.model);
  addUsage(modelBucket, usage);
}

function estimateCost(modelMap, segment, fxRate) {
  const byModel = new Map();
  let total = 0;
  for (const [model, usage] of modelMap.entries()) {
    const pricing = resolvePricing(segment, model, fxRate);
    const cost = priceUsage({ [model]: pricing }, model, usage);
    byModel.set(model, cost);
    total += cost;
  }
  return { total, byModel, warnings: [] };
}

function finalizeModels(modelMap, totalTokens, costMap, usdToCnyRate) {
  return rankModels(modelMap, totalTokens).map((model) => ({
    ...model,
    costUsd: roundCost(costMap.get(model.name) || 0),
    costCny: roundCost((costMap.get(model.name) || 0) * usdToCnyRate),
  }));
}

function resolvePricing(segment, model, fxRate) {
  if (segment === "desktop") {
    return lookupPricingWithDefault(OPENAI_PRICING, model, OPENAI_PRICING["gpt-5.2-codex"]);
  }
  return readGlmPricing(fxRate);
}

function lookupPricingWithDefault(table, model, fallback) {
  if (table[model]) return table[model];
  const prefix = Object.keys(table)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? table[prefix] : fallback;
}

const GLM_PRICING_CNY = { input: 8, cachedInput: 2, output: 28 };

function readGlmPricing(fxRate) {
  let cny = GLM_PRICING_CNY;
  const raw = process.env.AI_USAGE_GLM52_PRICING_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const input = Number(parsed.input);
      const cachedInput = Number(parsed.cachedInput);
      const output = Number(parsed.output);
      if ([input, cachedInput, output].every((v) => Number.isFinite(v) && v >= 0)) {
        cny = { input, cachedInput, output };
      }
    } catch {
      // fall through to default CNY pricing
    }
  }
  const rate = fxRate > 0 ? fxRate : 6.8287;
  return {
    input: cny.input / rate,
    cachedInput: cny.cachedInput / rate,
    output: cny.output / rate,
  };
}

function classifyCodexEvent({ source, provider, model, authMode }) {
  const sourceText = String(source || "").toLowerCase();
  const providerText = String(provider || "").toLowerCase();
  const modelText = String(model || "").toLowerCase();

  if (
    /(^|[+_\-/])(exec|cli|terminal)([+_\-/]|$)/.test(sourceText) ||
    /^(glm|ark)([-_.]|$)/.test(modelText) ||
    /(volc|ark|mimo)/.test(providerText)
  ) {
    return "cli";
  }
  if (
    /(^|[+_\-/])(vscode|desktop|app)([+_\-/]|$)/.test(sourceText) ||
    /^(gpt|codex)([-_.]|$)/.test(modelText) ||
    providerText === "openai"
  ) {
    return "desktop";
  }
  if (authMode === "chatgpt" && !modelText) return "desktop";
  return null;
}

function normalizeSource(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return Object.keys(value).join("+");
  return "";
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

function stubPayload(segment = "cli") {
  const isDesktop = segment === "desktop";
  return {
    tool: isDesktop ? "codex-desktop" : "codex-cli",
    name: isDesktop ? "ChatGPT Codex" : "Codex CLI",
    provider: isDesktop ? "OpenAI" : "Volcengine Ark",
    plan: "未安装",
    costMode: "estimated",
    status: "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: null,
    quotas: [],
    rateLimits: null,
    periods: {
      "7d": { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
      "30d": { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
      month: { ...emptyTotals(), totalCostUsd: 0, totalCostCny: 0 },
    },
    models: { "7d": [], "30d": [] },
    sources: { rolloutFiles: 0, segment },
    warnings: [isDesktop ? "未在本地检测到 ChatGPT Codex 数据。" : "未在本地检测到 Codex CLI 数据。"],
  };
}

function legacyStubPayload() {
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
