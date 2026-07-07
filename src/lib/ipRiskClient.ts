export type IpRiskSnapshot = {
  generatedAt: string;
  observedVia: string;
  egress: {
    ip: string;
    country: string;
    countryCode: string;
    region: string;
    city: string;
    timezone: string | null;
    colo: string | null;
    loc: string | null;
  };
  network: {
    asn: number | null;
    asLabel: string;
    asName: string;
    isp: string;
    companyName: string;
    companyType: string;
    attribute: "residential" | "datacenter" | "mobile" | "business" | "unknown";
    rdns: string | null;
    cidr: string | null;
  };
  risk: {
    trustScore: number | null;
    trustLevel: "high" | "medium" | "low" | "unknown";
    riskScore: number | null;
    riskLevel: "high" | "medium" | "low" | "unknown";
    flags: {
      datacenter: boolean;
      residential: boolean;
      vpn: boolean;
      proxy: boolean;
      tor: boolean;
      crawler: boolean;
      abuser: boolean;
      mobile: boolean;
    };
    abuserScore: string;
    reputationThreat: number | null;
    aiVerdict:
      | {
          label?: string;
          confidence?: number;
          reasoning?: string;
        }
      | null;
  };
  traces: {
    claude: {
      host: string;
      ip: string;
      colo: string | null;
      loc: string | null;
      warp: string;
      gateway: string;
      ts: string;
    };
    cloudflare: {
      host: string;
      ip: string;
      colo: string | null;
      loc: string | null;
      warp: string;
      gateway: string;
      ts: string;
    };
  };
  sources: {
    geoip: string;
    iprisk: string;
    trace: string;
  };
  locked?: { fullIp?: boolean; rdns?: boolean; cidr?: boolean };
};

export type VisitorIpRiskUnavailable = {
  unavailable: true;
  reason: string;
  message: string;
};

export type VisitorIpRiskResponse = IpRiskSnapshot | VisitorIpRiskUnavailable;

function resolveBackendUrl() {
  const fromEnv = String(import.meta.env.PUBLIC_IP_RISK_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function hasIpRiskBackend() {
  return resolveBackendUrl().length > 0;
}

export async function fetchIpRiskSnapshot(): Promise<IpRiskSnapshot> {
  return fetchSnapshot("/api/ip-risk/egress", { method: "GET" });
}

export async function fetchVisitorIpRiskSnapshot(): Promise<VisitorIpRiskResponse> {
  return fetchSnapshot<VisitorIpRiskResponse>("/api/ip-risk/visitor", { method: "GET" });
}

export async function refreshIpRiskSnapshot(): Promise<IpRiskSnapshot> {
  return fetchSnapshot("/api/ip-risk/refresh", { method: "POST" });
}

export function isVisitorIpRiskUnavailable(value: VisitorIpRiskResponse): value is VisitorIpRiskUnavailable {
  return "unavailable" in value && value.unavailable === true;
}

async function fetchSnapshot<T = IpRiskSnapshot>(path: string, init: RequestInit) {
  const baseUrl = resolveBackendUrl();
  if (!baseUrl) {
    throw new Error("IP risk backend is not configured");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`IP risk backend returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
