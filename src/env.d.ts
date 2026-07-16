/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    auth: {
      isAuthed: boolean;
    };
  }
}

interface ImportMetaEnv {
  readonly SITE_AUTH_PASSWORD?: string;
  readonly SITE_AUTH_SECRET?: string;
  readonly SITE_AUTH_DISABLE?: string;
  readonly AI_USAGE_BACKEND_URL?: string;
  readonly IP_RISK_BACKEND_URL?: string;
  readonly SERVER_STATUS_BACKEND_URL?: string;
  readonly NOTES_SYNC_BACKEND_URL?: string;
  readonly TRUST_PROXY_HEADERS?: string;
  readonly PUBLIC_AI_USAGE_API_BASE_URL?: string;
  readonly PUBLIC_IP_RISK_API_BASE_URL?: string;
  readonly PUBLIC_SERVER_STATUS_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
