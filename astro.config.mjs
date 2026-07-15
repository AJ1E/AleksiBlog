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
  // Keep Astro's SSR form-origin protection enabled. Auth JSON endpoints also
  // validate Nginx's overwritten forwarding headers on loopback deployments.
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
