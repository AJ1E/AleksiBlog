# IP Intelligence Provider Replacement

## Goal

Restore reliable visitor IP location, network attribution, and risk signals on the production ECS without exposing helper ports or full visitor IPs in the public UI.

## Cause

The original Net.Coffee and Cloudflare trace endpoints time out from the production ECS, while general outbound HTTPS works. This is an upstream reachability problem, not a browser or visitor-IP parsing problem.

## Current Change

- Use Net.Coffee as the preferred location source and IPinfo as the global country, ASN, ISP and timezone fallback.
- Use Proxycheck only for VPN, proxy, Tor, hosting, and risk signals. It must not override the displayed city.
- Query Net.Coffee as a short-timeout supplementary source; a timeout or failure must not block the response.
- Keep a bounded five-minute, per-IP in-memory cache and allow every provider to fail independently.
- UI and privacy text must describe city data as an IP exit location, not a visitor's physical location.
- Continue routing all browser requests through Astro and the loopback helper. The public UI keeps masking full IP addresses.

## Verification

- Confirm the helper responds with a masked visitor response when a provider is unavailable.
- Confirm Chinese and overseas IPv4 addresses continue to receive a location result through the Net.Coffee/IPinfo fallback.
- Run `pnpm build` and `pnpm audit --prod`.
- Confirm `/api/ip-risk/visitor` returns a populated, masked public response from an external network.
- Confirm no helper port is publicly reachable.
