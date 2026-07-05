import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AstroCookies } from "astro";

export const AUTH_COOKIE = "kai_auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type Token = {
  iat: number;
  exp: number;
  v: 1;
};

const PASSWORD_FILE = ".password";
const SECRET_FILE = ".password.secret";

function readLocalSecretFile(name: string): string | null {
  try {
    const path = resolve(process.cwd(), name);
    const raw = readFileSync(path, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function getSecret(): string {
  const secret =
    process.env.SITE_AUTH_SECRET || readLocalSecretFile(SECRET_FILE) || "";
  if (!secret || secret.length < 16) {
    throw new Error(
      `Missing auth secret. Either set SITE_AUTH_SECRET (≥ 16 chars) or write one to ${SECRET_FILE} at the project root.`
    );
  }
  return secret;
}

function getPassword(): string {
  const password =
    process.env.SITE_AUTH_PASSWORD || readLocalSecretFile(PASSWORD_FILE) || "";
  if (!password) {
    throw new Error(
      `Missing auth password. Either set SITE_AUTH_PASSWORD or write the password to ${PASSWORD_FILE} at the project root.`
    );
  }
  return password;
}

export function isAuthDisabled(): boolean {
  return process.env.SITE_AUTH_DISABLE === "1";
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payload).digest());
}

export function signToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const token: Token = { iat: now, exp: now + COOKIE_MAX_AGE_SECONDS, v: 1 };
  const body = base64url(JSON.stringify(token));
  return `${body}.${sign(body)}`;
}

export function verifyToken(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const [body, mac] = value.split(".");
  if (!body || !mac) return false;
  const expected = sign(body);
  if (expected.length !== mac.length) return false;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return false;
  } catch {
    return false;
  }
  try {
    const decoded = JSON.parse(fromBase64url(body).toString("utf8")) as Token;
    if (decoded.v !== 1) return false;
    return decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function checkPassword(submitted: string): boolean {
  const expected = getPassword();
  const a = Buffer.from(submitted ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // still spend ~constant time
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function setAuthCookie(cookies: AstroCookies, secure: boolean): void {
  cookies.set(AUTH_COOKIE, signToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookie(cookies: AstroCookies): void {
  cookies.delete(AUTH_COOKIE, { path: "/" });
}

export function readAuthFromCookies(cookies: AstroCookies): boolean {
  if (isAuthDisabled()) return true;
  const token = cookies.get(AUTH_COOKIE)?.value;
  return verifyToken(token);
}

export function generateSecretSuggestion(): string {
  return randomBytes(32).toString("base64url");
}
