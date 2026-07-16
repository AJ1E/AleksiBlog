#!/usr/bin/env bash
# Run as root: /usr/local/sbin/aleksiz-release
set -Eeuo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

APP_ROOT=/var/www/aleksiz
REPO="$APP_ROOT/repo"
RELEASES="$APP_ROOT/releases"
RUN_AS=aleksiz
CURRENT="$APP_ROOT/current"
PREVIOUS=""

BRANCH="main"
COMMIT=""

if [[ "${1:-}" == "--commit" ]]; then
  COMMIT="${2:-}"
  [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || {
    echo "A 40-character commit hash is required after --commit." >&2
    exit 2
  }
elif [[ -n "${1:-}" ]]; then
  BRANCH="$1"
fi

if [[ -L "$CURRENT" ]]; then
  PREVIOUS="$(readlink -f "$CURRENT")"
fi

run_as_app() {
  local command
  printf -v command ' %q' "$@"
  su -s /bin/bash "$RUN_AS" -c "${command:1}"
}

restart_release_services() {
  systemctl restart aleksiz-astro.service
  for unit in aleksiz-ai-usage.service aleksiz-ip-risk.service aleksiz-server-status.service; do
    if systemctl is-active --quiet "$unit"; then
      systemctl restart "$unit"
    elif systemctl is-enabled --quiet "$unit"; then
      systemctl start "$unit"
    fi
  done
}

if [[ ! -d "$REPO/.git" ]]; then
  echo "Missing deployment checkout: $REPO" >&2
  exit 1
fi

if [[ -z "$COMMIT" ]]; then
  run_as_app git -C "$REPO" fetch --quiet origin "$BRANCH"
  COMMIT="$(run_as_app git -C "$REPO" rev-parse "origin/$BRANCH")"
else
  # A manual notes refresh rebuilds the already deployed revision. Do not
  # fetch code here: the systemd unit intentionally cannot read deploy keys.
  # The commit must already exist locally because it produced `current`.
  run_as_app git -C "$REPO" cat-file -e "$COMMIT^{commit}"
fi
SHORT_COMMIT="${COMMIT:0:12}"
RELEASE="$RELEASES/$(date -u +%Y%m%d-%H%M%S)-$SHORT_COMMIT"

mkdir -p "$RELEASE"
run_as_app git -C "$REPO" archive "$COMMIT" | tar -x -C "$RELEASE"
printf '%s\n' "$COMMIT" > "$RELEASE/.release-commit"
chown -R "$RUN_AS:$RUN_AS" "$RELEASE"

if [[ -d "$CURRENT/.cache/notes" ]]; then
  # Keep the last verified notes snapshot available if GitHub is temporarily
  # unreachable during an ordinary code release.
  mkdir -p "$RELEASE/.cache"
  cp -a "$CURRENT/.cache/notes" "$RELEASE/.cache/notes"
  chown -R "$RUN_AS:$RUN_AS" "$RELEASE/.cache"
fi

# Do not use a login shell here: its profile can replace PATH and make pnpm
# unable to find Node. Keep the build environment explicit and reproducible.
run_as_app env HOME="$APP_ROOT" PATH=/usr/local/bin:/usr/bin:/bin NOTES_SYNC_REQUIRED="${NOTES_SYNC_REQUIRED:-0}" NOTES_SYNC_TRANSPORT="${NOTES_SYNC_TRANSPORT:-archive}" /bin/bash -c "cd '$RELEASE' && /usr/local/bin/pnpm install --frozen-lockfile && /usr/local/bin/pnpm build"

ln -sfn "$RELEASE" "$CURRENT"
restart_release_services

healthy=false
for _ in {1..15}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:4322/ > /dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "New release health check failed; restoring the previous release." >&2
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    restart_release_services
  fi
  exit 1
fi

echo "Released $SHORT_COMMIT to $RELEASE"
