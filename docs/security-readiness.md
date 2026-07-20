# 上线前安全与脱敏检查

最后检查：2026-07-11。本文件记录当前代码库的安全基线、已发现问题和上线前顺序；它不保存任何密码、令牌、私钥、真实服务器 IP 或其他凭据。

## 结论

当前项目已经具备一些正确的基础：`.env`、本地密码文件、数据库和缓存都被 `.gitignore` 排除；认证 Cookie 使用 `HttpOnly`、`SameSite=Lax`，并在 HTTPS 时启用 `Secure`；三个 helper 默认监听 `127.0.0.1`，敏感数据通过 Astro BFF 做登录态脱敏。

依赖与代码层面的本轮升级已完成：Astro 已升到 `7.0.7`，并更新官方 MDX、Node、React 集成；统一 Markdown 管线已保留。`pnpm install --frozen-lockfile`、`pnpm build`、安全接口冒烟检查和最终 `pnpm audit --prod` 均通过，审计结果为没有已知漏洞。备案通过后仍不能直接上线，必须先在 ECS 配置真实生产密钥、Nginx、systemd、HTTPS 和外部端口检查。

## 本轮加固进度

- 已收紧 BFF：只允许当前前端实际使用的路径、方法和登录级别；未知路径、IP 查询接口和未登录服务器明细均被拒绝，响应默认 `Cache-Control: no-store`。
- 已恢复 Astro 同源 POST 检查；登录跳转只接受站内路径，注销接口仅保留 POST。
- 已关闭 helper 默认通配 CORS；helper 继续只监听 loopback，访客 IP 仅在生产反向代理明确启用信任链时读取 Nginx 重写后的 `X-Real-IP`。
- 已加入 Nginx、systemd、GitHub Actions、Dependabot 模板；它们尚未部署到 ECS，备案通过后仍需按 `deploy.md` 备份、验证、再启用。
- 已在升级前保存桌面/移动端页面基准截图；Astro 7 升级后重新生成了首页、文章、笔记、项目、导航、关于、金融、收藏和登录页面的桌面/移动端截图，并人工检查了首页、笔记页、关于页的实际视图，未发现布局、字体、颜色或间距回归。
- 已完成最终 `pnpm audit --prod`，结果为没有已知漏洞；原 SEC-001 低风险依赖问题已由 Astro 7 依赖链修复。
- 待上线事项：在 ECS 部署 Nginx/systemd 模板、配置强密码和随机 secret、启用 HTTPS、设置 GitHub Secret Scanning/Push Protection，并从外部网络验证 helper 端口不可访问。

## 已发现事项

### SEC-001 已处理：生产依赖已通过审计

- 位置：`package.json`、`pnpm-lock.yaml:844`、`:2269`。
- 证据：`astro 7.0.7`、`@astrojs/mdx 7.0.2`、`@astrojs/node 11.0.2`、`@astrojs/react 6.0.1`，最终 `pnpm audit --prod` 返回没有已知漏洞。
- 影响：原 Astro/esbuild 依赖链风险已不再出现在当前生产依赖审计结果中。
- 处理：以后继续使用 `pnpm install --frozen-lockfile`，直接依赖升级必须分阶段、构建并回归页面；不要使用盲目的 `pnpm audit --fix` 批量改锁文件。

### SEC-002 中：生产安全响应头模板已准备，等待上线部署

- 位置：`deploy/nginx/aleksiz.conf`、`deploy/nginx/aleksiz-proxy-headers.conf`。
- 影响：模板已提供 CSP Report-Only、反嵌入、`nosniff`、Referrer Policy 和 Permissions Policy；真正生效需要备案通过后复制到 ECS 并执行 `nginx -t`。
- 处理：先备份现有 Nginx 配置，再启用模板；CSP 先以 Report-Only 验证，确认字体、图标和页面资源无误后再考虑正式策略。

### SEC-003 已处理代码层，待上线验证：共享密码登录防护

- 位置：`src/pages/api/auth/login.ts:12`、`astro.config.mjs:17`。
- 证据：Astro `security.checkOrigin` 已启用，登录跳转限制为站内路径，注销仅允许 POST；Nginx 模板对 `/api/auth/login` 设置了请求限速。
- 影响：仍需在 ECS 上确认限速、HTTPS Cookie 和真实生产密码配置均生效。
- 处理：上线前使用强随机生产密码，不使用开发密码；从外部网络验证错误来源请求被拒绝，并确认 Node 端口不可直连。

### SEC-004 已处理代码层，待上线验证：helper 暴露边界

- 位置：`scripts/ai-usage-server.mjs:14-15`、`scripts/ip-risk-server.mjs:12-13`、`scripts/server-status-server.mjs:14-15`。
- 证据：三个 helper 默认回环监听，默认 CORS 已关闭；Astro BFF 仅允许白名单路径和方法。
- 影响：只要有人把 `4322`、`8787`、`8788` 或 `8789` 开到公网，BFF 脱敏边界可能被绕过，AI 使用量、IP 风险或服务器信息会暴露。
- 处理：ECS 安全组和服务器防火墙仅开放 22、80、443；Nginx 只代理 `127.0.0.1:4322`；生产环境不要设置任何 `PUBLIC_*_API_BASE_URL`，也不要把 helper 反向代理到公网。上线后必须从外部网络实际验证 4322、8787、8788、8789 均不可访问。

### PRIV-001 中：访客 IP 会发送给第三方服务

- 位置：`src/pages/api/ip-risk/visitor.ts:6`、`scripts/ip-risk-server.mjs:105-106`。
- 影响：为了显示国家/地区、ASN 与 VPN/代理/机房判断，访客公网 IP 会由服务器转发到 IPinfo、Proxycheck 和 Net.Coffee；配置高德 Web 服务 Key 后，中国 IPv4 还会发送给高德 IP 定位服务。这属于个人信息处理。
- 处理：地区定位与风险识别必须保持分层：高德只用于中国 IPv4 地区，IPinfo/Net.Coffee 作为全球地区回退，Proxycheck/Net.Coffee 仅用于风险信号，不能用风险服务的城市字段覆盖地区结果。默认仅展示脱敏 IP 和大致地区；隐私页需说明服务与用途。高德 Key 只可保存在服务器共享 `.env`，绝不能进入仓库、浏览器或日志。

### PRIV-002 低：第三方静态资源会暴露访问者 IP

- 位置：`src/layouts/BaseLayout.astro:36-39`、`src/data/navigation.ts:85-86`、`src/components/react/HomePrototype.tsx:274-286`。
- 影响：Google Fonts、Google favicon、FlagCDN 和 jsDelivr 会收到访客 IP、请求时间和页面资源信息。
- 处理：上线稳定后优先自托管字体、导航图标、国旗图片和世界地图数据；在此之前，把这些外部来源列入隐私说明。

### PRIV-003 已处理：部署文档中的真实服务器 IP

- 原位置：`deploy.md` 的部署信息与 DNS 表。
- 处理：已替换为 `<your-ecs-public-ip>` 占位符。真实 IP 只保留在阿里云控制台或私有运维记录中。

## 当前未发现的问题

- 受 Git 跟踪文件中未发现常见 API key、私钥、GitHub token、AWS key 或明文生产密码特征；命中的 `password`、`secret` 等内容均为配置说明或安全代码名称。
- `.env`、`.password`、`.password.secret`、`local/`、`.cache/`、SQLite 数据库、日志和快照均被 `.gitignore` 排除。
- 未发现 `dangerouslySetInnerHTML`、`eval`、`new Function`、`document.write`、`postMessage`、service worker 或将认证数据写入浏览器存储的代码。现有 `localStorage` 只用于主题和非敏感面板设置。
- BFF 默认指向 `127.0.0.1`，并对未登录访问遮蔽 AI、IP 和服务器敏感字段。

这不是对 Git 历史、GitHub 附件或外部服务配置的完整证明。公开仓库还应启用 GitHub 的 Secret Scanning / Push Protection，并在提交前做本地扫描。

## AI 用量模块新增边界

- Qoder 和 WorkBuddy 只读取明确配置的结构化用量文件，不读取普通应用运行日志。
- 结构化文件只能提供 Token、Credits、模型和时间等聚合字段；提示词、代码正文、项目路径和账号信息不得进入文件或 API 响应。
- 没有可靠 Token 明细时，前端显示空态或 Credits 提示，不做伪精确换算。
- 四工具数据仍通过 Astro `/api/usage/*` BFF 返回；不要把 Qoder/WorkBuddy 文件路径或 helper 端口暴露给浏览器。
- 生产 ECS 通常没有本地开发电脑的 Qoder/WorkBuddy 日志，因此上线后默认显示空态；如未来增加同步，必须另写只上传聚合指标的安全设计。

### 私有 TokenUsage 仓库同步边界

- `AJ1E/TokenUsage` 作为私有数据源，只能保存脱敏后的 Token、模型、时间和费用汇总，不保存原始 Codex 会话。
- 私有仓库不等于原始日志可以安全上传；`.codex/auth.json`、`rollout-*.jsonl`、提示词、代码、路径和日志仍然禁止上传。
- ECS 以后使用仅限该仓库的只读 Deploy key 拉取，不能使用个人全局 SSH 私钥，也不能给网站运行用户写权限。
- Deploy key 只在备案通过、服务器准备部署时创建；在此之前不连接 ECS、不把私钥或 GitHub 访问凭据写入本地项目。
- 浏览器不直接访问 GitHub。服务器定时拉取并校验汇总文件，再由 Astro BFF 返回经过字段筛选的数据。
- Token 用量同步适配器尚未实现。完成前不要自行约定文件格式或上传原始文件；实现时必须增加文件大小限制、字段校验、异常回退和旧数据保留策略。
- 手动刷新只能刷新服务器已有数据。若要触发 GitHub 拉取，必须使用登录保护的 POST 接口，并进行限流、来源校验和审计日志记录。

## 数据分级

| 级别 | 可以公开 | 不应公开或提交 |
| --- | --- | --- |
| 公开 | 笔名、站点名称、公开 GitHub、专用公开邮箱、技术兴趣、已确认公开的项目链接 | 无 |
| 谨慎公开 | 学校/工作经历概述、城市级位置、个人照片、公开笔记内容、常用网站清单、服务器供应商 | 精确住址、身份证明、行程、电话号码、私人邮箱、生日、真实服务器 IP 与内部拓扑 |
| 绝不公开 | 无 | 密码、Cookie、session、API key、token、SSH 私钥、`.env`、CLI 登录文件、数据库、备份、日志、Beszel 数据、管理面板地址、未脱敏截图 |

## 提交和部署前检查

1. 先查看 `git status` 与 `git diff --check`，确认不会误提交 `.env`、缓存、截图或数据库。
2. 检查所有新增的 `src/`、`public/`、`docs/`、Markdown、图片和配置；敏感内容不只可能出现在代码里。
3. 不在任何 `PUBLIC_*` 或 `import.meta.env` 变量中放 secret；浏览器能读到的内容都视为公开。
4. 运行 `pnpm build` 和 `pnpm audit --prod`；高风险依赖未处理前不部署。更新依赖后必须重新跑页面冒烟检查。
5. 生产部署前确认：`SITE_AUTH_DISABLE` 未设置为 `1`，Astro 与 helpers 均只监听 loopback，安全组只开放 22/80/443。
6. 上线后用外部网络验证 `:4322`、`:8787`、`:8788`、`:8789` 均无法访问，并检查响应头、HTTPS 和登录流程。

## Strix 评估

Strix 是一个开源 AI 渗透测试工具，能在 Docker 沙箱中对本地代码或自有网站做动态测试，也可接入 CI；它需要 Docker 和 LLM API key，并会把配置写入 `~/.strix/cli-config.json`。它适合在依赖升级、Nginx 加固和 staging 环境准备完成后，作为一次授权范围内的补充测试，不适合作为现在的第一道防线。

当前决定：**暂不安装 Strix**。先完成依赖升级、基本安全响应头、限速/请求来源防护和 GitHub Secret Scanning。以后若使用，只扫描本地或你明确授权的 staging/生产域名；不要把真实共享密码、私钥或生产 token 写进 Strix 命令、指令文件或报告中。
