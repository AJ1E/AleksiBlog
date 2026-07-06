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
- Prefer existing content collections, layouts, components, CSS variables, helper functions, and API clients over new abstractions.
- For blog features, first inspect `src/content.config.ts`, `src/lib/content.ts`, `src/pages/blog/**`, and related React components.
- For personal information changes, use `docs/personal-profile-template.md` as the source of truth once the user fills it in.
- For UI changes, verify desktop, mobile, and dark mode. Pay special attention to overflow, contrast, article pages, tag pages, and the homepage.
- For security-sensitive changes, preserve Astro BFF routes and never expose helper backend ports directly.
- When SEO, RSS, or sitemap behavior is mentioned, first confirm whether the project already implements it. At the time of writing, RSS and sitemap are not implemented.
- After implementation, summarize changed files, explain why they changed, run available validation commands such as `pnpm build`, and review the diff.
- If validation fails, fix the errors before handing the work back unless the failure is unrelated or blocked by missing user input.

## Security Notes

- Never commit `.env`, passwords, tokens, CLI auth files, Beszel databases, snapshots, logs, or local cache data.
- `SITE_AUTH_DISABLE=1` is only for local development.
- In production, set real `SITE_AUTH_PASSWORD` and `SITE_AUTH_SECRET`.
- If exposing the site publicly, expose Astro only; keep AI usage, IP risk, and server status helpers private.

## Current Local Setup Notes

- The local project is developed in `D:\Projects\BlogV3`.
- The system `node` command may not be on PATH; the Codex bundled Node/pnpm were used during initial setup.
- A local empty Beszel placeholder database may exist under `local/` for beginner-mode development without a real Beszel instance.
- The project may include `pnpm-workspace.yaml` to allow pnpm 11 build scripts for `better-sqlite3`, `esbuild`, and `sharp`.
