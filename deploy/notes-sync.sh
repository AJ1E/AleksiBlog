#!/usr/bin/env bash
# Installed on ECS as /usr/local/sbin/aleksiz-notes-sync and run only by its
# dedicated systemd unit. Rebuild the current code revision with fresh notes.
set -Eeuo pipefail

APP_ROOT=/var/www/aleksiz
CURRENT="$APP_ROOT/current"
COMMIT_FILE="$CURRENT/.release-commit"

[[ -r "$COMMIT_FILE" ]] || {
  echo "Current release commit is unavailable" >&2
  exit 1
}

COMMIT="$(tr -d '[:space:]' < "$COMMIT_FILE")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Current release commit is invalid" >&2
  exit 1
}

exec /usr/local/sbin/aleksiz-release --commit "$COMMIT"
