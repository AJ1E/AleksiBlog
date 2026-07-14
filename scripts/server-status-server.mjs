import http from "node:http";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { BESZEL_SERVER_CONFIG } from "./server-config.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const PORT = parsePort(process.env.SERVER_STATUS_PORT, 8789);
const HOST = process.env.SERVER_STATUS_HOST || "127.0.0.1";
// Astro's BFF owns browser access; wildcard CORS would bypass that boundary.
const CORS_ALLOW_ORIGIN = process.env.SERVER_STATUS_CORS_ALLOW_ORIGIN?.trim() || "";
const BESZEL_DB = process.env.BESZEL_DB_PATH || "/opt/beszel/beszel_data/data.db";
const REFRESH_MS = 30_000;
const SNAPSHOT_FILE =
  process.env.SERVER_STATUS_SNAPSHOT_FILE ||
  path.join(os.homedir(), ".cache", "kai-space", "server-status.json");
const GEO_CACHE_FILE =
  process.env.SERVER_STATUS_GEO_CACHE_FILE ||
  path.join(os.homedir(), ".cache", "kai-space", "server-geo.json");
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const GEO_LOOKUP_TIMEOUT_MS = 5000;

// SQLite connection (opened lazily, read-only)
let _db = null;
function getDb() {
  if (_db) return _db;
  _db = new Database(BESZEL_DB, { readonly: true, fileMustExist: true });
  return _db;
}

// Prepared statements (lazy)
let _stmt = null;
function getStmt() {
  if (_stmt) return _stmt;
  _stmt = getDb().prepare(`
    SELECT
      s.id, s.name, s.host, s.status, s.info,
      ss.stats AS latest_stats,
      ss.created AS stats_at
    FROM systems s
    LEFT JOIN system_stats ss ON ss.id = (
      SELECT id FROM system_stats
      WHERE system = s.id AND type = '1m'
      ORDER BY created DESC
      LIMIT 1
    )
    ORDER BY s.name
  `);
  return _stmt;
}

const RANGE_TYPE = { "1h": "1m", "12h": "10m", "24h": "20m", "1w": "120m", "30d": "480m" };
const RANGE_INTERVAL_S = { "1h": 60, "12h": 600, "24h": 1200, "1w": 7200, "30d": 28800 };

let _statsStmt = null;
function getStatsStmt() {
  if (_statsStmt) return _statsStmt;
  _statsStmt = getDb().prepare(`
    SELECT stats, created FROM system_stats
    WHERE system = ? AND type = ?
    ORDER BY created ASC
  `);
  return _statsStmt;
}

let _containerStatsStmt = null;
function getContainerStatsStmt() {
  if (_containerStatsStmt) return _containerStatsStmt;
  _containerStatsStmt = getDb().prepare(`
    SELECT stats, created FROM container_stats
    WHERE system = ? AND type = ?
    ORDER BY created ASC
  `);
  return _containerStatsStmt;
}

let _containersStmt = null;
function getContainersStmt() {
  if (_containersStmt) return _containersStmt;
  _containersStmt = getDb().prepare(`
    SELECT cpu, health, id, image, memory, name, net, status, updated
    FROM containers
    WHERE system = ?
    ORDER BY memory DESC, cpu DESC, name ASC
  `);
  return _containersStmt;
}

let _servicesStmt = null;
function getServicesStmt() {
  if (_servicesStmt) return _servicesStmt;
  _servicesStmt = getDb().prepare(`
    SELECT cpu, cpuPeak, id, memPeak, memory, name, state, sub, updated
    FROM systemd_services
    WHERE system = ?
    ORDER BY memory DESC, cpuPeak DESC, name ASC
  `);
  return _servicesStmt;
}

function buildStatsPoints(systemId, range) {
  const type = RANGE_TYPE[range] || "1m";
  const intervalS = RANGE_INTERVAL_S[range] || 60;
  const rows = getStatsStmt().all(systemId, type);
  const containerRows = getContainerStatsStmt().all(systemId, type);
  const containerStatsByTime = new Map(
    containerRows.map((row) => [row.created, safeJsonArray(row.stats)]),
  );

  const points = [];
  let prevTime = null;

  for (const row of rows) {
    const t = Date.parse(row.created);
    if (prevTime !== null) {
      const gap = (t - prevTime) / 1000;
      if (gap > intervalS * 1.5) {
        points.push(null); // gap marker
      }
    }
    const s = safeJson(row.stats);
    const [rxBytes = 0, txBytes = 0] = Array.isArray(s.b) ? s.b : [];
    const gpus = Object.values(s.g || {});
    const gpuUtilPct = gpus.length > 0
      ? round1(gpus.reduce((sum, gpu) => sum + Number(gpu.u || 0), 0) / gpus.length)
      : 0;
    const gpuMemUsedGb = round2(gpus.reduce((sum, gpu) => sum + Number(gpu.mu || 0), 0) / 1024);
    const gpuMemTotalGb = round2(gpus.reduce((sum, gpu) => sum + Number(gpu.mt || 0), 0) / 1024);
    const gpuPowerW = round1(gpus.reduce((sum, gpu) => sum + Number(gpu.p || 0), 0));
    const containers = containerStatsByTime.get(row.created) ?? [];
    const containerCount = containers.length;
    const containerCpuPct = round2(containers.reduce((sum, container) => sum + Number(container.c || 0), 0));
    const containerMemUsedGb = round2(containers.reduce((sum, container) => sum + Number(container.m || 0), 0) / 1024);
    points.push({
      time: row.created,
      cpu: round1(s.cpu ?? 0),
      cpuPeak: round1(s.cpum ?? s.cpu ?? 0),
      ram: round1(s.mp ?? 0),
      ramUsedGb: round2(s.mu ?? 0),
      ramTotalGb: round2(s.m ?? 0),
      disk: round1(s.dp ?? 0),
      diskUsedGb: round2(s.du ?? 0),
      diskTotalGb: round2(s.d ?? 0),
      netRxBps: round2(rxBytes / intervalS),
      netTxBps: round2(txBytes / intervalS),
      gpuUtilPct,
      gpuMemUsedGb,
      gpuMemTotalGb,
      gpuPowerW,
      containerCount,
      containerCpuPct,
      containerMemUsedGb,
    });
    prevTime = t;
  }
  return points;
}

let latestSnapshot = await readSnapshot();
let geoCache = await readGeoCache();
let refreshPromise = null;

// ── data building ──────────────────────────────────────────────────────────

async function buildServerEntry(row) {
  const info = safeJson(row.info);
  const stats = safeJson(row.latest_stats);
  const cfg = BESZEL_SERVER_CONFIG[row.id] || {};
  const containerRows = getContainersStmt().all(row.id);
  const serviceRows = getServicesStmt().all(row.id);

  const cpu = round1(stats.cpu ?? info.cpu ?? 0);
  const ramPct = round1(stats.mp ?? info.mp ?? 0);
  const diskPct = round1(stats.dp ?? info.dp ?? 0);

  let status = row.status === "up" ? "online" : "offline";
  if (status === "online" && (cpu > 90 || ramPct > 90 || diskPct > 95)) {
    status = "warning";
  }

  const [rxBps = 0, txBps = 0] = Array.isArray(stats.b) ? stats.b : [];
  const ramTotalGb = round2(stats.m ?? 0);
  const ramUsedGb = round2(stats.mu ?? 0);
  const diskTotalGb = round2(stats.d ?? 0);
  const diskUsedGb = round2(stats.du ?? 0);
  const uptimeSecs = Number(info.u ?? 0);

  const gpus = Object.values(stats.g || {}).map((g) => ({
    name: String(g.n || "GPU"),
    memUsedGb: round2((g.mu ?? 0) / 1024),
    memTotalGb: round2((g.mt ?? 0) / 1024),
    utilPct: round1(g.u ?? 0),
    powerW: round1(g.p ?? 0),
  }));
  const containers = containerRows.map((container) => ({
    id: String(container.id || ""),
    name: String(container.name || ""),
    image: String(container.image || ""),
    status: String(container.status || ""),
    state: classifyContainerState(container.status),
    health: Number(container.health || 0),
    cpuPct: round2(container.cpu ?? 0),
    memoryGb: round2(Number(container.memory || 0) / 1024),
    netScore: round2(container.net ?? 0),
    updatedAt: formatContainerUpdated(container.updated),
  }));
  const services = serviceRows.map((service) => ({
    id: String(service.id || ""),
    name: String(service.name || ""),
    stateCode: Number(service.state || 0),
    subCode: Number(service.sub || 0),
    state: classifyServiceState(service.state, service.sub),
    cpuPct: round2(service.cpu ?? 0),
    cpuPeakPct: round2(service.cpuPeak ?? 0),
    memoryGb: round2(Number(service.memory || 0) / 1024 / 1024 / 1024),
    memPeakGb: round2(Number(service.memPeak || 0) / 1024 / 1024 / 1024),
    updatedAt: formatContainerUpdated(service.updated),
  }));
  const displayMeta = await resolveDisplayMeta(row.host, cfg);

  return {
    id: row.id,
    name: cfg.displayName || row.name,
    location: displayMeta.location,
    region: displayMeta.region,
    flag: displayMeta.flag,
    lat: displayMeta.lat,
    lon: displayMeta.lon,
    provider: displayMeta.provider,
    os: cfg.os || "",
    status,
    cpu,
    ram: ramPct,
    ramUsedGb,
    ramTotalGb,
    disk: diskPct,
    diskUsedGb,
    diskTotalGb,
    netRxBps: rxBps,
    netTxBps: txBps,
    uptime: formatUptime(uptimeSecs),
    gpus,
    containers,
    services,
    dataUpdatedAt: row.stats_at || null,
  };
}

async function buildSnapshot() {
  const rows = getStmt().all();
  const servers = [];
  for (const row of rows) {
    servers.push(await buildServerEntry(row));
  }
  return {
    generatedAt: new Date().toISOString(),
    servers,
  };
}

// ── refresh / cache ────────────────────────────────────────────────────────

async function refreshSnapshot(reason = "manual") {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const snapshot = await buildSnapshot();
      latestSnapshot = snapshot;
      await writeSnapshot(snapshot);
      process.stdout.write(
        `[server-status] refreshed (${reason}) at ${snapshot.generatedAt}\n`,
      );
      return snapshot;
    } catch (err) {
      process.stderr.write(
        `[server-status] refresh failed (${reason}): ${err instanceof Error ? err.message : err}\n`,
      );
      if (latestSnapshot) return latestSnapshot;
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function isStale(snapshot) {
  if (!snapshot?.generatedAt) return true;
  return Date.now() - Date.parse(snapshot.generatedAt) >= REFRESH_MS;
}

async function getSnapshot() {
  if (latestSnapshot) {
    if (isStale(latestSnapshot)) void refreshSnapshot("stale-request");
    return latestSnapshot;
  }
  return refreshSnapshot("initial-request");
}

// ── HTTP server ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "Missing URL" });
    const url = new URL(req.url, `http://localhost`);

    if (req.method === "OPTIONS") return sendNoContent(res);
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    if (url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, generatedAt: new Date().toISOString() });
    }

    if (url.pathname === "/api/servers/overview") {
      const snapshot = await getSnapshot();
      return sendJson(res, 200, snapshot);
    }

    const statsMatch = /^\/api\/servers\/([^/]+)\/stats$/.exec(url.pathname);
    if (statsMatch) {
      const systemId = statsMatch[1];
      const range = url.searchParams.get("range") || "1h";
      if (!RANGE_TYPE[range]) return sendJson(res, 400, { error: "Invalid range" });
      try {
        const points = buildStatsPoints(systemId, range);
        return sendJson(res, 200, { systemId, range, points });
      } catch (err) {
        return sendJson(res, 500, { error: err instanceof Error ? err.message : "DB error" });
      }
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    return sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[server-status] listening on http://${HOST}:${PORT}\n`);
  if (latestSnapshot) {
    process.stdout.write(
      `[server-status] loaded snapshot from ${SNAPSHOT_FILE} (${latestSnapshot.generatedAt})\n`,
    );
  }
  void refreshSnapshot("startup");
  const timer = setInterval(() => void refreshSnapshot("interval"), REFRESH_MS);
  timer.unref?.();
});

// ── persistence ────────────────────────────────────────────────────────────

async function readSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.servers && Array.isArray(parsed.servers)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot) {
  const dir = path.dirname(SNAPSHOT_FILE);
  const tmp = `${SNAPSHOT_FILE}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tmp, SNAPSHOT_FILE);
}

async function readGeoCache() {
  try {
    const raw = await fs.readFile(GEO_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeGeoCache(cache) {
  const dir = path.dirname(GEO_CACHE_FILE);
  const tmp = `${GEO_CACHE_FILE}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tmp, GEO_CACHE_FILE);
}

// ── helpers ────────────────────────────────────────────────────────────────

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders("GET, OPTIONS", "Content-Type"),
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(res) {
  res.writeHead(204, {
    ...corsHeaders("GET, OPTIONS", "Content-Type"),
  });
  res.end();
}

function corsHeaders(methods, allowedHeaders) {
  if (!CORS_ALLOW_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": allowedHeaders,
    Vary: "Origin",
  };
}

function maskIp(ip) {
  if (!ip) return ip;
  // IPv4: mask last octet  192.168.1.100 → 192.168.1.*
  const v4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.*`;
  // IPv6: mask last group  2001:db8::1 → 2001:db8::*
  const v6 = /^(.+):[\da-fA-F]{1,4}$/.exec(ip);
  if (v6) return `${v6[1]}:*`;
  return ip;
}

async function resolveDisplayMeta(host, cfg) {
  if (cfg.location || cfg.region || cfg.flag || cfg.lat !== undefined || cfg.lon !== undefined || cfg.provider) {
    return {
      location: cfg.location || maskIp(host) || "未配置",
      region: cfg.region || "未知",
      flag: cfg.flag || "🌐",
      lat: cfg.lat ?? 0,
      lon: cfg.lon ?? 0,
      provider: cfg.provider || "",
    };
  }

  const publicIp = await resolvePublicIp(host);
  if (publicIp) {
    const geo = await lookupGeo(publicIp);
    if (geo) {
      return {
        location: geo.location,
        region: geo.region,
        flag: geo.flag,
        lat: geo.lat,
        lon: geo.lon,
        provider: "公网 VPS",
      };
    }
  }

  if (isInternalHost(host)) {
    return {
      location: "内网设备",
      region: "内网",
      flag: "🏠",
      lat: 0,
      lon: 0,
      provider: "内网设备",
    };
  }

  return {
    location: maskIp(host) || "未配置",
    region: "未知",
    flag: "🌐",
    lat: 0,
    lon: 0,
    provider: "",
  };
}

async function resolvePublicIp(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  if (net.isIP(normalized)) {
    return isPublicIp(normalized) ? normalized : null;
  }
  try {
    const result = await dns.lookup(normalized, { all: true, verbatim: false });
    const publicMatch = result.find((entry) => isPublicIp(entry.address));
    return publicMatch?.address || null;
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  const raw = String(host || "").trim();
  if (!raw) return "";
  const withoutProto = raw.replace(/^[a-z]+:\/\//i, "");
  const withoutPath = withoutProto.split("/")[0];
  if (withoutPath.startsWith("[")) {
    const end = withoutPath.indexOf("]");
    if (end !== -1) return withoutPath.slice(1, end);
  }
  if (net.isIP(withoutPath)) return withoutPath;
  const portMatch = /^([^:]+):(\d+)$/.exec(withoutPath);
  if (portMatch) return portMatch[1];
  return withoutPath;
}

function isInternalHost(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (net.isIP(normalized)) return !isPublicIp(normalized);
  const lower = normalized.toLowerCase();
  return lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".localdomain");
}

function isPublicIp(ip) {
  if (net.isIP(ip) === 4) return isPublicIpv4(ip);
  if (net.isIP(ip) === 6) return isPublicIpv6(ip);
  return false;
}

function isPublicIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return false;
  }
  return true;
}

async function lookupGeo(ip) {
  const cached = geoCache[ip];
  if (cached && Date.now() - Date.parse(cached.cachedAt) < GEO_CACHE_TTL_MS) {
    return cached.value;
  }

  const value = await lookupGeoIpNetCoffee(ip) ?? await lookupGeoIpWhoIs(ip);
  if (!value) return null;

  geoCache[ip] = { cachedAt: new Date().toISOString(), value };
  await writeGeoCache(geoCache);
  return value;
}

async function lookupGeoIpNetCoffee(ip) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
    const res = await fetch(`https://ip.net.coffee/api/geoip/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.country) return null;
    const country = String(data.country || "").trim();
    const coords = countryLevelCoords(data.country_code);
    return {
      location: country || "未知",
      region: country || "未知",
      flag: countryCodeToFlag(data.country_code) || "🌐",
      lat: coords ? coords[0] : Number(data.latitude) || 0,
      lon: coords ? coords[1] : Number(data.longitude) || 0,
    };
  } catch {
    return null;
  }
}

async function lookupGeoIpWhoIs(ip) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success || !data.country) return null;
    const country = String(data.country || "").trim();
    const coords = countryLevelCoords(data.country_code);
    return {
      location: country || "未知",
      region: country || "未知",
      flag: String(data.flag?.emoji || countryCodeToFlag(data.country_code) || "🌐"),
      lat: coords ? coords[0] : Number(data.latitude) || 0,
      lon: coords ? coords[1] : Number(data.longitude) || 0,
    };
  } catch {
    return null;
  }
}

function countryCodeToFlag(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(...normalized.split("").map((ch) => 127397 + ch.charCodeAt(0)));
}

// Country-level representative coordinates (capital or major city)
const COUNTRY_COORDS = {
  // East Asia
  CN: [39.9, 116.4], JP: [35.7, 139.7], KR: [37.6, 127.0],
  TW: [25.0, 121.5], HK: [22.3, 114.2], MO: [22.2, 113.5],
  // Southeast Asia
  SG: [1.3, 103.8],  MY: [3.1, 101.7],  TH: [13.8, 100.5],
  VN: [21.0, 105.8], ID: [-6.2, 106.8], PH: [14.6, 121.0],
  // South / Middle East
  IN: [28.6, 77.2],  AE: [24.5, 54.4],  IL: [31.8, 35.2],
  TR: [39.9, 32.9],
  // Europe
  DE: [52.5, 13.4],  GB: [51.5, -0.1],  FR: [48.9, 2.3],
  NL: [52.4, 4.9],   RU: [55.8, 37.6],  SE: [59.3, 18.1],
  NO: [59.9, 10.7],  FI: [60.2, 24.9],  DK: [55.7, 12.6],
  PL: [52.2, 21.0],  CH: [46.9, 7.4],   AT: [48.2, 16.4],
  ES: [40.4, -3.7],  IT: [41.9, 12.5],  PT: [38.7, -9.1],
  CZ: [50.1, 14.4],  UA: [50.4, 30.5],  RO: [44.4, 26.1],
  // North America
  US: [38.9, -77.0], CA: [45.4, -75.7], MX: [19.4, -99.1],
  // South America
  BR: [-15.8, -47.9], AR: [-34.6, -58.4],
  // Oceania
  AU: [-35.3, 149.1], NZ: [-41.3, 174.8],
  // Africa
  ZA: [-25.7, 28.2],
};

function countryLevelCoords(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  return COUNTRY_COORDS[code] ?? null;
}

function safeJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function safeJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function classifyContainerState(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.startsWith("up ")) return "running";
  if (normalized.startsWith("restarting")) return "restarting";
  if (normalized.includes("exited") || normalized.startsWith("created") || normalized.startsWith("dead")) {
    return "exited";
  }
  return "other";
}

function classifyServiceState(state, sub) {
  const stateCode = Number(state);
  const subCode = Number(sub);
  if (stateCode === 0 && subCode === 1) return "running";
  if (stateCode === 0 && subCode === 2) return "exited";
  if (stateCode === 1 && subCode === 0) return "inactive";
  return "other";
}

function formatContainerUpdated(updated) {
  const n = Number(updated);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function formatUptime(secs) {
  const s = Math.floor(Number(secs) || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parsePort(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
