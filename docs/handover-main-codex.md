# Main Codex Handover

## Use This First

This document is for the primary desktop Codex task that owns this blog. Read it after `AGENTS.md`, `docs/site-development-guide.md`, and, for security or release work, `docs/security-readiness.md`.

Suggested opening prompt for a new primary Codex task:

```text
You are the primary maintainer of D:\Projects\BlogV3, an already deployed Astro SSR personal blog/dashboard. Before doing anything, read AGENTS.md, docs/handover-main-codex.md, docs/site-development-guide.md, and docs/security-readiness.md. Follow them as binding project rules.

The first release is accepted. Work locally by default: understand the affected flow, give a plan for medium or large changes, make the smallest safe change, validate it, inspect the diff, and report the result. Do not push or deploy each small change. Batch related finished work and explicitly remind me to review, security-scan, validate, commit/push, and deploy; wait for my confirmation before publishing.

You alone may edit AGENTS.md and the guidance, security, deployment, or specification documents under docs/. Preserve the Astro/content/React/helper architecture, the Astro BFF boundary, helper privacy, existing visual style, and production security. Never expose or request secrets in chat, code, commits, screenshots, or documentation.
```

## Current State

- Local workspace: `D:\Projects\BlogV3`.
- Public application: an Astro SSR personal blog/dashboard behind Nginx and HTTPS. The first production release has been accepted.
- Current local baseline commit: `6957dc6 feat: schedule automatic notes synchronization`.
- The site is a customized fork of `C2jeremy/kai-space`; Jeremy Chen's live site and the three reference articles listed in `AGENTS.md` remain the visual and operational reference.
- The site is not a static export. Astro SSR, auth-aware API routes, and local helper services are part of the deployment.

## Architecture To Preserve

1. Astro owns routing, SSR, layouts, login-aware rendering, and public API routes.
2. `src/content/` is the editable source for posts, projects, subscriptions, servers, and other file-backed data.
3. React islands are only for browser interactions that need them.
4. Node helpers collect runtime data. They remain private and are accessed through Astro BFF routes.
5. Visitors access Nginx and Astro only. Do not expose helper ports or bypass BFF routes with public client configuration.

Important BFF boundaries include `/api/usage/*`, `/api/ip-risk/*`, and `/api/servers/*`. Treat every BFF route as an explicit allowlist: method, auth, inputs, response fields, and cache behavior must be intentional.

## Features Already In Place

- Login-protected private dashboard areas and cookie-authenticated mutations.
- Public Obsidian notes are read from `AJ1E/ObsdianNotes` during sync/build. Only Markdown inside subfolders is published; root Markdown stays hidden.
- Notes have automatic server synchronization every six hours with a small randomized delay and a signed-in manual sync action. Automatic sync rebuilds the current deployed code only; it does not publish unreviewed code.
- AI usage snapshots come from the private `AJ1E/TokenUsage` repository. The server pulls them on a six-hour schedule with a signed-in manual refresh. Only the sanitized aggregate snapshot is allowed; raw local logs, prompts, source paths, sessions, and tokens are never published.
- Beszel monitors the two existing servers. The presentation names are `Alibaba Cloud` and `Azure Hong Kong`. Do not alter Beszel, server metadata, or the monitoring topology unless asked.
- The homepage contains subscriptions, AI usage, server monitoring, and visitor-IP cards. These depend on helpers and should fail gracefully rather than blocking page rendering.

## Visual Direction

- Preserve the existing quiet, clean, editorial style: warm off-white background, restrained borders, serif display type, compact monospaced labels, and limited accent colors.
- Use the existing components, CSS variables, patterns, and screenshots as the primary source of truth. Do not introduce a new design system, a marketing landing page style, oversized rounded cards, or decorative gradients.
- For UI work, check desktop, mobile, and dark mode. Check overflow, readable contrast, nav behavior, homepage, article pages, tag pages, notes, and any touched interactive state.
- New note folders need a deliberate category/theme color before polishing their cards.

## Development Process

1. Read the binding docs and inspect relevant code before planning.
2. For a medium or large change, update or add a concise specification under `docs/specs/` before implementation.
3. Make the smallest necessary diff. Do not rewrite architecture, move directories, or delete unrelated behavior.
4. Run relevant checks. At minimum run `pnpm build` after content, routes, schemas, or app changes. Use visual browser checks for UI work.
5. Inspect `git status` and the complete diff, including untracked files. Explain changed files, reasons, validation, and remaining risks.
6. Keep small work local. Recommend a release only when a related feature set, visitor-facing fix, article publication, or security/dependency update is ready. Wait for explicit user approval before GitHub push and production deployment.

## Security And Privacy Requirements

- Never place passwords, API keys, SSH keys, access tokens, cookies, `.env` values, Beszel data, logs, snapshots, local caches, real server addresses, private hostnames, or administrative URLs in the repository, output, screenshots, commit messages, or docs.
- Treat every tracked file and Git history as public. Scan staged and untracked files for secrets and personal infrastructure data before every commit/push.
- Production must keep `SITE_AUTH_DISABLE` off, use strong server-side credentials, and store secrets outside release directories with restrictive permissions.
- Keep Astro `security.checkOrigin` enabled. Fix reverse-proxy headers rather than disabling origin checks.
- State-changing authenticated routes must be POST-only and receive origin/CSRF and rate-limit review. Do not add state-changing GET routes.
- Helpers are loopback-only with no broad CORS. Public browser requests go through Astro BFF endpoints.
- Do not use blind dependency bulk-fixes. For dependency work: document intended versions, install from lockfile, build, audit production dependencies, and visually compare before accepting.
- Before a production deployment, run `pnpm build` and `pnpm audit --prod`. Do not claim a clean release if a required check could not run.

## Production And Release Boundaries

- Production uses Nginx, HTTPS, a systemd-managed Astro app, helper services, immutable releases, and a release script with rollback behavior.
- Do not connect to servers, run remote commands, change Nginx/systemd/firewall/DNS, or deploy without an explicit user request and a stated plan/risk.
- When deployment is approved: back up configuration first, verify auth and helper health locally, deploy the reviewed commit only, then test external HTTPS, login, homepage cards, notes sync, token refresh, monitoring, and rollback readiness.
- Never include server connection details or secrets in handoff notes. Obtain them only from the user's secure local environment when deployment is explicitly authorized.

## Ownership In Multi-Agent Work

- This primary Codex task owns blog code integration, `AGENTS.md`, all `docs/` guidance/spec/security/deployment documents, release review, production deployment, security, and monitoring.
- Gemini, Antigravity, Qoder, and other assisting agents may read the rules but may not edit `AGENTS.md`, `docs/`, deployment scripts/configuration, or production infrastructure unless the user explicitly moves that ownership.
- Dedicated note/token agents only update their approved source repositories. They do not edit this blog, deploy it, or receive production credentials.
- Ask an external agent to return a concise handoff: goal, changed files, validation commands/results, diff summary, and unresolved risks. Review their work and local diff before integrating or releasing.

## Useful Paths

- Project rules: `AGENTS.md`
- Beginner maintenance guide: `docs/site-development-guide.md`
- Security baseline: `docs/security-readiness.md`
- Deployment runbook: `deploy.md`
- Updating runbook: `update.md`
- Content guide: `docs/writing-posts.md`
- Change specs: `docs/specs/`
- Notes sync specification: `docs/specs/notes-manual-sync.md`
- Token snapshot specification: `docs/specs/token-usage-private-sync.md`
- Main source areas: `src/`, `scripts/`, `helpers/`, `deploy/`
