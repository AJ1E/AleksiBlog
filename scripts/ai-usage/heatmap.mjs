import fs from "node:fs/promises";
import { detectClaude, detectCodex, detectGemini } from "./detect.mjs";
import { listFilesRecursive, walkJsonl } from "./util.mjs";

const CACHE_TTL_MS = 60_000;
const LOOKBACK_DAYS = 365;

let cache = null;

export async function buildUsageHeatmap({ now = new Date() } = {}) {
  if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const [claude, codex, gemini] = await Promise.all([
    detectClaude(),
    detectCodex(),
    detectGemini(),
  ]);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (LOOKBACK_DAYS - 1));
  const startMs = start.getTime();

  const dayMap = new Map();
  const ensureDay = (timestampMs) => {
    const date = new Date(timestampMs);
    date.setHours(0, 0, 0, 0);
    const key = formatLocalDayKey(date);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = {
        date: key,
        total: 0,
        claude: 0,
        codex: 0,
        gemini: 0,
      };
      dayMap.set(key, bucket);
    }
    return bucket;
  };

  if (claude.installed) {
    const sessionFiles = await listFilesRecursive(claude.paths.projects, (name) => name.endsWith(".jsonl"));
    for (const file of sessionFiles) {
      try {
        for await (const entry of walkJsonl(file)) {
          if (!entry || typeof entry !== "object") continue;
          const usage = entry.message?.usage;
          if (!usage) continue;
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (!Number.isFinite(ts) || ts < startMs) continue;
          const bucket = ensureDay(ts);
          bucket.claude += 1;
          bucket.total += 1;
        }
      } catch {
        // skip unreadable file
      }
    }
  }

  if (codex.installed) {
    const rolloutFiles = await listFilesRecursive(codex.paths.sessions, (name) =>
      name.startsWith("rollout-") && name.endsWith(".jsonl"),
    );
    for (const file of rolloutFiles) {
      try {
        for await (const entry of walkJsonl(file)) {
          if (!entry || typeof entry !== "object") continue;
          if (entry.type !== "event_msg") continue;
          if (entry.payload?.type !== "token_count") continue;
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (!Number.isFinite(ts) || ts < startMs) continue;
          const bucket = ensureDay(ts);
          bucket.codex += 1;
          bucket.total += 1;
        }
      } catch {
        // skip unreadable file
      }
    }
  }

  if (gemini.installed) {
    const chatFiles = await listFilesRecursive(gemini.paths.tmp, (name) =>
      name.startsWith("session-") && name.endsWith(".jsonl"),
    );
    for (const file of chatFiles) {
      try {
        for await (const entry of walkJsonl(file)) {
          if (entry?.type !== "gemini") continue;
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (!Number.isFinite(ts) || ts < startMs) continue;
          const bucket = ensureDay(ts);
          bucket.gemini += 1;
          bucket.total += 1;
        }
      } catch {
        // skip
      }
    }

    const logFiles = await listFilesRecursive(gemini.paths.tmp, (name) => name === "logs.json");
    for (const file of logFiles) {
      try {
        const raw = await fs.readFile(file, "utf8");
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const ts = entry?.timestamp ? Date.parse(entry.timestamp) : NaN;
          if (!Number.isFinite(ts) || ts < startMs) continue;
          const bucket = ensureDay(ts);
          bucket.gemini += 1;
          bucket.total += 1;
        }
      } catch {
        // skip unreadable file
      }
    }
  }

  const days = [];
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const key = formatLocalDayKey(date);
    days.push(
      dayMap.get(key) || {
        date: key,
        total: 0,
        claude: 0,
        codex: 0,
        gemini: 0,
      },
    );
  }

  const payload = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    days,
  };
  cache = { builtAt: Date.now(), payload };
  return payload;
}

function formatLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
