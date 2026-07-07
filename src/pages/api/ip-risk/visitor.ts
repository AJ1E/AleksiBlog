import type { APIRoute } from "astro";
import { getBackendBase } from "../../../lib/bff";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const ip = getVisitorIp(request.headers);
  if (!ip) {
    return json(
      {
        unavailable: true,
        reason: "visitor-ip-unavailable",
        message: "当前环境没有提供可识别的公网访客 IP。部署到服务器并配置反向代理后即可显示真实访问 IP。",
      },
      200,
    );
  }

  const url = new URL("/api/ip-risk/lookup", `${getBackendBase("ip-risk")}/`);
  url.searchParams.set("ip", ip);

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      return json(
        {
          unavailable: true,
          reason: "ip-risk-helper-unreachable",
          message: `IP helper returned HTTP ${response.status}`,
        },
        200,
      );
    }
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return json(
      {
        unavailable: true,
        reason: "ip-risk-helper-unreachable",
        message: error instanceof Error ? error.message : "IP helper is unreachable",
      },
      200,
    );
  }
};

function getVisitorIp(headers: Headers): string {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
    headers.get("x-real-ip"),
    ...splitForwardedFor(headers.get("x-forwarded-for")),
    ...splitForwardedHeader(headers.get("forwarded")),
  ];

  return candidates.map(cleanIpCandidate).find(isPublicIp) || "";
}

function splitForwardedFor(value: string | null): string[] {
  return value ? value.split(",").map((item) => item.trim()) : [];
}

function splitForwardedHeader(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .flatMap((group) => group.split(";"))
    .map((part) => part.trim())
    .filter((part) => part.toLowerCase().startsWith("for="))
    .map((part) => part.slice(4));
}

function cleanIpCandidate(value: string | null | undefined): string {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  if (!raw) return "";
  if (raw.startsWith("[") && raw.includes("]")) return raw.slice(1, raw.indexOf("]"));
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(raw)) return raw.slice(0, raw.lastIndexOf(":"));
  return raw;
}

function isPublicIp(value: string): boolean {
  if (!value) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return isPublicIpv4(value);
  if (value.includes(":")) return isPublicIpv6(value);
  return false;
}

function isPublicIpv4(value: string): boolean {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function isPublicIpv6(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:")) return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  return true;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
