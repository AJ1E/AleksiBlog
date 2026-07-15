import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const outputPath = process.argv.slice(2).find((argument) => argument !== "--");

if (!outputPath) {
  throw new Error("Usage: pnpm token-usage:export -- <output-file>");
}

// Build from the workstation's current aggregate records instead of a cache
// written by a dev server. Each collector receives its own short-lived Node
// process: large local session histories can otherwise retain too much memory
// before desktop, CLI, and heatmap scans have all completed.
const codexCollectorModule = new URL("./ai-usage/codex-local.mjs", import.meta.url).href;
const heatmapCollectorModule = new URL("./ai-usage/heatmap.mjs", import.meta.url).href;
const desktop = await collectJson(`import { buildCodexOverview } from ${JSON.stringify(codexCollectorModule)}; process.stdout.write(JSON.stringify(await buildCodexOverview({ segment: "desktop" })));`);
const cli = await collectJson(`import { buildCodexOverview } from ${JSON.stringify(codexCollectorModule)}; process.stdout.write(JSON.stringify(await buildCodexOverview({ segment: "cli" })));`);
const heatmap = await collectJson(`import { buildUsageHeatmap } from ${JSON.stringify(heatmapCollectorModule)}; process.stdout.write(JSON.stringify(await buildUsageHeatmap()));`);

const snapshot = {
  generatedAt: new Date().toISOString(),
  tools: [sanitizeTool(desktop, "codex-desktop"), sanitizeTool(cli, "codex-cli")],
  heatmap: {
    days: Array.isArray(heatmap?.days)
      ? heatmap.days.map(sanitizeHeatmapDay).filter(Boolean).slice(-366)
      : [],
  },
};

await writeJsonAtomically(path.resolve(outputPath), snapshot);
process.stdout.write(`Wrote redacted TokenUsage snapshot with ${snapshot.tools.length} tools.\n`);

async function collectJson(source) {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["--input-type=module", "--eval", source],
    { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

function sanitizeTool(source, expectedTool) {
  return {
    tool: expectedTool,
    name: text(source?.name, 80),
    provider: text(source?.provider, 80),
    plan: text(source?.plan, 120),
    costMode: source?.costMode === "credits" ? "credits" : "estimated",
    billingUnit: source?.billingUnit === "credits" ? "credits" : "tokens",
    status: source?.status === "active" ? "active" : "idle",
    generatedAt: isoDate(source?.generatedAt),
    lastEventAt: isoDate(source?.lastEventAt),
    periods: {
      "7d": sanitizePeriod(source?.periods?.["7d"]),
      "30d": sanitizePeriod(source?.periods?.["30d"]),
      month: sanitizePeriod(source?.periods?.month),
    },
    models: {
      "7d": sanitizeModels(source?.models?.["7d"]),
      "30d": sanitizeModels(source?.models?.["30d"]),
    },
  };
}

function sanitizePeriod(period) {
  return {
    inputTokens: nonNegativeNumber(period?.inputTokens),
    cachedInputTokens: nonNegativeNumber(period?.cachedInputTokens),
    outputTokens: nonNegativeNumber(period?.outputTokens),
    totalTokens: nonNegativeNumber(period?.totalTokens),
    requests: nonNegativeNumber(period?.requests),
    credits: nonNegativeNumber(period?.credits),
    totalCostUsd: nonNegativeNumber(period?.totalCostUsd),
    totalCostCny: nonNegativeNumber(period?.totalCostCny),
  };
}

function sanitizeModels(models) {
  if (!Array.isArray(models)) return [];
  return models
    .map((model) => ({
      name: text(model?.name, 80),
      totalTokens: nonNegativeNumber(model?.totalTokens),
      inputTokens: nonNegativeNumber(model?.inputTokens),
      cachedInputTokens: nonNegativeNumber(model?.cachedInputTokens),
      outputTokens: nonNegativeNumber(model?.outputTokens),
      credits: nonNegativeNumber(model?.credits),
      requests: nonNegativeNumber(model?.requests),
      sharePct: nonNegativeNumber(model?.sharePct),
      costUsd: nonNegativeNumber(model?.costUsd),
      costCny: nonNegativeNumber(model?.costCny),
    }))
    .filter((model) => model.name)
    .slice(0, 24);
}

function sanitizeHeatmapDay(day) {
  const date = typeof day?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : "";
  if (!date) return null;
  return {
    date,
    total: nonNegativeNumber(day?.total),
    codex: nonNegativeNumber(day?.codex),
    totalTokens: nonNegativeNumber(day?.totalTokens),
  };
}

function text(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, " ").trim().slice(0, maxLength);
}

function isoDate(value) {
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function writeJsonAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}
