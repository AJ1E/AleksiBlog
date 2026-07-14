import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = path.join(os.homedir(), ".cache", "kai-space", "ai-usage", "usd-cny.json");
const FALLBACK_RATE = 6.8287;
const FALLBACK_UPDATED_AT = "2026-05-01";
const FALLBACK_SOURCE = "project fallback";

let memoryCache = null;
let refreshPromise = null;

export async function getUsdToCnyRate() {
  const now = Date.now();
  if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) return memoryCache;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const cached = await readCache();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      memoryCache = cached;
      return cached;
    }

    const configured = parseRate(process.env.AI_USAGE_USD_CNY_RATE);
    if (configured) {
      const result = {
        rate: configured,
        fetchedAt: now,
        updatedAt: new Date(now).toISOString(),
        source: "AI_USAGE_USD_CNY_RATE",
      };
      memoryCache = result;
      await writeCache(result);
      return result;
    }

    try {
      const response = await fetch(
        "https://api.frankfurter.dev/v2/rates?base=USD&quotes=CNY",
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
      );
      if (!response.ok) throw new Error(`Frankfurter returned HTTP ${response.status}`);
      const data = await response.json();
      const rate = parseRate(data?.rates?.CNY ?? data?.CNY);
      if (!rate) throw new Error("Frankfurter response did not include USD/CNY");
      const result = {
        rate,
        fetchedAt: now,
        updatedAt: String(data?.date || new Date(now).toISOString().slice(0, 10)),
        source: "Frankfurter",
      };
      memoryCache = result;
      await writeCache(result);
      return result;
    } catch {
      if (cached) {
        memoryCache = cached;
        return cached;
      }
      const fallback = {
        rate: FALLBACK_RATE,
        fetchedAt: now,
        updatedAt: FALLBACK_UPDATED_AT,
        source: FALLBACK_SOURCE,
      };
      memoryCache = fallback;
      return fallback;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function parseRate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function readCache() {
  try {
    const value = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
    const rate = parseRate(value?.rate);
    const fetchedAt = Number(value?.fetchedAt);
    if (!rate || !Number.isFinite(fetchedAt)) return null;
    return {
      rate,
      fetchedAt,
      updatedAt: String(value?.updatedAt || "unknown"),
      source: String(value?.source || "cached"),
    };
  } catch {
    return null;
  }
}

async function writeCache(value) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    const tempFile = `${CACHE_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempFile, CACHE_FILE);
  } catch {
    // A read-only home directory must not break usage reporting.
  }
}
