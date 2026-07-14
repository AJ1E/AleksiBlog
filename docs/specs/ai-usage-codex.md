# AI 用量监控改造规格

## 目标

- 首页和详情抽屉只展示 `ChatGPT Codex` 与 `Codex CLI` 两个工具。
- 保留 Claude Code 与 Gemini CLI 的采集代码，暂时不在前台展示。
- 展示输入、缓存命中、输出和总 Token，并提供美元/人民币等价估算。
- 保持现有首页卡片、抽屉、颜色变量和 Astro BFF 架构不变。

## 数据规则

- 优先使用 Codex 会话元数据中的 `source`、`model_provider` 和当前模型判断来源。
- `exec`/CLI 来源或 `glm-*`、`ark-*` 模型归入 Codex CLI。
- `vscode`/桌面来源或 `gpt-*` 模型归入 ChatGPT Codex。
- 无法可靠判断的事件不强行归类，并通过后端 warning 说明。
- `cachedInputTokens` 是输入 Token 的子集，费用计算时只计算一次。
- ChatGPT Codex 费用是 GPT 官方价格等价估算，不代表订阅真实扣费。
- Coding Plan 费用是 GLM-5.2 单价等价估算，不代表 Coding Plan 实际套餐扣费。

## 安全边界

- 只读取本地 Codex 日志中的元数据和 Token 统计，不上传日志正文。
- 不读取、不保存、不调用用户在聊天中暴露的 API Key。
- 继续通过 Astro `/api/usage/*` BFF 访问 helper，helper 只监听 loopback。
- Claude/Gemini 可以继续在 helper 内部采集，但 overview 返回给浏览器时只暴露两个 Codex 工具。
- 汇率仅由本地 helper 请求 Frankfurter 的 USD/CNY 汇率接口；不发送访客 IP、日志正文或账号信息。删除 `scripts/ai-usage/exchange-rate.mjs` 即可移除该外部依赖。

## 验收标准

- 首页 AI 卡片和详情抽屉均只有两个等宽 Codex 模块。
- 详情抽屉中 ChatGPT Codex 在上，Codex CLI 在下。
- Token 分项在有日志和无日志时都能稳定显示，不出现 NaN 或布局溢出。
- 汇率请求失败时使用缓存或最后已知值，不阻断 AI 用量接口。
- `pnpm build` 和 `pnpm audit --prod` 通过，且不出现密钥、日志正文或其他私密信息。
