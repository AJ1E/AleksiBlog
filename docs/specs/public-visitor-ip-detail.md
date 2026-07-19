# Public Visitor IP Detail

## Goal

Allow any visitor to open the homepage visitor-IP detail drawer without logging in. The drawer describes only the current requester's own IP-derived location, network category, and risk signals.

## Scope

- Remove the login gate from the homepage visitor-IP card.
- Update login copy so it no longer says visitor IP access requires login.
- Keep the displayed IP masked in the UI.
- Make the IP helper tolerant of a temporary single-provider failure and avoid repeated parallel lookups for the same visitor during a short bounded cache window.

## Security Boundaries

- Astro remains the only public entry point; the IP helper stays loopback-only.
- Nginx overwrites `X-Real-IP`; the endpoint does not trust browser-supplied forwarding headers.
- The result is `Cache-Control: no-store` at the public response boundary.
- The helper cache is process-memory only, bounded, and expires after five minutes. It is not written to disk or Git.
- This does not expose server monitoring, subscription details, AI usage details, or other visitors' data.

## Acceptance

- The login page has no empty error alert before an actual failed login.
- The IP card opens its detail drawer for signed-out visitors.
- A single upstream data-provider timeout does not produce an HTTP 500 visitor-IP response.
- `pnpm build` passes; production deployment verifies the login view, public IP drawer, and helper health.
