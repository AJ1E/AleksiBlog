import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import node from "@astrojs/node";
import { unified } from "@astrojs/markdown-remark";

// All `/api/*` paths used to be Vite-proxied directly to the local helper
// servers (8787 / 8788 / 8789). They are now handled by Astro server endpoints
// under src/pages/api/** which inject the auth check before forwarding.
export default defineConfig({
  integrations: [mdx(), react()],
  devToolbar: {
    enabled: false,
  },
  // Keep the existing remark/rehype rendering pipeline during the Astro 7
  // migration so article, note, and project Markdown output stays stable.
  markdown: {
    processor: unified(),
  },
  output: "server",
  adapter: node({ mode: "standalone" }),
  // Reverse proxies (Caddy / nginx in front of this site) often rewrite the
  // Origin header, which trips Astro's default same-origin POST check. Disable
  // it — the auth cookie is HttpOnly + SameSite=Lax, which already blocks
  // cross-site form CSRF for state-changing requests.
  security: { checkOrigin: true },
  server: {
    host: true,
    port: 4321
  },
  preview: {
    host: true,
    port: 4321
  }
});
