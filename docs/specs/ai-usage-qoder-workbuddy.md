# AI 用量分析：Qoder 与 WorkBuddy

## 目标

- 在现有 AI 用量抽屉中加入 Qoder 和 WorkBuddy 两个工具卡片。
- 保留 ChatGPT Codex、Codex CLI 的原有数据来源和展示逻辑。
- 四个工具按当前周期真实 Token 用量降序排列，桌面端两列、移动端单列。
- 每个工具卡片显示使用占比；热力图显示每天可确认的 Token 总量。

## 数据边界

- Qoder/WorkBuddy 只接受结构化 JSON 或 JSONL 用量记录。
- 支持的字段包括 `timestamp`、`model`、`inputTokens`、`cachedInputTokens`、`outputTokens`、`totalTokens` 和 `credits`。
- 可通过 `QODER_USAGE_FILE`、`WORKBUDDY_USAGE_FILE` 指向明确的导出文件；默认尝试用户目录下的 `usage.jsonl`/`usage.json`。
- 不解析普通运行日志，不上传提示词、代码、项目路径、账号信息或原始会话内容。
- 如果只有 Credits，没有 Token 明细，页面显示 Credits 空态或提示，不把 Credits 冒充 Token。

## 费用规则

- 有真实 Token 和已确认模型单价时才估算费用。
- 单价通过服务端环境变量配置，不进入浏览器代码。
- 未知模型或未确认的官方价格不显示费用，并保留警告。
- 估算费用不代表订阅或套餐实际扣费。

## 验收标准

- 顶部工具占比摘要不再显示。
- 四个详细卡片能稳定显示，空数据时不报错、不出现 NaN。
- 使用占比、排序、刷新、Token 分项和热力图均使用同一周期口径。
- Astro BFF 只允许固定的 `qoder`、`workbuddy` 路径，helper 继续监听 loopback。
- `pnpm build`、`pnpm audit --prod` 和桌面/移动端浅色/深色检查通过。
