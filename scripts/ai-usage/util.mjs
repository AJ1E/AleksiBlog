import fs from "node:fs/promises";

export function startOfRange(now, days) {
  const end = now.getTime();
  return {
    startMs: end - days * 24 * 60 * 60 * 1000,
    endMs: end,
  };
}

export function startOfMonth(now) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0);
  return { startMs: start, endMs: now.getTime() };
}

export function emptyTotals() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requests: 0,
  };
}

export function addUsage(target, source) {
  target.inputTokens += source.inputTokens || 0;
  target.cachedInputTokens += source.cachedInputTokens || 0;
  target.outputTokens += source.outputTokens || 0;
  target.totalTokens += source.totalTokens || 0;
  target.requests += source.requests || 0;
}

export function roundCost(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 1_000_000) / 1_000_000;
}

export function roundPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 10) / 10;
}

export function fmtSharePct(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export async function* walkJsonl(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const stream = handle.createReadStream({ encoding: "utf8" });
    let buffer = "";
    for await (const chunk of stream) {
      buffer += chunk;
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) continue;
        try {
          yield JSON.parse(line);
        } catch {
          // skip malformed line
        }
      }
    }
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer);
      } catch {
        // skip trailing garbage
      }
    }
  } finally {
    await handle.close();
  }
}

export async function listFilesRecursive(root, predicate) {
  const out = [];
  async function recurse(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile() && (!predicate || predicate(entry.name, full))) {
        out.push(full);
      }
    }
  }
  await recurse(root);
  return out;
}

export function rankModels(byModel, totalTokens) {
  return Array.from(byModel.entries())
    .map(([name, usage]) => ({
      name,
      totalTokens: usage.totalTokens,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      requests: usage.requests,
      sharePct: fmtSharePct(usage.totalTokens, totalTokens),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export function ensureModelBucket(map, model) {
  let bucket = map.get(model);
  if (!bucket) {
    bucket = emptyTotals();
    map.set(model, bucket);
  }
  return bucket;
}
