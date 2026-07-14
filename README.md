# AleksiBlog

Personal blog, working desk, knowledge base, and carefully protected private dashboard.

AleksiBlog is a customized fork of [C2jeremy/kai-space](https://github.com/C2jeremy/kai-space). It keeps the upstream project's quiet Astro visual language while adapting its content, notes, navigation, subscriptions, and personal tools for long-term personal use.

## What Lives Here

- **Blog**: MDX articles, tags, projects, and an About page.
- **Notes**: selected Obsidian Markdown synchronized at build time from `AJ1E/ObsdianNotes`; only subfolder Markdown is published.
- **Navigation and Bucketlist**: useful links plus a private movie watchlist.
- **Private dashboard**: subscriptions, AI usage, optional Beszel server status, and a visitor-IP view, all protected by site login where appropriate.

## Stack

- Astro 7 SSR with `@astrojs/node`
- React islands and TypeScript
- MDX and YAML content collections
- Node helper services behind Astro BFF routes
- pnpm

## Local Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4321/`.

Before sharing or deploying a change:

```bash
pnpm build
pnpm audit --prod
git diff --check
```

## Content Map

| What | Location |
| --- | --- |
| Site title, navigation, public contact metadata | `src/data/site.ts` and `src/data/navigation.ts` |
| Articles | `src/content/blog/` |
| Projects | `src/content/projects/` |
| Subscriptions | `src/content/subscriptions/` |
| Bucketlist items | `src/content/bucketlist/` |
| About page | `src/pages/about.astro` |
| Long-term project rules | `AGENTS.md` and `docs/site-development-guide.md` |

## Privacy And Security

- Do not commit `.env`, tokens, passwords, SSH keys, raw AI session logs, databases, or generated note caches.
- Public traffic reaches Nginx and Astro only. Helper ports stay loopback-only behind Astro's auth-aware BFF.
- The production release guide and rollback process are in [deploy.md](deploy.md); normal updates are in [update.md](update.md).
- Read [docs/security-readiness.md](docs/security-readiness.md) before a dependency upgrade, public release, or deployment.

## Credit

The project began with [C2jeremy/kai-space](https://github.com/C2jeremy/kai-space). Thank you to its author for the Astro/blog/dashboard foundation that made this personal adaptation possible.
