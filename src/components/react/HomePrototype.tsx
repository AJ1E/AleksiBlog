import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAiUsageOverview,
  refreshAiUsageOverview,
  hasAiUsageBackend,
  TOOL_DISPLAY,
  type AiUsageOverview,
  type AiHeatmapDay,
  type AiToolUsage,
} from "../../lib/aiUsageClient";
import {
  fetchVisitorIpRiskSnapshot,
  hasIpRiskBackend,
  isVisitorIpRiskUnavailable,
  type IpRiskSnapshot,
  type VisitorIpRiskResponse,
} from "../../lib/ipRiskClient";
import {
  fetchServerOverview,
  hasServerStatusBackend,
  fmtBps,
  type LiveServer,
  type ServerOverview,
  type GpuInfo,
} from "../../lib/serverStatusClient";
import {
  formatSubscriptionCategory,
  formatSubscriptionTag,
  formatCny,
  formatUsd,
  getNextRenewalDateString,
  getSubscriptionCategoryColor,
  sortSubscriptionCategories,
  type RenewalConfig
} from "../../lib/subscriptions";
import { navItems, siteCompliance, siteMeta } from "../../data/site";

type Subscription = {
  id: number;
  name: string;
  icon: string;
  iconLabel: string;
  color: string;
  price: number;
  priceCurrency: string;
  priceLabel: string;
  monthlyCost: number;
  monthlyCostCny: number;
  cy: string;
  cycleLabel: string;
  cat: string;
  status: "active" | "paused" | "planned";
  start: string;
  renewal: RenewalConfig;
  renewalDate: string;
  renewalDays: number;
  usage: number;
  usageNote: string;
  desc: string;
  note: string;
  renewalUrl?: string;
  tags: string[];
  badge: string;
};

type ApiTool = {
  id: string;
  name: string;
  provider: string;
  useCase: string;
  endpointHint: string;
  integrationState: string;
};

type Server = {
  id: string | number;
  name: string;
  loc: string;
  region?: string;
  flag: string;
  lat: number;
  lon: number;
  provider?: string;
  status: "online" | "warning" | "offline" | "placeholder";
  uptime: string;
  cpu: number;
  ram: number;
  ramUsedGb?: number;
  ramTotalGb?: number;
  disk: number;
  diskUsedGb?: number;
  diskTotalGb?: number;
  netIn: string;
  netOut: string;
  netRxBps?: number;
  netTxBps?: number;
  os: string;
  cores: number;
  ramTotal: string;
  gpus?: GpuInfo[];
  dataUpdatedAt?: string | null;
};

function normalizeServerRegion(value?: string | null): string {
  return value === "中国大陆" ? "China" : value ?? "";
}

function isServerOnline(server: Pick<Server, "status">): boolean {
  return server.status === "online" || server.status === "warning";
}

type Post = {
  id: string;
  href: string;
  cat: string;
  cc: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  cover?: string;
};

type Props = {
  subscriptions: Subscription[];
  apis: ApiTool[];
  servers: Server[];
  posts: Post[];
  isAuthed?: boolean;
  renderedAt: number;
  heroPhase: string;
};

const HOME_SERVER_PREVIEW_LIMIT = 8;

function countryFlagEmoji(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...Array.from(normalized).map((char) => char.charCodeAt(0) + 127397));
}

function formatCountryLabel(country: string, code: string) {
  const flag = countryFlagEmoji(code);
  if (country) return `${flag} ${country}`;
  return flag;
}

function maskIpAddress(ip: string) {
  const value = ip.trim();
  if (!value) return value;

  const v4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(value);
  if (v4) return `${v4[1]}.*`;

  if (value.includes(":")) {
    const compact = value.replace(/::$/, "");
    const idx = compact.lastIndexOf(":");
    if (idx >= 0) return `${compact.slice(0, idx)}:*`;
  }

  return value;
}

function formatAttributeLabel(attribute: IpRiskSnapshot["network"]["attribute"]) {
  switch (attribute) {
    case "residential":
      return "家宽";
    case "datacenter":
      return "机房";
    case "mobile":
      return "移动";
    case "business":
      return "商业";
    default:
      return "未知";
  }
}

function formatTrustLabel(level: IpRiskSnapshot["risk"]["trustLevel"]) {
  switch (level) {
    case "high":
      return "高可信";
    case "medium":
      return "中等";
    case "low":
      return "低可信";
    default:
      return "待检测";
  }
}

function formatRiskLabel(level: IpRiskSnapshot["risk"]["riskLevel"]) {
  switch (level) {
    case "high":
      return "高风险";
    case "medium":
      return "中风险";
    case "low":
      return "低风险";
    default:
      return "待检测";
  }
}

function trustBadgeColor(level: IpRiskSnapshot["risk"]["trustLevel"]): "green" | "yellow" | "red" | "gray" {
  switch (level) {
    case "high":
      return "green";
    case "medium":
      return "yellow";
    case "low":
      return "red";
    default:
      return "gray";
  }
}

function riskBadgeColor(level: IpRiskSnapshot["risk"]["riskLevel"]): "green" | "yellow" | "red" | "gray" {
  switch (level) {
    case "low":
      return "green";
    case "medium":
      return "yellow";
    case "high":
      return "red";
    default:
      return "gray";
  }
}

function riskScoreColor(score: number | null): string {
  if (score === null) return "var(--text-muted)";
  if (score >= 60) return "var(--red)";
  if (score >= 30) return "var(--yellow)";
  return "var(--green)";
}

function trustScoreColor(score: number | null): string {
  if (score === null) return "var(--text-muted)";
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--yellow)";
  return "var(--red)";
}

function ScoreGauge({ label, score, colorFn }: { label: string; score: number | null; colorFn: (s: number | null) => string }) {
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const color = colorFn(score);
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "DM Serif Display", color }}>{score ?? "—"}</div>
      </div>
      <div style={{ height: 3, background: "var(--border-light)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

function formatIpLocation(snapshot: IpRiskSnapshot) {
  return [snapshot.egress.city, snapshot.egress.region, snapshot.egress.country]
    .filter(Boolean)
    .join(" · ");
}

function FlagImg({ code, width = 52 }: { code: string; width?: number }) {
  const cc = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) {
    return (
      <div style={{ width, height: Math.round(width * 0.67), display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-2)", borderRadius: 6, fontSize: Math.round(width * 0.45), flexShrink: 0 }}>
        🌐
      </div>
    );
  }
  const srcW = width <= 40 ? 80 : width <= 80 ? 160 : 320;
  return (
    <div style={{ lineHeight: 0, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-light)", boxShadow: "0 1px 4px rgba(0,0,0,0.10)", flexShrink: 0 }}>
      <img
        src={`https://flagcdn.com/w${srcW}/${cc}.png`}
        srcSet={`https://flagcdn.com/w${srcW * 2}/${cc}.png 2x`}
        width={width}
        alt={cc.toUpperCase()}
        style={{ display: "block" }}
      />
    </div>
  );
}

const AI_USAGE_CACHE_KEY = "kai:ai-usage-overview-v2";
const SERVERS_CACHE_KEY = "kai:servers-overview-v1";
const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let aiUsageOverviewPromise: Promise<AiUsageOverview | null> | null = null;
let serverOverviewPromise: Promise<ServerOverview | null> | null = null;
let visitorIpRiskSnapshotPromise: Promise<VisitorIpRiskResponse> | null = null;
let worldAtlasPromise: Promise<any> | null = null;
let worldAtlasDataCache: any = null;
let heroEntranceAnimationPlayed = false;

function fetchAiUsageOverviewOnce() {
  aiUsageOverviewPromise ??= fetchAiUsageOverview();
  return aiUsageOverviewPromise;
}

function fetchServerOverviewOnce() {
  serverOverviewPromise ??= fetchServerOverview();
  return serverOverviewPromise;
}

function fetchVisitorIpRiskSnapshotOnce() {
  visitorIpRiskSnapshotPromise ??= fetchVisitorIpRiskSnapshot();
  return visitorIpRiskSnapshotPromise;
}

function fetchWorldAtlasOnce() {
  if (worldAtlasDataCache) return Promise.resolve(worldAtlasDataCache);
  worldAtlasPromise ??= (() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    return fetch(WORLD_ATLAS_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`World atlas request failed: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        worldAtlasDataCache = data;
        return data;
      })
      .finally(() => window.clearTimeout(timeout));
  })();
  return worldAtlasPromise;
}

function readLocalStorageJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalStorageJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

const VISIBLE_AI_TOOL_IDS = new Set(["codex-desktop", "codex-cli"]);

const PLACEHOLDER_AI_TOOLS: AiToolUsage[] = (["codex-desktop", "codex-cli"] as const).map(
  (id) => {
    const display = TOOL_DISPLAY[id];
    const provider = id === "codex-desktop" ? "OpenAI" : "Volcengine Ark";
    return {
      id,
      name: display.name,
      icon: display.icon,
      color: display.color,
      provider,
      plan: "等待后端",
      installed: false,
      costMode: "estimated" as const,
      billingUnit: "unknown" as const,
      status: "idle" as const,
      lastEventAt: null,
      quotas: [],
      tok7d: 0,
      tok30d: 0,
      input7d: 0,
      cachedInput7d: 0,
      output7d: 0,
      credits7d: 0,
      input30d: 0,
      cachedInput30d: 0,
      output30d: 0,
      credits30d: 0,
      cost7d: 0,
      cost30d: 0,
      costCny7d: 0,
      costCny30d: 0,
      models7d: [],
      models30d: [],
      warnings: [],
    };
  },
);

function fmt(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function sharePct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function tint(color: string, amount: number) {
  return `color-mix(in oklch, ${color} ${amount}%, transparent)`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${h}:${min}`;
}

function formatLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(dateStr: string, from = new Date()) {
  const diff = new Date(dateStr).valueOf() - from.valueOf();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getRenewalDate(sub: Subscription, from = new Date()) {
  return getNextRenewalDateString(sub.start, sub.renewal, from);
}

function Badge({
  color = "green",
  children,
  small
}: {
  color?: "green" | "red" | "yellow" | "blue" | "orange" | "gray";
  children: React.ReactNode;
  small?: boolean;
}) {
  const C = {
    green: { bg: "var(--green-soft)", fg: "var(--green)" },
    red: { bg: "var(--red-soft)", fg: "var(--red)" },
    yellow: { bg: "var(--yellow-soft)", fg: "var(--yellow)" },
    blue: { bg: "var(--accent-teal-soft)", fg: "var(--accent-teal)" },
    orange: { bg: "var(--accent-soft)", fg: "var(--accent)" },
    gray: { bg: "var(--border-light)", fg: "var(--text-muted)" }
  };
  const c = C[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "2px 6px" : "3px 8px",
        borderRadius: 99,
        background: c.bg,
        color: c.fg,
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap"
      }}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: c.fg,
          flexShrink: 0
        }}
      />
      {children}
    </span>
  );
}

function Bar({ val, max = 100, color = "var(--accent)", h = 5 }: { val: number; max?: number; color?: string; h?: number }) {
  const pct = Math.min(100, Math.round((val / max) * 100));
  const warn = pct > 80;
  return (
    <div style={{ height: h, background: "var(--border-light)", borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: warn ? "var(--yellow)" : color,
          borderRadius: 99,
          transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)"
        }}
      />
    </div>
  );
}

function Skeleton({ w = "100%", h = 14 }: { w?: string; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        background: "var(--border-light)",
        borderRadius: 4,
        animation: "pulse 1.4s ease-in-out infinite"
      }}
    />
  );
}

function getHeroPhase(timestamp = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp)));
  return hour < 6 ? "深夜构建" : hour < 12 ? "上午记录" : hour < 18 ? "下午调试" : "夜间整理";
}

const AnimatedHero = memo(function AnimatedHero({
  posts,
  subscriptions,
  servers,
  aiTools,
  renderedAt,
  heroPhase,
}: {
  posts: Post[];
  subscriptions: Subscription[];
  servers: Server[];
  aiTools: AiToolUsage[];
  renderedAt: number;
  heroPhase: string;
}) {
  const activeSubscriptions = subscriptions.filter((sub) => sub.status === "active");
  const onlineServers = servers.filter(isServerOnline);
  const totalAiTokens7d = aiTools.reduce((total, tool) => total + tool.tok7d, 0);
  const featuredPost = posts[0];
  const [phase, setPhase] = useState(heroPhase);
  const [pointer, setPointer] = useState({ x: 50, y: 50 });
  const [pointerInside, setPointerInside] = useState(false);
  const [animateEntrance, setAnimateEntrance] = useState(false);

  useEffect(() => {
    const update = () => setPhase(getHeroPhase());
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (heroEntranceAnimationPlayed) return;

    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      heroEntranceAnimationPlayed = true;
      setAnimateEntrance(true);
      timer = window.setTimeout(() => setAnimateEntrance(false), 1800);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const fadeUp = (delayMs = 0) =>
    animateEntrance
      ? `heroFadeUp 0.7s cubic-bezier(0.4,0,0.2,1) ${delayMs}ms both`
      : "none";

  const heroStats = [
    { label: "文章", value: String(posts.length), note: featuredPost?.cat ?? "Blog" },
    { label: "订阅", value: String(activeSubscriptions.length), note: "active" },
    { label: "服务器", value: `${onlineServers.length}/${servers.length}`, note: "online" },
    { label: "AI 7d", value: totalAiTokens7d > 0 ? fmt(totalAiTokens7d) : "—", note: "tokens" },
  ];
  type PiscesStar = {
    id: string;
    x: number;
    y: number;
    mag: number;
    name?: string;
    color?: string;
    label?: string;
  };
  const piscesStars: PiscesStar[] = [
    { id: "tx",  x: 320, y: 198, mag: 4.6 },
    { id: "19",  x: 336, y: 186, mag: 5.0 },
    { id: "20",  x: 352, y: 192, mag: 4.8 },
    { id: "27",  x: 352, y: 212, mag: 4.7 },
    { id: "33",  x: 334, y: 220, mag: 4.6 },
    { id: "30",  x: 316, y: 214, mag: 4.7 },
    { id: "om",  x: 300, y: 178, mag: 4.0 },
    { id: "io",  x: 278, y: 162, mag: 4.2 },
    { id: "th",  x: 254, y: 148, mag: 4.3 },
    { id: "ga",  x: 228, y: 138, mag: 3.7, name: "γ", color: "var(--accent-purple)", label: "γ Psc" },
    { id: "al",  x: 198, y: 132, mag: 3.6, name: "α", color: "var(--accent)", label: "α Alrescha" },
    { id: "xi",  x: 180, y: 116, mag: 4.4 },
    { id: "nu",  x: 162, y: 100, mag: 4.6 },
    { id: "mu",  x: 144, y: 84,  mag: 4.5 },
    { id: "ze",  x: 124, y: 72,  mag: 4.4 },
    { id: "ep",  x: 104, y: 64,  mag: 4.3 },
    { id: "de",  x: 84,  y: 70,  mag: 4.0 },
    { id: "pi",  x: 70,  y: 88,  mag: 4.5 },
    { id: "eta", x: 60,  y: 110, mag: 3.5, name: "η", color: "var(--accent-teal)", label: "η Psc" },
    { id: "om2", x: 68,  y: 134, mag: 4.2 },
    { id: "rho", x: 90,  y: 142, mag: 4.4 },
  ];
  const piscesLines: Array<[string, string]> = [
    ["tx", "19"], ["19", "20"], ["20", "27"], ["27", "33"], ["33", "30"], ["30", "tx"],
    ["tx", "om"], ["om", "io"], ["io", "th"], ["th", "ga"], ["ga", "al"],
    ["al", "xi"], ["xi", "nu"], ["nu", "mu"], ["mu", "ze"],
    ["ze", "ep"], ["ep", "de"], ["de", "pi"], ["pi", "eta"], ["eta", "om2"], ["om2", "rho"], ["rho", "ze"],
  ];
  const starById = new Map(piscesStars.map((s) => [s.id, s] as const));
  const fieldStars = [
    { x: 28,  y: 32,  r: 0.9, delay: 0.2, dur: 4.6 },
    { x: 56,  y: 50,  r: 0.6, delay: 1.4, dur: 5.2 },
    { x: 22,  y: 92,  r: 0.7, delay: 2.6, dur: 4.4 },
    { x: 14,  y: 158, r: 0.5, delay: 0.8, dur: 5.6 },
    { x: 32,  y: 222, r: 0.9, delay: 1.9, dur: 4.8 },
    { x: 78,  y: 232, r: 0.6, delay: 3.1, dur: 5.0 },
    { x: 132, y: 240, r: 0.7, delay: 0.5, dur: 4.2 },
    { x: 192, y: 244, r: 0.5, delay: 2.0, dur: 5.4 },
    { x: 252, y: 246, r: 0.8, delay: 1.1, dur: 4.6 },
    { x: 308, y: 240, r: 0.6, delay: 2.7, dur: 5.0 },
    { x: 372, y: 220, r: 0.9, delay: 0.4, dur: 4.4 },
    { x: 380, y: 168, r: 0.5, delay: 1.6, dur: 5.2 },
    { x: 374, y: 110, r: 0.7, delay: 2.3, dur: 4.6 },
    { x: 360, y: 60,  r: 0.6, delay: 3.0, dur: 5.0 },
    { x: 322, y: 28,  r: 0.9, delay: 0.7, dur: 4.4 },
    { x: 268, y: 18,  r: 0.5, delay: 1.8, dur: 5.6 },
    { x: 200, y: 22,  r: 0.7, delay: 2.4, dur: 4.8 },
    { x: 142, y: 18,  r: 0.6, delay: 0.9, dur: 5.0 },
    { x: 84,  y: 24,  r: 0.8, delay: 2.1, dur: 4.6 },
    { x: 232, y: 62,  r: 0.5, delay: 2.9, dur: 5.2 },
    { x: 296, y: 86,  r: 0.6, delay: 0.6, dur: 4.4 },
    { x: 286, y: 168, r: 0.5, delay: 2.2, dur: 5.0 },
    { x: 232, y: 192, r: 0.4, delay: 1.7, dur: 5.6 },
    { x: 160, y: 200, r: 0.6, delay: 2.8, dur: 4.8 },
    { x: 110, y: 188, r: 0.5, delay: 0.3, dur: 5.0 },
    { x: 50,  y: 180, r: 0.6, delay: 1.5, dur: 4.6 },
    { x: 96,  y: 200, r: 0.4, delay: 2.5, dur: 5.4 },
    { x: 168, y: 60,  r: 0.4, delay: 1.3, dur: 5.0 },
  ];

  function updatePointerFromEvent(event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointerInside(true);
    setPointer({
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    updatePointerFromEvent(event);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLElement>) {
    updatePointerFromEvent(event);
  }

  function handlePointerLeave() {
    setPointerInside(false);
  }

  return (
    <section
      className={[
        "home-dynamic-hero",
        animateEntrance ? "home-dynamic-hero--animate" : "",
        pointerInside ? "home-dynamic-hero--pointer" : "",
      ].filter(Boolean).join(" ")}
      onPointerMove={handlePointerMove}
      onMouseMove={handleMouseMove}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      style={{
        "--hero-x": `${pointer.x}%`,
        "--hero-y": `${pointer.y}%`,
      } as React.CSSProperties}
    >
      <div className="home-dynamic-hero__frame" aria-hidden="true" />
      <div
        className="home-dynamic-hero__pointerGlow"
        aria-hidden="true"
        style={{
          opacity: pointerInside ? "var(--hero-pointer-opacity)" : 0,
          background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, var(--hero-pointer-core) 0%, var(--hero-pointer-mid) 22%, var(--hero-pointer-tail) 42%, transparent 64%)`,
        }}
      />
      <div
        className="home-dynamic-hero__copy"
        style={{ position: "relative", zIndex: 3, paddingLeft: 32 }}
      >
        <div
          className="home-dynamic-hero__eyebrow"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 9px",
            borderRadius: 99,
            border: "1px solid var(--border-light)",
            background: "var(--bg-glass)",
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 13,
            backdropFilter: "blur(12px)",
            animation: fadeUp(),
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 4px var(--accent-soft)" }} />
          {phase ? `${phase} · ${siteMeta.title}` : siteMeta.title}
        </div>
        <h1
          className="home-dynamic-hero__title"
          style={{
            fontFamily: "DM Serif Display",
            fontSize: 50,
            fontWeight: 400,
            lineHeight: 1.02,
            color: "var(--text)",
            marginBottom: 12,
            maxWidth: 620,
            animation: fadeUp(70),
          }}
        >
          <span
            style={{
              backgroundImage:
                "linear-gradient(118deg, var(--accent-teal) 0%, var(--accent) 94%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              WebkitTextFillColor: "transparent",
            }}
          >
            Aleksi
          </span> 的工作台
        </h1>
        <p
          className="home-dynamic-hero__copyText"
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            maxWidth: 530,
            lineHeight: 1.76,
            textWrap: "pretty",
            animation: fadeUp(130),
          }}
        >
          A personal blog, private dashboard, and local tooling surface in one Astro app.
        </p>
        <div
          className="home-dynamic-hero__stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 96px), 1fr))",
            gap: 8,
            marginTop: 20,
            maxWidth: 550,
            animation: fadeUp(190),
          }}
        >
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              style={{
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid var(--glass-hero-border)",
                background: "linear-gradient(180deg, color-mix(in oklch, var(--bg-card) 52%, transparent), color-mix(in oklch, var(--bg) 42%, transparent))",
                backdropFilter: "blur(18px) saturate(1.35)",
                WebkitBackdropFilter: "blur(18px) saturate(1.35)",
                boxShadow: "inset 0 1px 0 var(--glass-hero-highlight), var(--glass-hero-shadow)",
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 3 }}>{stat.label}</div>
              <div style={{ fontSize: 19, fontFamily: "DM Serif Display", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stat.note}</div>
            </div>
          ))}
        </div>
        {featuredPost && (
          <a
            className="home-dynamic-hero__latest"
            href={featuredPost.href}
            style={{
              marginTop: 15,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              maxWidth: "100%",
              padding: "10px 13px",
              borderRadius: 14,
              border: "1px solid var(--glass-hero-border)",
              background: "linear-gradient(180deg, color-mix(in oklch, var(--bg-card) 56%, transparent), color-mix(in oklch, var(--bg) 46%, transparent))",
              color: "var(--text)",
              textDecoration: "none",
              backdropFilter: "blur(18px) saturate(1.3)",
              WebkitBackdropFilter: "blur(18px) saturate(1.3)",
              boxShadow: "inset 0 1px 0 var(--glass-hero-highlight), var(--glass-hero-shadow-strong)",
              animation: fadeUp(250),
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: featuredPost.cc, background: `${featuredPost.cc}18`, padding: "2px 7px", borderRadius: 5, flexShrink: 0 }}>{featuredPost.cat}</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{featuredPost.title}</span>
            <span style={{ color: "var(--accent)", fontSize: 13, flexShrink: 0 }}>→</span>
          </a>
        )}
      </div>
      <div
        className="home-dynamic-hero__visual"
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 3,
          animation: fadeUp(120),
        }}
      >
        <svg
          viewBox="0 0 390 260"
          width="100%"
          height="100%"
          className="home-dynamic-hero__pisces-svg"
          style={{
            display: "block",
            minHeight: "clamp(190px, 34vw, 260px)",
            overflow: "visible",
            transform: pointerInside
              ? `translate3d(${(pointer.x - 50) * 0.06}px, ${(pointer.y - 50) * 0.05}px, 0)`
              : "translate3d(0, 0, 0)",
          }}
        >
          <defs>
            <radialGradient id="heroNebula" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
              <stop offset="45%" stopColor="var(--accent-teal)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="heroNebula2" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="var(--accent-purple)" stopOpacity="0.16" />
              <stop offset="60%" stopColor="var(--accent-teal)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="heroPiscesLine" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-teal)" stopOpacity="0.9" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--accent-purple)" stopOpacity="0.85" />
            </linearGradient>
            <radialGradient id="heroStarCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--text)" stopOpacity="1" />
              <stop offset="70%" stopColor="var(--text)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
            </radialGradient>
            <filter id="heroStarGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="heroBigGlow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g className="home-dynamic-hero__constellation">
            <ellipse
              className="home-dynamic-hero__orbit home-dynamic-hero__orbit--one"
              cx="205"
              cy="132"
              rx="178"
              ry="92"
              fill="none"
              stroke="var(--accent-teal)"
              strokeWidth="0.35"
              strokeDasharray="2 12"
              opacity="0.24"
            />
            <ellipse
              className="home-dynamic-hero__orbit home-dynamic-hero__orbit--two"
              cx="205"
              cy="132"
              rx="112"
              ry="168"
              fill="none"
              stroke="var(--accent-purple)"
              strokeWidth="0.3"
              strokeDasharray="1 14"
              opacity="0.18"
              transform="rotate(58 205 132)"
            />
            <ellipse
              cx="68" cy="100" rx="92" ry="62"
              fill="url(#heroNebula)"
              style={{ animation: "heroNebulaPulse 9s ease-in-out infinite" }}
            />
            <ellipse
              cx="320" cy="200" rx="88" ry="58"
              fill="url(#heroNebula2)"
              style={{ animation: "heroNebulaPulse 11s ease-in-out 2s infinite" }}
            />
            {fieldStars.map((star, i) => (
              <circle
                key={`field-${i}`}
                className="home-dynamic-hero__field-star"
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill="var(--text-muted)"
                opacity="0.55"
                style={{
                  animation: `heroStarTwinkle ${star.dur}s ease-in-out ${star.delay}s infinite`,
                }}
              />
            ))}
            {piscesLines.map(([a, b], i) => {
              const s1 = starById.get(a);
              const s2 = starById.get(b);
              if (!s1 || !s2) return null;
              const drawDelay = 0.25 + i * 0.05;
              const breathDelay = drawDelay + 1.0 + (i % 5) * 0.6;
              return (
                <line
                  key={`line-${a}-${b}`}
                  className="home-dynamic-hero__pisces-line"
                  x1={s1.x}
                  y1={s1.y}
                  x2={s2.x}
                  y2={s2.y}
                  stroke="url(#heroPiscesLine)"
                  strokeWidth="0.55"
                  strokeLinecap="round"
                  pathLength="1"
                  style={{
                    strokeDasharray: 1,
                    animation: `heroLineTrace ${8.4 + (i % 4) * 0.7}s cubic-bezier(0.4,0,0.2,1) ${drawDelay}s infinite, heroLineBreath ${7 + (i % 4)}s ease-in-out ${breathDelay}s infinite`,
                  }}
                />
              );
            })}
            {piscesStars.map((star) => {
              const isBright = star.mag <= 3.7;
              const isMid = !isBright && star.mag <= 4.3;
              const r = isBright ? 2.4 : isMid ? 1.6 : 1.0;
              const haloR = isBright ? 8 : isMid ? 5 : 3.4;
              const color = star.color ?? "var(--text)";
              const twinkleDelay = ((star.x * 13 + star.y * 7) % 50) / 10;
              const twinkleDur = 3.5 + ((star.x + star.y) % 6) * 0.4;
              return (
                <g key={star.id}>
                  <circle
                    className="home-dynamic-hero__star-halo"
                    cx={star.x}
                    cy={star.y}
                    r={haloR}
                    fill={color}
                    opacity={isBright ? 0.18 : isMid ? 0.12 : 0.08}
                    filter="url(#heroStarGlow)"
                    style={{
                      animation: `${isBright ? "heroBrightStar" : "heroStarHaloTwinkle"} ${4 + ((star.x % 3))}s ease-in-out ${twinkleDelay * 0.4}s infinite`,
                    }}
                  />
                  {isBright && (
                    <g
                      className="home-dynamic-hero__star-spikes"
                      style={{
                        animation: `heroSpikeBreath ${5 + ((star.y % 4))}s ease-in-out ${twinkleDelay * 0.3}s infinite`,
                      }}
                    >
                      <line x1={star.x - 11} y1={star.y} x2={star.x + 11} y2={star.y} stroke={color} strokeWidth="0.5" strokeLinecap="round" />
                      <line x1={star.x} y1={star.y - 11} x2={star.x} y2={star.y + 11} stroke={color} strokeWidth="0.5" strokeLinecap="round" />
                    </g>
                  )}
                  <circle
                    className="home-dynamic-hero__star-core"
                    cx={star.x}
                    cy={star.y}
                    r={r}
                    fill={color}
                    opacity="0.95"
                    filter={isBright ? "url(#heroBigGlow)" : undefined}
                    style={{
                      animation: `heroStarTwinkle ${twinkleDur}s ease-in-out ${twinkleDelay}s infinite`,
                    }}
                  />
                  {star.label && (
                    <text
                      x={star.x + (isBright ? 9 : 6)}
                      y={star.y - 6}
                      fontFamily="JetBrains Mono, monospace"
                      fontSize="8"
                      fill="var(--text-faint)"
                      opacity="0.7"
                    >
                      {star.label}
                    </text>
                  )}
                </g>
              );
            })}
            <g
              className="home-dynamic-hero__meteor"
              style={{ animation: "heroMeteor 14s ease-in-out 4s infinite" }}
            >
              <line
                x1="380" y1="20" x2="340" y2="50"
                stroke="var(--text)"
                strokeWidth="0.8"
                strokeLinecap="round"
                opacity="0.7"
              />
              <circle cx="380" cy="20" r="1.4" fill="var(--text)" opacity="0.9" />
            </g>
            <g opacity="0.55">
              <text x="14" y="248" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="var(--text-faint)" letterSpacing="0.12em">
                PISCES · ψ
              </text>
              <text x="298" y="22" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="var(--text-faint)" letterSpacing="0.12em">
                {posts.length} posts · {totalAiTokens7d > 0 ? fmt(totalAiTokens7d) : "idle"}
              </text>
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "var(--text-faint)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 10
      }}
    >
      {children}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  mono
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.05em" }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontFamily: mono ? "JetBrains Mono" : "inherit",
          color: "var(--text)",
          wordBreak: "break-all"
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconColor = "var(--accent)",
  children,
  width = 520
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "oklch(0.15 0.01 50 / 0.28)", backdropFilter: "blur(2px)", animation: "fadeIn 0.2s ease" }} />
      <div
        style={{
          position: "relative",
          width,
          maxWidth: "92vw",
          height: "100%",
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          animation: "slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)"
        }}
      >
        <div
          style={{
            padding: "20px 24px 18px",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${iconColor}22`,
              color: iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "DM Serif Display" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, transition: "all 0.15s" }}>
            ✕
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "scroll",
            scrollbarGutter: "stable",
            padding: "20px 24px 32px"
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Heatmap({
  days,
  timezone,
  compact = false,
}: {
  days: AiHeatmapDay[];
  timezone: string;
  compact?: boolean;
}) {
  const resolvedDays = useMemo(() => {
    if (days.length > 0) return days;
    const arr: AiHeatmapDay[] = [];
    const now = new Date();
    for (let i = 364; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      arr.push({
        date: formatLocalDayKey(d),
        total: 0,
        claude: 0,
        codex: 0,
        gemini: 0,
        totalTokens: 0,
      });
    }
    return arr;
  }, [days]);
  const visibleDays = compact ? resolvedDays.slice(-182) : resolvedDays;
  const weeks = [];
  for (let w = 0; w < Math.ceil(visibleDays.length / 7); w += 1) {
    weeks.push(visibleDays.slice(w * 7, (w + 1) * 7));
  }
  const maxV = Math.max(...visibleDays.map((d) => d.totalTokens), 1);
  const colors = ["var(--ai-heatmap-0)", "var(--ai-heatmap-1)", "var(--ai-heatmap-2)", "var(--ai-heatmap-3)", "var(--ai-heatmap-4)"];
  const cellSize = compact ? 6 : 8;
  const cellGap = 1;
  const monthLabels = weeks.map((week) => {
    const first = week[0];
    if (!first) return "";
    const date = new Date(`${first.date}T00:00:00`);
    return date.getDate() <= 7 ? `${date.getMonth() + 1}月` : "";
  });
  function getColor(v: number) {
    if (!v) return colors[0];
    const i = Math.ceil((v / maxV) * 4);
    return colors[Math.min(i, 4)];
  }
  const labelWidth = compact ? 0 : 20;
  const weekColumns = `repeat(${weeks.length}, minmax(0, 1fr))`;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "hidden", paddingBottom: compact ? 0 : 4 }}>
        {!compact && <div style={{ width: labelWidth, display: "flex", flexDirection: "column", gap: cellGap, flexShrink: 0 }}>
          {["一", "", "三", "", "五", "", "日"].map((label, index) => (
            <div key={index} style={{ height: cellSize, fontSize: 8, color: "var(--text-faint)", lineHeight: `${cellSize}px` }}>{label}</div>
          ))}
        </div>}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: weekColumns, gap: cellGap }}>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: cellGap }}>
              {wk.map((d, di) => (
                <div
                  key={di}
                  title={`${d.date} · ${d.totalTokens.toLocaleString()} tokens`}
                  style={{ width: "100%", aspectRatio: "1 / 1", maxHeight: cellSize, borderRadius: compact ? 1 : 2, background: getColor(d.totalTokens) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {!compact && <div style={{ display: "flex", gap: 6, marginTop: 4, overflow: "hidden" }}>
        <div style={{ width: labelWidth, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: weekColumns, gap: cellGap }}>
          {monthLabels.map((label, index) => (
            <div key={index} style={{ fontSize: 8, color: "var(--text-faint)", minWidth: 0 }}>{label}</div>
          ))}
        </div>
      </div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: compact ? 6 : 4 }}>
        <span style={{ fontSize: 9, color: "var(--text-faint)" }}>Less</span>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>{colors.map((c) => <div key={c} style={{ width: compact ? 8 : 9, height: compact ? 8 : 9, borderRadius: 2, background: c }} />)}</div>
        <span style={{ fontSize: 9, color: "var(--text-faint)" }}>More</span>
      </div>
    </div>
  );
}

type MapCluster = { lat: number; lon: number; servers: Server[] };

function buildMapClusters(servers: Server[]): MapCluster[] {
  const result: MapCluster[] = [];
  for (const s of servers) {
    if (!s.lat && !s.lon) continue;
    const match = result.find(
      (c) => Math.abs(c.lat - s.lat) < 1 && Math.abs(c.lon - s.lon) < 1,
    );
    if (match) match.servers.push(s);
    else result.push({ lat: s.lat, lon: s.lon, servers: [s] });
  }
  return result;
}

// ISO 3166-1 alpha-2 → numeric (world-atlas TopoJSON feature IDs)
const ISO2_TO_NUM: Record<string, number> = {
  CN: 156, JP: 392, KR: 410, TW: 158, IN: 356,
  US: 840, CA: 124, MX: 484, BR: 76,  AR: 32,
  DE: 276, GB: 826, FR: 250, NL: 528, RU: 643,
  SE: 752, NO: 578, FI: 246, DK: 208, PL: 616,
  CH: 756, AT: 40,  ES: 724, IT: 380, PT: 620,
  CZ: 203, UA: 804, RO: 642, TR: 792,
  MY: 458, TH: 764, VN: 704, ID: 360, PH: 608,
  AU: 36,  NZ: 554, ZA: 710, IL: 376, AE: 784,
};

// Regions too small to color as countries — show as dots
const DOT_REGIONS = new Set(["HK", "MO", "SG"]);

function flagToCode(flag: string): string {
  const pts = [...(flag ?? "")].map((c) => c.codePointAt(0) ?? 0);
  if (pts.length >= 2 && pts[0] >= 0x1f1e6 && pts[0] <= 0x1f1ff) {
    return String.fromCharCode(pts[0] - 0x1f1e6 + 65, pts[1] - 0x1f1e6 + 65);
  }
  return "";
}

function WorldMap({ servers, compact = false }: { servers: Server[]; compact?: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [worldData, setWorldData] = useState<any>(worldAtlasDataCache);
  const [worldDataError, setWorldDataError] = useState(false);
  const [mapRuntime, setMapRuntime] = useState<{
    d3: typeof import("d3");
    topojson: typeof import("topojson-client");
  } | null>(null);
  const [mapRuntimeError, setMapRuntimeError] = useState(false);
  const [mapWidth, setMapWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cluster: MapCluster } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("d3"), import("topojson-client")])
      .then(([d3Module, topojsonModule]) => {
        if (cancelled) return;
        setMapRuntime({ d3: d3Module, topojson: topojsonModule });
      })
      .catch(() => {
        if (!cancelled) setMapRuntimeError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (worldData) return;
    fetchWorldAtlasOnce()
      .then(setWorldData)
      .catch(() => setWorldDataError(true));
  }, [worldData]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      setMapWidth(Math.round(node.getBoundingClientRect().width));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clusters = useMemo(() => buildMapClusters(servers), [servers]);

  // Split into: country-level fills vs. dot markers
  const { onlineIds, idToCluster, dotClusters } = useMemo(() => {
    const onlineIds = new Set<number>();
    const idToCluster = new Map<number, MapCluster>();
    const dotClusters: MapCluster[] = [];
    for (const cluster of clusters) {
      if (!cluster.servers.some(isServerOnline)) continue;
      const code = flagToCode(cluster.servers[0].flag);
      if (!code || DOT_REGIONS.has(code)) { dotClusters.push(cluster); continue; }
      const num = ISO2_TO_NUM[code];
      if (!num) { dotClusters.push(cluster); continue; }
      onlineIds.add(num);
      idToCluster.set(num, cluster);
    }
    return { onlineIds, idToCluster, dotClusters };
  }, [clusters]);

  useEffect(() => {
    if (!svgRef.current || !worldData || !mapRuntime) return;
    const { d3, topojson } = mapRuntime;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = Math.max(mapWidth || svgRef.current.getBoundingClientRect().width || 700, 240);
    const H = compact
      ? Math.max(Math.round(W * 0.5), 128)
      : Math.max(Math.round(W * 0.48), 220);
    svg.attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);

    const countries = topojson.feature(worldData, worldData.objects.countries) as any;
    const proj = d3.geoEquirectangular().fitSize([W, H], { type: "Sphere" } as any);
    const path = d3.geoPath().projection(proj);

    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "var(--map-bg)").attr("rx", compact ? 6 : 10);
    svg.append("path").datum(d3.geoGraticule()())
      .attr("d", path as any).attr("fill", "none").attr("stroke", "var(--map-graticule)").attr("stroke-width", 0.3);
    const getRect = () => containerRef.current?.getBoundingClientRect();

    // Country fills: online → green tint, others → default sage
    svg.append("g").selectAll("path").data(countries.features).join("path")
      .attr("d", path as any)
      .attr("fill", (d: any) => onlineIds.has(Number(d.id)) ? "var(--map-land-online)" : "var(--map-land)")
      .attr("stroke", "var(--map-border)").attr("stroke-width", 0.45)
      .style("cursor", (d: any) => onlineIds.has(Number(d.id)) ? "pointer" : "default")
      .on("mouseenter", function (event: any, d: any) {
        const cluster = idToCluster.get(Number(d.id));
        if (!cluster) return;
        const rect = getRect();
        setTooltip({ x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0), cluster });
      })
      .on("mousemove", function (event: any, d: any) {
        if (!idToCluster.has(Number(d.id))) return;
        const rect = getRect();
        setTooltip((prev) => prev
          ? { ...prev, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
          : prev);
      })
      .on("mouseleave", () => setTooltip(null));

    // Country borders on top
    svg.append("path")
      .datum(topojson.mesh(worldData, worldData.objects.countries, (a: any, b: any) => a !== b) as any)
      .attr("d", path as any).attr("fill", "none").attr("stroke", "var(--map-border)").attr("stroke-width", 0.3);

    // Small-region dots (HK, MO, SG, unknown codes)
    dotClusters.forEach((cluster) => {
      const c = proj([cluster.lon, cluster.lat]);
      if (!c) return;
      const [x, y] = c;
      svg.append("circle")
        .attr("cx", x).attr("cy", y).attr("r", 3)
        .style("fill", "#22c55e").style("stroke", "var(--bg)").style("stroke-width", 1.2)
        .style("cursor", "pointer")
        .on("mouseenter", function () {
          d3.select(this).transition().duration(80).attr("r", 4.5);
          setTooltip({ x, y, cluster });
        })
        .on("mouseleave", function () {
          d3.select(this).transition().duration(80).attr("r", 3);
          setTooltip(null);
        });
    });
  }, [worldData, mapRuntime, onlineIds, idToCluster, dotClusters, compact, mapWidth]);

  const mapReady = Boolean(worldData && mapRuntime && !mapRuntimeError);

  return (
    <div ref={containerRef} style={{ position: "relative", borderRadius: compact ? 6 : 10, overflow: "hidden" }}>
      {!mapReady && (
        <div style={{ height: compact ? 160 : 300, background: "var(--map-bg)", borderRadius: compact ? 6 : 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono" }}>
          <span style={{ animation: worldDataError ? "none" : "pulse 1.4s ease-in-out infinite" }}>{worldDataError ? "地图数据暂不可用" : "加载地图中…"}</span>
        </div>
      )}
      <svg ref={svgRef} style={{ width: "100%", height: "auto", display: mapReady ? "block" : "none" }} />
      {tooltip && (() => {
        const W = containerRef.current?.getBoundingClientRect().width ?? 600;
        const left = tooltip.x > W * 0.62 ? tooltip.x - 145 : tooltip.x + 10;
        return (
          <div style={{ position: "absolute", left, top: Math.max(tooltip.y - 8, 4), background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", boxShadow: "var(--shadow-md)", pointerEvents: "none", zIndex: 10, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono", marginBottom: 4 }}>
              {tooltip.cluster.servers[0].flag} {tooltip.cluster.servers[0].loc}
            </div>
            {tooltip.cluster.servers.map((s) => (
              <div key={s.id as string} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "online" ? "#22c55e" : s.status === "warning" ? "#eab308" : "#ef4444", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
                {s.status !== "offline" && s.status !== "placeholder" && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono", marginLeft: "auto", paddingLeft: 6 }}>{s.cpu}%</span>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function DarkToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem("kai-theme", "dark");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("kai-theme", "light");
    }
  }
  return (
    <button
      onClick={toggle}
      title={dark ? "切换亮色" : "切换暗色"}
      style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--text-muted)", transition: "all 0.15s", flexShrink: 0 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--text-muted)";
        e.currentTarget.style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {dark ? "☀" : "◑"}
    </button>
  );
}

function Nav({ isAuthed }: { isAuthed: boolean }) {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px) saturate(1.5)", background: "var(--bg-glass)", borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ width: "min(1200px, calc(100% - 32px))", margin: "0 auto", minHeight: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/favicon.svg" alt="" width={34} height={34} style={{ width: 34, height: 34, objectFit: "contain", display: "block" }} />
          <span style={{ fontSize: "1.1rem", fontFamily: "DM Serif Display, serif" }}>{siteMeta.title}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {navItems.map((link) => <a key={link.label} href={link.href} style={{ fontSize: "0.87rem", color: "var(--text-muted)", padding: "7px 11px", borderRadius: 999, textDecoration: "none", transition: "0.15s ease" }} onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-soft)";
            e.currentTarget.style.color = "var(--text)";
          }} onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}>{link.label}</a>)}
          </div>
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          <AuthButton isAuthed={isAuthed} next="/" />
          <DarkToggle />
        </div>
      </div>
    </nav>
  );
}

function AuthButton({ isAuthed, next }: { isAuthed: boolean; next: string }) {
  const baseStyle: React.CSSProperties = {
    fontSize: "0.82rem",
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text-muted)",
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = "var(--text)";
    e.currentTarget.style.borderColor = "var(--text-muted)";
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = "var(--text-muted)";
    e.currentTarget.style.borderColor = "var(--border)";
  };
  if (!isAuthed) {
    return (
      <a href={`/login?next=${encodeURIComponent(next)}`} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>登录</a>
    );
  }
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
    if (response.ok) window.location.assign("/");
  };
  return (
    <form method="POST" action="/api/auth/logout" style={{ margin: 0, display: "inline-flex" }} onSubmit={onSubmit}>
      <button type="submit" style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>退出</button>
    </form>
  );
}

function SubscriptionIcon({ sub, size = 36 }: { sub: Subscription; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        background: `linear-gradient(135deg, ${tint(sub.color, 18)}, var(--bg-card))`,
        border: "1px solid var(--border-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 color-mix(in oklch, white 18%, transparent)"
      }}
    >
      <img
        src={sub.icon}
        alt={sub.iconLabel}
        style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72), objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

function SubscriptionWidget({ subscriptions, onOpen }: { subscriptions: Subscription[]; onOpen: () => void }) {
  const active = subscriptions.filter((s) => s.status === "active");
  const ordered = [...active].sort((a, b) => a.renewalDays - b.renewalDays);
  const totalUsd = active.reduce((sum, sub) => sum + sub.monthlyCost, 0);
  const totalCny = active.reduce((sum, sub) => sum + sub.monthlyCostCny, 0);
  const next = ordered[0];
  const nextDays = next?.renewalDays ?? null;

  return (
    <div
      onClick={onOpen}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.18s", display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>订阅概览</div>
          <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "DM Serif Display", letterSpacing: "-0.02em" }}>
            {formatUsd(totalUsd)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>/月</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>≈ {formatCny(totalCny)} / 月</div>
        </div>
        <Badge color="green">{active.length} 活跃</Badge>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {ordered.map((sub) => (
          <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "1px solid var(--border-light)", borderRadius: 8, background: "var(--bg-2)" }}>
            <SubscriptionIcon sub={sub} size={27} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{sub.cycleLabel}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "JetBrains Mono" }}>{formatUsd(sub.monthlyCost)}</div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>≈ {formatCny(sub.monthlyCostCny)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>下次续费 · {next?.name ?? "暂无"}</span>
        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{nextDays != null ? `${nextDays} 天后 →` : "—"}</span>
      </div>
    </div>
  );
}

function SubscriptionDrawer({ subscriptions, open, onClose }: { subscriptions: Subscription[]; open: boolean; onClose: () => void }) {
  if (!open) return null;

  const active = subscriptions.filter((s) => s.status === "active");
  const ordered = [...subscriptions].sort((a, b) => daysUntil(getRenewalDate(a)) - daysUntil(getRenewalDate(b)));
  const totalUsd = active.reduce((sum, sub) => sum + sub.monthlyCost, 0);
  const totalCny = active.reduce((sum, sub) => sum + sub.monthlyCostCny, 0);
  return (
    <Drawer open={open} onClose={onClose} title="订阅管理" subtitle={`共 ${subscriptions.length} 项 · 金额为当前汇率近似值`} icon="◈" iconColor="var(--accent)">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}><StatCell label="月度总计" value={formatUsd(totalUsd)} sub={`≈ ${formatCny(totalCny)} / 月`} /></div>
        <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}><StatCell label="年度预估" value={formatUsd(totalUsd * 12)} sub={`≈ ${formatCny(totalCny * 12)} / 年`} /></div>
        <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}><StatCell label="活跃数量" value={`${active.length}/${subscriptions.length}`} sub="项订阅" /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ordered.map((sub) => {
          const renewalDate = getRenewalDate(sub);
          const days = daysUntil(renewalDate);
          const categoryColor = getSubscriptionCategoryColor(sub.cat);
          return (
            <div key={sub.id} style={{ padding: "14px 16px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SubscriptionIcon sub={sub} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{sub.name}</span>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: tint(categoryColor, 14), color: categoryColor, fontWeight: 600 }}>{formatSubscriptionCategory(sub.cat)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub.desc}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "DM Serif Display" }}>{sub.priceLabel}</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{sub.cycleLabel}</div>
                </div>
              </div>
              {sub.status === "active" && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <StatCell label="开始日期" value={sub.start} mono />
                <StatCell label="续费日期" value={renewalDate} mono />
                <StatCell label="距离续费" value={`${days} 天`} sub={days < 7 ? "即将到期" : days < 30 ? "本月内" : ""} />
              </div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <StatCell label="计费周期" value={sub.cycleLabel} />
                <StatCell label="月均折算" value={formatUsd(sub.monthlyCost)} sub={`≈ ${formatCny(sub.monthlyCostCny)}`} mono />
              </div>
              {(sub.note || sub.renewalUrl) && <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, padding: "10px 12px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
                {sub.note && <div>{sub.note}</div>}
                {sub.renewalUrl && <a href={sub.renewalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}>续费链接：{sub.renewalUrl}</a>}
              </div>}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

function SubscriptionWidgetLegacy({ subscriptions, onOpen }: { subscriptions: Subscription[]; onOpen: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = subscriptions.filter((s) => s.status === "active");
  const total = active.reduce((a, s) => a + s.monthlyCost, 0);
  const cats = sortSubscriptionCategories([...new Set(active.map((s) => s.cat))]);
  const next = mounted
    ? subscriptions.reduce((a, s) => (daysUntil(getRenewalDate(s)) < daysUntil(getRenewalDate(a)) ? s : a))
    : subscriptions[0];
  const nextDays = mounted && next ? daysUntil(getRenewalDate(next)) : null;
  return (
    <div
      onClick={onOpen}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.18s", display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>订阅概览</div>
          <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "DM Serif Display", letterSpacing: "-0.02em" }}>${total.toFixed(0)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>/月</span></div>
        </div>
        <Badge color="green">{active.length} 活跃</Badge>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {cats.map((cat) => {
          const catSubs = subscriptions.filter((s) => s.cat === cat && s.status === "active");
          const catTotal = catSubs.reduce((a, s) => a + s.monthlyCost, 0);
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: getSubscriptionCategoryColor(cat), flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", width: 56, flexShrink: 0 }}>{formatSubscriptionCategory(cat)}</span>
              <div style={{ flex: 1 }}><Bar val={catTotal} max={total} color={getSubscriptionCategoryColor(cat)} h={4} /></div>
              <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "JetBrains Mono", color: "var(--text)", flexShrink: 0 }}>${catTotal.toFixed(0)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>下次续费 · {next?.name ?? "—"}</span>
        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{nextDays != null ? `${nextDays} 天后 →` : "— →"}</span>
      </div>
    </div>
  );
}

function SubscriptionDrawerLegacy({ subscriptions, open, onClose }: { subscriptions: Subscription[]; open: boolean; onClose: () => void }) {
  const [cat, setCat] = useState("全部");
  const categories = sortSubscriptionCategories([...new Set(subscriptions.map((s) => s.cat))]);
  const cats = ["全部", ...categories];
  const filtered = cat === "全部" ? subscriptions : subscriptions.filter((s) => s.cat === cat);
  const active = subscriptions.filter((s) => s.status === "active");
  const total = active.reduce((a, s) => a + s.monthlyCost, 0);
  return (
    <Drawer open={open} onClose={onClose} title="订阅管理" subtitle={`共 ${subscriptions.length} 项 · 月支出 $${total.toFixed(2)}`} icon="◈" iconColor="var(--accent)">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
        {[{ label: "月度总计", value: `$${total.toFixed(2)}`, sub: "活跃订阅" }, { label: "年度预估", value: `$${(total * 12).toFixed(0)}`, sub: "按当前计划" }, { label: "活跃数量", value: `${active.length}/${subscriptions.length}`, sub: "项订阅" }].map((s) => <div key={s.label} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}><StatCell {...s} /></div>)}
      </div>
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>分类占比</SectionLabel>
        {categories.map((c) => {
          const cs = subscriptions.filter((s) => s.cat === c && s.status === "active");
          if (!cs.length) return null;
          const ct = cs.reduce((a, s) => a + s.monthlyCost, 0);
          return <div key={c} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: getSubscriptionCategoryColor(c), display: "inline-block" }} />{formatSubscriptionCategory(c)}</span><span style={{ fontWeight: 600, fontFamily: "JetBrains Mono", fontSize: 11 }}>${ct.toFixed(2)} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({Math.round((ct / total) * 100)}%)</span></span></div><Bar val={ct} max={total} color={getSubscriptionCategoryColor(c)} h={6} /></div>;
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {cats.map((c) => <button key={c} onClick={() => setCat(c)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: "1px solid", borderColor: cat === c ? "transparent" : "var(--border-light)", background: cat === c ? "var(--accent)" : "transparent", color: cat === c ? "white" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>{c === "全部" ? c : formatSubscriptionCategory(c)}</button>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((s) => {
          const renewalDate = getRenewalDate(s);
          const days = daysUntil(renewalDate);
          return (
            <div key={s.id} style={{ padding: "14px 16px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SubscriptionIcon sub={s} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: tint(getSubscriptionCategoryColor(s.cat), 14), color: getSubscriptionCategoryColor(s.cat), fontWeight: 600 }}>{formatSubscriptionCategory(s.cat)}</span>
                    {s.status === "paused" && <Badge color="gray" small>暂停</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.desc}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "DM Serif Display" }}>{s.priceLabel}</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{s.cycleLabel}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {s.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "var(--bg-card)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                    #{formatSubscriptionTag(tag)}
                  </span>
                ))}
                {s.badge && <Badge color="blue" small>{s.badge}</Badge>}
              </div>
              {s.status === "active" && <>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>使用量</span>
                    <span style={{ fontWeight: 600 }}>{s.usage}%</span>
                  </div>
                  <Bar val={s.usage} color={s.color} h={5} />
                  {s.usageNote && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 5 }}>{s.usageNote}</div>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <StatCell label="开始日期" value={s.start} mono />
                  <StatCell label="续费日期" value={renewalDate} mono />
                  <StatCell label="距续费" value={`${days}天`} sub={days < 7 ? "即将到期" : days < 30 ? "本月内" : ""} />
                </div>
              </>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <StatCell label="计费周期" value={s.cycleLabel} />
                <StatCell label="月均折算" value={`${s.cy}${s.monthlyCost.toFixed(2)}`} mono />
              </div>
              {s.note && <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, padding: "10px 12px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>{s.note}</div>}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

function AIUsageWidget({
  onOpen,
  tools,
  installedCount,
  backendConnected,
  generatedAt,
}: {
  onOpen: () => void;
  tools: AiToolUsage[];
  installedCount: number;
  backendConnected: boolean;
  generatedAt: string | null;
}) {
  const total7d = tools.reduce((a, t) => a + t.tok7d, 0);
  const totalCost7d = tools.reduce((a, t) => a + t.cost7d, 0);
  const totalCostCny7d = tools.reduce((a, t) => a + t.costCny7d, 0);
  const hasApproxCost = tools.some((t) => t.costMode === "estimated" && t.tok7d > 0);
  const hasData = installedCount > 0;
  return (
    <div
      onClick={onOpen}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.18s", display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>AI 工具用量</div>
          <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "DM Serif Display", letterSpacing: "-0.02em" }}>{hasData ? fmt(total7d) : "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{hasData ? "tokens · 过去 7 天" : backendConnected ? "未检测到本地工具" : "等待后端"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{hasData && (totalCost7d > 0 || totalCostCny7d > 0) ? `${hasApproxCost ? "~" : ""}$${totalCost7d.toFixed(2)}` : "—"}</div>
          <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{hasData && totalCostCny7d > 0 ? `≈ ¥${totalCostCny7d.toFixed(2)}` : "费用待配置"}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tools.map((t) => {
          return (
            <div
              key={t.id}
              style={{
                minWidth: 0,
                minHeight: 76,
                padding: "14px",
                background: "var(--bg-2)",
                borderRadius: 10,
                border: "1px solid var(--border-light)",
                display: "grid",
                gridTemplateColumns: "34px minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 8, background: tint(t.color, 18), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AiToolIcon tool={t} size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1, fontFamily: "DM Serif Display", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{t.tok7d > 0 ? fmt(t.tok7d) : "—"}</div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 6, whiteSpace: "nowrap" }}>7d tokens</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ paddingTop: 8, borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {generatedAt ? (
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>更新 {fmtRelative(generatedAt)}</span>
        ) : (
          <span />
        )}
        <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>查看详情 →</span>
      </div>
    </div>
  );
}

function AiToolIcon({
  tool,
  size = 14,
}: {
  tool: Pick<AiToolUsage, "id" | "icon" | "color">;
  size?: number;
}) {
  if (tool.id === "codex-desktop") {
    return <img src="/assets/openai-chatgpt-icon.png" alt="" aria-hidden="true" style={{ width: size, height: size, objectFit: "contain", display: "block", mixBlendMode: "multiply" }} />;
  }
  return <span style={{ fontSize: size, color: tool.color, fontWeight: 700, lineHeight: 1 }}>{tool.icon}</span>;
}

function AIUsageDrawer({
  open,
  onClose,
  tools,
  heatmap,
  backendConnected,
  backendError,
  generatedAt,
  onOverviewRefreshed,
}: {
  open: boolean;
  onClose: () => void;
  tools: AiToolUsage[];
  heatmap: { timezone: string; days: AiHeatmapDay[] };
  backendConnected: boolean;
  backendError: string | null;
  generatedAt: string | null;
  onOverviewRefreshed: (overview: AiUsageOverview) => void;
}) {
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [refreshingTool, setRefreshingTool] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefreshTool(toolId: string) {
    if (refreshingTool) return;
    setRefreshingTool(toolId);
    setRefreshError(null);
    try {
      const overview = await refreshAiUsageOverview();
      if (!overview) throw new Error("empty refresh response");
      onOverviewRefreshed(overview);
    } catch {
      setRefreshError("刷新未完成，请稍后重试。");
    } finally {
      setRefreshingTool(null);
    }
  }
  const total7d = tools.reduce((a, t) => a + t.tok7d, 0);
  const total30d = tools.reduce((a, t) => a + t.tok30d, 0);
  const cost7d = tools.reduce((a, t) => a + t.cost7d, 0);
  const cost30d = tools.reduce((a, t) => a + t.cost30d, 0);
  const costCny7d = tools.reduce((a, t) => a + t.costCny7d, 0);
  const costCny30d = tools.reduce((a, t) => a + t.costCny30d, 0);
  const totalTok = period === "7d" ? total7d : total30d;
  const totalCost = period === "7d" ? cost7d : cost30d;
  const totalCostCny = period === "7d" ? costCny7d : costCny30d;
  const hasApproxCost = tools.some((t) => t.costMode === "estimated" && (period === "7d" ? t.tok7d : t.tok30d) > 0);
  const orderedTools = useMemo(() => [...tools].sort((a, b) => {
    const aTokens = period === "7d" ? a.tok7d : a.tok30d;
    const bTokens = period === "7d" ? b.tok7d : b.tok30d;
    return bTokens - aTokens || a.name.localeCompare(b.name);
  }), [period, tools]);
  const installedTools = tools.filter((t) => t.installed);
  const subtitle = "ChatGPT Codex · Codex CLI";
  return (
    <Drawer open={open} onClose={onClose} title="AI 工具用量分析" subtitle={subtitle} icon="⬡" iconColor="var(--accent-teal)" width={640}>
      <style>{`@keyframes ai-refresh-spin { to { transform: rotate(360deg); } } .ai-usage-tool-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }`}</style>
      {!backendConnected && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--accent-light)", borderRadius: 8, border: "1px solid var(--border-light)", fontSize: 11, color: "var(--text-muted)" }}>
          {backendError ? (
            <>
              后端请求失败：<code style={{ fontFamily: "JetBrains Mono" }}>{backendError}</code>。请确认 <code style={{ fontFamily: "JetBrains Mono" }}>pnpm ai-usage:dev</code> 已在本机 8787 端口运行，或设置 <code style={{ fontFamily: "JetBrains Mono" }}>PUBLIC_AI_USAGE_API_BASE_URL</code> 指向你的后端地址。
            </>
          ) : (
            <>未配置 <code style={{ fontFamily: "JetBrains Mono" }}>PUBLIC_AI_USAGE_API_BASE_URL</code>，且当前不在本地访问。运行 <code style={{ fontFamily: "JetBrains Mono" }}>pnpm ai-usage:dev</code> 启动本地后端，或设置该环境变量指向远程后端。</>
          )}
        </div>
      )}
      {backendConnected && installedTools.length === 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border-light)", fontSize: 11, color: "var(--text-muted)" }}>
          后端运行正常，但未在本地检测到两个 AI 工具的结构化用量数据。请先产生过 ChatGPT Codex 或 Codex CLI 会话日志。
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--bg-2)", borderRadius: 9, padding: 3, border: "1px solid var(--border-light)" }}>
          {[["7d", "7天"], ["30d", "30天"]].map(([k, label]) => <button key={k} onClick={() => setPeriod(k as "7d" | "30d")} style={{ padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: period === k ? "1px solid var(--border)" : "1px solid transparent", cursor: "pointer", transition: "all 0.15s", background: period === k ? "var(--bg-card)" : "transparent", color: period === k ? "var(--text)" : "var(--text-muted)", boxShadow: period === k ? "var(--shadow-sm)" : "none" }}>{label}</button>)}
        </div>
        {generatedAt && (
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>数据更新于 {fmtRelative(generatedAt)}</span>
        )}
      </div>
      {refreshError && <div role="status" style={{ marginTop: -10, marginBottom: 14, fontSize: 11, color: "var(--accent)", textAlign: "right" }}>{refreshError}</div>}
      <div style={{ marginBottom: 20, padding: "20px 24px", background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--border-light)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", marginBottom: 8 }}>TOTAL TOKENS</div>
        <div style={{ fontSize: 36, fontWeight: 700, textAlign: "center", letterSpacing: "-0.03em", fontFamily: "DM Serif Display" }}>{totalTok.toLocaleString()}</div>
        <div style={{ fontSize: 16, color: "var(--accent)", fontWeight: 600, textAlign: "center", marginTop: 4 }}>{totalCost > 0 ? `${hasApproxCost ? "~" : ""}$${totalCost.toFixed(2)}` : "费用待配置官方单价"}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>{totalCostCny > 0 ? `≈ ¥${totalCostCny.toFixed(2)} · USD/CNY cached daily` : "人民币费用待配置官方单价"}</div>
        {hasApproxCost && totalCost > 0 && <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", marginTop: 2 }}>~ = 官方单价等价估算，不代表实际扣费</div>}
      </div>
      <div className="ai-usage-tool-grid">
      {orderedTools.map((t) => {
        const tok = period === "7d" ? t.tok7d : t.tok30d;
        const credits = period === "7d" ? t.credits7d : t.credits30d;
        const cost = period === "7d" ? t.cost7d : t.cost30d;
        const costCny = period === "7d" ? t.costCny7d : t.costCny30d;
        const models = period === "7d" ? t.models7d : t.models30d;
        const usagePct = sharePct(tok, totalTok);
        const usageLabel = t.billingUnit === "credits" ? "Credits" : "Token用量";
        const usageValue = t.billingUnit === "credits" ? (credits > 0 ? fmt(credits) : "—") : (tok > 0 ? fmt(tok) : "—");
        const costLabel = t.costMode === "unknown" || (t.costMode === "estimated" && cost <= 0 && tok > 0)
          ? "待配置官方单价"
          : t.costMode === "subscription"
            ? `~$${cost.toFixed(2)}`
            : `$${cost.toFixed(2)}${t.costMode === "estimated" ? "*" : ""} / ¥${costCny.toFixed(2)}`;
        const fiveHour = t.windows?.fiveHour;
        const sevenDay = t.windows?.sevenDay;
        const hasInformationalWindows = (fiveHour || sevenDay) && t.quotas.length === 0;
        return <div key={t.id} style={{ padding: 16, background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border-light)", minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, minWidth: 0 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: tint(t.color, 20), color: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}><AiToolIcon tool={t} size={20} /></div><div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div><div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.provider} · {t.plan}</div></div><div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}><span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>使用占比：{totalTok > 0 ? `${usagePct}%` : "—"}</span><button onClick={(e) => { e.stopPropagation(); handleRefreshTool(t.id); }} disabled={refreshingTool === t.id} title="从 GitHub 刷新" aria-label={`${t.name}从 GitHub 刷新`} style={{ width: 28, height: 28, background: "var(--bg-2)", border: "1px solid var(--border-light)", cursor: refreshingTool === t.id ? "default" : "pointer", padding: 0, borderRadius: "50%", color: "var(--text-faint)", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: refreshingTool !== null && refreshingTool !== t.id ? 0.4 : 1 }}><span style={{ display: "inline-block", animation: refreshingTool === t.id ? "ai-refresh-spin 0.8s linear infinite" : "none" }}>↻</span></button><Badge color={t.status === "active" ? "green" : "gray"}>{t.status === "active" ? "运行中" : "待机"}</Badge></div></div>{t.quotas.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>{t.quotas.map((q) => <div key={q.label}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 4, fontSize: 11 }}><div><div style={{ color: "var(--text-muted)" }}>{q.label}</div>{q.note && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2, fontFamily: "JetBrains Mono" }}>{q.note}</div>}</div><span style={{ fontWeight: 600, fontFamily: "JetBrains Mono", whiteSpace: "nowrap" }}>{q.used}{q.unit} / {q.total}{q.unit}</span></div><Bar val={q.used} max={q.total} color={t.color} h={5} /></div>)}</div>}{hasInformationalWindows && <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>{fiveHour && <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border-light)" }}><div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.06em", marginBottom: 4 }}>5h 滚动窗口</div><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "DM Serif Display" }}>{fmt(fiveHour.totalTokens)} <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>tokens</span></div><div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono" }}>{fiveHour.requests} 次请求</div></div>}{sevenDay && <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border-light)" }}><div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.06em", marginBottom: 4 }}>7d 滚动窗口</div><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "DM Serif Display" }}>{fmt(sevenDay.totalTokens)} <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)" }}>tokens</span></div><div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono" }}>{sevenDay.requests} 次请求</div></div>}</div>}<div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}><StatCell label={usageLabel} value={usageValue} mono /><StatCell label="花费" value={costLabel} mono />{models.slice(0, 2).map((m) => <StatCell key={m.name} label={m.name} value={`${m.pct}%`} mono />)}</div>{models.length > 0 && <div style={{ marginTop: 10 }}>{models.map((m) => <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}><span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono", width: 120, flexShrink: 0 }}>{m.name}</span><div style={{ flex: 1 }}><Bar val={m.pct} color={t.color} h={4} /></div><span style={{ fontSize: 11, fontWeight: 600, width: 30, textAlign: "right" }}>{m.pct}%</span></div>)}</div>}{t.warnings.length > 0 && <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 8, fontSize: 10, color: "var(--text-faint)" }}>{t.warnings.map((w, i) => <div key={i}>· {w}</div>)}</div>}</div>;
      })}
      </div>
      <div style={{ marginTop: 16, marginBottom: 18 }}>
        <SectionLabel>Token 分项</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {orderedTools.map((t) => {
            const input = period === "7d" ? t.input7d : t.input30d;
            const cached = period === "7d" ? t.cachedInput7d : t.cachedInput30d;
            const output = period === "7d" ? t.output7d : t.output30d;
            const costUsd = period === "7d" ? t.cost7d : t.cost30d;
            const costCny = period === "7d" ? t.costCny7d : t.costCny30d;
            return <div key={t.id} style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 9, border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}><AiToolIcon tool={t} size={14} /><span style={{ fontSize: 11, fontWeight: 600 }}>{t.name}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                <StatCell label="输入" value={fmt(input)} mono />
                <StatCell label="缓存命中" value={fmt(cached)} mono />
                <StatCell label="输出" value={fmt(output)} mono />
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>{t.billingUnit === "credits" ? `Credits ${fmt(period === "7d" ? t.credits7d : t.credits30d)} · 官方套餐计费` : `估算 ${costUsd > 0 ? `~$${costUsd.toFixed(2)} / ¥${costCny.toFixed(2)}` : "待配置官方单价"}`}</div>
            </div>;
          })}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <SectionLabel>活跃度热力图</SectionLabel>
        <Heatmap days={heatmap.days} timezone={heatmap.timezone} />
      </div>
    </Drawer>
  );
}

function ServerWidget({ servers, onOpen }: { servers: Server[]; onOpen: () => void }) {
  const hasLiveServers = servers.some((server) => server.status !== "placeholder");
  const online = servers.filter(isServerOnline).length;
  const warn = servers.filter((s) => s.status === "warning").length;
  const offline = servers.filter((s) => s.status === "offline").length;
  const previewServers = servers.slice(0, HOME_SERVER_PREVIEW_LIMIT);
  const hiddenServerCount = Math.max(servers.length - previewServers.length, 0);
  return (
    <div
      onClick={onOpen}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18, cursor: "pointer", boxShadow: "var(--shadow-sm)", transition: "all 0.18s", display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>服务器监控</div>
          <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "DM Serif Display", letterSpacing: "-0.02em" }}>
            {hasLiveServers ? online : "—"}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 2 }}>
              {hasLiveServers ? `/${servers.length} 在线` : "等待接入"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {!hasLiveServers && <Badge color="gray">待配置</Badge>}
          {hasLiveServers && warn > 0 && <Badge color="yellow">{warn} 告警</Badge>}
          {hasLiveServers && offline > 0 && <Badge color="red">{offline} 离线</Badge>}
          {hasLiveServers && warn === 0 && offline === 0 && <Badge color="green">全部正常</Badge>}
        </div>
      </div>
      {hasLiveServers ? (
        <>
          <WorldMap servers={servers} compact />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {previewServers.map((s) => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--bg-2)", borderRadius: 6, border: "1px solid var(--border-light)" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "online" ? "var(--green)" : s.status === "warning" ? "var(--yellow)" : s.status === "offline" ? "var(--red)" : "var(--border)" }} /><span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--text-muted)" }}>{s.name}</span></div>)}
            {hiddenServerCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "var(--accent-light)", borderRadius: 6, border: "1px solid var(--accent-light)", color: "var(--accent)", fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 600 }}>更多 +{hiddenServerCount}</div>}
          </div>
        </>
      ) : (
        <div style={{ minHeight: 126, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--border-light)", color: "var(--text-muted)", fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>
          暂未接入 Beszel 监控数据<br />部署完成后可按需配置
        </div>
      )}
    </div>
  );
}

function ServerDrawer({ servers, open, onClose, generatedAt }: { servers: Server[]; open: boolean; onClose: () => void; generatedAt: string | null }) {
  const [sel, setSel] = useState<string | number | null>(null);
  const hasLiveServers = servers.some((server) => server.status !== "placeholder");
  const online = servers.filter(isServerOnline).length;
  const isLive = servers.some((s) => s.dataUpdatedAt);
  return (
    <Drawer open={open} onClose={onClose} title="服务器监控" subtitle={`Beszel · ${servers.length} 台服务器`} icon="⬢" iconColor="var(--accent-teal)" width={580}>
      {!hasLiveServers ? (
        <div style={{ padding: "28px 20px", textAlign: "center", border: "1px solid var(--border-light)", borderRadius: 12, background: "var(--bg-2)", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
          暂未接入 Beszel 监控数据。<br />当前不会展示示例节点或虚构的在线状态。
        </div>
      ) : (
        <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 20 }}>
        {[{ label: "在线", value: online, color: "var(--green)" }, { label: "告警", value: servers.filter((s) => s.status === "warning").length, color: "var(--yellow)" }, { label: "离线", value: servers.filter((s) => s.status === "offline").length, color: "var(--red)" }, { label: "总计", value: servers.length, color: "var(--text-muted)" }].map((s) => <div key={s.label} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)", textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 700, fontFamily: "DM Serif Display", color: s.color }}>{s.value}</div><div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>{s.label}</div></div>)}
      </div>
      {generatedAt && <div style={{ marginBottom: 12, fontSize: 10, color: "var(--text-faint)", textAlign: "right" }}>数据更新于 {fmtRelative(generatedAt)}</div>}
      <div style={{ marginBottom: 20 }}><SectionLabel>服务器分布</SectionLabel><WorldMap servers={servers} /></div>
      <SectionLabel>详细状态</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {servers.map((s) => {
          const isOpen = sel === s.id;
          const sc = s.status === "online" ? "green" : s.status === "warning" ? "yellow" : s.status === "offline" ? "red" : "gray";
          const hasMetrics = s.status !== "offline" && s.status !== "placeholder" && isLive;
          return (
            <div key={s.id} style={{ background: "var(--bg)", borderRadius: 10, border: `1px solid ${isOpen ? "var(--border)" : "var(--border-light)"}`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div onClick={() => setSel(isOpen ? null : s.id)} style={{ flex: 1, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: s.status === "online" ? "var(--green)" : s.status === "warning" ? "var(--yellow)" : s.status === "offline" ? "var(--red)" : "var(--border)" }} />
                  <span style={{ fontSize: 13, fontFamily: "JetBrains Mono", fontWeight: 500, minWidth: 100 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.flag} {s.loc}</span>
                  <Badge color={sc as any} small>{s.status === "online" ? "在线" : s.status === "warning" ? "在线 · 告警" : s.status === "offline" ? "离线" : "—"}</Badge>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto", fontFamily: "JetBrains Mono" }}>{s.uptime}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </div>
                {s.status !== "placeholder" && (
                  <a href={`/servers?server=${encodeURIComponent(String(s.id))}`} style={{ flexShrink: 0, margin: "0 12px", padding: "5px 12px", fontSize: 11, fontWeight: 600, color: "var(--accent)", textDecoration: "none", borderRadius: 7, border: "1px solid var(--accent-light)", background: "var(--accent-light)", whiteSpace: "nowrap", transition: "all 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "white"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-light)"; e.currentTarget.style.color = "var(--accent)"; }}>详细 →</a>
                )}
              </div>
              {isOpen && (
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border-light)" }}>
                  <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {s.os && <StatCell label="系统" value={s.os} mono />}
                    {s.provider && <StatCell label="主机类型" value={s.provider} />}
                    <StatCell label="↓ 入流量" value={s.netIn} mono />
                    <StatCell label="↑ 出流量" value={s.netOut} mono />
                  </div>
                  {hasMetrics && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {[
                        { label: "CPU", val: s.cpu, note: `${s.cpu}%`, color: "var(--accent)" },
                        { label: "RAM", val: s.ram, note: s.ramUsedGb != null ? `${s.ramUsedGb} / ${s.ramTotalGb} GB` : `${s.ram}%`, color: "var(--accent-teal)" },
                        { label: "Disk", val: s.disk, note: s.diskUsedGb != null ? `${s.diskUsedGb} / ${s.diskTotalGb} GB` : `${s.disk}%`, color: "var(--accent-purple)" },
                      ].map((r) => (
                        <div key={r.label}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                            <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500, color: "var(--text-muted)" }}>{r.label}</span>
                            <span style={{ fontWeight: 600, fontFamily: "JetBrains Mono" }}>{r.note}</span>
                          </div>
                          <Bar val={r.val} color={r.color} h={5} />
                        </div>
                      ))}
                    </div>
                  )}
                  {hasMetrics && s.gpus && s.gpus.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>GPU</div>
                      {s.gpus.map((g, i) => (
                        <div key={i} style={{ marginBottom: 8, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border-light)" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono" }}>
                            <span>VRAM {g.memUsedGb.toFixed(1)}/{g.memTotalGb.toFixed(1)} GB</span>
                            <span>占用 {g.utilPct}%</span>
                            <span>功耗 {g.powerW}W</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}
    </Drawer>
  );
}

function SignalPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 11,
        background: active ? "var(--red-soft)" : "var(--bg-2)",
        color: active ? "var(--red)" : "var(--text-faint)",
        fontWeight: 600,
        border: `1px solid ${active ? "color-mix(in srgb, var(--red) 30%, transparent)" : "var(--border-light)"}`,
        letterSpacing: "0.01em",
        transition: "all 0.15s"
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: active ? "var(--red)" : "var(--border)", flexShrink: 0 }} />
      {label}
    </span>
  );
}

function IPWidget({
  api,
  snapshot,
  loading,
  backendError,
  onOpen,
}: {
  api: ApiTool | null;
  snapshot: IpRiskSnapshot | null;
  loading: boolean;
  backendError: string | null;
  onOpen: () => void;
}) {
  const locationLine = snapshot
    ? [snapshot.egress.city, snapshot.egress.region, snapshot.egress.country].filter(Boolean).join(" · ")
    : "";
  const maskedIp = snapshot ? maskIpAddress(snapshot.egress.ip) : "";
  return (
    <div
      onClick={onOpen}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", cursor: "pointer", transition: "all 0.18s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "none";
      }}
    >
      {/* Card header */}
      <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 1 }}>当前访问 IP</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>访客公网 · Net.Coffee</div>
        </div>
        {snapshot && (
          <Badge color={trustBadgeColor(snapshot.risk.trustLevel)}>{formatTrustLabel(snapshot.risk.trustLevel)}</Badge>
        )}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {loading && !snapshot ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[80, 60, 70, 90].map((w, i) => <Skeleton key={i} w={`${w}%`} />)}
          </div>
        ) : snapshot ? (
          <>
            {/* Flag + IP hero row */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <FlagImg code={snapshot.egress.countryCode} width={52} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "JetBrains Mono", fontSize: 14, fontWeight: 600, letterSpacing: "0.04em", lineHeight: 1.2, wordBreak: "break-all" }}>{maskedIp}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {locationLine || formatCountryLabel(snapshot.egress.country, snapshot.egress.countryCode) || "地区未识别"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {snapshot.network.asLabel || "ASN —"} · {formatAttributeLabel(snapshot.network.attribute)}
                </div>
              </div>
            </div>

            {/* Score gauges */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ScoreGauge label="风险" score={snapshot.risk.riskScore} colorFn={riskScoreColor} />
              <ScoreGauge label="可信" score={snapshot.risk.trustScore} colorFn={trustScoreColor} />
            </div>

            {/* Signal pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <SignalPill label="VPN" active={snapshot.risk.flags.vpn} />
              <SignalPill label="Proxy" active={snapshot.risk.flags.proxy} />
              <SignalPill label="Tor" active={snapshot.risk.flags.tor} />
              <SignalPill label="机房" active={snapshot.risk.flags.datacenter} />
              <SignalPill label="滥用" active={snapshot.risk.flags.abuser} />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>访客 IP 暂不可用</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {backendError
                ? `当前请求失败：${backendError}`
                : `部署到服务器并传递访客 IP 后，这里会展示访问者的公网 IP、地区和风险标签。`}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>/api/ip-risk/visitor</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
            {snapshot ? `更新 ${fmtRelative(snapshot.generatedAt)}` : "等待访客 IP"}
          </span>
          <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>查看详情 →</span>
        </div>
      </div>
    </div>
  );
}

function IPRiskDrawer({
  api,
  open,
  onClose,
  snapshot,
  backendError,
  onRefresh,
  refreshing,
}: {
  api: ApiTool | null;
  open: boolean;
  onClose: () => void;
  snapshot: IpRiskSnapshot | null;
  backendError: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const location = snapshot ? formatIpLocation(snapshot) : "";
  const countryLabel = snapshot
    ? formatCountryLabel(snapshot.egress.country, snapshot.egress.countryCode)
    : "";
  const coloLabel = snapshot
    ? [snapshot.egress.colo, countryLabel].filter(Boolean).join(" · ")
    : "";
  const maskedIp = snapshot ? maskIpAddress(snapshot.egress.ip) : "";
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="当前访问 IP 画像"
      subtitle="访客公网 · Net.Coffee"
      icon="⌘"
      iconColor="var(--accent-teal)"
      width={560}
    >
      <style>{`@keyframes ip-risk-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          当前结果来自访问请求携带的公网 IP，用于判断这个访客此刻的地区、ASN 和风险信号。
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: refreshing ? "default" : "pointer", color: "var(--text)", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ display: "inline-block", animation: refreshing ? "ip-risk-spin 0.8s linear infinite" : "none" }}>↻</span>
          刷新
        </button>
      </div>
      {backendError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--accent-light)", borderRadius: 8, border: "1px solid var(--border-light)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
          后端请求失败：<code style={{ fontFamily: "JetBrains Mono" }}>{backendError}</code>。请确认 <code style={{ fontFamily: "JetBrains Mono" }}>pnpm ip-risk:dev</code> 正在运行，并且公网部署时反向代理会传递访客 IP。
        </div>
      )}
      {!snapshot ? (
        <div style={{ padding: "16px 18px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
          暂时还没有访客画像数据。本地直连开发环境通常只能看到内网地址；部署到服务器并配置反向代理后，这里会展示当前访客 IP、ASN、地区、IP 属性和风险信号。
        </div>
      ) : (
        <>
          {/* Hero card: flag + IP + location + badges */}
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border-light)",
            borderRadius: 14,
            padding: "16px 18px",
            marginBottom: 20,
            display: "flex",
            gap: 16,
            alignItems: "center"
          }}>
            <FlagImg code={snapshot.egress.countryCode} width={80} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1.2, wordBreak: "break-all" }}>
                {maskedIp}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {[snapshot.egress.city, snapshot.egress.region, snapshot.egress.country].filter(Boolean).join(" · ") || "地区未识别"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "JetBrains Mono", marginTop: 2 }}>
                {snapshot.network.asLabel || "—"} · {formatAttributeLabel(snapshot.network.attribute)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
              <Badge color={trustBadgeColor(snapshot.risk.trustLevel)}>{formatTrustLabel(snapshot.risk.trustLevel)}</Badge>
              <Badge color={riskBadgeColor(snapshot.risk.riskLevel)}>{formatRiskLabel(snapshot.risk.riskLevel)}</Badge>
            </div>
          </div>

          {/* Score gauges row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 6 }}>信任评分</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "DM Serif Display", color: trustScoreColor(snapshot.risk.trustScore), marginBottom: 8 }}>{snapshot.risk.trustScore ?? "—"}</div>
              <div style={{ height: 3, background: "var(--border-light)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${snapshot.risk.trustScore ?? 0}%`, background: trustScoreColor(snapshot.risk.trustScore), borderRadius: 99, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 6 }}>风险分数</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "DM Serif Display", color: riskScoreColor(snapshot.risk.riskScore), marginBottom: 8 }}>{snapshot.risk.riskScore ?? "—"}</div>
              <div style={{ height: 3, background: "var(--border-light)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${snapshot.risk.riskScore ?? 0}%`, background: riskScoreColor(snapshot.risk.riskScore), borderRadius: 99, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
              </div>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 6 }}>IP 属性</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{formatAttributeLabel(snapshot.network.attribute)}</div>
            </div>
          </div>

            <div style={{ marginBottom: 18 }}>
              <SectionLabel>出口观测</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <StatCell
                    label="地区"
                    value={[snapshot.egress.city, snapshot.egress.region, snapshot.egress.country].filter(Boolean).join(" · ") || "未识别"}
                    sub={snapshot.egress.countryCode || ""}
                  />
                </div>
                <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <StatCell
                    label="Cloudflare 节点"
                    value={snapshot.egress.colo || coloLabel || "未返回"}
                    sub={snapshot.egress.loc ? `loc: ${snapshot.egress.loc}` : "trace"}
                    mono
                  />
                </div>
                <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <StatCell label="时区" value={snapshot.egress.timezone || "未返回"} mono />
                </div>
                <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <StatCell label="检测时间" value={fmtRelative(snapshot.generatedAt) || snapshot.generatedAt} sub={snapshot.generatedAt} mono />
                </div>
              </div>
            </div>

          <div style={{ marginBottom: 18 }}>
            <SectionLabel>网络归属</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="ASN" value={snapshot.network.asLabel || "未返回"} sub={snapshot.network.asName || "AS 名称缺失"} mono />
              </div>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="运营商" value={snapshot.network.isp || snapshot.network.companyName || "未返回"} sub={snapshot.network.companyType || "类型未识别"} />
              </div>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="RDNS" value={snapshot.network.rdns || "未返回"} mono />
              </div>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="CIDR" value={snapshot.network.cidr || "未返回"} mono />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <SectionLabel>风险信号</SectionLabel>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              <SignalPill label="VPN" active={snapshot.risk.flags.vpn} />
              <SignalPill label="Proxy" active={snapshot.risk.flags.proxy} />
              <SignalPill label="Tor" active={snapshot.risk.flags.tor} />
              <SignalPill label="Crawler" active={snapshot.risk.flags.crawler} />
              <SignalPill label="滥用" active={snapshot.risk.flags.abuser} />
              <SignalPill label="机房" active={snapshot.risk.flags.datacenter} />
              {snapshot.risk.flags.mobile && <SignalPill label="移动" active />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="Abuser Score" value={snapshot.risk.abuserScore || "未返回"} />
              </div>
              <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                <StatCell label="Threat" value={snapshot.risk.reputationThreat !== null ? String(snapshot.risk.reputationThreat) : "未返回"} />
              </div>
            </div>
            {snapshot.risk.aiVerdict?.label && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border-light)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text)" }}>{snapshot.risk.aiVerdict.label}</strong>
                {typeof snapshot.risk.aiVerdict.confidence === "number" ? ` · 置信度 ${snapshot.risk.aiVerdict.confidence}` : ""}
                {snapshot.risk.aiVerdict.reasoning ? ` · ${snapshot.risk.aiVerdict.reasoning}` : ""}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>数据来源</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Trace", value: snapshot.sources.trace },
                { label: "GeoIP", value: snapshot.sources.geoip },
                { label: "Risk", value: snapshot.sources.iprisk },
              ].map((item) => (
                <div key={item.label} style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
                  <StatCell label={item.label} value={item.value} mono />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

function PostCard({ post }: { post: Post }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={post.href} style={{ textDecoration: "none" }}>
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ background: "var(--bg-card)", border: `1px solid ${hovered ? "var(--border)" : "var(--border-light)"}`, borderRadius: "var(--r)", padding: 22, boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)", transform: hovered ? "translateY(-2px)" : "none", transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)", display: "flex", flexDirection: "column", gap: 12 }}>
        {post.cover ? (
          <div style={{ aspectRatio: "16 / 9", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-light)", background: "var(--bg)" }}>
            <img src={post.cover} alt={post.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ) : (
          <div style={{ aspectRatio: "16 / 9", borderRadius: 8, background: "repeating-linear-gradient(45deg,var(--border-light) 0px,var(--border-light) 1px,transparent 1px,transparent 9px)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: 11, fontFamily: "JetBrains Mono", border: "1px solid var(--border-light)" }}>cover image</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${post.cc}18`, color: post.cc, letterSpacing: "0.04em" }}>{post.cat}</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{post.date} · {post.readTime}</span>
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: "DM Serif Display", lineHeight: 1.4, marginBottom: 6, color: hovered ? "var(--accent)" : "var(--text)", transition: "color 0.2s" }}>{post.title}</h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{post.excerpt}</p>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: "auto", paddingTop: 4 }}>{post.tags.map((t) => <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: "var(--bg)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>#{t}</span>)}</div>
      </div>
    </a>
  );
}

type AuthGateScope = "subscriptions" | "ai" | "server" | null;

export default function HomePrototype({ subscriptions, apis, servers, posts, isAuthed = false, renderedAt, heroPhase }: Props) {
  const [subOpen, setSubOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [srvOpen, setSrvOpen] = useState(false);
  const [ipOpen, setIpOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState<AuthGateScope>(null);
  const [search, setSearch] = useState("");
  const [aiTools, setAiTools] = useState<AiToolUsage[]>(PLACEHOLDER_AI_TOOLS);
  const [aiHeatmap, setAiHeatmap] = useState<{ timezone: string; days: AiHeatmapDay[] }>({
    timezone: "Asia/Shanghai",
    days: [],
  });
  const [aiBackendError, setAiBackendError] = useState<string | null>(null);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null);
  const [liveServers, setLiveServers] = useState<Server[] | null>(null);
  const [serverGeneratedAt, setServerGeneratedAt] = useState<string | null>(null);
  const [ipSnapshot, setIpSnapshot] = useState<IpRiskSnapshot | null>(null);
  const [ipLoading, setIpLoading] = useState(true);
  const [ipRefreshing, setIpRefreshing] = useState(false);
  const [ipBackendError, setIpBackendError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [serversReady, setServersReady] = useState(false);
  const [ipReady, setIpReady] = useState(false);

  function handleAiUsageOverviewRefreshed(overview: AiUsageOverview) {
    aiUsageOverviewPromise = Promise.resolve(overview);
    setAiTools(overview.tools);
    setAiHeatmap(overview.heatmap);
    setAiGeneratedAt(overview.generatedAt);
    setAiBackendError(null);
    writeLocalStorageJson(AI_USAGE_CACHE_KEY, overview);
  }

  async function handleRefreshIpRisk() {
    setIpRefreshing(true);
    try {
      visitorIpRiskSnapshotPromise = null;
      const result = await fetchVisitorIpRiskSnapshotOnce();
      if (isVisitorIpRiskUnavailable(result)) {
        setIpSnapshot(null);
        setIpBackendError(result.message);
      } else {
        setIpSnapshot(result);
        setIpBackendError(null);
      }
    } catch (error) {
      setIpBackendError(
        error instanceof Error ? error.message : "IP 风险后端连接失败",
      );
    } finally {
      setIpRefreshing(false);
      setIpLoading(false);
    }
  }
  const filteredPosts = useMemo(() => {
    if (!search.trim()) return posts;
    const q = search.toLowerCase();
    return posts.filter((p) => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)));
  }, [search, posts]);

  useEffect(() => {
    let cancelled = false;

    if (!hasAiUsageBackend()) {
      setAiTools(PLACEHOLDER_AI_TOOLS);
      setAiHeatmap({ timezone: "Asia/Shanghai", days: [] });
      setAiBackendError(null);
      setAiReady(true);
      return () => {
        cancelled = true;
      };
    }

    let hasCache = false;
    const cached = readLocalStorageJson<AiUsageOverview>(AI_USAGE_CACHE_KEY);
    if (cached && Array.isArray(cached.tools) && cached.tools.length > 0) {
      setAiTools(cached.tools);
      setAiHeatmap(cached.heatmap ?? { timezone: "Asia/Shanghai", days: [] });
      if (cached.generatedAt) setAiGeneratedAt(cached.generatedAt);
      hasCache = true;
    }

    (async () => {
      try {
        const overview = await fetchAiUsageOverviewOnce();
        if (cancelled) return;
        if (overview && overview.tools.length > 0) {
          setAiTools(overview.tools);
          setAiHeatmap(overview.heatmap);
          setAiGeneratedAt(overview.generatedAt);
          setAiBackendError(null);
          writeLocalStorageJson(AI_USAGE_CACHE_KEY, overview);
        } else {
          if (!hasCache) {
            setAiTools(PLACEHOLDER_AI_TOOLS);
            setAiHeatmap({ timezone: "Asia/Shanghai", days: [] });
          }
        }
      } catch (error) {
        if (cancelled) return;
        if (!hasCache) {
          setAiTools(PLACEHOLDER_AI_TOOLS);
          setAiHeatmap({ timezone: "Asia/Shanghai", days: [] });
        }
        setAiBackendError(
          error instanceof Error ? error.message : "AI 用量后端连接失败",
        );
      } finally {
        if (!cancelled) setAiReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!hasServerStatusBackend()) {
      setServersReady(true);
      return () => { cancelled = true; };
    }

    const cached = readLocalStorageJson<{ servers: Server[]; generatedAt?: string }>(SERVERS_CACHE_KEY);
    if (cached && Array.isArray(cached.servers) && cached.servers.length > 0) {
      setLiveServers(cached.servers);
      if (cached.generatedAt) setServerGeneratedAt(cached.generatedAt);
    }

    (async () => {
      try {
        const overview = await fetchServerOverviewOnce();
        if (cancelled || !overview) return;
        const mapped: Server[] = overview.servers.map((s: LiveServer) => ({
          id: s.id,
          name: s.name,
          loc: normalizeServerRegion(s.location),
          region: normalizeServerRegion(s.region),
          flag: s.flag,
          lat: s.lat,
          lon: s.lon,
          provider: s.provider,
          status: s.status,
          uptime: s.uptime,
          cpu: s.cpu,
          ram: s.ram,
          ramUsedGb: s.ramUsedGb,
          ramTotalGb: s.ramTotalGb,
          disk: s.disk,
          diskUsedGb: s.diskUsedGb,
          diskTotalGb: s.diskTotalGb,
          netIn: fmtBps(s.netRxBps),
          netOut: fmtBps(s.netTxBps),
          netRxBps: s.netRxBps,
          netTxBps: s.netTxBps,
          os: s.os,
          cores: 0,
          ramTotal: `${s.ramTotalGb} GB`,
          gpus: s.gpus,
          dataUpdatedAt: s.dataUpdatedAt,
        }));
        setLiveServers(mapped);
        setServerGeneratedAt(overview.generatedAt);
        writeLocalStorageJson(SERVERS_CACHE_KEY, { servers: mapped, generatedAt: overview.generatedAt });
      } catch {
        // silently fall back to placeholder
      } finally {
        if (!cancelled) setServersReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!hasIpRiskBackend()) {
      setIpLoading(false);
      setIpBackendError("IP risk backend is not configured");
      setIpReady(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const result = await fetchVisitorIpRiskSnapshotOnce();
        if (cancelled) return;
        if (isVisitorIpRiskUnavailable(result)) {
          setIpSnapshot(null);
          setIpBackendError(result.message);
        } else {
          setIpSnapshot(result);
          setIpBackendError(null);
        }
      } catch (error) {
        if (cancelled) return;
        setIpBackendError(
          error instanceof Error ? error.message : "IP 风险后端连接失败",
        );
      } finally {
        if (!cancelled) {
          setIpLoading(false);
          setIpReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchWorldAtlasOnce().catch(() => null);
  }, []);

  const displayServers = useMemo(
    () => liveServers ?? servers,
    [liveServers, servers],
  );
  const visibleAiTools = useMemo(
    () => aiTools.filter((tool) => VISIBLE_AI_TOOL_IDS.has(tool.id)),
    [aiTools],
  );
  const installedAiTools = useMemo(
    () => visibleAiTools.filter((tool) => tool.installed),
    [visibleAiTools],
  );
  const displayAiTools = visibleAiTools.length > 0 ? visibleAiTools : PLACEHOLDER_AI_TOOLS;
  const ipApi = useMemo(
    () => apis.find((api) => api.id === "net-coffee-claude") ?? apis[0] ?? null,
    [apis],
  );
  return (
    <div style={{ minHeight: "100vh" }}>
      <Nav isAuthed={isAuthed} />
      <main style={{ width: "min(1200px, calc(100% - 32px))", margin: "0 auto", padding: "clamp(20px, 3vw, 36px) 0 80px" }}>
        <AnimatedHero
          posts={posts}
          subscriptions={subscriptions}
          servers={displayServers}
          aiTools={displayAiTools}
          renderedAt={renderedAt}
          heroPhase={heroPhase}
        />
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 14, marginBottom: 48 }}>
          <SubscriptionWidget subscriptions={subscriptions} onOpen={() => (isAuthed ? setSubOpen(true) : setAuthGateOpen("subscriptions"))} />
          <AIUsageWidget
            tools={displayAiTools}
            installedCount={installedAiTools.length}
            backendConnected={hasAiUsageBackend() && aiBackendError === null}
            generatedAt={aiGeneratedAt}
            onOpen={() => (isAuthed ? setAiOpen(true) : setAuthGateOpen("ai"))}
          />
          <ServerWidget servers={displayServers} onOpen={() => (isAuthed ? setSrvOpen(true) : setAuthGateOpen("server"))} />
          <IPWidget
            api={ipApi}
            snapshot={ipSnapshot}
            loading={ipLoading}
            backendError={ipBackendError}
            onOpen={() => setIpOpen(true)}
          />
        </section>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <div style={{ height: 1, flex: 1, background: "var(--border-light)" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.10em", textTransform: "uppercase" }}>最近文章</span>
          <div style={{ height: 1, flex: 1, background: "var(--border-light)" }} />
        </div>
        <div style={{ position: "relative", marginBottom: 20, maxWidth: 480 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 15, pointerEvents: "none" }}>⌕</span>
          <input type="text" placeholder="搜索文章标题、标签、分类…" value={search} onChange={(e) => setSearch(e.target.value)} onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }} onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-light)";
          }} style={{ width: "100%", padding: "9px 36px 9px 34px", borderRadius: 10, border: "1px solid var(--border-light)", background: "var(--bg-card)", fontSize: 13, color: "var(--text)", outline: "none", fontFamily: "DM Sans", transition: "border-color 0.15s" }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 13 }}>✕</button>}
        </div>
        {filteredPosts.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 14 }}>没有找到「{search}」相关文章</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16, marginBottom: 32 }}>
          {filteredPosts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
        <div style={{ textAlign: "center" }}>
          <a href="/blog/" style={{ display: "inline-flex", padding: "9px 26px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-card)", fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textDecoration: "none", transition: "all 0.15s" }} onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text)";
            e.currentTarget.style.boxShadow = "var(--shadow-sm)";
          }} onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.boxShadow = "none";
          }}>查看更多文章</a>
        </div>
      </main>
      <footer
        aria-label="网站备案与隐私说明"
        style={{
          width: "min(1200px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "0 0 42px",
          display: "flex",
          justifyContent: "center",
          gap: 8,
          color: "var(--text-faint)",
          fontSize: 12,
        }}
      >
        <a href={siteCompliance.icpUrl} style={{ color: "inherit", textDecoration: "none" }}>{siteCompliance.icpRecord}</a>
        <span aria-hidden="true">·</span>
        <a href="/privacy/" style={{ color: "inherit", textDecoration: "none" }}>隐私说明</a>
      </footer>
      <SubscriptionDrawer subscriptions={subscriptions} open={subOpen} onClose={() => setSubOpen(false)} />
      <AIUsageDrawer
        tools={displayAiTools}
        heatmap={aiHeatmap}
        backendConnected={hasAiUsageBackend() && aiBackendError === null}
        backendError={aiBackendError}
        generatedAt={aiGeneratedAt}
        onOverviewRefreshed={handleAiUsageOverviewRefreshed}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
      />
      <ServerDrawer servers={displayServers} open={srvOpen} onClose={() => setSrvOpen(false)} generatedAt={serverGeneratedAt} />
      <IPRiskDrawer
        api={ipApi}
        open={ipOpen}
        onClose={() => setIpOpen(false)}
        snapshot={ipSnapshot}
        backendError={ipBackendError}
        onRefresh={handleRefreshIpRisk}
        refreshing={ipRefreshing}
      />
      <AuthGateModal
        scope={authGateOpen}
        onClose={() => setAuthGateOpen(null)}
      />
    </div>
  );
}

function AuthGateModal({ scope, onClose }: { scope: AuthGateScope; onClose: () => void }) {
  if (!scope) return null;
  const titles: Record<NonNullable<AuthGateScope>, string> = {
    subscriptions: "订阅明细需要登录",
    ai: "AI 工具详细用量需要登录",
    server: "服务器详细信息需要登录",
  };
  const messages: Record<NonNullable<AuthGateScope>, string> = {
    subscriptions: "未登录视图只展示统计金额，不展示具体订阅条目。登录后即可查看每个服务的细节、备注与续费日期。",
    ai: "未登录视图只展示 7d / 30d 总用量。5 小时滚动窗口、7 天限额、模型分布等敏感字段需要登录后查看。",
    server: "未登录视图只展示服务器位置和在线状态。CPU、内存、磁盘、容器、服务、GPU 等指标需要登录后查看。",
  };
  const next = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklch, var(--bg-overlay, rgba(0,0,0,0.45)), transparent 0%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, calc(100vw - 32px))",
          padding: 24,
          borderRadius: 16,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px -20px rgba(0,0,0,0.35)",
          fontFamily: "DM Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>🔒</span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text)" }}>{titles[scope]}</h3>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
          {messages[scope]}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            取消
          </button>
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-on, white)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            前往登录
          </a>
        </div>
      </div>
    </div>
  );
}
