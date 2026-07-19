import http from "node:http";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = parsePort(process.env.IP_RISK_PORT ?? process.env.PORT, 8788);
const HOST = process.env.HOST || "127.0.0.1";
// The helper stays behind Astro's same-origin BFF. Do not grant wildcard CORS.
const CORS_ALLOW_ORIGIN = process.env.IP_RISK_CORS_ALLOW_ORIGIN?.trim() || "";
const SNAPSHOT_REFRESH_INTERVAL_MS = 3 * 60_000;
const VISITOR_CACHE_TTL_MS = 5 * 60_000;
const VISITOR_CACHE_MAX_ENTRIES = 64;
const SNAPSHOT_FILE =
  process.env.IP_RISK_SNAPSHOT_FILE ||
  path.join(os.homedir(), ".cache", "kai-space", "ip-risk-egress.json");

const IPINFO_BASE_URL = "https://ipinfo.io";
const PROXYCHECK_BASE_URL = "https://proxycheck.io/v3";

let latestSnapshot = await readSnapshot();
let refreshPromise = null;
let ipCheckPromise = null;
const visitorSnapshotCache = new Map();
const visitorLookupPromises = new Map();

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "Missing URL" });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") return sendNoContent(res);

    if (url.pathname === "/api/ip-risk/refresh") {
      if (req.method !== "POST") {
        return sendJson(res, 405, { error: "Method not allowed" });
      }
      const snapshot = await refreshSnapshot({ reason: "manual-refresh" });
      return sendJson(res, 200, snapshot);
    }

    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

    if (url.pathname === "/api/ip-risk/lookup") {
      const ip = normalizeString(url.searchParams.get("ip"));
      if (!isPublicIp(ip)) {
        return sendJson(res, 400, { error: "A public IP address is required" });
      }
      const snapshot = await lookupSnapshotForIp(ip);
      return sendJson(res, 200, snapshot);
    }

    if (url.pathname === "/api/ip-risk/health") {
      return sendJson(res, 200, {
        ok: true,
        stale: !latestSnapshot,
        generatedAt: latestSnapshot?.generatedAt || null,
        observedIp: latestSnapshot?.egress?.ip || null,
        observedVia: latestSnapshot?.observedVia || IPINFO_BASE_URL,
      });
    }

    if (url.pathname === "/api/ip-risk/egress") {
      const snapshot = await getSnapshot();
      return sendJson(res, 200, snapshot);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch {
    return sendJson(res, 500, {
      error: "Internal server error",
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[ip-risk-server] listening on http://${HOST}:${PORT}\n`);
  if (latestSnapshot) {
    process.stdout.write(
      `[ip-risk-server] loaded snapshot ${latestSnapshot.generatedAt} from ${SNAPSHOT_FILE}\n`,
    );
  }
  if (latestSnapshot) {
    refreshInBackground("startup-ip-check");
  } else {
    refreshInBackground("startup");
  }
  const timer = setInterval(() => {
    refreshInBackground("interval-ip-check");
  }, SNAPSHOT_REFRESH_INTERVAL_MS);
  timer.unref?.();
});

function refreshInBackground(reason) {
  const task = latestSnapshot ? refreshIfIpChanged({ reason }) : refreshSnapshot({ reason });
  void task.catch((error) => {
    process.stderr.write(
      `[ip-risk-server] background refresh skipped (${reason}): ${formatErrorMessage(error)}\n`,
    );
  });
}

async function getSnapshot() {
  if (latestSnapshot) {
    void refreshIfIpChanged({ reason: "egress-request-ip-check" });
    return latestSnapshot;
  }
  return refreshSnapshot({ reason: "initial-request" });
}

async function lookupSnapshotForIp(observedIp) {
  const now = Date.now();
  pruneVisitorSnapshotCache(now);

  const cached = visitorSnapshotCache.get(observedIp);
  if (cached && cached.expiresAt > now) return cached.snapshot;

  const pending = visitorLookupPromises.get(observedIp);
  if (pending) return pending;

  const task = buildVisitorSnapshot(observedIp)
    .then((snapshot) => {
      visitorSnapshotCache.set(observedIp, {
        snapshot,
        expiresAt: Date.now() + VISITOR_CACHE_TTL_MS,
      });
      return snapshot;
    })
    .finally(() => {
      visitorLookupPromises.delete(observedIp);
    });

  visitorLookupPromises.set(observedIp, task);
  return task;
}

async function buildVisitorSnapshot(observedIp) {
  const [ipInfoResult, proxyCheckResult] = await Promise.allSettled([
    fetchIpInfo(observedIp),
    fetchProxyCheck(observedIp),
  ]);

  // Either provider may be temporarily unavailable. Preserve every field that
  // is available instead of converting a partial upstream outage into a 500.
  const ipInfo = ipInfoResult.status === "fulfilled" ? ipInfoResult.value : {};
  const proxyCheck = proxyCheckResult.status === "fulfilled" ? proxyCheckResult.value : {};
  const { geo, ipRisk } = normalizeProviderData({ observedIp, ipInfo, proxyCheck });

  return buildSnapshot({
    observedIp,
    claudeTrace: {},
    cloudflareTrace: {},
    geo,
    ipRisk,
    observedVia: "visitor-request",
    sources: providerSources(),
  });
}

function pruneVisitorSnapshotCache(now) {
  for (const [ip, entry] of visitorSnapshotCache) {
    if (entry.expiresAt <= now) visitorSnapshotCache.delete(ip);
  }
  while (visitorSnapshotCache.size >= VISITOR_CACHE_MAX_ENTRIES) {
    const oldest = visitorSnapshotCache.keys().next().value;
    if (!oldest) return;
    visitorSnapshotCache.delete(oldest);
  }
}

async function refreshIfIpChanged({ reason = "ip-check" } = {}) {
  if (refreshPromise) return refreshPromise;
  if (ipCheckPromise) return ipCheckPromise;

  ipCheckPromise = (async () => {
    const ipInfo = await fetchIpInfo();
    const observedIp = normalizeString(ipInfo?.ip);
    if (!observedIp) {
      throw new Error("Could not detect egress IP from IPinfo");
    }
    if (!latestSnapshot || latestSnapshot.egress?.ip !== observedIp) {
      return refreshSnapshot({ reason, ipInfo });
    }
    process.stdout.write(
      `[ip-risk-server] kept cached snapshot (${reason}); egress IP unchanged: ${observedIp}\n`,
    );
    return latestSnapshot;
  })()
    .catch((error) => {
      process.stderr.write(
        `[ip-risk-server] IP check failed (${reason}): ${formatErrorMessage(error)}\n`,
      );
      if (latestSnapshot) return latestSnapshot;
      throw error;
    })
    .finally(() => {
      ipCheckPromise = null;
    });

  return ipCheckPromise;
}

async function refreshSnapshot({ reason = "manual", ipInfo = null } = {}) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const currentIpInfo = ipInfo || await fetchIpInfo();
    const observedIp = normalizeString(currentIpInfo?.ip);
    if (!observedIp) {
      throw new Error("Could not detect egress IP from IPinfo");
    }

    const [proxyCheckResult] = await Promise.allSettled([fetchProxyCheck(observedIp)]);
    const proxyCheck = proxyCheckResult.status === "fulfilled" ? proxyCheckResult.value : {};
    const { geo, ipRisk } = normalizeProviderData({
      observedIp,
      ipInfo: currentIpInfo,
      proxyCheck,
    });

    const snapshot = buildSnapshot({
      observedIp,
      claudeTrace: {},
      cloudflareTrace: {},
      geo,
      ipRisk,
      observedVia: IPINFO_BASE_URL,
      sources: providerSources(),
    });
    latestSnapshot = snapshot;
    await writeSnapshot(snapshot);
    process.stdout.write(
      `[ip-risk-server] refreshed snapshot (${reason}) at ${snapshot.generatedAt} for ${snapshot.egress.ip}\n`,
    );
    return snapshot;
  })()
    .catch((error) => {
      process.stderr.write(
        `[ip-risk-server] refresh failed (${reason}): ${formatErrorMessage(error)}\n`,
      );
      if (latestSnapshot) return latestSnapshot;
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

function buildSnapshot({
  observedIp,
  claudeTrace = {},
  cloudflareTrace = {},
  geo,
  ipRisk,
  observedVia = IPINFO_BASE_URL,
  sources = providerSources(),
}) {
  const trustScore = normalizeInteger(ipRisk?.trust_score);
  const riskScore = trustScore === null ? null : Math.max(0, 100 - trustScore);
  const attribute = classifyAttribute(ipRisk);
  return {
    generatedAt: new Date().toISOString(),
    observedVia,
    egress: {
      ip: observedIp,
      country: normalizeString(ipRisk?.country) || normalizeString(geo?.country),
      countryCode:
        normalizeString(ipRisk?.countryCode)?.toUpperCase() ||
        normalizeString(geo?.country_code)?.toUpperCase() ||
        normalizeString(claudeTrace.loc)?.toUpperCase() ||
        "",
      region: normalizeString(ipRisk?.region) || normalizeString(geo?.region),
      city: normalizeString(ipRisk?.city) || normalizeString(geo?.city),
      timezone: normalizeString(ipRisk?.timezone),
      colo: normalizeString(claudeTrace.colo)?.toUpperCase() || null,
      loc: normalizeString(claudeTrace.loc)?.toUpperCase() || null,
    },
    network: {
      asn: normalizeInteger(ipRisk?.asn),
      asLabel: normalizeInteger(ipRisk?.asn) ? `AS${normalizeInteger(ipRisk.asn)}` : "",
      asName: normalizeString(ipRisk?.asOrganization),
      isp: normalizeString(geo?.isp),
      companyName: normalizeString(ipRisk?.company_name),
      companyType: normalizeString(ipRisk?.company_type) || normalizeString(ipRisk?.asn_kind),
      attribute,
      rdns: normalizeString(ipRisk?.rdns),
      cidr: normalizeString(ipRisk?.cidr),
    },
    risk: {
      trustScore,
      trustLevel: classifyTrustLevel(trustScore),
      riskScore,
      riskLevel: classifyRiskLevel(riskScore),
      flags: {
        datacenter: Boolean(ipRisk?.is_datacenter),
        residential: Boolean(ipRisk?.isResidential),
        vpn: Boolean(ipRisk?.is_vpn),
        proxy: Boolean(ipRisk?.is_proxy),
        tor: Boolean(ipRisk?.is_tor),
        crawler: Boolean(ipRisk?.is_crawler),
        abuser: Boolean(ipRisk?.is_abuser),
        mobile: Boolean(ipRisk?.is_mobile),
      },
      abuserScore: normalizeString(ipRisk?.abuser_score),
      reputationThreat: normalizeInteger(ipRisk?.rep_threat),
      aiVerdict: ipRisk?.ai_verdict || null,
    },
    traces: {
      claude: simplifyTrace(claudeTrace),
      cloudflare: simplifyTrace(cloudflareTrace),
    },
    sources: {
      ...sources,
    },
  };
}

function providerSources() {
  return {
    geoip: "https://ipinfo.io/{ip}/json",
    iprisk: "https://proxycheck.io/v3/{ip}",
    trace: "IPinfo + Proxycheck",
  };
}

async function fetchIpInfo(ip = "") {
  const suffix = ip ? `/${encodeURIComponent(ip)}` : "";
  return fetchJson(`${IPINFO_BASE_URL}${suffix}/json`);
}

async function fetchProxyCheck(ip) {
  return fetchJson(`${PROXYCHECK_BASE_URL}/${encodeURIComponent(ip)}?asn=1&vpn=3&risk=1`);
}

function normalizeProviderData({ observedIp, ipInfo, proxyCheck }) {
  const record = proxyCheck?.[observedIp] && typeof proxyCheck[observedIp] === "object"
    ? proxyCheck[observedIp]
    : {};
  const network = record.network && typeof record.network === "object" ? record.network : {};
  const location = record.location && typeof record.location === "object" ? record.location : {};
  const detections = record.detections && typeof record.detections === "object" ? record.detections : {};
  const risk = normalizeInteger(detections.risk);

  return {
    geo: {
      country: normalizeString(location.country_name) || normalizeString(ipInfo.country),
      country_code: normalizeString(location.country_code) || normalizeString(ipInfo.country),
      region: normalizeString(location.region_name) || normalizeString(ipInfo.region),
      city: normalizeString(location.city_name) || normalizeString(ipInfo.city),
      isp: normalizeString(network.provider) || normalizeString(ipInfo.org),
    },
    ipRisk: {
      country: normalizeString(location.country_name),
      countryCode: normalizeString(location.country_code),
      region: normalizeString(location.region_name),
      city: normalizeString(location.city_name),
      timezone: normalizeString(location.timezone) || normalizeString(ipInfo.timezone),
      asn: parseAsn(network.asn),
      asOrganization: normalizeString(network.provider) || normalizeString(ipInfo.org),
      company_name: normalizeString(network.organisation),
      company_type: normalizeString(network.type),
      rdns: normalizeString(network.hostname) || normalizeString(ipInfo.hostname),
      cidr: normalizeString(network.range),
      trust_score: risk === null ? null : Math.max(0, 100 - risk),
      rep_threat: risk,
      is_datacenter: Boolean(detections.hosting),
      is_vpn: Boolean(detections.vpn),
      is_proxy: Boolean(detections.proxy),
      is_tor: Boolean(detections.tor),
      is_crawler: Boolean(detections.scraper),
      is_abuser: Boolean(detections.compromised),
    },
  };
}

function parseAsn(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function simplifyTrace(trace) {
  return {
    host: normalizeString(trace?.h),
    ip: normalizeString(trace?.ip),
    colo: normalizeString(trace?.colo)?.toUpperCase() || null,
    loc: normalizeString(trace?.loc)?.toUpperCase() || null,
    warp: normalizeString(trace?.warp),
    gateway: normalizeString(trace?.gateway),
    ts: normalizeString(trace?.ts),
  };
}

function classifyAttribute(ipRisk) {
  if (ipRisk?.isResidential) return "residential";
  if (ipRisk?.is_mobile) return "mobile";
  const typeHints = [ipRisk?.company_type, ipRisk?.asn_kind]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());
  if (
    ipRisk?.is_datacenter ||
    typeHints.some((item) => item.includes("hosting") || item.includes("data"))
  ) {
    return "datacenter";
  }
  if (typeHints.some((item) => item.includes("business") || item.includes("corporate"))) {
    return "business";
  }
  if (typeHints.some((item) => item.includes("isp") || item.includes("broadband"))) {
    return "residential";
  }
  return "unknown";
}

function classifyTrustLevel(score) {
  if (score === null) return "unknown";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function classifyRiskLevel(score) {
  if (score === null) return "unknown";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

async function fetchJson(url) {
  const body = await fetchText(url);
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${formatErrorMessage(error)}`);
  }
}

async function fetchText(url) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-L", "-sS", "--connect-timeout", "5", "--max-time", "12", url],
      {
        env: process.env,
        maxBuffer: 1024 * 1024,
      },
    );
    return stdout.trim();
  } catch (error) {
    throw new Error(`curl failed for ${url}: ${formatErrorMessage(error)}`);
  }
}

async function readSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.egress || typeof parsed.egress.ip !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot) {
  const dir = path.dirname(SNAPSHOT_FILE);
  const tempFile = `${SNAPSHOT_FILE}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tempFile, SNAPSHOT_FILE);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders("GET, POST, OPTIONS", "Content-Type, Authorization"),
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendNoContent(res) {
  res.writeHead(204, {
    ...corsHeaders("GET, POST, OPTIONS", "Content-Type, Authorization"),
  });
  res.end();
}

function parsePort(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
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

function isPublicIp(value) {
  if (!value || net.isIP(value) === 0) return false;
  if (net.isIP(value) === 4) return isPublicIpv4(value);
  return isPublicIpv6(value);
}

function isPublicIpv4(value) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function isPublicIpv6(value) {
  const lower = value.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:")) return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  return true;
}

function formatErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
