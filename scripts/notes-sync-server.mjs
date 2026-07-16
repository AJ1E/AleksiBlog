import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const PORT = parsePort(process.env.NOTES_SYNC_PORT, 8790);
const HOST = process.env.HOST || "127.0.0.1";
const MANUAL_SYNC_ENABLED = process.env.NOTES_MANUAL_SYNC_ENABLED === "1";
const COOLDOWN_MS = parsePositiveInt(process.env.NOTES_MANUAL_SYNC_COOLDOWN_MS, 5 * 60_000);
const execFileAsync = promisify(execFile);

let syncPromise = null;
let lastSyncAtMs = 0;

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: "invalid-request" });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, enabled: MANUAL_SYNC_ENABLED });
    }

    if (url.pathname !== "/api/notes/sync") {
      return sendJson(res, 404, { error: "not-found" });
    }
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method-not-allowed" });
    }
    if (!MANUAL_SYNC_ENABLED) {
      return sendJson(res, 503, { error: "sync-unavailable" });
    }

    await syncNotesRelease();
    return sendJson(res, 200, { ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    process.stderr.write(`[notes-sync-server] request failed: ${formatError(error)}\n`);
    if (error && typeof error === "object" && "code" in error && error.code === "COOLDOWN") {
      return sendJson(res, 429, { error: "sync-cooldown" });
    }
    return sendJson(res, 500, { error: "notes-sync-failed" });
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 135_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, HOST, () => {
  process.stdout.write(`[notes-sync-server] listening on http://${HOST}:${PORT}\n`);
});

async function syncNotesRelease() {
  const now = Date.now();
  if (syncPromise) return syncPromise;
  if (now - lastSyncAtMs < COOLDOWN_MS) {
    const error = new Error("sync-cooldown");
    error.code = "COOLDOWN";
    throw error;
  }

  syncPromise = execFileAsync(
    "/usr/bin/sudo",
    ["-n", "/usr/bin/systemctl", "start", "aleksiz-notes-sync.service"],
    { timeout: 120_000, maxBuffer: 16 * 1024 },
  )
    .then(() => {
      lastSyncAtMs = Date.now();
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sendJson(res, status, body) {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(encoded),
  });
  res.end(encoded);
}

function formatError(error) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "unknown error";
}
