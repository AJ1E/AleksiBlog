# IP Intelligence Provider Replacement

## Goal

Restore reliable visitor IP location, network attribution, and risk signals on the production ECS without exposing helper ports or full visitor IPs in the public UI.

## Cause

The original Net.Coffee and Cloudflare trace endpoints time out from the production ECS, while general outbound HTTPS works. This is an upstream reachability problem, not a browser or visitor-IP parsing problem.

## Change

- Use IPinfo over HTTPS for IP, location, timezone, and ASN fallback data.
- Use Proxycheck over HTTPS for VPN, proxy, Tor, hosting, and risk signals.
- Keep a bounded five-minute, per-IP in-memory cache and allow either provider to fail independently.
- Continue routing all browser requests through Astro and the loopback helper. The public UI keeps masking full IP addresses.

## Verification

- Confirm both providers respond from ECS before deployment.
- Run `pnpm build` and `pnpm audit --prod`.
- Confirm `/api/ip-risk/visitor` returns a populated, masked public response from an external network.
- Confirm no helper port is publicly reachable.
