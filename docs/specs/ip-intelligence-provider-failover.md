# IP Intelligence Provider Replacement

## Goal

Restore reliable visitor IP location, network attribution, and risk signals on the production ECS without exposing helper ports or full visitor IPs in the public UI.

## Cause

The original Net.Coffee and Cloudflare trace endpoints time out from the production ECS, while general outbound HTTPS works. This is an upstream reachability problem, not a browser or visitor-IP parsing problem.

## Current Change

- Use IPinfo over HTTPS for global country, ASN, ISP and timezone fallback data.
- Use Proxycheck only for VPN, proxy, Tor, hosting, and risk signals. It must not override the displayed city.
- Query Net.Coffee as a short-timeout supplementary source; a timeout or failure must not block the response.
- When `AMAP_WEB_SERVICE_KEY` is set on ECS and the IP is Chinese IPv4, use AMap as the preferred city/province source. The key stays only in `/var/www/aleksiz/shared/.env` and is never exposed to the browser.
- Keep a bounded five-minute, per-IP in-memory cache and allow every provider to fail independently.
- UI and privacy text must describe city data as an IP exit location, not a visitor's physical location.
- Continue routing all browser requests through Astro and the loopback helper. The public UI keeps masking full IP addresses.

## Verification

- Confirm the helper responds with a masked visitor response when a provider is unavailable.
- With the server-only AMap key configured, confirm a Chinese IPv4 records AMap as the active location source; without it, confirm the IPinfo/Net.Coffee fallback remains usable.
- Run `pnpm build` and `pnpm audit --prod`.
- Confirm `/api/ip-risk/visitor` returns a populated, masked public response from an external network.
- Confirm no helper port is publicly reachable.
