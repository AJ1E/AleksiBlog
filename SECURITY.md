# Security

Kai Space is designed for a personal site with private dashboard panels. Treat helper backend data as sensitive.

## Keep Out of Git

- `.env`, `.password`, `.password.secret`, private keys, and token files
- CLI auth files such as Claude, Codex, or Gemini credentials
- Beszel SQLite databases and generated snapshots
- Real server IDs, hostnames, screenshots, and private network diagrams

## Production Defaults

- Bind helper services to `127.0.0.1`.
- Put Astro behind a reverse proxy or tunnel.
- Set `SITE_AUTH_PASSWORD` and a high-entropy `SITE_AUTH_SECRET`.
- Do not expose helper backend ports directly to the public internet.

## Reporting

For template issues, open an issue in your public repository. For secrets accidentally committed to your own fork, rotate them immediately and rewrite public Git history if needed.
