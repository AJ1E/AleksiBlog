import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectClaude } from "./detect.mjs";
import { ANTHROPIC_PRICING, priceUsage } from "./pricing.mjs";
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
const CLAUDE_TIMEOUT_MS = 8_000;
const CLAUDE_USAGE_PTY_TIMEOUT_MS = 30_000;
let cache = null;

export function clearClaudeCache() { cache = null; }

export async function buildClaudeOverview({ now = new Date(), budgets } = {}) {
  if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const detect = await detectClaude();
  if (!detect.installed) {
    return { ...stubPayload(), installed: false };
  }

  const sessionFiles = await listFilesRecursive(detect.paths.projects, (name) =>
    name.endsWith(".jsonl"),
  );

  const range7 = startOfRange(now, 7);
  const range30 = startOfRange(now, 30);
  const rangeMonth = startOfMonth(now);
  // Anthropic's Pro/Max plans use a rolling 5-hour window plus a 7-day cap.
  // Token / prompt budgets are configurable since Anthropic doesn't publish
  // exact ceilings.
  const fiveHourCutoffMs = now.getTime() - 5 * 60 * 60 * 1000;
  const sevenDayCutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const buckets = {
    "7d": { totals: emptyTotals(), models: new Map() },
    "30d": { totals: emptyTotals(), models: new Map() },
    month: { totals: emptyTotals(), models: new Map() },
  };
  const fiveHourWindow = emptyTotals();
  const sevenDayWindow = emptyTotals();
  let lastEventAtMs = 0;
  let recentDayTokens = 0;
  const recentCutoffMs = now.getTime() - 24 * 60 * 60 * 1000;

  for (const file of sessionFiles) {
    try {
      for await (const entry of walkJsonl(file)) {
        const usage = extractUsageEntry(entry);
        if (!usage) continue;

        if (usage.timestampMs > lastEventAtMs) lastEventAtMs = usage.timestampMs;
        if (usage.timestampMs >= recentCutoffMs) recentDayTokens += usage.totalTokens;
        if (usage.timestampMs >= fiveHourCutoffMs) addUsage(fiveHourWindow, usage);
        if (usage.timestampMs >= sevenDayCutoffMs) addUsage(sevenDayWindow, usage);

        applyToBucket(buckets["30d"], range30, usage);
        applyToBucket(buckets["7d"], range7, usage);
        applyToBucket(buckets.month, rangeMonth, usage);
      }
    } catch {
      // skip unreadable file
    }
  }

  const cost7d = estimateCost(buckets["7d"].models);
  const cost30d = estimateCost(buckets["30d"].models);
  const costMonth = estimateCost(buckets.month.models);

  const credentials = await readClaudeCredentials(detect.paths.credentials);
  const officialUsage = await fetchClaudeOfficialUsage(credentials);
  const plan = officialUsage.plan || detectPlan(credentials);
  const fallbackQuotas = buildClaudeQuotas({
    fiveHour: fiveHourWindow,
    sevenDay: sevenDayWindow,
    budgets: budgets || {},
  });
  const quotas = officialUsage.quotas.length > 0 ? officialUsage.quotas : fallbackQuotas;
  const warnings = officialUsage.warnings.slice();

  const payload = {
    tool: "claude",
    name: detect.name,
    provider: "Anthropic",
    installed: true,
    plan,
    costMode: "estimated",
    status: recentDayTokens > 0 ? "active" : "idle",
    generatedAt: new Date().toISOString(),
    lastEventAt: lastEventAtMs > 0 ? new Date(lastEventAtMs).toISOString() : null,
    quotas,
    windows: {
      fiveHour: {
        ...fiveHourWindow,
        coversMs: 5 * 60 * 60 * 1000,
      },
      sevenDay: {
        ...sevenDayWindow,
        coversMs: 7 * 24 * 60 * 60 * 1000,
      },
    },
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
      sessionFiles: sessionFiles.length,
      officialUsage: officialUsage.quotas.length > 0,
    },
    warnings,
  };

  cache = { builtAt: Date.now(), payload };
  return payload;
}

function extractUsageEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.type !== "assistant" && entry.type !== "message") {
    if (!entry.message?.usage) return null;
  }

  const usage = entry.message?.usage;
  if (!usage) return null;

  const inputTokens = Number(usage.input_tokens) || 0;
  const cachedCreation = Number(usage.cache_creation_input_tokens) || 0;
  const cachedRead = Number(usage.cache_read_input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;

  // Anthropic bills cache_creation as standard input, cache_read at cached
  // input tier. We keep that distinction so cost estimation lines up with
  // Anthropic's published pricing.
  const totalInput = inputTokens + cachedCreation;
  const cachedInput = cachedRead;
  const total = totalInput + cachedInput + outputTokens;
  if (total <= 0) return null;

  const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;

  return {
    model: typeof entry.message?.model === "string" ? entry.message.model : "claude-unknown",
    timestampMs: Number.isFinite(ts) ? ts : Date.now(),
    inputTokens: totalInput,
    cachedInputTokens: cachedInput,
    outputTokens,
    totalTokens: total,
    requests: 1,
  };
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
    const cost = priceUsage(ANTHROPIC_PRICING, model, usage);
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

function buildClaudeQuotas({ fiveHour, sevenDay, budgets }) {
  // Only emit quota bars when the user provides an explicit budget — without
  // one, a percentage is meaningless. Raw window usage is still exposed via
  // the `windows` field so the frontend can render it as informational stats.
  const quotas = [];
  const fiveHourPromptBudget = numericOrNull(budgets.fiveHourPrompts);
  const fiveHourTokenBudget = numericOrNull(budgets.fiveHourTokens);
  const sevenDayPromptBudget = numericOrNull(budgets.sevenDayPrompts);
  const sevenDayTokenBudget = numericOrNull(budgets.sevenDayTokens);

  if (fiveHourPromptBudget) {
    quotas.push({
      label: "5h 窗口 (prompts)",
      used: fiveHour.requests,
      total: fiveHourPromptBudget,
      unit: " 次",
    });
  } else if (fiveHourTokenBudget) {
    quotas.push({
      label: "5h 窗口 (tokens)",
      used: Math.round((fiveHour.totalTokens / 1_000_000) * 100) / 100,
      total: Math.round((fiveHourTokenBudget / 1_000_000) * 100) / 100,
      unit: "M",
    });
  }

  if (sevenDayPromptBudget) {
    quotas.push({
      label: "7d 窗口 (prompts)",
      used: sevenDay.requests,
      total: sevenDayPromptBudget,
      unit: " 次",
    });
  } else if (sevenDayTokenBudget) {
    quotas.push({
      label: "7d 窗口 (tokens)",
      used: Math.round((sevenDay.totalTokens / 1_000_000) * 100) / 100,
      total: Math.round((sevenDayTokenBudget / 1_000_000) * 100) / 100,
      unit: "M",
    });
  }

  return quotas;
}

async function readClaudeCredentials(credentialsPath) {
  try {
    const raw = await fs.readFile(credentialsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchClaudeOfficialUsage(credentials) {
  const plan = detectPlan(credentials);
  const warnings = [];
  const accessToken = credentials?.claudeAiOauth?.accessToken;
  let data = null;
  let lastError = null;
  let quotas = [];

  try {
    quotas = await fetchClaudeCliUsageViaPty();
  } catch (error) {
    lastError = error;
  }

  if (quotas.length > 0) {
    return {
      plan,
      quotas,
      warnings,
    };
  }

  if (typeof accessToken === "string" && accessToken.trim()) {
    try {
      data = await fetchClaudeOauthUsage(accessToken.trim());
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) {
    const sessionKey = resolveClaudeWebSessionKey();
    if (sessionKey) {
      try {
        data = await fetchClaudeWebUsage(sessionKey);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!data && lastError) {
    const detail = lastError instanceof Error ? lastError.message : "unknown error";
    warnings.push(
      `Claude 官方额度获取失败，已回退为本地日志统计。详情: ${detail}`,
    );
    if (
      detail.includes("Request not allowed") ||
      detail.includes("scope requirement") ||
      detail.includes("Missing Claude web session")
    ) {
      warnings.push(
        "如需显示官方 5h/7d 百分比与重置时间，请设置 CLAUDE_WEB_SESSION_KEY、CLAUDE_AI_SESSION_KEY 或 CLAUDE_WEB_COOKIE。",
      );
    }
  }

  return {
    plan,
    quotas: buildClaudeOfficialQuotas(data),
    warnings,
  };
}

async function fetchClaudeCliUsageViaPty() {
  const raw = await runClaudeUsageDialog();
  const quotas = parseClaudeUsageDialog(raw);
  if (quotas.length === 0) {
    const lines = stripTerminalControl(raw)
      .replace(/\r/g, "\n").split("\n")
      .map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const relevant = lines.filter(l => /\d+%|rese|current.*session|current.*week|extra\s*usage|loading/i.test(l));
    process.stderr.write(`[ai-usage/claude] PTY no-quota. relevant lines: ${JSON.stringify(relevant)}\n`);
    throw new Error("Claude CLI usage dialog returned no quota rows");
  }
  return quotas;
}

async function runClaudeUsageDialog() {
  return new Promise((resolve, reject) => {
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const spawnEnv = {
      ...process.env,
      TERM: process.env.TERM || "xterm-256color",
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || "en_US.UTF-8",
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`,
      DBUS_SESSION_BUS_ADDRESS:
        process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${uid}/bus`,
    };
    const child = spawn("script", ["-qfec", "claude", "/dev/null"], {
      cwd: process.cwd(),
      env: spawnEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;
    let usageCommandSent = false;
    let earlyExitScheduled = false;
    let earlyExitTimer = null;
    let forceKillTimer = null;
    let hardKillTimer = null;

    const settle = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(earlyExitTimer);
      clearTimeout(forceKillTimer);
      clearTimeout(hardKillTimer);
      if (err) reject(err);
      else resolve(value);
    };

    const sendEsc = () => {
      if (!settled) child.stdin.write("\u001b");
    };

    child.on("error", (error) => settle(error));
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      // Strip terminal codes before matching so escape sequences don't interfere.
      // Wait for an actual percentage number to appear (not just section headers),
      // then give 600ms for the remaining quota lines to finish rendering.
      if (usageCommandSent && !earlyExitScheduled &&
          /(\d{1,3})%\s*used/i.test(stripTerminalControl(output))) {
        earlyExitScheduled = true;
        earlyExitTimer = setTimeout(sendEsc, 600);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("close", () => settle(null, output));

    setTimeout(() => {
      usageCommandSent = true;
      child.stdin.write("/usage\r");
    }, 1500);
    // Fallback ESC if quota patterns never appear within 20s
    setTimeout(sendEsc, 20000);
    forceKillTimer = setTimeout(() => child.kill("SIGTERM"), 22000);
    hardKillTimer = setTimeout(() => child.kill("SIGKILL"), CLAUDE_USAGE_PTY_TIMEOUT_MS);
  });
}

function parseClaudeUsageDialog(raw) {
  const lines = stripTerminalControl(raw)
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
  const compactLines = lines.map((line) => line.replace(/\s+/g, ""));
  const quotas = [];

  pushCliPercentQuota(quotas, compactLines, /cur\w*session/i, "5 小时限额");
  pushCliPercentQuota(quotas, compactLines, /currentweek\(allmodels\)/i, "7 天限额");
  pushCliPercentQuota(quotas, compactLines, /currentweek\(sonnetonly\)/i, "7 天 Sonnet");
  pushCliPercentQuota(quotas, compactLines, /currentweek\(opusonly\)/i, "7 天 Opus");
  pushCliPercentQuota(quotas, compactLines, /currentweek\(oauthapps\)/i, "7 天 OAuth 应用");
  pushCliPercentQuota(quotas, compactLines, /currentweek\(cowork\)/i, "7 天 Cowork");
  pushCliExtraUsageQuota(quotas, compactLines);

  return quotas;
}

function stripTerminalControl(input) {
  return String(input || "")
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B[@-_]/g, "")
    .replace(/\u0007/g, "");
}

function pushCliPercentQuota(quotas, compactLines, matcher, label) {
  const index = compactLines.findIndex((line) => matcher.test(line.toLowerCase()));
  if (index < 0) return;

  const windowLines = compactLines.slice(index + 1, index + 5);
  const used = windowLines.map(parseCompactPercentUsed).find((value) => value != null);
  if (used == null) return;

  quotas.push({
    label,
    used,
    total: 100,
    unit: "%",
    note: windowLines.map(parseCompactResetNote).find(Boolean) || "",
  });
}

function pushCliExtraUsageQuota(quotas, compactLines) {
  const index = compactLines.findIndex((line) => /extrausage/i.test(line.toLowerCase()));
  if (index < 0) return;

  const windowLines = compactLines.slice(index + 1, index + 5);
  const spendMatch = windowLines
    .map((line) =>
      /^\$(\d+(?:\.\d+)?)\/\$(\d+(?:\.\d+)?)spent(?:·)?(?:resets(.+))?$/i.exec(line),
    )
    .find(Boolean);
  if (!spendMatch) return;

  quotas.push({
    label: "额外用量",
    used: Number(spendMatch[1]),
    total: Number(spendMatch[2]),
    unit: "$",
    note: spendMatch[3] ? parseCompactResetNote(`Resets${spendMatch[3]}`) : "",
  });
}

function parseCompactPercentUsed(line) {
  const match = /(\d{1,3})%used/i.exec(line);
  if (!match) return null;
  return Number(match[1]);
}

function parseCompactResetNote(line) {
  if (!/^rese/i.test(line)) return "";
  const time = /(\d{1,2}(?::\d{2})?(?:am|pm))/i.exec(line)?.[1] || "";
  const timezone = /\(([^)]+)\)/.exec(line)?.[1] || "";
  if (!time && !timezone) return "";
  if (time && timezone) return `Resets ${time} (${timezone})`;
  if (time) return `Resets ${time}`;
  return `Resets (${timezone})`;
}

async function fetchClaudeOauthUsage(token) {
  const res = await fetchWithTimeout("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "kai-blog-ai-usage",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });

  if (!res.ok) {
    const message = await extractErrorMessage(res);
    throw new Error(message || `HTTP ${res.status}`);
  }

  return res.json();
}

function resolveClaudeWebSessionKey() {
  const direct =
    process.env.CLAUDE_AI_SESSION_KEY?.trim() || process.env.CLAUDE_WEB_SESSION_KEY?.trim();
  if (direct?.startsWith("sk-ant-")) {
    return direct;
  }

  const cookieHeader = process.env.CLAUDE_WEB_COOKIE?.trim();
  if (!cookieHeader) {
    return "";
  }

  const stripped = cookieHeader.replace(/^cookie:\s*/i, "");
  const match = stripped.match(/(?:^|;\s*)sessionKey=([^;\s]+)/i);
  const value = match?.[1]?.trim() || "";
  return value.startsWith("sk-ant-") ? value : "";
}

async function fetchClaudeWebUsage(sessionKey) {
  if (!sessionKey) {
    throw new Error("Missing Claude web session");
  }

  const headers = {
    Cookie: `sessionKey=${sessionKey}`,
    Accept: "application/json",
    "User-Agent": "kai-blog-ai-usage",
  };
  const orgRes = await fetchWithTimeout("https://claude.ai/api/organizations", { headers });
  if (!orgRes.ok) {
    const message = await extractErrorMessage(orgRes);
    throw new Error(message || `HTTP ${orgRes.status}`);
  }

  const orgs = await orgRes.json();
  const orgId = Array.isArray(orgs) ? String(orgs[0]?.uuid || "").trim() : "";
  if (!orgId) {
    throw new Error("Claude web organizations response missing org id");
  }

  const usageRes = await fetchWithTimeout(`https://claude.ai/api/organizations/${orgId}/usage`, {
    headers,
  });
  if (!usageRes.ok) {
    const message = await extractErrorMessage(usageRes);
    throw new Error(message || `HTTP ${usageRes.status}`);
  }

  return usageRes.json();
}

function buildClaudeOfficialQuotas(data) {
  if (!data || typeof data !== "object") return [];

  const quotas = [];
  pushPercentQuota(quotas, "5 小时限额", data.five_hour);
  pushPercentQuota(quotas, "7 天限额", data.seven_day);
  pushPercentQuota(quotas, "7 天 Sonnet", data.seven_day_sonnet);
  pushPercentQuota(quotas, "7 天 Opus", data.seven_day_opus);
  pushPercentQuota(quotas, "7 天 OAuth 应用", data.seven_day_oauth_apps);
  pushPercentQuota(quotas, "7 天 Cowork", data.seven_day_cowork);

  const extraUsage = normalizeMoneyWindow(data.extra_usage || data.extraUsage);
  if (extraUsage) {
    quotas.push({
      label: "额外用量",
      used: extraUsage.used,
      total: extraUsage.total,
      unit: "$",
      note: extraUsage.note,
    });
  }

  return quotas;
}

function pushPercentQuota(quotas, label, raw) {
  const used = numericOrZeroAllowed(raw?.utilization);
  if (used == null) return;
  quotas.push({
    label,
    used: Math.max(0, Math.min(100, used)),
    total: 100,
    unit: "%",
    note: formatResetNote(raw?.resets_at),
  });
}

function normalizeMoneyWindow(raw) {
  if (!raw || typeof raw !== "object") return null;

  const usedCandidates = [
    raw.spent_usd,
    raw.spentUsd,
    raw.used_usd,
    raw.usedUsd,
    raw.amount_used_usd,
    raw.amountUsedUsd,
    raw.current_usd,
    raw.currentUsd,
  ];
  const totalCandidates = [
    raw.limit_usd,
    raw.limitUsd,
    raw.total_usd,
    raw.totalUsd,
    raw.max_usd,
    raw.maxUsd,
    raw.included_usd,
    raw.includedUsd,
  ];

  const used = firstPositiveNumber(usedCandidates);
  const total = firstPositiveNumber(totalCandidates);
  if (used == null || total == null) return null;

  return {
    used: roundMoney(used),
    total: roundMoney(total),
    note: formatResetNote(raw.resets_at || raw.reset_at || raw.resetsAt),
  };
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }
  return null;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function formatResetNote(value) {
  const resetAt = Date.parse(String(value || ""));
  if (!Number.isFinite(resetAt)) return "";
  const date = new Date(resetAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute} 重置`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function extractErrorMessage(res) {
  try {
    const data = await res.json();
    const raw = data?.error?.message || data?.message;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  } catch {
    return "";
  }
}

function numericOrNull(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function numericOrZeroAllowed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function detectPlan(credentials) {
  const subscriptionType = String(credentials?.claudeAiOauth?.subscriptionType || "")
    .trim()
    .toLowerCase();
  if (subscriptionType === "pro") return "专业版";
  if (subscriptionType === "free") return "免费版";
  if (subscriptionType === "max") return "Max";
  if (subscriptionType === "max5") return "Max 5x";
  if (subscriptionType === "max20") return "Max 20x";
  if (subscriptionType === "team") return "团队版";
  if (credentials?.claudeAiOauth) return "Claude (本地认证)";
  return "Claude API";
}

function stubPayload() {
  return {
    tool: "claude",
    name: "Claude Code",
    provider: "Anthropic",
    plan: "未安装",
    costMode: "estimated",
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
    sources: { sessionFiles: 0 },
    warnings: ["未在本地检测到 Claude Code 数据。"],
  };
}
