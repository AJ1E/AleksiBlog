# Aleksi Blog: Safe Update Procedure

The server never receives hand-edited site code. Every public release comes from a reviewed commit on `main`.

## Normal Website Update

1. Make and verify the change locally.

   ```bash
   pnpm build
   pnpm audit --prod
   git status
   git diff --check
   git diff
   ```

2. Before staging, scan the intended files for passwords, API keys, private URLs, exact location data, server addresses, screenshots containing private data, and generated caches. Never commit `.env`, `.cache/`, session logs, databases, or deployment keys.
3. Commit the reviewed files and push `main`.
4. On ECS, run the release script as root:

   ```bash
   sudo /usr/local/sbin/aleksiz-release
   ```

5. Check the service and public HTTPS response:

   ```bash
   sudo systemctl --no-pager --full status aleksiz-astro nginx
   curl -fsSI http://127.0.0.1:4322/
   curl -fsSI https://aleksiz.com/
   ```

The script creates a new release, builds before switching `current`, and automatically returns to the previous release if the local health check fails.

## Obsidian Notes

The blog build runs `scripts/sync-notes.mjs` and reads Markdown from `AJ1E/ObsdianNotes`.

- Only Markdown inside subfolders is published; root-level Markdown stays hidden.
- Do a separate review before pushing the notes repository. Do not publish credentials, personal records, private plans, raw screenshots, or private attachments.
- A website release always refreshes notes during `pnpm build`.
- After login, the notes page also provides “同步笔记”. It starts a rate-limited, server-side rebuild of the **current deployed commit** with the latest public notes. It does not deploy newer blog code from `main`; wait for the page reload before opening new notes.

After deployment is stable, create a separate Codex task for a constrained note/token sync workflow. It should export only reviewed data, push only the two intended repositories, and report its diff without touching site code.

## Token Usage Data

`AJ1E/TokenUsage` is private and contains only sanitized aggregate usage data. Do not upload Codex authentication files, raw session/rollout JSONL, prompts, source paths, logs, or provider keys. ECS pulls its single validated snapshot with a read-only deploy key through `aleksiz-token-usage-sync.timer`; the service keeps the last known-good snapshot if validation fails.

After pushing a reviewed TokenUsage snapshot, wait for the six-hour timer or, after signing in to the blog, use the AI usage refresh control. The browser never fetches GitHub directly: the same-origin, login-protected POST action is rate-limited and can start only the scoped read-only sync service.

## Future Timed Sync

For any future timed notes refresh, the safe order is:

1. Create read-only deploy keys for each data repository, scoped to the `aleksiz` service account.
2. Add a small sync script that writes only under `/var/www/aleksiz/shared/`.
3. Validate repository identity, branch, file size, JSON schema, and timestamps before replacing cached data.
4. Trigger a blog rebuild for notes; refresh only the protected usage cache for token data.
5. Run it from a systemd timer daily at first, log failures, and preserve the last known-good content.

Do not let a browser button fetch GitHub directly. The existing manual action is login-protected, POST-only, origin-checked, rate-limited, loopback-only, and may only start its dedicated systemd unit.

## Rollback

```bash
ls -lah /var/www/aleksiz/releases
sudo ln -sfn /var/www/aleksiz/releases/<known-good-release> /var/www/aleksiz/current
sudo systemctl restart aleksiz-astro aleksiz-ip-risk
curl -fsSI http://127.0.0.1:4322/
```

Use `sudo journalctl -u aleksiz-astro -n 100 --no-pager` to understand a failed release before attempting another deployment.
