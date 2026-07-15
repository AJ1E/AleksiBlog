#!/usr/bin/env bash
# Installed on ECS as /usr/local/sbin/aleksiz-token-usage-sync.
# It accepts only a redacted aggregate JSON snapshot from a private repository.
set -Eeuo pipefail

APP_ROOT=/var/www/aleksiz
SHARED_DIR="$APP_ROOT/shared/token-usage"
REPO_DIR="$SHARED_DIR/repo"
TARGET_FILE="$SHARED_DIR/ai-usage-overview.json"
KEY_FILE="$APP_ROOT/shared/keys/token-usage_ed25519"
KNOWN_HOSTS_FILE="$APP_ROOT/shared/keys/github-known_hosts"
REPO_REF="${TOKEN_USAGE_REPO_REF:-main}"
SNAPSHOT_PATH="${TOKEN_USAGE_SNAPSHOT_PATH:-snapshot/ai-usage-overview.json}"

: "${TOKEN_USAGE_REPO_URL:?TOKEN_USAGE_REPO_URL must be set in the protected server environment file}"
[[ -r "$KEY_FILE" && -r "$KNOWN_HOSTS_FILE" ]] || {
  echo "TokenUsage deploy key or GitHub known_hosts file is unavailable" >&2
  exit 1
}

mkdir -p "$SHARED_DIR"
chmod 700 "$SHARED_DIR"
export GIT_SSH_COMMAND="ssh -i $KEY_FILE -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS_FILE"

if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch --depth=1 origin "$REPO_REF"
  git -C "$REPO_DIR" checkout --detach --force FETCH_HEAD
  git -C "$REPO_DIR" clean -ffdqx
else
  git clone --depth=1 --branch "$REPO_REF" "$TOKEN_USAGE_REPO_URL" "$REPO_DIR"
fi

SOURCE_FILE="$REPO_DIR/$SNAPSHOT_PATH"
[[ -f "$SOURCE_FILE" ]] || {
  echo "Configured TokenUsage snapshot is missing" >&2
  exit 1
}
[[ $(wc -c < "$SOURCE_FILE") -le 1048576 ]] || {
  echo "TokenUsage snapshot exceeds the 1 MiB limit" >&2
  exit 1
}

TEMP_FILE=$(mktemp "$SHARED_DIR/.snapshot.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT

node - "$SOURCE_FILE" "$TEMP_FILE" <<'NODE'
const fs = require("node:fs");
const [source, target] = process.argv.slice(2);
const snapshot = JSON.parse(fs.readFileSync(source, "utf8"));
const allowedTools = new Set(["codex-desktop", "codex-cli"]);

if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("snapshot must be an object");
if (typeof snapshot.generatedAt !== "string" || snapshot.generatedAt.length > 64) throw new Error("generatedAt is invalid");
if (!Array.isArray(snapshot.tools) || snapshot.tools.length > allowedTools.size) throw new Error("tools is invalid");
if (!snapshot.heatmap || !Array.isArray(snapshot.heatmap.days) || snapshot.heatmap.days.length > 366) throw new Error("heatmap is invalid");

const seen = new Set();
for (const tool of snapshot.tools) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool) || !allowedTools.has(tool.tool) || seen.has(tool.tool)) {
    throw new Error("tool entry is invalid");
  }
  seen.add(tool.tool);
}
for (const day of snapshot.heatmap.days) {
  if (!day || typeof day !== "object" || typeof day.date !== "string" || day.date.length !== 10 || !Number.isFinite(day.totalTokens) || day.totalTokens < 0) {
    throw new Error("heatmap day is invalid");
  }
}

fs.writeFileSync(target, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
NODE

install -m 0600 "$TEMP_FILE" "$TARGET_FILE"
echo "TokenUsage snapshot updated"
