# AI 用量后端

零配置的本地 AI 用量聚合服务。直接读取你已经登录的 Claude Code / Codex CLI / Gemini CLI 在本地写下的会话日志，不需要额外的 OAuth 流程或管理员 API key。

如果你想先理解三个 helper backend 的整体架构、技术栈、BFF 转发和脱敏边界，先看 [helper-backends.md](helper-backends.md)。

## 工作原理

每个 CLI 工具都把会话日志写在固定路径：

| 工具 | 数据来源 | 包含的信息 |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl` | 每条 assistant 消息的 `usage`（input / cache_read / cache_creation / output tokens 与 model） |
| Codex CLI | `~/.codex/sessions/<YYYY/MM/DD>/rollout-*.jsonl` | `event_msg.token_count`（精确 token 与 `rate_limits` 窗口、`plan_type`） |
| Gemini CLI | `~/.gemini/tmp/<hash>/logs.json` | 会话与消息时间线（不含 token，详见下文） |

`scripts/ai-usage-server.mjs` 把这三处文件聚合成统一的 JSON 接口。CLI 工具自身的认证（`~/.claude/.credentials.json`、`~/.codex/auth.json`、`~/.gemini/oauth_creds.json`）就是我们需要的全部「认证文件」——你只要正常用过这些 CLI，就不需要再做任何登录。

## 快速开始

```bash
# 1. 看本地装了哪些 CLI
pnpm ai-usage:detect

# 2. 启动聚合服务（默认绑定 127.0.0.1:8787）
pnpm ai-usage:dev

# 3. 启动前端；浏览器通过 Astro BFF 访问 /api/usage/*
pnpm dev
```

前端默认走同源 Astro BFF：`/api/usage/*`。Astro 再把请求转发到 `AI_USAGE_BACKEND_URL`，默认是 `http://127.0.0.1:8787`。这样未登录访问者只能看到经过裁剪的汇总字段。

> 不建议在公网或局域网直接暴露 helper backend。需要远程访问时，让公网只访问 Astro 应用，再由 Astro 转发到 loopback helper。

## 接口

### `GET /health`

返回每个工具的安装/认证/日志检测状态：

```json
{
  "ok": true,
  "tools": {
    "claude": { "installed": true, "hasAuth": true, "hasLogs": true },
    "codex":  { "installed": true, "hasAuth": true, "hasLogs": true },
    "gemini": { "installed": true, "hasAuth": true, "hasLogs": true }
  }
}
```

### `GET /api/usage/overview`

合并三个工具的 7d / 30d / 当月汇总，每个工具的 payload 形如：

```json
{
  "tool": "claude",
  "installed": true,
  "plan": "Claude (本地认证)",
  "costMode": "estimated | subscription | unknown",
  "status": "active | idle",
  "lastEventAt": "2026-04-30T09:45:10.707Z",
  "quotas": [{ "label": "...", "used": 24, "total": 100, "unit": "%" }],
  "periods": {
    "7d":  { "totalTokens": 0, "totalCostUsd": 0, ... },
    "30d": { ... },
    "month": { ... }
  },
  "models": {
    "7d":  [{ "name": "claude-opus-4-7", "sharePct": 60.8, "costUsd": 99.5, ... }],
    "30d": [...]
  }
}
```

### `GET /api/usage/{claude|codex|gemini}`

只读单个工具，便于排查。

## 成本口径

`costMode` 字段说明：

- `estimated` — 走公开模型价格表估算。Claude Code 与按量付费的 Codex 都是这种。前端在花费数字后加 `*` 表示估算。
- `subscription` — Codex CLI 走 ChatGPT Plus/Pro 订阅时显示。token 数来自本地日志，但花费始终为 0；额度由「主/次额度窗口」体现。
- `unknown` — 当前给 Gemini 用，因为本地日志里没有 token 计数。

## 可选环境变量

```bash
# 端口/绑定
PORT=8787
HOST=127.0.0.1
AI_USAGE_CORS_ALLOW_ORIGIN=http://127.0.0.1:4321

# Codex 月度预算（仅当走 API key 而非订阅时启用）
CODEX_MONTHLY_BUDGET_USD=200

# Claude Pro/Max 5h 与 7d 滚动窗口预算（任选一种单位）
# 不设置时，前端会以「滚动窗口」卡片展示原始 tokens 与请求数（不画百分比条）
CLAUDE_5H_PROMPT_BUDGET=200      # 5 小时窗口允许的 prompt 次数
CLAUDE_5H_TOKEN_BUDGET=20000000  # 5 小时窗口允许的 token 数
CLAUDE_7D_PROMPT_BUDGET=2000     # 7 天窗口允许的 prompt 次数
CLAUDE_7D_TOKEN_BUDGET=200000000 # 7 天窗口允许的 token 数

# 改写 CLI 的 home / config 目录
# Claude CLI 自身使用 CLAUDE_CONFIG_DIR；此项目也兼容旧的 CLAUDE_HOME
CLAUDE_CONFIG_DIR=/Users/you/.claude
# CLAUDE_HOME=/Users/you/.claude
CODEX_HOME=/Users/you/.codex
GEMINI_HOME=/Users/you/.gemini
```

## 已知限制

- **Gemini CLI 缺 token**：`logs.json` 只记录消息文本与时间戳。要拿到精确的 token 数，需要接入 Code Assist 后端或在 CLI 侧再加一层 hook（参考 TokenTracker 的做法）。
- **Codex 模型 ID 取自 `turn_context`**：极少数老版本 rollout 没写 `turn_context`，会归到 `codex-unknown`。
- **价格表是手工维护**：`scripts/ai-usage/pricing.mjs`。出现新模型时 cost 会显示为 0，添加一行即可。
