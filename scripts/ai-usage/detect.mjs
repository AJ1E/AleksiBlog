import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function resolveToolHome(envName, fallback) {
  const explicit = process.env[envName];
  const trimmed = typeof explicit === "string" ? explicit.trim() : "";
  return trimmed.length > 0 ? path.resolve(trimmed) : path.join(os.homedir(), fallback);
}

export function resolveToolHomeFromEnv(envNames, fallback) {
  for (const envName of envNames) {
    const explicit = process.env[envName];
    const trimmed = typeof explicit === "string" ? explicit.trim() : "";
    if (trimmed.length > 0) {
      return path.resolve(trimmed);
    }
  }
  return path.join(os.homedir(), fallback);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function dirHasEntries(dir, predicate) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (!predicate) return entries.length > 0;
    return entries.some((entry) => predicate(entry));
  } catch {
    return false;
  }
}

export async function detectClaude() {
  const home = resolveToolHomeFromEnv(["CLAUDE_CONFIG_DIR", "CLAUDE_HOME"], ".claude");
  const credentials = path.join(home, ".credentials.json");
  const projects = path.join(home, "projects");

  const [hasCreds, hasProjects] = await Promise.all([
    pathExists(credentials),
    dirHasEntries(projects, (entry) => entry.isDirectory()),
  ]);

  return {
    id: "claude",
    name: "Claude Code",
    home,
    installed: hasCreds || hasProjects,
    hasAuth: hasCreds,
    hasLogs: hasProjects,
    paths: { credentials, projects },
  };
}

export async function detectCodex() {
  const home = resolveToolHome("CODEX_HOME", ".codex");
  const auth = path.join(home, "auth.json");
  const sessions = path.join(home, "sessions");
  const config = path.join(home, "config.toml");

  const [hasAuth, hasSessions, hasConfig] = await Promise.all([
    pathExists(auth),
    dirHasEntries(sessions, (entry) => entry.isDirectory()),
    pathExists(config),
  ]);

  return {
    id: "codex",
    name: "Codex CLI",
    home,
    installed: hasAuth || hasSessions || hasConfig,
    hasAuth,
    hasLogs: hasSessions,
    paths: { auth, sessions, config },
  };
}

export async function detectGemini() {
  const home = resolveToolHome("GEMINI_HOME", ".gemini");
  const oauth = path.join(home, "oauth_creds.json");
  const tmp = path.join(home, "tmp");
  const settings = path.join(home, "settings.json");

  const [hasOauth, hasTmp, hasSettings] = await Promise.all([
    pathExists(oauth),
    dirHasEntries(tmp, (entry) => entry.isDirectory()),
    pathExists(settings),
  ]);

  return {
    id: "gemini",
    name: "Gemini CLI",
    home,
    installed: hasOauth || hasTmp || hasSettings,
    hasAuth: hasOauth,
    hasLogs: hasTmp,
    paths: { oauth, tmp, settings },
  };
}

export async function detectQoder() {
  const home = resolveToolHomeFromEnv(["QODER_HOME", "QODER_CONFIG_DIR"], ".qoder");
  const explicitUsage = process.env.QODER_USAGE_FILE?.trim();
  const usageCandidates = explicitUsage
    ? [path.resolve(explicitUsage)]
    : [path.join(home, "usage.jsonl"), path.join(home, "usage.json")];
  const [hasHome, usageFile] = await Promise.all([
    dirHasEntries(home),
    firstExistingFile(usageCandidates),
  ]);

  return {
    id: "qoder",
    name: "Qoder",
    home,
    installed: hasHome || Boolean(usageFile),
    hasAuth: false,
    hasLogs: Boolean(usageFile),
    paths: { home, usageFile },
  };
}

export async function detectWorkBuddy() {
  const home = resolveToolHomeFromEnv(["WORKBUDDY_HOME", "WORKBUDDY_CONFIG_DIR"], ".workbuddy");
  const explicitUsage = process.env.WORKBUDDY_USAGE_FILE?.trim();
  const usageCandidates = explicitUsage
    ? [path.resolve(explicitUsage)]
    : [path.join(home, "usage.jsonl"), path.join(home, "usage.json")];
  const [hasHome, usageFile] = await Promise.all([
    dirHasEntries(home),
    firstExistingFile(usageCandidates),
  ]);

  return {
    id: "workbuddy",
    name: "WorkBuddy",
    home,
    installed: hasHome || Boolean(usageFile),
    hasAuth: false,
    hasLogs: Boolean(usageFile),
    paths: { home, usageFile },
  };
}

export async function detectAllTools() {
  const [claude, codex, gemini, qoder, workbuddy] = await Promise.all([
    detectClaude(),
    detectCodex(),
    detectGemini(),
    detectQoder(),
    detectWorkBuddy(),
  ]);
  return { claude, codex, gemini, qoder, workbuddy };
}

async function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}
