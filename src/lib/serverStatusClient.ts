export type GpuInfo = {
  name: string;
  memUsedGb: number;
  memTotalGb: number;
  utilPct: number;
  powerW: number;
};

export type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "restarting" | "exited" | "other";
  health: number;
  cpuPct: number;
  memoryGb: number;
  netScore: number;
  updatedAt: string | null;
};

export type ServiceInfo = {
  id: string;
  name: string;
  stateCode: number;
  subCode: number;
  state: "running" | "exited" | "inactive" | "other";
  cpuPct: number;
  cpuPeakPct: number;
  memoryGb: number;
  memPeakGb: number;
  updatedAt: string | null;
};

export type LiveServer = {
  id: string;
  name: string;
  location: string;
  region: string;
  flag: string;
  lat: number;
  lon: number;
  provider: string;
  os: string;
  status: "online" | "warning" | "offline";
  cpu: number;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  disk: number;
  diskUsedGb: number;
  diskTotalGb: number;
  netRxBps: number;
  netTxBps: number;
  uptime: string;
  gpus: GpuInfo[];
  containers: ContainerInfo[];
  services: ServiceInfo[];
  dataUpdatedAt: string | null;
};

export type ServerOverview = {
  generatedAt: string;
  servers: LiveServer[];
  locked?: { perServerMetrics?: boolean; containers?: boolean; services?: boolean; gpus?: boolean };
};

function resolveBackendUrl(): string {
  // Same-origin Astro BFF (auth-gated) is the default. PUBLIC_* env override
  // exists as an escape hatch but bypasses the login gate.
  const fromEnv = String(import.meta.env.PUBLIC_SERVER_STATUS_API_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export function hasServerStatusBackend(): boolean {
  return resolveBackendUrl().length > 0;
}

export async function fetchServerOverview(): Promise<ServerOverview | null> {
  const base = resolveBackendUrl();
  if (!base) return null;
  const res = await fetch(`${base}/api/servers/overview`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Server status backend returned HTTP ${res.status}`);
  return res.json() as Promise<ServerOverview>;
}

export type StatRange = "1h" | "12h" | "24h" | "1w" | "30d";

export type StatPoint = {
  time: string;
  cpu: number;
  cpuPeak: number;
  ram: number;
  ramUsedGb: number;
  ramTotalGb: number;
  disk: number;
  diskUsedGb: number;
  diskTotalGb: number;
  netRxBps: number;
  netTxBps: number;
  gpuUtilPct: number;
  gpuMemUsedGb: number;
  gpuMemTotalGb: number;
  gpuPowerW: number;
  containerCount: number;
  containerCpuPct: number;
  containerMemUsedGb: number;
} | null;

export type ServerStats = {
  systemId: string;
  range: StatRange;
  points: StatPoint[];
};

export async function fetchServerStats(systemId: string, range: StatRange): Promise<ServerStats | null> {
  const base = resolveBackendUrl();
  if (!base) return null;
  const res = await fetch(`${base}/api/servers/${systemId}/stats?range=${range}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Server stats backend returned HTTP ${res.status}`);
  return res.json() as Promise<ServerStats>;
}

export function fmtBps(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1024 * 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  return `${(bps / 1024 / 1024 / 1024).toFixed(2)} GB/s`;
}
