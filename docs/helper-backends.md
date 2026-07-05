# Helper Backends 说明书

Kai Space 的主站是 Astro SSR 应用，页面里的动态面板不直接读本机敏感文件，而是通过三个可选的本地 helper backend 提供数据：

- AI 用量后端：聚合 Claude Code、Codex CLI、Gemini CLI 的本地使用记录。
- IP 风险后端：检测当前出口 IP，并拉取地理位置、ASN、代理/VPN/机房风险信息。
- 服务器状态后端：读取 Beszel 的 SQLite 数据库，生成服务器、容器、systemd 服务和历史指标。

这些 helper 默认只监听 `127.0.0.1`。浏览器默认访问 Astro 同源 API，例如 `/api/usage/overview`，再由 Astro 转发到本机 helper。这样 Astro 可以先做登录判断，再决定返回完整数据还是脱敏后的公开数据。

## 总体技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 主应用 | Astro 6、Astro Node adapter、MDX、React islands | 负责 SSR 页面、内容集合、登录态、BFF 转发和字段脱敏 |
| 前端组件 | React 19、D3、Recharts、TopoJSON | 首页仪表盘、地图、图表、交互状态 |
| helper HTTP 服务 | Node.js ESM、内置 `node:http` | 三个 helper 都是轻量 HTTP 服务，没有 Express/Koa |
| 本地数据 | JSONL、JSON、SQLite | AI CLI 日志、快照缓存、Beszel 监控数据库 |
| 进程编排 | `concurrently`、pnpm scripts | `pnpm dev` 同时启动 Astro 与三个 helper |

默认端口：

| 服务 | 脚本 | 默认地址 |
| --- | --- | --- |
| Astro | `astro dev` 或 `node dist/server/entry.mjs` | `http://127.0.0.1:4321` 开发，`4322` 生产示例 |
| AI 用量 | `scripts/ai-usage-server.mjs` | `http://127.0.0.1:8787` |
| IP 风险 | `scripts/ip-risk-server.mjs` | `http://127.0.0.1:8788` |
| 服务器状态 | `scripts/server-status-server.mjs` | `http://127.0.0.1:8789` |

## 请求链路

```text
Browser
  -> Astro page / React island
  -> Astro API route: /api/usage/*, /api/ip-risk/*, /api/servers/*
  -> local helper backend on 127.0.0.1
  -> local files, Beszel SQLite, or public IP metadata APIs
```

关键点：

- `src/lib/bff.ts` 统一处理 helper 地址、请求转发和上游不可达时的 `502` 响应。
- `src/pages/api/usage/[...path].ts`、`src/pages/api/ip-risk/[...path].ts`、`src/pages/api/servers/[...path].ts` 负责按登录态脱敏。
- `src/lib/auth.ts` 使用共享密码登录，生成 HMAC 签名的 `kai_auth` cookie。
- `PUBLIC_*_API_BASE_URL` 只适合高级部署。它会让浏览器绕过 Astro BFF 直连某个地址，因此也会绕过项目自带的登录脱敏层。

## 启动方式

开发时：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

只启动某个 helper：

```bash
pnpm ai-usage:dev
pnpm ip-risk:dev
pnpm server-status:dev
```

生产示例：

```bash
pnpm build
pnpm serve
```

生产部署时建议只暴露 Astro 应用，把三个 helper 继续绑定在 loopback。反向代理、隧道或公网入口应该指向 Astro，而不是指向 `8787`、`8788`、`8789`。

## 环境变量

Astro BFF 上游地址：

```bash
AI_USAGE_BACKEND_URL=http://127.0.0.1:8787
IP_RISK_BACKEND_URL=http://127.0.0.1:8788
SERVER_STATUS_BACKEND_URL=http://127.0.0.1:8789
```

helper 监听地址：

```bash
HOST=127.0.0.1
PORT=8787
IP_RISK_PORT=8788
SERVER_STATUS_HOST=127.0.0.1
SERVER_STATUS_PORT=8789
```

登录相关：

```bash
SITE_AUTH_PASSWORD=change-me
SITE_AUTH_SECRET=replace-with-at-least-16-random-characters
# SITE_AUTH_DISABLE=1  # 仅开发调试使用
```

快照缓存默认写入 `~/.cache/kai-space/`。可以用这些变量改路径：

```bash
AI_USAGE_SNAPSHOT_FILE=/path/to/ai-usage-overview.json
IP_RISK_SNAPSHOT_FILE=/path/to/ip-risk-egress.json
SERVER_STATUS_SNAPSHOT_FILE=/path/to/server-status.json
SERVER_STATUS_GEO_CACHE_FILE=/path/to/server-geo.json
```

## AI 用量后端

入口文件：`scripts/ai-usage-server.mjs`

技术栈与数据源：

- Node.js 内置 HTTP server。
- 读取本机 CLI 日志，不需要额外 OAuth 服务端流程。
- Claude Code：`~/.claude/projects/**/<session>.jsonl`。
- Codex CLI：`~/.codex/sessions/<YYYY/MM/DD>/rollout-*.jsonl`。
- Gemini CLI：`~/.gemini/tmp/<hash>/logs.json`。
- `scripts/ai-usage/pricing.mjs` 维护公开模型价格，用于估算 token 成本。
- `scripts/ai-usage/heatmap.mjs` 生成跨工具的使用热力图。
- 默认每 60 秒刷新一次快照。

接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 检测三个 CLI 是否安装、是否有认证文件、是否有日志 |
| `GET` | `/api/usage/overview` | 返回三个工具的汇总和热力图 |
| `GET` | `/api/usage/claude` | 返回 Claude Code 用量 |
| `GET` | `/api/usage/codex` | 返回 Codex CLI 用量 |
| `GET` | `/api/usage/gemini` | 返回 Gemini CLI 用量 |
| `POST` | `/api/usage/{tool}/refresh` | 清空该工具内存缓存并立即重算 |

脱敏规则：

- 未登录访问者仍可看到 7 天、30 天总量和热力图。
- 未登录时隐藏 quotas、模型明细、rolling window 等更细的使用细节。
- helper 自身不做用户登录判断，登录判断在 Astro BFF 层完成。

更多细节见 `docs/ai-usage-backend.md`。

## IP 风险后端

入口文件：`scripts/ip-risk-server.mjs`

技术栈与数据源：

- Node.js 内置 HTTP server。
- 使用 `curl` 拉取 trace 和 IP 元数据，避免引入额外 HTTP 客户端依赖。
- 出口 IP trace：`https://claude.ai/cdn-cgi/trace`，备用参考 `https://1.1.1.1/cdn-cgi/trace`。
- 地理位置和风险数据：`https://ip.net.coffee/api/geoip/{ip}` 与 `https://ip.net.coffee/api/iprisk/{ip}`。
- 默认每 3 分钟检查一次出口 IP；IP 不变时复用本地快照。

接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/ip-risk/health` | 返回服务状态、快照时间和当前观察到的出口 IP |
| `GET` | `/api/ip-risk/egress` | 返回出口 IP、地理位置、ASN、风险评分和 trace |
| `POST` | `/api/ip-risk/refresh` | 立即重新检测出口 IP 并刷新快照 |

脱敏规则：

- 未登录时完整 IP 会被掩码处理。
- 未登录时 `rdns`、`cidr` 等网络细节会置空。
- 风险等级、国家/地区、ASN、是否 VPN/代理/机房等摘要仍可用于公开展示。

运行依赖：

- 机器上需要可执行的 `curl`。
- 运行环境需要能访问 `claude.ai`、`1.1.1.1` 和 `ip.net.coffee`。

## 服务器状态后端

入口文件：`scripts/server-status-server.mjs`

技术栈与数据源：

- Node.js 内置 HTTP server。
- `better-sqlite3` 以只读方式打开 Beszel 数据库。
- 默认读取 `/opt/beszel/beszel_data/data.db`，可用 `BESZEL_DB_PATH` 覆盖。
- `scripts/server-config.mjs` 维护 Beszel system ID 到展示信息的映射，例如展示名、地区、经纬度、云厂商和系统类型。
- DNS 和公网 IP 地理位置用于补全未手动配置的服务器位置。
- 默认每 30 秒刷新一次快照。

Beszel system ID 可以这样查：

```bash
sqlite3 /opt/beszel/beszel_data/data.db "SELECT id,name,host FROM systems;"
```

然后编辑 `scripts/server-config.mjs`：

```js
export const BESZEL_SERVER_CONFIG = {
  "your-beszel-system-id": {
    displayName: "Home Lab",
    location: "Home",
    region: "Private Network",
    flag: "🏠",
    lat: 37.77,
    lon: -122.42,
    provider: "Local machine",
    os: "Linux",
  },
};
```

接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 返回服务健康状态 |
| `GET` | `/api/servers/overview` | 返回服务器列表、实时指标、容器、GPU、systemd 服务 |
| `GET` | `/api/servers/{systemId}/stats?range=1h` | 返回某台机器的历史指标 |

`range` 可选值：

- `1h`
- `12h`
- `24h`
- `1w`
- `30d`

脱敏规则：

- 未登录时 `/api/servers/overview` 只保留服务器名称、地区、地图点位和在线状态。
- 未登录时 CPU、内存、磁盘、网络、容器、GPU、systemd 服务等详细指标会被清空。
- 未登录访问 `/api/servers/{systemId}/stats` 会返回 `401`。

运行依赖：

- 已安装并运行 Beszel。
- Node 进程对 Beszel SQLite 数据库有只读权限。
- 如果使用 `better-sqlite3`，首次安装依赖时可能需要本机具备对应的 Node 原生模块构建环境，或使用已有的预编译包。

## 安全边界

这几个 helper 的定位是「本机数据适配器」，不是公网 API 服务。

建议：

- helper 只监听 `127.0.0.1`。
- 公网只暴露 Astro 应用。
- 不要提交 `.env`、`.password`、`.password.secret`、CLI 认证文件、Beszel 数据库、快照文件或日志。
- 不要依赖 helper 的 CORS 配置做安全边界；真正的访问控制在 Astro 登录和 BFF 脱敏层。
- 若要远程访问动态面板，优先通过反向代理、VPN 或隧道访问 Astro，而不是暴露 helper 端口。

## 排错

AI 用量面板为空：

- 先运行 `pnpm ai-usage:detect`。
- 确认对应 CLI 安装、登录过、并且已经产生本地日志。
- 如果 CLI 配置目录不在默认位置，设置 `CLAUDE_CONFIG_DIR`、`CODEX_HOME` 或 `GEMINI_HOME`。

IP 风险面板失败：

- 确认 `curl` 可用。
- 直接访问 `http://127.0.0.1:8788/api/ip-risk/health`。
- 检查当前网络是否能访问 trace 和 `ip.net.coffee`。

服务器状态面板失败：

- 确认 `BESZEL_DB_PATH` 指向真实 Beszel 数据库。
- 确认 Node 进程对数据库有读取权限。
- 用上面的 `sqlite3` 命令确认 system ID，再同步更新 `scripts/server-config.mjs`。

Astro 页面显示后端不可达：

- 确认 helper 进程在对应端口运行。
- 确认 `.env` 里的 `*_BACKEND_URL` 指向 helper 地址。
- 开发时可以先分别运行 `pnpm ai-usage:dev`、`pnpm ip-risk:dev`、`pnpm server-status:dev` 定位是哪一个服务失败。
