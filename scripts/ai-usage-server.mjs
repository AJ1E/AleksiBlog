import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectAllTools } from "./ai-usage/detect.mjs";
import { buildClaudeOverview, clearClaudeCache } from "./ai-usage/claude-local.mjs";
import { buildCodexOverview, clearCodexCache } from "./ai-usage/codex-local.mjs";
import { buildGeminiOverview, clearGeminiCache } from "./ai-usage/gemini-local.mjs";
import { buildUsageHeatmap } from "./ai-usage/heatmap.mjs";

const PORT = parsePort(process.env.PORT, 8787);
// Default to 127.0.0.1 so local usage details stay behind the Astro BFF.
// Prefer exposing Astro, not this helper, when deploying remotely.
const HOST = process.env.HOST || "127.0.0.1";
const CORS_ALLOW_ORIGIN = process.env.AI_USAGE_CORS_ALLOW_ORIGIN || "*";
const SNAPSHOT_REFRESH_INTERVAL_MS = 60_000;
const SNAPSHOT_FILE =
  process.env.AI_USAGE_SNAPSHOT_FILE ||
  path.join(os.homedir(), ".cache", "kai-space", "ai-usage-overview.json");
const CODEX_MONTHLY_BUDGET_USD = parseFiniteNumber(process.env.CODEX_MONTHLY_BUDGET_USD);
const GEMINI_MONTHLY_BUDGET_USD = parseFiniteNumber(process.env.GEMINI_MONTHLY_BUDGET_USD);
const CLAUDE_BUDGETS = {
  fiveHourTokens: parseFiniteNumber(process.env.CLAUDE_5H_TOKEN_BUDGET),
  fiveHourPrompts: parseFiniteNumber(process.env.CLAUDE_5H_PROMPT_BUDGET),
  sevenDayTokens: parseFiniteNumber(process.env.CLAUDE_7D_TOKEN_BUDGET),
  sevenDayPrompts: parseFiniteNumber(process.env.CLAUDE_7D_PROMPT_BUDGET),
};

const TOOL_BUILDERS = {
  claude: () => buildClaudeOverview({ budgets: CLAUDE_BUDGETS }),
  codex: () => buildCodexOverview({ monthlyBudgetUsd: CODEX_MONTHLY_BUDGET_USD }),
  gemini: () => buildGeminiOverview({ monthlyBudgetUsd: GEMINI_MONTHLY_BUDGET_USD }),
};

const CACHE_CLEARERS = {
  claude: clearClaudeCache,
  codex: clearCodexCache,
  gemini: clearGeminiCache,
};

let latestOverviewSnapshot = await readOverviewSnapshot();
let overviewRefreshPromise = null;

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "Missing URL" });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") return sendNoContent(res);

    const refreshMatch = /^\/api\/usage\/(claude|codex|gemini)\/refresh$/.exec(url.pathname);
    if (refreshMatch) {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
      const tool = refreshMatch[1];
      CACHE_CLEARERS[tool]();
      const detection = await detectAllTools();
      if (!detection[tool]?.installed) {
        return sendJson(res, 200, { tool, installed: false });
      }
      const payload = await TOOL_BUILDERS[tool]();
      if (latestOverviewSnapshot) {
        latestOverviewSnapshot = {
          ...latestOverviewSnapshot,
          generatedAt: new Date().toISOString(),
          tools: latestOverviewSnapshot.tools.map((t) =>
            t?.tool === tool ? { ...payload, installed: true } : t,
          ),
        };
        void writeOverviewSnapshot(latestOverviewSnapshot);
      }
      return sendJson(res, 200, payload);
    }

    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    if (url.pathname === "/health") {
      const detection = await detectAllTools();
      return sendJson(res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        tools: Object.fromEntries(
          Object.entries(detection).map(([id, info]) => [
            id,
            {
              installed: info.installed,
              hasAuth: info.hasAuth,
              hasLogs: info.hasLogs,
            },
          ]),
        ),
      });
    }

    if (url.pathname === "/api/usage/overview") {
      const snapshot = await getOverviewSnapshot();
      return sendJson(res, 200, snapshot);
    }

    const match = /^\/api\/usage\/(claude|codex|gemini)$/.exec(url.pathname);
    if (match) {
      const tool = match[1];
      const cachedTool = latestOverviewSnapshot?.tools?.find((entry) => entry?.tool === tool);
      if (cachedTool) {
        if (isSnapshotStale(latestOverviewSnapshot)) {
          void refreshOverviewSnapshot({ reason: `${tool}-stale-request` });
        }
        return sendJson(res, 200, cachedTool);
      }
      const detection = await detectAllTools();
      if (!detection[tool]?.installed) {
        return sendJson(res, 200, { tool, installed: false });
      }
      const payload = await TOOL_BUILDERS[tool]();
      return sendJson(res, 200, payload);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[ai-usage-server] listening on http://${HOST}:${PORT}\n`);
  detectAllTools().then((detection) => {
    const summary = Object.entries(detection)
      .map(([id, info]) => `${id}=${info.installed ? "✓" : "—"}`)
      .join(" ");
    process.stdout.write(`[ai-usage-server] detected: ${summary}\n`);
  });
  if (latestOverviewSnapshot) {
    process.stdout.write(
      `[ai-usage-server] loaded snapshot ${latestOverviewSnapshot.generatedAt} from ${SNAPSHOT_FILE}\n`,
    );
  }
  void refreshOverviewSnapshot({ reason: "startup" });
  const timer = setInterval(() => {
    void refreshOverviewSnapshot({ reason: "interval" });
  }, SNAPSHOT_REFRESH_INTERVAL_MS);
  timer.unref?.();
});

async function getOverviewSnapshot() {
  if (latestOverviewSnapshot) {
    if (isSnapshotStale(latestOverviewSnapshot)) {
      void refreshOverviewSnapshot({ reason: "overview-stale-request" });
    }
    return latestOverviewSnapshot;
  }
  return refreshOverviewSnapshot({ reason: "overview-initial-request" });
}

async function refreshOverviewSnapshot({ reason = "manual" } = {}) {
  if (overviewRefreshPromise) return overviewRefreshPromise;

  overviewRefreshPromise = (async () => {
    const detection = await detectAllTools();
    const [overview, heatmap] = await Promise.all([
      Promise.all(
        Object.keys(TOOL_BUILDERS).map(async (tool) => {
          if (!detection[tool]?.installed) {
            return { tool, installed: false };
          }
          try {
            const payload = await TOOL_BUILDERS[tool]();
            return { ...payload, installed: true };
          } catch (error) {
            return {
              tool,
              installed: detection[tool].installed,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        }),
      ),
      buildUsageHeatmap(),
    ]);

    const snapshot = {
      generatedAt: new Date().toISOString(),
      tools: overview,
      heatmap,
    };
    latestOverviewSnapshot = snapshot;
    await writeOverviewSnapshot(snapshot);
    process.stdout.write(
      `[ai-usage-server] refreshed snapshot (${reason}) at ${snapshot.generatedAt}\n`,
    );
    return snapshot;
  })()
    .catch((error) => {
      process.stderr.write(
        `[ai-usage-server] refresh failed (${reason}): ${formatErrorMessage(error)}\n`,
      );
      if (latestOverviewSnapshot) return latestOverviewSnapshot;
      throw error;
    })
    .finally(() => {
      overviewRefreshPromise = null;
    });

  return overviewRefreshPromise;
}

function isSnapshotStale(snapshot) {
  const generatedAtMs = snapshot?.generatedAt ? Date.parse(snapshot.generatedAt) : NaN;
  if (!Number.isFinite(generatedAtMs)) return true;
  return Date.now() - generatedAtMs >= SNAPSHOT_REFRESH_INTERVAL_MS;
}

async function readOverviewSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.tools)) return null;
    if (!parsed.heatmap || !Array.isArray(parsed.heatmap.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeOverviewSnapshot(snapshot) {
  const dir = path.dirname(SNAPSHOT_FILE);
  const tempFile = `${SNAPSHOT_FILE}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tempFile, SNAPSHOT_FILE);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end();
}

function parsePort(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function parseFiniteNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}
