# TokenUsage Private Sync

## Goal

Show redacted ChatGPT Codex and Codex CLI aggregate usage on the public server without giving the ECS access to workstation logs, prompts, source code, local paths, session identifiers, login files, or GitHub write permission.

## Data Contract

The private TokenUsage repository will contain only `snapshot/ai-usage-overview.json`.

Required fields:

- `generatedAt`: ISO timestamp.
- `tools`: at most two aggregate entries, with `tool` limited to `codex-desktop` or `codex-cli`.
- `heatmap.days`: at most 366 daily rows containing `date` and non-negative `totalTokens`.

The snapshot may contain totals, model names, token counts, estimated costs, and already-redacted display labels. It must never contain raw Codex/CLI logs, prompt text, code, local paths, account identifiers, session identifiers, cookies, API keys, or authentication files.

## Server Flow

1. A local-only sync task produces the redacted JSON and pushes it to the private repository.
2. ECS uses a dedicated read-only GitHub Deploy Key for that repository only.
3. `aleksiz-token-usage-sync.timer` fetches every six hours with a randomized delay.
4. `aleksiz-token-usage-sync.service` rejects missing, oversized, malformed, or unexpected-tool snapshots and preserves the prior valid file.
5. `aleksiz-ai-usage.service` runs in snapshot-only mode on `127.0.0.1:8787`; the browser sees data only through Astro's authenticated BFF.
6. A signed-in user may manually refresh the snapshot from the dashboard. The Astro BFF accepts only same-origin `POST /api/usage/refresh`; Nginx rate-limits it, and the helper can start only the single read-only sync service through a narrowly scoped sudoers rule. The action has a one-minute helper cooldown.

## Local Export

Run `pnpm token-usage:export -- <output-file>` on the developer workstation. The command directly rebuilds the current Codex aggregate and heatmap from local records, then writes only the whitelisted dashboard fields. It never uploads raw session files and never performs Git operations; a dedicated sync workflow is responsible for reviewing and pushing the result to the private repository.

## Manual Setup Still Required

The owner must add the server-generated public key to the private TokenUsage repository as a read-only Deploy Key. Do not reuse the blog repository key, a personal SSH key, or a GitHub personal access token. The protected server environment file then receives only the private repository SSH URL and optional branch/path settings.

## Acceptance Criteria

- No helper port is publicly reachable.
- A failed pull or invalid JSON leaves the last valid dashboard data in place.
- The helper never runs local Codex collectors in production snapshot-only mode.
- Visitors receive only the existing BFF-stripped view; detailed model data remains login-protected.
