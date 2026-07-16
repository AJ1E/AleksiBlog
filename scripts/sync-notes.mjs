import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, basename, extname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repo = process.env.NOTES_GITHUB_REPO || "AJ1E/ObsdianNotes";
const branch = process.env.NOTES_GITHUB_BRANCH || "main";
const remoteUrl = `https://github.com/${repo}.git`;
const repoUrl = `https://github.com/${repo}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, ".cache", "notes");
const contentRoot = join(outputRoot, "content");
const sourceRoot = join(tmpdir(), "aleksi-notes-sync");
const cloneTimeoutMs = parsePositiveInt(process.env.NOTES_SYNC_TIMEOUT_MS, 30_000);
const syncRequired = process.env.NOTES_SYNC_REQUIRED === "1";
const skipDirs = new Set([".git", ".obsidian", ".trash", "templates", "template", "assets", "attachments"]);
const themedFolders = new Set(["Computer", "Finance"]);

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: cloneTimeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/bin/false" },
  });
  if (result.status !== 0) {
    const reason = result.error?.message || result.stderr || result.stdout || "git command failed";
    throw new Error(String(reason).trim());
  }
  return result.stdout;
}

function ensureEmptyDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function walkMarkdown(base) {
  const entries = [];
  const stack = [base];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = relative(base, path).split(sep).join("/");
      const parts = rel.split("/");
      if (parts.some((part) => skipDirs.has(part.toLowerCase()))) continue;
      if (parts.length === 1 && extname(entry.name).toLowerCase() === ".md") continue;
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        entries.push(path);
      }
    }
  }
  return entries.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  return { data: parseSimpleYaml(match[1]), body: raw.slice(match[0].length) };
}

function parseSimpleYaml(raw) {
  const data = {};
  const lines = raw.split(/\r?\n/);
  let activeKey = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const arrayItem = /^\s*-\s+(.+)$/.exec(line);
    if (arrayItem && activeKey) {
      data[activeKey].push(cleanScalar(arrayItem[1]));
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === "") {
      data[key] = [];
      activeKey = key;
      continue;
    }
    data[key] = cleanScalar(value);
    activeKey = null;
  }
  return data;
}

function cleanScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function titleFromBody(body, fallback) {
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading ? heading[1].trim() : fallback;
}

function descriptionFromBody(body) {
  const paragraph = body
    .replace(/^#\s+.+$/gm, "")
    .split(/\r?\n\r?\n/)
    .map((part) => part.replace(/[#>*_`-]/g, "").trim())
    .find((part) => part.length > 0);
  if (!paragraph) return "";
  return paragraph.length > 120 ? `${paragraph.slice(0, 118)}...` : paragraph;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function inlineTags(body) {
  const tags = new Set();
  for (const match of body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
    tags.add(match[2]);
  }
  return [...tags];
}

function slugify(input) {
  return input
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/[#[\]{}%`~^|<>:"?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\/+/g, "--")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function shortHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlArray(values) {
  if (!values.length) return "[]";
  return `\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}`;
}

function sourceUrlFor(path) {
  return `${repoUrl}/blob/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function replaceWikiLinks(body, lookup) {
  return body.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (full, target, alias) => {
    const label = alias || target;
    const key = target.trim().toLowerCase();
    const slug = lookup.get(key);
    return slug ? `[${label}](/notes/${slug}/)` : label;
  });
}

function main() {
  ensureEmptyDir(sourceRoot);

  try {
    runGit(["clone", "--depth", "1", "--branch", branch, remoteUrl, sourceRoot]);
  } catch (error) {
    console.warn(`[notes] sync skipped: ${error.message}`);
    if (syncRequired) throw error;
    mkdirSync(contentRoot, { recursive: true });
    return;
  }

  ensureEmptyDir(contentRoot);
  const files = walkMarkdown(sourceRoot);
  const notes = files.map((file) => {
    const sourcePath = relative(sourceRoot, file).split(sep).join("/");
    const raw = readFileSync(file, "utf8");
    const { data, body } = splitFrontmatter(raw);
    const fileTitle = basename(file, extname(file));
    const title = String(data.title || titleFromBody(body, fileTitle));
    const folder = dirname(sourcePath) === "." ? "Root" : dirname(sourcePath).split(sep).join("/");
    const tags = [...new Set([...normalizeArray(data.tags), ...inlineTags(body)])].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const slugBase = slugify(sourcePath) || shortHash(sourcePath);
    return {
      sourcePath,
      rawBody: body,
      title,
      description: String(data.description || descriptionFromBody(body)),
      folder,
      tags,
      aliases: normalizeArray(data.aliases),
      created: data.created ? String(data.created) : "",
      updated: data.updated ? String(data.updated) : "",
      draft: data.draft === true || data.draft === "true",
      slug: slugBase,
    };
  });
  const unknownFolders = [...new Set(notes.map((note) => note.folder.split("/")[0]))]
    .filter((folder) => folder && !themedFolders.has(folder))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (unknownFolders.length > 0) {
    console.warn(`[notes] new folders need theme colors: ${unknownFolders.join(", ")}`);
  }

  const seen = new Map();
  for (const note of notes) {
    const count = seen.get(note.slug) || 0;
    seen.set(note.slug, count + 1);
    if (count > 0) note.slug = `${note.slug}-${shortHash(note.sourcePath)}`;
  }

  const lookup = new Map();
  for (const note of notes) {
    lookup.set(note.title.toLowerCase(), note.slug);
    lookup.set(basename(note.sourcePath, ".md").toLowerCase(), note.slug);
    for (const alias of note.aliases) lookup.set(alias.toLowerCase(), note.slug);
  }

  const manifest = [];
  for (const note of notes) {
    if (note.draft) continue;
    const body = replaceWikiLinks(note.rawBody, lookup).trimStart();
    const frontmatter = [
      "---",
      `title: ${yamlString(note.title)}`,
      `description: ${yamlString(note.description)}`,
      `sourcePath: ${yamlString(note.sourcePath)}`,
      `sourceUrl: ${yamlString(sourceUrlFor(note.sourcePath))}`,
      `folder: ${yamlString(note.folder)}`,
      `tags: ${yamlArray(note.tags)}`,
      `aliases: ${yamlArray(note.aliases)}`,
      note.created ? `created: ${yamlString(note.created)}` : "",
      note.updated ? `updated: ${yamlString(note.updated)}` : "",
      "draft: false",
      "---",
    ].filter(Boolean).join("\n");
    const outputPath = join(contentRoot, `${note.slug}.md`);
    writeFileSync(outputPath, `${frontmatter}\n\n${body}`, "utf8");
    manifest.push({ slug: note.slug, title: note.title, sourcePath: note.sourcePath, folder: note.folder });
  }

  writeFileSync(join(outputRoot, "manifest.json"), JSON.stringify({ repo, branch, count: manifest.length, notes: manifest }, null, 2), "utf8");
  console.log(`[notes] synced ${manifest.length} notes from ${repo}@${branch}`);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

main();
