#!/usr/bin/env bash
# Run as root: /usr/local/sbin/aleksiz-release
set -Eeuo pipefail

APP_ROOT=/var/www/aleksiz
REPO="$APP_ROOT/repo"
RELEASES="$APP_ROOT/releases"
BRANCH="${1:-main}"
RUN_AS=aleksiz
CURRENT="$APP_ROOT/current"
PREVIOUS=""

if [[ -L "$CURRENT" ]]; then
  PREVIOUS="$(readlink -f "$CURRENT")"
fi

run_as_app() {
  runuser -u "$RUN_AS" -- "$@"
}

if [[ ! -d "$REPO/.git" ]]; then
  echo "Missing deployment checkout: $REPO" >&2
  exit 1
fi

run_as_app git -C "$REPO" fetch --quiet origin "$BRANCH"
COMMIT="$(run_as_app git -C "$REPO" rev-parse "origin/$BRANCH")"
SHORT_COMMIT="${COMMIT:0:12}"
RELEASE="$RELEASES/$(date -u +%Y%m%d-%H%M%S)-$SHORT_COMMIT"

mkdir -p "$RELEASE"
git -C "$REPO" archive "$COMMIT" | tar -x -C "$RELEASE"
printf '%s\n' "$COMMIT" > "$RELEASE/.release-commit"
chown -R "$RUN_AS:$RUN_AS" "$RELEASE"

run_as_app bash -lc "cd '$RELEASE' && pnpm install --frozen-lockfile && pnpm build"

ln -sfn "$RELEASE" "$CURRENT"
systemctl restart aleksiz-astro.service
if systemctl is-enabled --quiet aleksiz-ip-risk.service; then
  systemctl restart aleksiz-ip-risk.service
fi

if ! curl --fail --silent --show-error --max-time 15 http://127.0.0.1:4322/ > /dev/null; then
  echo "New release health check failed; restoring the previous release." >&2
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    systemctl restart aleksiz-astro.service
    if systemctl is-enabled --quiet aleksiz-ip-risk.service; then
      systemctl restart aleksiz-ip-risk.service
    fi
  fi
  exit 1
fi

echo "Released $SHORT_COMMIT to $RELEASE"
