import { exchangeRates } from "../data/exchangeRates";

export type RenewalUnit = "day" | "month" | "year";

export interface RenewalConfig {
  unit: RenewalUnit;
  interval: number;
  anchor?: string;
}

export interface PriceConfig {
  amount: number;
  currency: string;
}

export const subscriptionCategoryOrder = ["AI", "Streaming", "Utilities", "Gaming", "Infrastructure"] as const;

const subscriptionCategoryMeta: Record<string, { label: string; color: string; tone: string }> = {
  AI: { label: "人工智能", color: "var(--accent)", tone: "orange" },
  Streaming: { label: "影音娱乐", color: "var(--accent-purple)", tone: "purple" },
  Utilities: { label: "工具服务", color: "var(--accent-teal)", tone: "teal" },
  Gaming: { label: "游戏", color: "var(--green)", tone: "green" },
  Infrastructure: { label: "基础设施", color: "var(--yellow)", tone: "yellow" }
};

const subscriptionTagLabels: Record<string, string> = {
  AI: "AI",
  CLI: "命令行",
  China: "国内",
  Cloud: "云服务",
  Coding: "编程",
  Console: "主机",
  DNS: "DNS",
  Domain: "域名",
  Gaming: "游戏",
  Infrastructure: "基础设施",
  Japan: "日本",
  Membership: "会员",
  Mobile: "移动端",
  Music: "音乐",
  Office: "办公",
  Online: "联机",
  Productivity: "效率",
  Research: "研究",
  Server: "服务器",
  Shopping: "购物",
  Storage: "存储",
  Streaming: "影音",
  US: "美国",
  Video: "视频",
  VPS: "VPS"
};

export function formatSubscriptionCategory(category: string) {
  return subscriptionCategoryMeta[category]?.label ?? category;
}

export function getSubscriptionCategoryColor(category: string) {
  return subscriptionCategoryMeta[category]?.color ?? "var(--text-muted)";
}

export function getSubscriptionCategoryTone(category: string) {
  return subscriptionCategoryMeta[category]?.tone ?? "orange";
}

export function formatSubscriptionTag(tag: string) {
  return subscriptionTagLabels[tag] ?? tag;
}

export function sortSubscriptionCategories(categories: string[]) {
  const rank = new Map(subscriptionCategoryOrder.map((category, index) => [category, index]));
  return [...categories].sort((a, b) => {
    const aRank = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return formatSubscriptionCategory(a).localeCompare(formatSubscriptionCategory(b), "zh-CN");
  });
}

export function getCurrencySymbol(currency: string) {
  const symbols: Record<string, string> = {
    USD: "$",
    CNY: "¥",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    HKD: "HK$",
    TRY: "₺",
    NGN: "₦"
  };
  return symbols[currency] ?? currency;
}

export function getExchangeRateSourceLabel() {
  return `${exchangeRates.provider} · ${exchangeRates.updatedAt}`;
}

export function convertToUsd(amount: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const rates = exchangeRates.rates as Record<string, number>;
  const rate = rates[normalizedCurrency];
  if (!Number.isFinite(rate) || rate <= 0) return amount;
  return amount / rate;
}

export function formatRenewalCycle(renewal: RenewalConfig) {
  if (renewal.unit === "month") {
    return renewal.interval === 1 ? "每月" : `每 ${renewal.interval} 个月`;
  }
  if (renewal.unit === "year") {
    return renewal.interval === 1 ? "每年" : `每 ${renewal.interval} 年`;
  }
  return renewal.interval === 1 ? "每天" : `每 ${renewal.interval} 天`;
}

export function getMonthlyCost(price: PriceConfig, renewal: RenewalConfig) {
  if (renewal.unit === "month") {
    return price.amount / renewal.interval;
  }
  if (renewal.unit === "year") {
    return price.amount / (renewal.interval * 12);
  }
  return (price.amount / (renewal.interval || 1)) * 30;
}

export function getMonthlyCostUsd(price: PriceConfig, renewal: RenewalConfig) {
  return convertToUsd(getMonthlyCost(price, renewal), price.currency);
}

export function formatUsd(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function formatPrice(price: PriceConfig) {
  return `${getCurrencySymbol(price.currency)}${price.amount}`;
}

function parseIsoDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function toIsoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfTodayUtc(from = new Date()) {
  return new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0));
}

function daysInMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0)).getUTCDate();
}

function addMonthsUtc(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonthUtc(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0));
}

function addYearsUtc(date: Date, years: number) {
  return addMonthsUtc(date, years * 12);
}

function addRenewalInterval(date: Date, renewal: RenewalConfig) {
  if (renewal.unit === "day") {
    return new Date(date.getTime() + renewal.interval * 24 * 60 * 60 * 1000);
  }
  if (renewal.unit === "month") {
    return addMonthsUtc(date, renewal.interval);
  }
  return addYearsUtc(date, renewal.interval);
}

export function getNextRenewalDate(startedAt: string, renewal: RenewalConfig, from = new Date()) {
  const base = parseIsoDate(renewal.anchor ?? startedAt);
  const today = startOfTodayUtc(from);
  let next = base;
  let guard = 0;

  while (next < today && guard < 1000) {
    next = addRenewalInterval(next, renewal);
    guard += 1;
  }

  return next;
}

export function getNextRenewalDateString(startedAt: string, renewal: RenewalConfig, from = new Date()) {
  return toIsoDate(getNextRenewalDate(startedAt, renewal, from));
}
