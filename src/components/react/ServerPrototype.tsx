import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ContainerInfo,
  type ServiceInfo,
  fetchServerOverview,
  fetchServerStats,
  fmtBps,
  type GpuInfo,
  hasServerStatusBackend,
  type LiveServer,
  type StatPoint,
  type StatRange,
} from "../../lib/serverStatusClient";

type Server = {
  id: string;
  name: string;
  loc: string;
  flag: string;
  region?: string;
  provider?: string;
  lat?: number;
  lon?: number;
  status: "online" | "warning" | "offline" | "placeholder";
  uptime: string;
  cpu: number;
  ram: number;
  ramUsedGb?: number;
  ramTotalGb?: number;
  disk: number;
  diskUsedGb?: number;
  diskTotalGb?: number;
  netIn: string;
  netOut: string;
  os: string;
  cores: number;
  ramTotal: string;
  gpus?: GpuInfo[];
  containers?: ContainerInfo[];
  services?: ServiceInfo[];
  dataUpdatedAt?: string | null;
};

function normalizeServerRegion(value?: string | null): string {
  return value === "中国大陆" ? "China" : value ?? "";
}

function isServerOnline(server: Pick<Server, "status">): boolean {
  return server.status === "online" || server.status === "warning";
}

function getInitialServerId(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get("server") || fallback;
}

function liveToServer(s: LiveServer): Server {
  return {
    id: s.id,
    name: s.name,
    loc: normalizeServerRegion(s.location),
    flag: s.flag,
    region: normalizeServerRegion(s.region),
    provider: s.provider,
    lat: s.lat,
    lon: s.lon,
    status: s.status,
    uptime: s.uptime,
    cpu: s.cpu,
    ram: s.ram,
    ramUsedGb: s.ramUsedGb,
    ramTotalGb: s.ramTotalGb,
    disk: s.disk,
    diskUsedGb: s.diskUsedGb,
    diskTotalGb: s.diskTotalGb,
    netIn: fmtBps(s.netRxBps),
    netOut: fmtBps(s.netTxBps),
    os: s.os,
    cores: 0,
    ramTotal: `${s.ramTotalGb} GB`,
    gpus: s.gpus,
    containers: s.containers,
    services: s.services,
    dataUpdatedAt: s.dataUpdatedAt,
  };
}

// ── Dark toggle ──────────────────────────────────────────────────────────────

function DarkToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem("kai-theme", "dark");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("kai-theme", "light");
    }
  }
  return (
    <button
      onClick={toggle}
      title={dark ? "切换亮色" : "切换暗色"}
      style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "var(--text-muted)" }}
    >
      {dark ? "☀" : "◑"}
    </button>
  );
}

// ── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid var(--border-light)", background: "var(--bg-card)", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

type PanelSettings = {
  showStatPills: boolean;
  showResourceCards: boolean;
  showNetworkCards: boolean;
  showSystemCard: boolean;
  showTrendCharts: boolean;
  showGpuSection: boolean;
  showGpuCharts: boolean;
  showDockerSection: boolean;
  showDockerCharts: boolean;
  showServiceSection: boolean;
};

const PANEL_SETTINGS_KEY = "kai-server-panel-settings-v2";

const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  showStatPills: true,
  showResourceCards: true,
  showNetworkCards: true,
  showSystemCard: true,
  showTrendCharts: true,
  showGpuSection: true,
  showGpuCharts: true,
  showDockerSection: true,
  showDockerCharts: true,
  showServiceSection: true,
};

function MetricBar({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  const clamped = Math.max(0, Math.min(value, 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, gap: 12 }}>
        <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontWeight: 600, fontFamily: "JetBrains Mono", color: "var(--text)" }}>{note}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-2)", overflow: "hidden", border: "1px solid var(--border-light)" }}>
        <div style={{ height: "100%", width: `${clamped}%`, background: color, borderRadius: 999, transition: "width 0.25s ease" }} />
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        borderTop: "1px solid var(--border-light)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{ marginTop: 2 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2, lineHeight: 1.5 }}>{hint}</div>
      </div>
    </label>
  );
}

function fmtGb(gb: number): string {
  if (!Number.isFinite(gb)) return "—";
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

function fmtWatts(powerW: number): string {
  if (!Number.isFinite(powerW)) return "—";
  return `${powerW.toFixed(powerW >= 100 ? 0 : 1)} W`;
}

function fmtRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} 天前`;
}

function summarizeGpu(gpus?: GpuInfo[]) {
  const list = gpus ?? [];
  const count = list.length;
  const totalMemUsedGb = list.reduce((sum, gpu) => sum + gpu.memUsedGb, 0);
  const totalMemTotalGb = list.reduce((sum, gpu) => sum + gpu.memTotalGb, 0);
  const totalPowerW = list.reduce((sum, gpu) => sum + gpu.powerW, 0);
  const avgUtilPct = count > 0
    ? list.reduce((sum, gpu) => sum + gpu.utilPct, 0) / count
    : 0;
  return {
    count,
    totalMemUsedGb,
    totalMemTotalGb,
    totalPowerW,
    avgUtilPct,
  };
}

function summarizeContainers(containers?: ContainerInfo[]) {
  const list = containers ?? [];
  const running = list.filter((container) => container.state === "running").length;
  const restarting = list.filter((container) => container.state === "restarting").length;
  const exited = list.filter((container) => container.state === "exited").length;
  const healthy = list.filter((container) => container.health === 2).length;
  const totalCpuPct = roundTo(list.reduce((sum, container) => sum + container.cpuPct, 0), 2);
  const totalMemoryGb = roundTo(list.reduce((sum, container) => sum + container.memoryGb, 0), 2);
  return {
    total: list.length,
    running,
    restarting,
    exited,
    healthy,
    totalCpuPct,
    totalMemoryGb,
  };
}

function summarizeServices(services?: ServiceInfo[]) {
  const list = services ?? [];
  const running = list.filter((service) => service.state === "running").length;
  const exited = list.filter((service) => service.state === "exited").length;
  const inactive = list.filter((service) => service.state === "inactive").length;
  const totalMemoryGb = roundTo(list.reduce((sum, service) => sum + service.memoryGb, 0), 2);
  const totalCpuPeakPct = roundTo(list.reduce((sum, service) => sum + service.cpuPeakPct, 0), 2);
  return {
    total: list.length,
    running,
    exited,
    inactive,
    totalMemoryGb,
    totalCpuPeakPct,
  };
}

function roundTo(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function containerStateColor(state: ContainerInfo["state"]): string {
  if (state === "running") return "var(--green)";
  if (state === "restarting") return "var(--yellow)";
  if (state === "exited") return "var(--red)";
  return "var(--text-faint)";
}

function serviceStateColor(state: ServiceInfo["state"]): string {
  if (state === "running") return "var(--green)";
  if (state === "inactive") return "var(--yellow)";
  if (state === "exited") return "var(--red)";
  return "var(--text-faint)";
}

function ServiceStateLabel(state: ServiceInfo["state"]): string {
  if (state === "running") return "running";
  if (state === "inactive") return "inactive";
  if (state === "exited") return "exited";
  return "other";
}

function DockerPanel({ containers }: { containers: ContainerInfo[] }) {
  const summary = summarizeContainers(containers);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"memory" | "cpu" | "name" | "status">("memory");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visibleContainers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? containers.filter((container) =>
          container.name.toLowerCase().includes(query) ||
          container.image.toLowerCase().includes(query) ||
          container.status.toLowerCase().includes(query),
        )
      : containers;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "memory") return b.memoryGb - a.memoryGb || b.cpuPct - a.cpuPct;
      if (sort === "cpu") return b.cpuPct - a.cpuPct || b.memoryGb - a.memoryGb;
      if (sort === "status") return a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [containers, search, sort]);

  const visibleSlice = showAll ? 16 : 6;
  const maxMemoryGb = visibleContainers.reduce((max, container) => Math.max(max, container.memoryGb), 0);

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-purple)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" }}>DOCKER</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>
          {summary.running}/{summary.total} running · {fmtGb(summary.totalMemoryGb)} RAM
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        {[
          { label: "运行中", value: `${summary.running}`, sub: "running", color: "var(--green)" },
          { label: "重启中", value: `${summary.restarting}`, sub: "restarting", color: "var(--yellow)" },
          { label: "已退出", value: `${summary.exited}`, sub: "exited", color: "var(--red)" },
          { label: "总 CPU", value: `${summary.totalCpuPct}%`, sub: "containers", color: "var(--accent)" },
          { label: "总内存", value: fmtGb(summary.totalMemoryGb), sub: "containers", color: "var(--accent-teal)" },
          { label: "健康检查", value: `${summary.healthy}`, sub: "healthy", color: "var(--accent-purple)" },
        ].map((item) => (
          <div key={item.label} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color }} />
              <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.05em" }}>{item.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "DM Serif Display", lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, fontFamily: "JetBrains Mono" }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="搜索容器名 / 镜像"
          style={{ flex: "1 1 220px", minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-2)", color: "var(--text)", fontSize: 12, outline: "none" }}
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.currentTarget.value as typeof sort)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-2)", color: "var(--text)", fontSize: 12 }}
        >
          <option value="memory">按内存</option>
          <option value="cpu">按 CPU</option>
          <option value="name">按名称</option>
          <option value="status">按状态</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleContainers.slice(0, visibleSlice).map((container) => {
          const isOpen = openId === container.id;
          const stateTone = containerStateColor(container.state);
          const healthLabel = container.health === 2 ? "healthy" : container.health === 1 ? "warning" : "none";
          const memoryPct = maxMemoryGb > 0 ? (container.memoryGb / maxMemoryGb) * 100 : 0;
          return (
            <div key={container.id} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: stateTone, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{container.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {container.image}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: stateTone, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{container.state}</span>
                  <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>{healthLabel}</span>
                </div>
                <button
                  onClick={() => setOpenId(isOpen ? null : container.id)}
                  style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}
                >
                  {isOpen ? "收起" : "详情"}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <MetricBar label="CPU" value={Math.min(container.cpuPct, 100)} note={`${container.cpuPct}%`} color="var(--accent)" />
                <MetricBar label="内存" value={memoryPct} note={fmtGb(container.memoryGb)} color="var(--accent-teal)" />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 10, marginTop: 8, color: "var(--text-muted)", fontFamily: "JetBrains Mono", flexWrap: "wrap" }}>
                <span>NET {container.netScore}</span>
                <span>更新 {fmtRelativeDate(container.updatedAt)}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.05em" }}>运行状态</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono", lineHeight: 1.6, wordBreak: "break-word" }}>
                    {container.status}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono" }}>
                    <span>镜像 {container.image}</span>
                    <span>健康 {healthLabel}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visibleContainers.length === 0 && (
          <div style={{ padding: "18px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            没有匹配的容器
          </div>
        )}
      </div>
      {visibleContainers.length > visibleSlice && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            onClick={() => setShowAll((value) => !value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}
          >
            {showAll ? "收起容器列表" : `展开更多 (${visibleContainers.length - visibleSlice})`}
          </button>
        </div>
      )}
    </div>
  );
}

function ServicesPanel({ services }: { services: ServiceInfo[] }) {
  const summary = summarizeServices(services);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = query ? services.filter((service) => service.name.toLowerCase().includes(query)) : services;
    if (onlyActive) filtered = filtered.filter((service) => service.state === "running" || service.cpuPeakPct > 0 || service.memoryGb > 0);
    return [...filtered].sort((a, b) => b.memoryGb - a.memoryGb || b.cpuPeakPct - a.cpuPeakPct || a.name.localeCompare(b.name));
  }, [onlyActive, search, services]);

  const visibleSlice = showAll ? 16 : 6;
  const maxMemoryGb = visibleServices.reduce((max, service) => Math.max(max, service.memoryGb), 0);
  const maxCpuPeakPct = visibleServices.reduce((max, service) => Math.max(max, service.cpuPeakPct), 0);

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-teal)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" }}>SYSTEMD</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>
          {summary.running}/{summary.total} active · {fmtGb(summary.totalMemoryGb)} RAM
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        {[
          { label: "运行中", value: `${summary.running}`, sub: "running", color: "var(--green)" },
          { label: "已退出", value: `${summary.exited}`, sub: "oneshot", color: "var(--red)" },
          { label: "未激活", value: `${summary.inactive}`, sub: "inactive", color: "var(--yellow)" },
          { label: "峰值 CPU", value: `${summary.totalCpuPeakPct}%`, sub: "sum", color: "var(--accent)" },
          { label: "当前内存", value: fmtGb(summary.totalMemoryGb), sub: "services", color: "var(--accent-teal)" },
        ].map((item) => (
          <div key={item.label} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color }} />
              <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, letterSpacing: "0.05em" }}>{item.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "DM Serif Display", lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, fontFamily: "JetBrains Mono" }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="搜索服务名"
          style={{ flex: "1 1 220px", minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-2)", color: "var(--text)", fontSize: 12, outline: "none" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.currentTarget.checked)} />
          仅看活跃 / 有资源占用
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleServices.slice(0, visibleSlice).map((service) => {
          const tone = serviceStateColor(service.state);
          const memoryPct = maxMemoryGb > 0 ? (service.memoryGb / maxMemoryGb) * 100 : 0;
          const cpuPeakPct = maxCpuPeakPct > 0 ? (service.cpuPeakPct / maxCpuPeakPct) * 100 : 0;
          return (
            <div key={service.id} style={{ padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: tone, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{service.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono", marginTop: 2 }}>
                    state={service.stateCode} sub={service.subCode}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: tone, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {ServiceStateLabel(service.state)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <MetricBar label="峰值 CPU" value={cpuPeakPct} note={`${service.cpuPeakPct}%`} color="var(--accent)" />
                <MetricBar label="内存" value={memoryPct} note={fmtGb(service.memoryGb)} color="var(--accent-teal)" />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 10, marginTop: 8, color: "var(--text-muted)", fontFamily: "JetBrains Mono", flexWrap: "wrap" }}>
                <span>CPU {service.cpuPct}%</span>
                <span>峰值 {fmtGb(service.memPeakGb)}</span>
              </div>
            </div>
          );
        })}
        {visibleServices.length === 0 && (
          <div style={{ padding: "18px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            没有匹配的服务
          </div>
        )}
      </div>
      {visibleServices.length > visibleSlice && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            onClick={() => setShowAll((value) => !value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}
          >
            {showAll ? "收起服务列表" : `展开更多 (${visibleServices.length - visibleSlice})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Time formatting helpers ──────────────────────────────────────────────────

function fmtXTick(isoStr: string, range: StatRange): string {
  const d = new Date(isoStr);
  if (range === "1h") {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "12h" || range === "24h") {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtTooltipTime(isoStr: string | undefined, range: StatRange): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (range === "1h" || range === "12h" || range === "24h") {
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit" });
}

function fmtNetTooltip(bps: number): string {
  return fmtBps(bps);
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  range,
  yFmt,
  series,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  range: StatRange;
  yFmt: (v: number) => string;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const map: Record<string, number> = {};
  for (const p of payload) map[p.name] = p.value;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 10, padding: "8px 12px", fontSize: 11, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ color: "var(--text-faint)", marginBottom: 6, fontFamily: "JetBrains Mono" }}>{fmtTooltipTime(label, range)}</div>
      {series.map((s) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
          <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          <span style={{ color: "var(--text)", fontWeight: 600, fontFamily: "JetBrains Mono" }}>
            {map[s.key] != null ? yFmt(map[s.key]) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Metric chart card ─────────────────────────────────────────────────────────

function MetricChart({
  title,
  points,
  series,
  yDomain,
  yFmt,
  range,
  height = 120,
}: {
  title: string;
  points: StatPoint[];
  series: Array<{ key: keyof Exclude<StatPoint, null>; label: string; color: string; dashed?: boolean }>;
  yDomain?: [number | "auto", number | "auto"];
  yFmt: (v: number) => string;
  range: StatRange;
  height?: number;
}) {
  const data = points.map((p) => {
    if (p === null) return null;
    const row: Record<string, string | number | null> = { time: p.time };
    for (const s of series) row[s.key as string] = p[s.key] as number;
    return row;
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === "dark");
    const obs = new MutationObserver(() => setIsDark(document.documentElement.dataset.theme === "dark"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tickColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "14px 16px 10px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: series[0].color }} />
        {title}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {series.map((s) => (
            <span key={s.key as string} style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.7 }}>
              <span style={{ width: 16, height: 2, borderRadius: 1, background: s.color, display: "inline-block", borderBottom: s.dashed ? "2px dashed" : undefined }} />
              <span style={{ fontSize: 10 }}>{s.label}</span>
            </span>
          ))}
        </span>
      </div>
      {data.length === 0 ? (
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: 12 }}>暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key as string} id={`grad-${String(s.key)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => fmtXTick(String(v), range)}
              tick={{ fontSize: 10, fill: tickColor, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={yDomain || [0, "auto"]}
              tickFormatter={yFmt}
              tick={{ fontSize: 10, fill: tickColor, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...props}
                  range={range}
                  yFmt={yFmt}
                  series={series.map((s) => ({ key: s.key as string, label: s.label, color: s.color }))}
                />
              )}
            />
            {series.map((s) => (
              <Area
                key={s.key as string}
                type="monotone"
                dataKey={s.key as string}
                stroke={s.color}
                strokeWidth={1.5}
                strokeDasharray={s.dashed ? "4 3" : undefined}
                fill={s.dashed ? "none" : `url(#grad-${String(s.key)})`}
                dot={false}
                activeDot={{ r: 3, fill: s.color }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Range selector ────────────────────────────────────────────────────────────

const RANGES: { label: string; value: StatRange }[] = [
  { label: "1小时", value: "1h" },
  { label: "12小时", value: "12h" },
  { label: "24小时", value: "24h" },
  { label: "1周", value: "1w" },
  { label: "30天", value: "30d" },
];

function RangeSelector({ range, onChange }: { range: StatRange; onChange: (r: StatRange) => void }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          style={{
            padding: "4px 10px",
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 600,
            border: "1px solid",
            borderColor: range === r.value ? "var(--accent)" : "transparent",
            background: range === r.value ? "var(--accent-light)" : "transparent",
            color: range === r.value ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ── Charts panel ──────────────────────────────────────────────────────────────

function ChartsPanel({
  srv,
  range,
  showTrendCharts,
  showGpuCharts,
  showDockerCharts,
}: {
  srv: Server;
  range: StatRange;
  showTrendCharts: boolean;
  showGpuCharts: boolean;
  showDockerCharts: boolean;
}) {
  const [points, setPoints] = useState<StatPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const hasGpu = (srv.gpus?.length ?? 0) > 0;
  const hasContainers = (srv.containers?.length ?? 0) > 0;
  const shouldShow = showTrendCharts || (showGpuCharts && hasGpu) || (showDockerCharts && hasContainers);

  useEffect(() => {
    if (!shouldShow) {
      setLoading(false);
      setPoints([]);
      return;
    }
    setLoading(true);
    setPoints(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetchServerStats(srv.id, range)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPoints(data?.points ?? []);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPoints([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [range, shouldShow, srv.id]);

  const pct = (v: number) => `${v}%`;
  const net = (v: number) => fmtBps(v);
  const gb = (v: number) => fmtGb(v);
  const watts = (v: number) => fmtWatts(v);

  if (!shouldShow) return null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-faint)", fontSize: 13 }}>
        加载图表数据…
      </div>
    );
  }

  const pts = points ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showTrendCharts && (
        <>
          <MetricChart
            title="CPU 占用"
            points={pts}
            series={[
              { key: "cpu", label: "平均", color: "var(--accent)" },
              { key: "cpuPeak", label: "峰值", color: "var(--accent)", dashed: true },
            ]}
            yDomain={[0, 100]}
            yFmt={pct}
            range={range}
            height={130}
          />
          <MetricChart
            title="内存占用"
            points={pts}
            series={[{ key: "ram", label: "使用率", color: "var(--teal)" }]}
            yDomain={[0, 100]}
            yFmt={pct}
            range={range}
            height={110}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <MetricChart
              title="磁盘占用"
              points={pts}
              series={[{ key: "disk", label: "使用率", color: "var(--purple)" }]}
              yDomain={[0, 100]}
              yFmt={pct}
              range={range}
              height={100}
            />
            <MetricChart
              title="网络流量"
              points={pts}
              series={[
                { key: "netRxBps", label: "↓入", color: "var(--green)" },
                { key: "netTxBps", label: "↑出", color: "var(--blue)" },
              ]}
              yDomain={[0, "auto"]}
              yFmt={net}
              range={range}
              height={100}
            />
          </div>
        </>
      )}
      {showGpuCharts && hasGpu && (
        <>
          <MetricChart
            title="GPU 占用"
            points={pts}
            series={[{ key: "gpuUtilPct", label: "平均占用", color: "var(--yellow)" }]}
            yDomain={[0, 100]}
            yFmt={pct}
            range={range}
            height={110}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <MetricChart
              title="显存占用"
              points={pts}
              series={[{ key: "gpuMemUsedGb", label: "已用 VRAM", color: "var(--accent-teal)" }]}
              yDomain={[0, "auto"]}
              yFmt={gb}
              range={range}
              height={100}
            />
            <MetricChart
              title="GPU 功耗"
              points={pts}
              series={[{ key: "gpuPowerW", label: "总功耗", color: "var(--accent)" }]}
              yDomain={[0, "auto"]}
              yFmt={watts}
              range={range}
              height={100}
            />
          </div>
        </>
      )}
      {showDockerCharts && hasContainers && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <MetricChart
            title="Docker 容器数量"
            points={pts}
            series={[{ key: "containerCount", label: "容器数", color: "var(--accent-purple)" }]}
            yDomain={[0, "auto"]}
            yFmt={(v) => `${Math.round(v)}`}
            range={range}
            height={100}
          />
          <MetricChart
            title="Docker 内存"
            points={pts}
            series={[{ key: "containerMemUsedGb", label: "总内存", color: "var(--accent-teal)" }]}
            yDomain={[0, "auto"]}
            yFmt={gb}
            range={range}
            height={100}
          />
          <MetricChart
            title="Docker CPU"
            points={pts}
            series={[{ key: "containerCpuPct", label: "总 CPU", color: "var(--accent)" }]}
            yDomain={[0, "auto"]}
            yFmt={pct}
            range={range}
            height={100}
          />
        </div>
      )}
    </div>
  );
}

// ── Snapshot of current metrics ───────────────────────────────────────────────

function MetricSnapshot({ srv, settings }: { srv: Server; settings: PanelSettings }) {
  const SC: Record<string, string> = { online: "var(--green)", warning: "var(--yellow)", offline: "var(--red)", placeholder: "var(--text-faint)" };
  const gpus = srv.gpus ?? [];
  const containers = srv.containers ?? [];
  const services = srv.services ?? [];
  const gpuSummary = summarizeGpu(gpus);
  const containerSummary = summarizeContainers(containers);
  const serviceSummary = summarizeServices(services);
  const cards: Array<{ label: string; value: string; sub: string; color: string }> = [];

  if (settings.showResourceCards) {
    cards.push(
      { label: "CPU 占用", value: `${srv.cpu}%`, sub: "实时 CPU 负载", color: "var(--accent)" },
      { label: "内存占用", value: `${srv.ram}%`, sub: srv.ramUsedGb != null ? `${srv.ramUsedGb} / ${srv.ramTotalGb} GB` : srv.ramTotal, color: "var(--teal)" },
      { label: "磁盘占用", value: `${srv.disk}%`, sub: srv.diskUsedGb != null ? `${srv.diskUsedGb} / ${srv.diskTotalGb} GB` : "本地存储", color: "var(--purple)" },
    );
  }

  if (settings.showNetworkCards) {
    cards.push(
      { label: "↓ 入流量", value: srv.netIn, sub: "实时速率", color: "var(--green)" },
      { label: "↑ 出流量", value: srv.netOut, sub: "实时速率", color: "var(--blue)" },
    );
  }

  if (settings.showSystemCard) {
    cards.push({
      label: "系统信息",
      value: srv.os || srv.loc,
      sub: [srv.flag, srv.loc, srv.provider].filter(Boolean).join(" "),
      color: "var(--yellow)",
    });
    if (srv.dataUpdatedAt) {
      cards.push({
        label: "数据刷新",
        value: fmtRelativeDate(srv.dataUpdatedAt),
        sub: srv.dataUpdatedAt,
        color: "var(--text-muted)",
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {settings.showStatPills && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatPill label="运行时间" value={srv.uptime} color="var(--green)" />
          <StatPill label="CPU" value={`${srv.cpu}%`} color="var(--accent)" />
          <StatPill label="内存" value={`${srv.ram}%`} color="var(--teal)" />
          <StatPill label="磁盘" value={`${srv.disk}%`} color="var(--purple)" />
          <StatPill label="状态" value={{ online: "正常运行", warning: "在线 · 负载告警", offline: "已离线", placeholder: "占位" }[srv.status]} color={SC[srv.status]} />
          {gpuSummary.count > 0 && settings.showGpuSection && (
            <StatPill label="GPU" value={`${gpuSummary.count} 张`} color="var(--yellow)" />
          )}
        </div>
      )}

      {cards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {cards.map(({ label, value, sub, color }) => (
          <div
            key={label}
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "18px 18px 14px", boxShadow: "var(--shadow-sm)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "DM Serif Display", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3, fontFamily: "JetBrains Mono" }}>{sub}</div>
          </div>
          ))}
        </div>
      )}

      {settings.showGpuSection && gpuSummary.count > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--yellow)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" }}>GPU</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>
              {gpuSummary.count} 张卡 · VRAM {fmtGb(gpuSummary.totalMemUsedGb)}/{fmtGb(gpuSummary.totalMemTotalGb)}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {gpus.map((gpu, index) => {
              const memPct = gpu.memTotalGb > 0 ? (gpu.memUsedGb / gpu.memTotalGb) * 100 : 0;
              return (
                <div key={`${gpu.name}-${index}`} style={{ padding: "14px 14px 12px", background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gpu.name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono", marginTop: 2 }}>
                        VRAM {fmtGb(gpu.memUsedGb)} / {fmtGb(gpu.memTotalGb)}
                      </div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "DM Serif Display", color: "var(--yellow)", lineHeight: 1 }}>
                      {gpu.utilPct}%
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <MetricBar label="GPU" value={gpu.utilPct} note={`${gpu.utilPct}%`} color="var(--yellow)" />
                    <MetricBar label="VRAM" value={memPct} note={`${fmtGb(gpu.memUsedGb)} / ${fmtGb(gpu.memTotalGb)}`} color="var(--accent-teal)" />
                    <MetricBar label="功耗" value={Math.min((gpu.powerW / 400) * 100, 100)} note={fmtWatts(gpu.powerW)} color="var(--accent)" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────

export default function ServerPrototype({ servers: staticServers, isAuthed = false }: { servers: Server[]; isAuthed?: boolean }) {
  const [selId, setSelId] = useState(() => getInitialServerId(staticServers[0]?.id ?? ""));
  const [range, setRange] = useState<StatRange>("1h");
  const [liveMap, setLiveMap] = useState<Record<string, Server>>({});
  const [settings, setSettings] = useState<PanelSettings>(DEFAULT_PANEL_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!hasServerStatusBackend()) return;
    try {
      const overview = await fetchServerOverview();
      if (!overview) return;
      const map: Record<string, Server> = {};
      for (const s of overview.servers) map[s.id] = liveToServer(s);
      setLiveMap(map);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOverview();
    const timer = setInterval(fetchOverview, 30_000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PanelSettings>;
      setSettings((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore malformed local settings
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PANEL_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const servers = useMemo(() => {
    const seen = new Set<string>();
    const merged = staticServers.map((s) => {
      seen.add(s.id);
      return liveMap[s.id] ?? s;
    });
    const extras = Object.values(liveMap)
      .filter((s) => !seen.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return [...merged, ...extras];
  }, [staticServers, liveMap]);

  useEffect(() => {
    if (!servers.length) return;
    if (!selId || !servers.some((server) => server.id === selId)) {
      setSelId(servers[0].id);
    }
  }, [servers, selId]);

  useEffect(() => {
    if (typeof window === "undefined" || !selId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("server") === selId) return;
    url.searchParams.set("server", selId);
    window.history.replaceState(null, "", url);
  }, [selId]);

  const srv = useMemo(() => servers.find((s) => s.id === selId) ?? servers[0], [servers, selId]);
  if (!srv) return null;

  useEffect(() => {
    if (!settingsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [settingsOpen]);

  const SC: Record<string, string> = { online: "var(--green)", warning: "var(--yellow)", offline: "var(--red)", placeholder: "var(--border)" };
  const SL: Record<string, string> = { online: "正常运行", warning: "在线 · 负载告警", offline: "已离线", placeholder: "占位" };
  const isPlaceholder = srv.status === "placeholder";
  const hasGpu = (srv.gpus?.length ?? 0) > 0;
  const hasContainers = (srv.containers?.length ?? 0) > 0;
  const hasServices = (srv.services?.length ?? 0) > 0;
  const gpuSummary = summarizeGpu(srv.gpus);
  const containerSummary = summarizeContainers(srv.containers);
  const serviceSummary = summarizeServices(srv.services);
  const showTailPanels =
    (settings.showDockerSection && hasContainers) ||
    (settings.showServiceSection && hasServices);
  const showMainSnapshot =
    settings.showStatPills ||
    settings.showResourceCards ||
    settings.showNetworkCards ||
    settings.showSystemCard ||
    (settings.showGpuSection && hasGpu);
  const showCharts =
    (settings.showTrendCharts && !isPlaceholder) ||
    (settings.showGpuCharts && hasGpu && !isPlaceholder) ||
    (settings.showDockerCharts && hasContainers && !isPlaceholder);

  if (!isAuthed) {
    return <ServerAuthGate />;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* nav */}
      <nav style={{ height: 54, borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", flexShrink: 0, background: "var(--bg-glass)", backdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--text-muted)", fontSize: 13, fontWeight: 500 }}>← 返回首页</a>
          <span style={{ color: "var(--border)", fontSize: 14 }}>|</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,var(--accent),oklch(0.58 0.16 55))", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700 }}>⬢</div>
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "DM Serif Display" }}>服务器监控</span>
          </div>
          <span style={{ color: "var(--border)" }}>›</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontFamily: "JetBrains Mono", color: "var(--text)" }}>{srv.flag} {srv.name}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: `${SC[srv.status]}18`, fontSize: 10, fontWeight: 600, color: SC[srv.status] }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: SC[srv.status] }} />
              {SL[srv.status]}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "JetBrains Mono", display: "flex", alignItems: "center", gap: 10 }}>
          <span>
            {[srv.os, srv.cores > 0 ? `${srv.cores}核` : "", srv.ramTotal, hasGpu ? `GPU ${gpuSummary.count}` : ""].filter(Boolean).join(" · ")}
          </span>
          <DarkToggle />
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* sidebar */}
        <div style={{ width: 230, borderRight: "1px solid var(--border-light)", background: "var(--bg-card)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
            {servers.map((s) => {
              const active = s.id === selId;
              const dot = SC[s.status];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelId(s.id)}
                  style={{ textAlign: "left", border: `1px solid ${active ? "var(--border)" : "var(--border-light)"}`, background: active ? "var(--bg-2)" : "var(--bg-card)", borderRadius: 12, padding: "12px 12px 10px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 2 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontFamily: "JetBrains Mono", fontWeight: 500, color: active ? "var(--accent)" : "var(--text)" }}>{s.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 16, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{s.flag} {s.loc}</span>
                    {s.status !== "offline" && s.status !== "placeholder" && (
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--text-faint)" }}>{s.cpu}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: "auto", padding: "10px 16px", borderTop: "1px solid var(--border-light)", fontSize: 10, color: "var(--text-faint)", display: "flex", gap: 10 }}>
            <span><span style={{ color: "var(--green)" }}>●</span> {servers.filter(isServerOnline).length}</span>
            <span><span style={{ color: "var(--yellow)" }}>●</span> {servers.filter((s) => s.status === "warning").length}</span>
            <span><span style={{ color: "var(--red)" }}>●</span> {servers.filter((s) => s.status === "offline").length}</span>
          </div>
        </div>

        {/* main panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* toolbar */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "var(--bg-card)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              {showCharts ? "历史趋势" : "监控概览"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!isPlaceholder && showCharts && <RangeSelector range={range} onChange={setRange} />}
              <div ref={settingsRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setSettingsOpen((open) => !open)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border-light)",
                    background: settingsOpen ? "var(--bg-2)" : "var(--bg-card)",
                    color: "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  显示项
                </button>
                {settingsOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280, background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: 12, boxShadow: "var(--shadow-md)", padding: "12px 14px", zIndex: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>面板显示项</div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.5, marginBottom: 8 }}>
                      按你的使用习惯裁剪页面。设置会保存在当前浏览器。
                    </div>
                    <SettingToggle label="概览标签" hint="顶部运行时间、状态和核心资源的快速标签。" checked={settings.showStatPills} onChange={(next) => setSettings((prev) => ({ ...prev, showStatPills: next }))} />
                    <SettingToggle label="资源卡片" hint="CPU、内存、磁盘这三组主要资源卡片。" checked={settings.showResourceCards} onChange={(next) => setSettings((prev) => ({ ...prev, showResourceCards: next }))} />
                    <SettingToggle label="网络卡片" hint="入站与出站实时流量卡片。" checked={settings.showNetworkCards} onChange={(next) => setSettings((prev) => ({ ...prev, showNetworkCards: next }))} />
                    <SettingToggle label="系统信息" hint="系统、位置、主机类型和最后刷新时间。" checked={settings.showSystemCard} onChange={(next) => setSettings((prev) => ({ ...prev, showSystemCard: next }))} />
                    <SettingToggle label="基础趋势" hint="CPU、内存、磁盘、网络四组历史趋势。" checked={settings.showTrendCharts} disabled={isPlaceholder} onChange={(next) => setSettings((prev) => ({ ...prev, showTrendCharts: next }))} />
                    <SettingToggle label="GPU 模块" hint="显示每张 GPU 的占用、显存和功耗。" checked={settings.showGpuSection} disabled={!hasGpu} onChange={(next) => setSettings((prev) => ({ ...prev, showGpuSection: next }))} />
                    <SettingToggle label="GPU 趋势" hint="显示 GPU 占用、显存和功耗的历史趋势。" checked={settings.showGpuCharts} disabled={!hasGpu || isPlaceholder} onChange={(next) => setSettings((prev) => ({ ...prev, showGpuCharts: next }))} />
                    <SettingToggle label="Docker 模块" hint="显示容器概览、状态和主要容器列表。" checked={settings.showDockerSection} disabled={!hasContainers} onChange={(next) => setSettings((prev) => ({ ...prev, showDockerSection: next }))} />
                    <SettingToggle label="Docker 趋势" hint="显示容器数量、CPU 和内存历史趋势。" checked={settings.showDockerCharts} disabled={!hasContainers || isPlaceholder} onChange={(next) => setSettings((prev) => ({ ...prev, showDockerCharts: next }))} />
                    <SettingToggle label="Service 模块" hint="显示 systemd 服务的状态与资源占用。" checked={settings.showServiceSection} disabled={!hasServices} onChange={(next) => setSettings((prev) => ({ ...prev, showServiceSection: next }))} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* scroll area */}
          <div style={{ flex: 1, overflowY: "scroll", scrollbarGutter: "stable", padding: "18px 20px 28px" }}>
            {srv.status === "offline" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 40 }}>🔌</div>
                <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "DM Serif Display" }}>服务器已离线</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>无法获取实时监控数据，最后在线：{srv.uptime}</div>
              </div>
            ) : !showMainSnapshot && !showCharts && !showTailPanels ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60%", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 30 }}>⚙</div>
                <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "DM Serif Display" }}>当前没有启用任何显示项</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>打开右上角"显示项"，选择你想保留的模块。</div>
              </div>
            ) : isPlaceholder ? (
              <MetricSnapshot srv={srv} settings={settings} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {showMainSnapshot && <MetricSnapshot srv={srv} settings={settings} />}
                {showCharts && (
                  <ChartsPanel
                    srv={srv}
                    range={range}
                    showTrendCharts={settings.showTrendCharts}
                    showGpuCharts={settings.showGpuCharts}
                    showDockerCharts={settings.showDockerCharts}
                  />
                )}
                {showTailPanels && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {settings.showDockerSection && hasContainers && <DockerPanel containers={srv.containers ?? []} />}
                    {settings.showServiceSection && hasServices && <ServicesPanel services={srv.services ?? []} />}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* status bar */}
          <div style={{ height: 30, borderTop: "1px solid var(--border-light)", display: "flex", alignItems: "center", padding: "0 20px", gap: 24, flexShrink: 0, background: "var(--bg-card)" }}>
            {[{ l: "CPU", v: `${srv.cpu}%` }, { l: "内存", v: `${srv.ram}%` }, { l: "磁盘", v: `${srv.disk}%` }, hasGpu ? { l: "GPU", v: `${Math.round(gpuSummary.avgUtilPct)}%` } : null, { l: "节点", v: srv.name }].filter((s): s is { l: string; v: string } => Boolean(s)).map((s) => (
              <div key={s.l} style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono", display: "flex", gap: 4 }}>
                <span>{s.l}</span><span style={{ color: "var(--text-muted)" }}>{s.v}</span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-faint)", fontFamily: "JetBrains Mono" }}>
              {new Date().toLocaleTimeString("zh-CN")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServerAuthGate() {
  const next = typeof window !== "undefined" ? window.location.pathname : "/servers";
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        background: "var(--bg)",
        fontFamily: "DM Sans",
      }}
    >
      <div
        style={{
          width: "min(480px, 100%)",
          padding: 32,
          borderRadius: 18,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 60px -28px rgba(0,0,0,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 600, color: "var(--text)" }}>权限不足</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>
          服务器监控详情（CPU / 内存 / 磁盘 / 容器 / 服务 / GPU 等指标）需要登录后查看。<br />
          请先登录再访问此页面。
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <a
            href="/"
            style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
          >
            返回首页
          </a>
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            style={{ padding: "9px 20px", borderRadius: 9, background: "var(--accent)", color: "var(--accent-on, white)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            前往登录
          </a>
        </div>
      </div>
    </div>
  );
}
