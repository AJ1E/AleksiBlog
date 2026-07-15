# 个人博客长期改造与维护指南

这份文档是以后改造本项目的基准说明。你可以把它理解成“这个网站的总说明书”：以后改页面、写文章、加功能、做部署，都先按这里的原则来，除非你明确决定大改架构。

当前默认路线是：先把它改成稳定、好维护、符合你个人需求的博客；等内容和页面稳定后，再逐步接入公网部署、监控、安全自动化和更完整的 dashboard。

## 1. 项目应该保持什么样子

这个项目来自 Jeremy 的 Astro 博客/dashboard。后续开发默认继续遵循他的文章《这个网站是如何运行的：从 Astro 页面到本地后端服务》里的分层思路：

- **Astro 页面层**：负责页面路由、SSR、布局、登录态判断和 `/api/*` 端点。
- **内容集合层**：`src/content/` 是文章、项目、订阅、API、服务器静态信息的主要来源。
- **React islands 层**：只在首页、服务器面板等复杂交互区域使用 React。
- **Node helper 后端层**：AI 用量、IP 风险、服务器状态等本地运行数据由小型 helper 服务采集。

新手阶段不要急着重构架构。优先把网站改成“你的内容、你的页面、你的风格”，然后再考虑高级功能。

## 2. 新手项目地图

优先改这些地方：

- `src/data/site.ts`：网站名称、描述、基础站点信息。
- `src/pages/about.astro`：关于页面，先改成你的自我介绍。
- `src/content/blog/`：博客文章。
- `src/content/projects/`：项目展示。
- `src/content/subscriptions/`：订阅服务数据；不用可以先改成少量真实数据或隐藏相关模块。
- `src/content/apis/`：API/工具卡片；不用可以先简化。
- `src/content/servers/`：服务器静态展示；没有服务器监控时先保持示例或空态。
- `public/uploads/`：封面图、正文图、个人图片等静态资源。

先别碰这些地方，除非明确要改功能：

- `src/lib/auth.ts`：登录和 cookie 签名。
- `src/lib/bff.ts`：Astro 到 helper 后端的代理层。
- `src/pages/api/**`：登录态脱敏和 API 转发。
- `scripts/*server.mjs`：三个 helper 后端。
- `scripts/server-config.mjs`：Beszel system ID 和展示信息映射。
- `astro.config.mjs`：SSR、Node adapter、端口、安全配置。

## 3. 长期维护原则

后续修改按这个顺序来：

1. **先内容**：先替换作者、文章、项目、首页文案。
2. **再结构**：再决定哪些页面保留、哪些模块隐藏。
3. **再样式**：在内容稳定后统一颜色、排版、卡片、导航。
4. **再功能**：确实需要时才改登录、dashboard、helper 后端。
5. **最后部署**：本地稳定后，再做公网长期运行、监控和自动化。

每次大改前，先在 `docs/specs/` 写一份变更说明。说明里至少写清楚：为什么要改、改哪些页面、哪些地方不改、怎么验收。

### 发布节奏与部署边界

现在仍处于“部署优化和生产验证”阶段，还不能把第一版视为正式完成。直到你明确说“第一版完成”或“完全部署好”之前，优先把登录、HTTPS、Nginx、helper 后端、监控、外网访问、安全检查和回滚流程验证完整。

第一版确认完成后，日常小改动不需要每改一点就上传服务器：

1. 在本地完成一组相关的小改动或一篇文章，先自己预览和验证。
2. 累积成一个容易说明、容易回滚的小版本，再检查 diff、敏感信息和 `pnpm build`。
3. 当你明确要发布，或内容需要上线、一个功能完成、修复访客可见问题、需要应用安全更新时，Codex 应主动提醒你进入“提交、推送、部署”流程。
4. 提醒不等于自动上线。除非你明确确认，本地修改只保留在本地和开发分支。

任务职责也要分开：主博客任务负责代码、部署、安全和服务器监控；笔记同步任务只维护公开笔记仓库；TokenUsage 同步任务只维护脱敏后的私有快照仓库。两个同步任务都不能自行部署博客或修改项目指导文档。

## 4. 推荐工具路线

### 现在就应该坚持的检查

- `pnpm build`：发布前必须跑。它会检查 Astro、MDX、内容集合 schema、页面生成。
- `pnpm dev`：本地预览。改页面时用它看效果。
- 内容 schema：`src/content.config.ts` 已经定义了文章、项目、订阅等字段规则。

### 建议下一阶段加入的工具

- **Astro check**：Astro 官方 CLI 提供 `astro check`，用于检查 Astro/TypeScript 相关错误。后续可加入 `pnpm check`。
- **Biome**：用于格式化和 lint JavaScript/TypeScript/CSS/JSON，适合替代一堆分散工具。
- **Playwright**：用于浏览器冒烟测试，比如检查首页、博客列表、文章详情、关于页是否能打开。
- **依赖审计**：用 `pnpm audit` 或 GitHub Dependabot 检查依赖风险。
- **Secret scanning**：防止 `.env`、token、密码、数据库文件被提交。
- **GitHub Actions**：以后推送代码时自动跑 `pnpm install`、`pnpm build`、检查和测试。
- **Sentry 或类似监控**：公网运行后再考虑，用于捕获生产错误。

### OpenSpec / 规格驱动建议

暂时不要盲目安装 OpenSpec。原因很简单：你现在最需要的是把网站改成自己的，而不是先维护一套复杂流程。

更适合当前阶段的做法是轻量规格驱动：

- 小改动：直接修改，但最后跑 `pnpm build`。
- 中等改动：先在聊天里说清楚目标，再改。
- 大改动：先在 `docs/specs/` 写一份变更说明，再实现。

以后如果要做比较大的功能，比如完整重做首页、加入后台编辑、接入真实监控、换部署架构，再评估 OpenSpec、Spec Kit 或类似工具。

## 5. 可选 Codex skills

这些 skills 适合以后按需安装，不需要现在全部装：

- `security-best-practices`：做安全检查和安全建议。
- `security-threat-model`：上线公网前做威胁建模。
- `playwright`：写和运行浏览器测试。
- `cloudflare-deploy`：如果以后走 Cloudflare Tunnel/Pages/Workers 相关路线。
- `sentry`：如果以后接入错误监控。

安装原则：只有当某个阶段真的需要它，再安装对应 skill。不要为了“看起来专业”一次性装很多工具。

## 6. 安全基线

永远不要提交这些东西：

- `.env`
- `.password`
- `.password.secret`
- token、API key、cookie、私钥
- CLI 登录文件
- Beszel 数据库
- 本地 snapshot/cache/log
- 真实服务器内网地址和敏感拓扑

本地开发可以使用：

```env
SITE_AUTH_DISABLE=1
```

生产环境不可以使用这个开关。生产环境必须设置真实的：

```env
SITE_AUTH_PASSWORD=...
SITE_AUTH_SECRET=...
```

公开部署时，只暴露 Astro 应用。不要把下面这些 helper 端口直接暴露到公网：

- `8787`：AI 用量 helper
- `8788`：IP 风险 helper
- `8789`：服务器状态 helper

外部访问应该是：

```text
访客 -> Astro 网站 -> /api/* -> 本机 helper
```

而不是：

```text
访客 -> helper 端口
```

## 7. 改造路线

### 第一阶段：变成你的博客

- 替换网站名称、描述、作者信息。
- 重写 About 页面。
- 删除或隐藏明显属于原作者的内容。
- 新增 1-3 篇你自己的文章。
- 保留最少必要页面：主页、博客、关于、项目。

验收标准：

- 首页不像原作者网站。
- About 页是你的信息。
- 博客列表能看到你的文章。
- `pnpm build` 通过。

### 第二阶段：内容和视觉统一

- 统一分类、标签、项目展示规则。
- 整理封面图和正文图。
- 调整首页模块顺序。
- 简化暂时不用的 dashboard 区域。
- 统一颜色、字体、间距、按钮、卡片风格。

验收标准：

- 你自己能清楚知道“写文章放哪里、改资料改哪里”。
- 页面在手机和桌面都能正常阅读。
- 没有明显多余的原作者示例内容。

### 第三阶段：工具和质量基线

- 加入 `pnpm check`，优先使用 Astro check。
- 加入格式化/lint，优先考虑 Biome。
- 加入少量 Playwright 冒烟测试。
- 加入 GitHub Actions，自动跑构建和检查。
- 增加 docs/specs 流程，较大改动先写说明。

验收标准：

- 提交前有明确检查命令。
- 常见错误能在本地或 CI 里提前发现。
- 大改动不会只靠口头描述。

### 第四阶段：公网长期运行

- 选择部署方式：Cloudflare Tunnel、VPS + PM2/Caddy、Render/Vercel/Netlify 等。
- 如果保留 helper 后端，优先使用 Node 服务器或私有主机，不要当纯静态站部署。
- 配置真实登录密码和 secret。
- 配置日志、监控、备份和回滚方式。

验收标准：

- 网站能稳定公网访问。
- helper 端口不对公网开放。
- 生产环境没有 `SITE_AUTH_DISABLE=1`。
- 失败时知道看哪里：构建、Astro、helper、部署日志。

## 8. 每次修改前的简单判断

可以用这张小表判断该怎么做：

| 想做什么 | 应该先改哪里 | 需要写 spec 吗 |
| --- | --- | --- |
| 写新文章 | `src/content/blog/` | 不需要 |
| 改作者介绍 | `src/pages/about.astro`、`src/data/site.ts` | 不需要 |
| 改首页文案 | `src/pages/index.astro` 或首页 React 组件 | 中等以上改动建议写 |
| 隐藏 dashboard | 页面和 React 组件 | 建议写 |
| 接入 Beszel | `.env`、`scripts/server-config.mjs`、真实 DB | 必须写 |
| 改登录方式 | `src/lib/auth.ts` | 必须写 |
| 公网部署 | 部署文档、环境变量、进程管理 | 必须写 |

## 9. 参考资料

- Jeremy Chen 的网站运行说明：`https://blog.czhifang.com/blog/how-this-website-runs/`
  - 学习 Astro 页面、内容集合、React islands、本地 helper 和 Astro BFF 的分层；helper 保持私有，浏览器只访问 Astro。
  - 这篇文章中的 Cloudflare Tunnel 设置不能原样复制到本项目。本站使用 Nginx + HTTPS，必须保留 Astro 的 `security.checkOrigin`，通过正确的反向代理头解决登录问题。
- Jeremy Chen 的内容维护流程：`https://blog.czhifang.com/blog/how-to-manage-this-blog/`
  - 文章使用稳定 slug、明确 frontmatter 和草稿状态；改正文后更新 `updatedAt`；发布前本地预览并运行构建检查。
- Jeremy Chen 的图片管理流程：`https://blog.czhifang.com/blog/how-to-manage-blog-images/`
  - 公共图片集中放在 `public/uploads/`，文件名应表达内容；封面和正文图要有尺寸、压缩、alt/caption 规范；发布前去除 EXIF/GPS 和隐私信息。
- Astro CLI：`https://docs.astro.build/en/reference/cli-reference/`
- Biome：`https://biomejs.dev/`
- Playwright：`https://playwright.dev/docs/intro`
- Cloudflare Tunnel：`https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/`
