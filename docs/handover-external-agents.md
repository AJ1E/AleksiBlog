# External Agent Handover

## Who This Is For

This document is for Gemini, Antigravity, Qoder, and any non-primary agent assisting with code. It is intentionally stricter than the primary Codex handover.

## Copyable Startup Prompt

```text
You are a limited-scope implementation assistant for D:\Projects\BlogV3. Before working, read AGENTS.md and docs/handover-external-agents.md. Follow both as binding rules.

You may inspect and modify only the code files directly needed for the task I give you. Preserve the existing Astro SSR, content collection, React island, Astro BFF, and private-helper architecture. Make the smallest necessary change, keep the current visual style, and do not refactor unrelated code.

You must not edit AGENTS.md, any docs/ guidance/spec/security/deployment file, deploy scripts/configuration, server configuration, DNS, Nginx, systemd, GitHub repository settings, or production infrastructure. Do not deploy, push, or commit unless I explicitly ask. Never read, print, create, or transmit passwords, keys, tokens, cookies, .env values, raw logs, private snapshots, real server details, or personal infrastructure data.

For a medium or large task, first provide a concise plan and affected files, then wait for approval. After implementation, run appropriate local validation, inspect the diff, and return the exact handoff format required at the end of this document.
```

## Project Snapshot

- This is an accepted, deployed first release of an Astro SSR personal blog/dashboard.
- The visual reference is Jeremy Chen's blog and the local existing components. Keep the clean, quiet editorial styling; do not add a new design language.
- Astro is the public app boundary. React is used only for interactive islands. Node helpers are private runtime collectors behind Astro BFF endpoints.
- The public notes source is `AJ1E/ObsdianNotes`; only Markdown in subfolders is publishable. Do not add root vault Markdown to the site.
- AI usage is derived from a sanitized private snapshot. Do not touch raw provider logs, session records, prompts, or credentials.
- Two servers are monitored through Beszel. Do not alter its integration or server configuration.

## Non-Negotiable Engineering Rules

- Do not expose helper ports, call third-party services from browser code for IP/data lookup, or bypass Astro BFF routes.
- Do not weaken login, cookie security, origin validation, auth checks, rate limiting, or Nginx/systemd boundaries to make a task easier.
- Do not add dependencies unless the task explicitly justifies them and the primary maintainer approves.
- Do not modify directory structure, use a CMS/database, replace Astro, or perform broad refactors.
- For UI tasks, preserve desktop/mobile/dark-mode behavior and check overflow, contrast, homepage, article pages, tags, notes, and touched interactions.
- Do not commit generated caches, sync output, `.env`, logs, screenshots with private details, or dependencies unrelated to the task.
- Do not push/deploy by default. The primary Codex task batches releases and owns all production actions.

## Required Working Method

1. Inspect the relevant files and explain the smallest approach for medium/large tasks.
2. Limit edits to the task scope.
3. Run relevant validation. `pnpm build` is required after route, content, schema, or application changes when available.
4. Review the diff for regressions, secrets, and accidental unrelated edits.
5. Return the handoff below. Do not make promises about production status.

## Required Final Handoff

Return this exact information in Chinese:

1. Goal completed or not completed.
2. Changed files, with one short reason for each.
3. Validation commands run and results.
4. Visual checks performed and any remaining responsive/dark-mode risk.
5. `git diff --stat` summary and whether the working tree contains unrelated changes.
6. Security/privacy check: confirm no secret, credential, real server detail, raw log, or private snapshot was added; otherwise stop and name only the category of concern.
7. Unresolved issues, assumptions, or work the primary Codex must review.

## How To Hand Work Back

The user will give the final handoff to the primary Codex task. The primary task reviews the actual local diff, decides whether it is safe to integrate, and later decides whether a batched release should be committed, pushed, and deployed.
