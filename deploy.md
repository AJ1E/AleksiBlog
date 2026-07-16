# Aleksi Blog: Alibaba Cloud ECS Deployment

This is the runbook for the first public deployment after ICP approval. The site record is `渝ICP备2026015413号`; the footer links it to the MIIT record site. Never put a password, private key, GitHub token, real server address, or `.env` value in this repository or this document.

## Architecture

```text
Visitor -> Nginx :80/:443 -> Astro SSR 127.0.0.1:4322
                                  -> BFF routes
                                  -> IP helper 127.0.0.1:8788
```

- Astro 7 uses server output and starts from `dist/server/entry.mjs`.
- `pnpm build` builds the server application into `dist/`.
- Nginx is the only public entry point. Do not open `4321`, `4322`, `8787`, `8788`, or `8789` in the ECS security group.
- The IP helper is optional but recommended for the visitor-IP card. It is loopback-only and Astro calls it through the BFF.
- AI usage and Beszel helpers remain disabled until their production data sources are deliberately configured.

## Before The First Deployment

1. In the ECS security group, allow only `80` and `443` from the Internet. Restrict `22` to your current trusted public IP and remove or restrict broad ICMP if it is not needed.
2. Confirm both `aleksiz.com` and `www.aleksiz.com` resolve to the ECS in a public resolver.
3. Keep the source repository clean: run `pnpm build`, `pnpm audit --prod`, review the diff, and scan for secrets before pushing `main`.
4. Use an SSH key or the ECS console. Never send the server password or SSH private key through chat.

## 1. Install The Runtime

Run these commands on Alibaba Cloud Linux 3. Read the package transaction before accepting it: it updates operating-system packages.

```bash
sudo dnf update -y
sudo dnf install -y git nginx curl tar gzip rsync gcc gcc-c++ make python3 certbot
```

Install an actively supported Node.js LTS release, verify it works, then activate the project pnpm version:

```bash
node --version
npm --version
sudo corepack enable
sudo corepack prepare pnpm@10.30.3 --activate
pnpm --version
command -v node
command -v pnpm
```

If Node.js is absent or too old, install the current supported Node.js LTS release using the official Node.js instructions before continuing. Confirm that `node` and `pnpm` are available to a non-login system service; do not assume a shell profile will be read by systemd.

## 2. Create The Service Account And Directories

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin aleksiz
sudo install -d -o aleksiz -g aleksiz /var/www/aleksiz/{releases,shared,acme}
sudo install -d -m 700 -o aleksiz -g aleksiz /home/aleksiz/.ssh
```

The important paths are:

```text
/var/www/aleksiz/repo/       deployment-only Git checkout
/var/www/aleksiz/releases/  immutable built releases
/var/www/aleksiz/current    symlink to the live release
/var/www/aleksiz/shared/.env
/var/www/aleksiz/acme/      temporary Let's Encrypt challenges
```

## 3. Obtain The Blog Source

For a public blog repository:

```bash
sudo -u aleksiz git clone https://github.com/AJ1E/AleksiBlog.git /var/www/aleksiz/repo
```

For a private repository, create a deploy key as the `aleksiz` user, add only its public half to GitHub as a **read-only** deploy key, and configure `~aleksiz/.ssh/config` to use it. The private half stays only on ECS with `0600` permission.

## 4. Create Production Secrets

Create the environment file locally on ECS, then edit it in the terminal. This command creates a restrictive file; do not paste the values into shell history, Git, screenshots, or chat.

```bash
sudo -u aleksiz install -m 600 /dev/null /var/www/aleksiz/shared/.env
sudo -u aleksiz nano /var/www/aleksiz/shared/.env
```

Required entries:

```dotenv
SITE_AUTH_PASSWORD=<strong-unique-password>
SITE_AUTH_SECRET=<random-32-byte-base64url-value>
TRUST_PROXY_HEADERS=1
IP_RISK_BACKEND_URL=http://127.0.0.1:8788
```

Generate the secret only on ECS:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Do not set `SITE_AUTH_DISABLE=1`. Leave `PUBLIC_*_API_BASE_URL` unset. Leave AI/Beszel backend URLs unset until their private helpers are actually configured.

## 5. Install Services And Publish The First Release

Copy the reviewed templates, including the release script:

```bash
sudo install -m 644 /var/www/aleksiz/repo/deploy/systemd/aleksiz-astro.service /etc/systemd/system/aleksiz-astro.service
sudo install -m 644 /var/www/aleksiz/repo/deploy/systemd/aleksiz-ip-risk.service /etc/systemd/system/aleksiz-ip-risk.service
sudo install -m 644 /var/www/aleksiz/repo/deploy/systemd/aleksiz-notes-sync-helper.service /etc/systemd/system/aleksiz-notes-sync-helper.service
sudo install -m 644 /var/www/aleksiz/repo/deploy/systemd/aleksiz-notes-sync.service /etc/systemd/system/aleksiz-notes-sync.service
sudo install -m 644 /var/www/aleksiz/repo/deploy/nginx/aleksiz-proxy-headers.conf /etc/nginx/conf.d/aleksiz-proxy-headers.conf
sudo install -m 755 /var/www/aleksiz/repo/deploy/release.sh /usr/local/sbin/aleksiz-release
sudo install -m 755 /var/www/aleksiz/repo/deploy/notes-sync.sh /usr/local/sbin/aleksiz-notes-sync
sudo install -m 440 /var/www/aleksiz/repo/deploy/sudoers/aleksiz-notes-sync /etc/sudoers.d/aleksiz-notes-sync
sudo visudo -cf /etc/sudoers.d/aleksiz-notes-sync
sudo systemctl daemon-reload
sudo systemctl enable --now aleksiz-astro.service aleksiz-ip-risk.service aleksiz-notes-sync-helper.service
sudo /usr/local/sbin/aleksiz-release
```

`aleksiz-release` downloads the specified `main` commit, builds it in a new release directory, switches `current` only after a successful build, then restores the previous release if the local health check fails.

Verify the private services before proxying them:

```bash
curl -fsSI http://127.0.0.1:4322/
curl -fsS http://127.0.0.1:8788/api/ip-risk/health
sudo systemctl --no-pager --full status aleksiz-astro aleksiz-ip-risk
```

## 6. Bootstrap HTTP And Obtain TLS Certificates

Back up the Nginx configuration before changing it:

```bash
sudo cp -a /etc/nginx /etc/nginx.backup.$(date -u +%Y%m%d-%H%M%S)
sudo install -m 644 /var/www/aleksiz/current/deploy/nginx/aleksiz-bootstrap.conf /etc/nginx/conf.d/aleksiz.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Confirm HTTP works from an external network, then obtain the certificate using the webroot challenge:

```bash
sudo certbot certonly --webroot -w /var/www/aleksiz/acme -d aleksiz.com -d www.aleksiz.com --agree-tos --no-eff-email --email <your-notification-email>
sudo certbot renew --dry-run
```

The email belongs only in the interactive command on ECS, not in version control.

## 7. Enable HTTPS

The final template redirects HTTP to HTTPS, keeps ACME renewal reachable, rate-limits login, rewrites proxy headers, and starts with CSP report-only mode:

```bash
sudo install -m 644 /var/www/aleksiz/current/deploy/nginx/aleksiz.conf /etc/nginx/conf.d/aleksiz.conf
sudo nginx -t
sudo systemctl reload nginx
```

Do not enable HSTS on the first day. First verify both hostnames, certificate renewal, fonts/icons/maps, login, and external links. HSTS can be evaluated after the site has stayed healthy over HTTPS.

## 8. Release Checks

From the ECS:

```bash
curl -fsSI http://127.0.0.1:4322/
curl -fsSI -H 'Host: aleksiz.com' http://127.0.0.1/
curl -fsSI https://aleksiz.com/
sudo systemctl --no-pager --full status nginx aleksiz-astro aleksiz-ip-risk
sudo journalctl -u aleksiz-astro -u aleksiz-ip-risk -n 100 --no-pager
```

From a different network:

```powershell
curl.exe -I https://aleksiz.com/
curl.exe -I https://www.aleksiz.com/
Test-NetConnection aleksiz.com -Port 4322
Test-NetConnection aleksiz.com -Port 8788
```

Expected result: HTTPS returns a valid certificate and the latter two probes fail. In a browser, check home, blog, notes, projects, navigation, bucketlist/login protection, about, dark mode, and mobile layout. Log in once, open the four dashboard drawers, and verify the visitor-IP drawer reports the current visitor rather than the server address.

For the protected notes refresh, confirm that an anonymous `POST /api/notes/sync` returns `401`. Then log in, select **同步笔记** on `/notes`, wait for the page to reload, and confirm the displayed update time changes. The browser must never be given a GitHub credential or direct helper address.

## Rollback

List releases and point `current` at the previous known-good directory, then restart the services:

```bash
ls -lah /var/www/aleksiz/releases
sudo ln -sfn /var/www/aleksiz/releases/<known-good-release> /var/www/aleksiz/current
sudo systemctl restart aleksiz-astro aleksiz-ip-risk
curl -fsSI http://127.0.0.1:4322/
```

If Nginx was changed, restore the dated `/etc/nginx.backup.*` copy, run `sudo nginx -t`, and reload it only when the test passes.
