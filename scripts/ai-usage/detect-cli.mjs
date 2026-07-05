#!/usr/bin/env node
import { detectAllTools } from "./detect.mjs";

const result = await detectAllTools();
const rows = Object.values(result);

const labelLen = Math.max(...rows.map((r) => r.name.length));
process.stdout.write("\n本地 AI 工具检测结果\n");
process.stdout.write("─".repeat(labelLen + 28) + "\n");
for (const row of rows) {
  const status = row.installed ? "✓ 已安装" : "—  未检测到";
  const auth = row.hasAuth ? "auth" : "    ";
  const logs = row.hasLogs ? "logs" : "    ";
  process.stdout.write(
    `${row.name.padEnd(labelLen)}  ${status.padEnd(10)}  ${auth} ${logs}  ${row.home}\n`,
  );
}
process.stdout.write("\n");
process.stdout.write(
  rows.some((r) => r.installed)
    ? "运行 `pnpm ai-usage:dev` 启动后端，然后在前端配置 PUBLIC_AI_USAGE_API_BASE_URL。\n"
    : "未检测到任何已登录的 CLI。请先正常使用 Claude Code / Codex CLI / Gemini CLI 让它们写入本地数据。\n",
);
