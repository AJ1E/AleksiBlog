// Indicative public list prices in USD per 1M tokens. Used only for cost
// estimation when no exact-cost source (e.g. OpenAI Costs API) is configured.
// Cached input pricing follows each provider's published cache-read tier.

export const ANTHROPIC_PRICING = {
  "claude-opus-4-7": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-opus-4-6": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-opus-4-5": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-opus-4-1": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-opus-4": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-sonnet-4-7": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-sonnet-4-6": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-sonnet-4-5": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-sonnet-4": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-haiku-4-5": { input: 1, cachedInput: 0.1, output: 5 },
  "claude-3-7-sonnet": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-3-5-sonnet": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, cachedInput: 0.08, output: 4 },
};

export const OPENAI_PRICING = {
  "codex-mini-latest": { input: 1.5, cachedInput: 0.375, output: 6 },
  "gpt-5-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex-max": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5.1-codex-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.4": { input: 1.75, cachedInput: 0.175, output: 14 },
  "gpt-5.4-mini": { input: 0.35, cachedInput: 0.035, output: 2.8 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "o4-mini": { input: 1.1, cachedInput: 0.275, output: 4.4 },
};

export const GEMINI_PRICING = {
  "gemini-2.5-pro": { input: 1.25, cachedInput: 0.31, output: 10 },
  "gemini-2.5-flash": { input: 0.15, cachedInput: 0.038, output: 0.60 },
  "gemini-2.5-flash-lite": { input: 0.10, cachedInput: 0.025, output: 0.40 },
  "gemini-2.0-flash": { input: 0.10, cachedInput: 0.025, output: 0.40 },
  "gemini-2.0-flash-lite": { input: 0.075, cachedInput: 0.019, output: 0.30 },
  // Preview / experimental models: pricing TBD, but mapped to stable tier to allow estimations
  "gemini-3.1-pro-preview": { input: 1.25, cachedInput: 0.31, output: 10 },
  "gemini-3.1-pro": { input: 1.25, cachedInput: 0.31, output: 10 },
  "gemini-3-flash-preview": { input: 0.15, cachedInput: 0.038, output: 0.60 },
  "gemini-3-flash": { input: 0.15, cachedInput: 0.038, output: 0.60 },
};

export function lookupPricing(table, modelName) {
  if (!modelName) return null;
  if (table[modelName]) return table[modelName];

  // Try a longest-prefix match so versioned ids like "claude-opus-4-7-20260201"
  // still hit the base "claude-opus-4-7" entry.
  let bestKey = null;
  for (const key of Object.keys(table)) {
    if (modelName.startsWith(key) && (!bestKey || key.length > bestKey.length)) {
      bestKey = key;
    }
  }
  return bestKey ? table[bestKey] : null;
}

export function priceUsage(table, modelName, usage) {
  const pricing = lookupPricing(table, modelName);
  if (!pricing) return 0;

  const cached = Math.max(0, usage.cachedInputTokens || 0);
  const uncached = Math.max(0, (usage.inputTokens || 0) - cached);
  return (
    (uncached * pricing.input +
      cached * pricing.cachedInput +
      (usage.outputTokens || 0) * pricing.output) /
    1_000_000
  );
}
