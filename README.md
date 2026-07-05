# Kai Space

Kai Space is an Astro personal blog and private dashboard template. It combines MDX writing, structured YAML collections, React dashboard islands, a shared-password login, and optional local helper backends.

## Features

- Astro SSR with MDX content collections
- Blog, project, subscription, API, and server collections
- React dashboard for subscriptions, AI usage, IP risk, and server status
- Same-origin BFF routes that redact sensitive fields for public visitors
- Optional Node helpers for local CLI usage, egress IP risk, and Beszel metrics

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://127.0.0.1:4321/`.

For production, set `SITE_AUTH_PASSWORD` and `SITE_AUTH_SECRET` with real values. Do not commit `.env`, local snapshots, Beszel databases, CLI auth files, or helper logs.

## Content

- Blog posts: `src/content/blog/*.mdx`
- Projects: `src/content/projects/*.mdx`
- Subscriptions: `src/content/subscriptions/*.yaml`
- API cards: `src/content/apis/*.yaml`
- Server metadata: `src/content/servers/*.yaml`

Schemas live in `src/content.config.ts`.

## Helper Backends

`pnpm dev` starts Astro and the three helper services:

- `scripts/ai-usage-server.mjs`
- `scripts/ip-risk-server.mjs`
- `scripts/server-status-server.mjs`

The helpers default to loopback. Astro forwards `/api/usage/*`, `/api/ip-risk/*`, and `/api/servers/*` through auth-aware API routes.

Read [docs/helper-backends.md](docs/helper-backends.md) for the full backend handbook, including the technical stack, process model, environment variables, API routes, redaction rules, and troubleshooting notes. [docs/ai-usage-backend.md](docs/ai-usage-backend.md) contains deeper notes for the local AI usage collector.

## Open Source Hygiene

Before publishing your own fork, replace demo content and run a residual scan:

```bash
rg -n "your-real-name|your-domain|token|secret|private key" .
pnpm build
```

Use a fresh Git repository for public release if the source project ever contained private content.
