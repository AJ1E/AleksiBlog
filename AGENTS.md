# Project Development Notes

This project is a customized fork of Jeremy's Astro blog/dashboard. Future work should generally follow the architecture and operating principles described in Jeremy's article, "这个网站是如何运行的：从 Astro 页面到本地后端服务", unless the user explicitly asks for a larger redesign.

Before making substantial changes, read `docs/site-development-guide.md`. Treat that guide as the project's baseline for beginner-friendly customization, long-term maintenance, security, and future tooling decisions.

## Default Direction

- Treat the site first as a personal Astro blog, then as a private dashboard.
- Prefer small, understandable changes over broad rewrites.
- Keep the existing four-layer shape:
  - Astro pages handle routing, SSR, layouts, login-aware rendering, and API endpoints.
  - `src/content/` remains the main source of editable personal content.
  - React islands handle complex browser interactions only where needed.
  - Node helper backends collect local/runtime data and stay behind Astro API routes.
- For beginner-friendly customization, change personal content before changing architecture.
- For medium or large changes, write or update a short spec under `docs/specs/` before implementation.

## What To Customize First

- Site metadata, author/profile text, navigation labels, and homepage copy.
- Blog posts in `src/content/blog/`.
- Public notes synced from `AJ1E/ObsdianNotes` into `.cache/notes/content/` by `scripts/sync-notes.mjs`.
- Projects in `src/content/projects/`.
- About page content.
- Demo YAML data under `src/content/subscriptions/`, `src/content/apis/`, and `src/content/servers/`.

Avoid changing auth, BFF proxying, helper backend internals, Beszel integration, and deployment topology until the user asks for that level of work.

## Architecture Rules To Preserve

- Public visitors should access Astro, not the helper backend ports directly.
- `/api/usage/*`, `/api/ip-risk/*`, and `/api/servers/*` should continue to go through Astro's auth-aware BFF layer.
- Helper services should stay bound to loopback or otherwise be protected from public access.
- Use content collections and schema validation for file-backed content instead of inventing a CMS or database unless explicitly requested.
- Run `pnpm build` after content or schema changes to catch MDX/frontmatter/YAML errors.

## Development Workflow

- Always inspect the existing project structure before planning changes.
- For medium or large features, explain the implementation plan and affected files before modifying code.
- Prefer the smallest useful change. Do not rewrite the whole project, change the directory structure, or remove existing features unless explicitly requested.
- Preserve the current visual direction: simple, clean, quiet, elegant, readable, and consistent with the existing Astro/React components.
- Treat Jeremy's current site, `https://blog.czhifang.com/`, as the standing visual reference for spacing, typography, cards, and restrained decoration. When the live site cannot be accessed, use the user's screenshots and the existing local components as the source of truth.
- Prefer existing content collections, layouts, components, CSS variables, helper functions, and API clients over new abstractions.
- For blog features, first inspect `src/content.config.ts`, `src/lib/content.ts`, `src/pages/blog/**`, and related React components.
- For notes features, keep the Obsidian source repository read-only from this site. Sync public Markdown at build time, keep generated notes under `.cache/`, and do not commit synced note files.
- Only Obsidian Markdown files inside subfolders are published as site notes; root-level Markdown is treated as vault maintenance or test material and should stay hidden.
- When a newly synced notes folder appears, remind the user to choose a dedicated theme color before polishing that category's UI.
- For personal information changes, use `docs/personal-profile-template.md` as the source of truth once the user fills it in.
- For UI changes, verify desktop, mobile, and dark mode. Pay special attention to overflow, contrast, article pages, tag pages, and the homepage.
- For security-sensitive changes, preserve Astro BFF routes and never expose helper backend ports directly.
- For visitor IP features, route browser requests through Astro API endpoints first. The frontend must not call third-party IP/risk services directly, and helper backend ports must remain private.
- When SEO, RSS, or sitemap behavior is mentioned, first confirm whether the project already implements it. At the time of writing, RSS and sitemap are not implemented.
- After implementation, summarize changed files, explain why they changed, run available validation commands such as `pnpm build`, and review the diff.
- If validation fails, fix the errors before handing the work back unless the failure is unrelated or blocked by missing user input.

## Recommended Tooling And Skills

- Keep the default validation lightweight first: run `pnpm build` for content, routing, MDX, and Astro integration checks.
- Before adding new dependencies, prefer built-in Astro checks and the project's existing patterns; only add a tool when it removes real maintenance risk.
- For larger UI changes, use Playwright or the Codex browser skill for desktop/mobile visual checks when available, especially for overflow, dark mode, and interactive filters.
- For security-sensitive work, use security review habits or relevant Codex security skills before implementation: identify secrets, public endpoints, auth boundaries, and data exposure paths.
- Future tooling candidates can include `astro check`, Biome or Prettier for formatting consistency, Playwright for smoke tests, GitHub Actions for build checks, dependency audit tools, and secret scanning.
- Do not introduce OpenSpec, Spec Kit, a CMS, a database, or a heavy search/indexing service unless the user explicitly agrees that the feature is large enough to justify it.
- If a third-party GitHub project or plugin is proposed, document why it is needed, what files it affects, and how to remove it later before installing it.

## Codex Skills And Plugins Policy

- Installed project-relevant skills: `security-best-practices`, `playwright`, and the third-party `ponytail` plugin.
- Restart Codex after installing new skills before relying on them being triggerable by name.
- Project rules have priority over Ponytail. Treat Ponytail as an auxiliary engineering heuristic for reducing unnecessary code and dependencies, never as the project's sole development standard or as permission to skip required reading, validation, security, accessibility, SEO, performance, responsive behavior, or release gates.
- Use Ponytail after understanding the task and tracing the affected flow: question whether work is needed, reuse existing project patterns, prefer standard library/native browser features/already-installed dependencies, avoid speculative abstractions, and keep the smallest correct diff. Do not use minimalism to justify changing unrelated modules, removing requested behavior, or weakening error handling.
- For UI work, Ponytail must preserve the existing visual direction, mobile adaptation, dark mode, accessibility, SEO, and performance requirements. A shorter implementation is not preferred if it causes visual inconsistency, overflow, regressions, or weaker semantics.
- For this Astro project, Ponytail does not override the four-layer architecture, content collections, Astro BFF boundaries, helper privacy, `docs/site-development-guide.md`, `docs/security-readiness.md`, or the requirement to run build, lint, tests, and relevant visual checks after changes.
- Use `ponytail-review` only as a focused over-engineering review. It complements, and does not replace, correctness, security, accessibility, performance, or normal code review.
- Use `security-best-practices` only for explicit security reviews, secure-by-default implementation work, or security-sensitive changes. For this Astro/React/Node project, consider both frontend React code and backend/API/helper boundaries, and preserve the Astro BFF layer.
- Use `playwright` or the Codex browser skill for UI verification when visual behavior matters. Check desktop, mobile, dark mode, overflow, contrast, article pages, tag pages, homepage, and interactive filters. Keep screenshots and browser artifacts under `output/playwright/` if artifacts are needed.
- For visual, layout, component, responsive, and aesthetic work, prefer the existing Astro components, React islands, CSS variables, global styles, and Jeremy's site as the visual reference. A design skill should guide review and verification, not replace the project's architecture or visual direction.
- The OpenAI Sites/building workflow is useful for new hosted sites, but this repository is already an Astro SSR blog/dashboard. Do not let Sites, build-web-app, or generic app-builder guidance replace the existing Astro structure unless the user explicitly requests a larger migration.
- Do not install Vercel, Figma, Canva, Notion, MCP, deployment, telemetry, or external-account plugins just for general polish. Install them only when the user has a concrete workflow that needs that service.
- Treat third-party skills from videos, lists, or GitHub repos as untrusted until their `README`, `LICENSE`, and `SKILL.md` have been read. Prefer official OpenAI curated skills or already installed trusted plugins.
- If a future skill or plugin is recommended, record its purpose, source, external-service requirements, project dependency impact, risks, and removal path before installing it.

## Security Notes

- Never commit `.env`, passwords, tokens, CLI auth files, Beszel databases, snapshots, logs, or local cache data.
- `SITE_AUTH_DISABLE=1` is only for local development.
- In production, set real `SITE_AUTH_PASSWORD` and `SITE_AUTH_SECRET`.
- If exposing the site publicly, expose Astro only; keep AI usage, IP risk, and server status helpers private.

## Security, Privacy, And Release Gate

- Read `docs/security-readiness.md` before any security-sensitive change, dependency upgrade, deployment, or public release. Treat it as the current security baseline and update it after a meaningful review.
- Treat every repository file as potentially public: source code, `public/` assets, Markdown, deployment documents, images, screenshots, generated reports, commit messages, and Git history. Do not put real server IPs, internal hostnames, administrative URLs, private network diagrams, or unredacted screenshots in the public repository.
- Data may be published only after an explicit choice: a pen name, public GitHub profile, dedicated public contact address, general interests, and deliberately public project links are normally acceptable. Treat school/work details, city-level location, personal photos, public notes, and usage lists as privacy-sensitive; never publish exact address, phone number, private email, identity documents, travel plans, birth date, or personal account records.
- Never put secrets in browser-visible code or configuration. `PUBLIC_*`, `import.meta.env`, client React props, HTML, `public/`, and any browser network response are public. Secrets stay only in server-side environment files or a secret manager with restrictive permissions.
- Before every commit or push, inspect `git status`, review the diff including untracked files, and run a secret/PII scan. If a possible secret or sensitive personal/infrastructure value appears, stop staging it, tell the user what category was detected without repeating its value, and require rotation/revocation before publishing if it was ever exposed.
- Before every production deployment, run `pnpm build` and `pnpm audit --prod`. Do not deploy while high-severity dependency vulnerabilities remain unless the user explicitly accepts a documented, time-limited exception. Do not run blind bulk fixes such as `pnpm audit --fix`; upgrade direct Astro and integration dependencies deliberately and re-test.
- Production requires `SITE_AUTH_DISABLE` to be absent or different from `1`; a strong unique `SITE_AUTH_PASSWORD`; a random `SITE_AUTH_SECRET`; and secret files stored outside release directories with restrictive permissions. Never paste these values into chat, docs, commands, screenshots, commits, or CI logs.
- Keep Astro SSR and all helpers on loopback. ECS security groups/firewall may expose only SSH (restricted to trusted source IPs), HTTP, and HTTPS; never expose `4321`, `4322`, `8787`, `8788`, or `8789`. Do not configure `PUBLIC_*_API_BASE_URL` in production because it bypasses the Astro BFF and login-aware field stripping.
- Any Nginx/reverse-proxy deployment must overwrite trusted forwarding headers, keep direct Node access unavailable, and add security headers. Introduce CSP in report-only mode first, then enforce it after browser verification; do not solve CSP breakage by adding broad `unsafe-inline` or `unsafe-eval`.
- Login, logout, or any new state-changing cookie-authenticated endpoint must receive rate-limit and Origin/Referer or CSRF review before it becomes public. Do not add a state-changing GET endpoint.
- Before adding external scripts, fonts, favicon providers, analytics, IP lookup services, maps, or widgets, document provider, data sent, privacy impact, removal path, and whether a self-hosted alternative is practical. The current visitor IP-risk feature sends IP data to third-party lookup providers; preserve the BFF and add a clear privacy notice or disable the feature before public launch.
- Enable GitHub Secret Scanning and Push Protection for the repository before public release. Use Dependabot or an equivalent recurring dependency-alert workflow. A future Strix scan is optional only after staging exists: it requires Docker and an LLM API key, must target only user-authorized systems, and must never receive production credentials in arguments, instructions, or reports.

## Security Maintenance Rules

- Current dependency baseline: Astro `7.0.7`, `@astrojs/mdx` `7.0.2`, `@astrojs/node` `11.0.2`, `@astrojs/react` `6.0.1`, and `@astrojs/markdown-remark` `7.2.1`. Keep the explicit `unified()` Markdown processor unless a future migration deliberately compares rendered Markdown/MDX output.
- For every dependency upgrade, record the reason and target versions in `docs/specs/`, run `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm audit --prod`, then perform desktop/mobile light/dark smoke checks before accepting the lockfile. Never use blind `pnpm audit --fix`.
- A green audit means no known advisories at that moment, not that the application is universally secure. Pair it with source review, secret/PII scanning, BFF authorization tests, reverse-proxy checks, and a rollback plan.
- Keep the current release gate explicit: no public deployment until `pnpm build` and `pnpm audit --prod` pass, production auth is configured, Nginx has been tested, HTTPS is ready, helper ports are private, and an external-network check confirms only 80/443 are reachable.
- Keep Astro's `security.checkOrigin` enabled. Do not disable it to work around a reverse-proxy problem; fix the proxy headers and verify the login form instead.
- Treat every BFF route as an allowlist: explicitly define allowed method, path, authentication level, request parameters, response field stripping, and cache policy. Do not restore catch-all proxying or pass arbitrary `OPTIONS`, paths, methods, query strings, cookies, or upstream error messages through the public API.
- Public dashboard summaries may be cached only when a deliberate privacy review says so. The default for helper/BFF responses is `Cache-Control: no-store`.
- Helpers default to loopback and no CORS. Add a helper CORS origin only for a documented, necessary browser integration; it must be a single trusted origin, never `*`.
- Visitor-IP handling trusts `X-Real-IP` only with `TRUST_PROXY_HEADERS=1`, after Nginx is confirmed as the sole public entry point and configured to overwrite that header. Do not trust `X-Forwarded-For`, `Forwarded`, Cloudflare headers, or arbitrary client headers by default.
- Cookie-authenticated mutations must be POST-only, require Astro's origin check, and be rate-limited at the reverse proxy. Login redirects must stay same-origin paths; never permit an external `next` URL.
- Do not reveal raw backend, filesystem, URL, database, stack trace, or provider errors to visitors. Keep diagnostic details in protected server logs only.
- For dependency upgrades, make a baseline visual capture first, upgrade in a small reversible step, run `pnpm build`, and compare desktop/mobile plus light/dark pages before accepting the change. Do not make layout or CSS edits merely to mask an upgrade regression.
- GitHub Actions must use least-privilege `permissions`, install from the lockfile, run build and production dependency audit, and never receive deployment credentials unless a later deployment design explicitly requires them. Dependabot pull requests must receive the same build and visual review as ordinary changes.
- Security checks are evidence, not a substitute for judgment. If an external audit or secret scan cannot run, record it as unresolved and do not claim a clean release until it is rerun successfully.
- Maintain this cadence after public launch: inspect Dependabot and GitHub security alerts weekly; run `pnpm audit --prod`, review dependencies, and take an encrypted server backup monthly; rotate the site password/secret immediately after suspected exposure and at least annually; test rollback after every deployment-process change.

## Current Local Setup Notes

- The local project is developed in `D:\Projects\BlogV3`.
- The system `node` command may not be on PATH; the Codex bundled Node/pnpm were used during initial setup.
- A local empty Beszel placeholder database may exist under `local/` for beginner-mode development without a real Beszel instance.
- The project may include `pnpm-workspace.yaml` to allow pnpm 11 build scripts for `better-sqlite3`, `esbuild`, and `sharp`.
