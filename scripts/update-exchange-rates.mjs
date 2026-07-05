import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SUBSCRIPTIONS_DIR = path.join(ROOT, "src/content/subscriptions");
const OUTPUT_FILE = path.join(ROOT, "src/data/exchangeRates.ts");
const API_BASE = "https://api.frankfurter.dev/v2/rates";
const FALLBACK_CURRENCIES = ["CNY", "EUR", "GBP", "HKD", "JPY"];

const currencies = await getSubscriptionCurrencies();
const quotes = currencies.filter((currency) => currency !== "USD").sort();
const url = quotes.length > 0
  ? `${API_BASE}?base=USD&quotes=${quotes.join(",")}`
  : `${API_BASE}?base=USD`;

const response = await fetch(url, {
  headers: { Accept: "application/json" }
});

if (!response.ok) {
  throw new Error(`Frankfurter returned HTTP ${response.status}`);
}

const data = await response.json();
const rows = Array.isArray(data) ? data : data.rates;
const updatedAt = getLatestDate(rows) || new Date().toISOString().slice(0, 10);
const rates = { USD: 1 };

if (Array.isArray(rows)) {
  for (const row of rows) {
    const quote = normalizeCurrency(row?.quote);
    const rate = Number(row?.rate);
    if (quote && Number.isFinite(rate) && rate > 0) {
      rates[quote] = rate;
    }
  }
} else if (rows && typeof rows === "object") {
  for (const [quote, rate] of Object.entries(rows)) {
    const currency = normalizeCurrency(quote);
    const numeric = Number(rate);
    if (currency && Number.isFinite(numeric) && numeric > 0) {
      rates[currency] = numeric;
    }
  }
}

for (const currency of currencies) {
  if (!rates[currency]) {
    throw new Error(`Frankfurter response did not include ${currency}`);
  }
}

const content = `export const exchangeRates = {
  provider: "Frankfurter",
  providerUrl: "https://frankfurter.dev",
  base: "USD",
  updatedAt: "${updatedAt}",
  rates: ${formatRates(rates)}
} as const;
`;

await fs.writeFile(OUTPUT_FILE, content, "utf8");
process.stdout.write(`Updated ${path.relative(ROOT, OUTPUT_FILE)} from Frankfurter (${updatedAt})\n`);

async function getSubscriptionCurrencies() {
  const found = new Set(["USD", ...FALLBACK_CURRENCIES]);
  const files = await listYamlFiles(SUBSCRIPTIONS_DIR);
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    for (const match of raw.matchAll(/^\s*currency:\s*["']?([A-Za-z]{3})["']?\s*$/gm)) {
      found.add(match[1].toUpperCase());
    }
  }
  return Array.from(found).sort();
}

async function listYamlFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listYamlFiles(full));
    } else if (entry.isFile() && /\.(ya?ml)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function getLatestDate(rows) {
  if (!Array.isArray(rows)) return "";
  return rows
    .map((row) => String(row?.date || ""))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function formatRates(rates) {
  const lines = Object.entries(rates)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, rate]) => `    ${currency}: ${rate}`);
  return `{\n${lines.join(",\n")}\n  }`;
}

