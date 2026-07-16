# 登录保护的笔记同步

## 目标

允许已登录的站点所有者从“我的笔记”页面手动同步 `AJ1E/ObsdianNotes`，并在同步完成后立即显示新笔记。访客不能看到或调用此操作，浏览器也不能直接访问 GitHub 或服务器内部服务。

## 设计

1. 笔记仍在构建期由 `scripts/sync-notes.mjs` 从公开只读仓库生成到 `.cache/notes/`；根目录 Markdown 继续排除。
2. 页面只在 Astro 已确认登录态时显示“同步笔记”按钮和最近同步时间。
3. 点击按钮只会发送同源 `POST /api/notes/sync`。Astro BFF 再转发到仅监听 `127.0.0.1:8790` 的 notes helper。
4. helper 不接收任何浏览器参数；它只能通过精确 sudoers 规则启动 `aleksiz-notes-sync.service`。
5. 同步服务读取当前 release 的提交哈希，并调用发布脚本以该固定提交重新构建。它会拉取最新笔记，但不会把 GitHub `main` 中尚未确认发布的博客代码带上线。
6. Nginx 对该 POST 单独限流；helper 有五分钟冷却。失败仅向浏览器返回通用提示，详细错误留在服务器日志。

## 安全边界

- 仅 cookie 登录态可调用；未登录返回 `401`，按钮不渲染。
- 仅允许 `POST`；Astro 保持 `security.checkOrigin`，Nginx 只代理到 Astro。
- helper 仅绑定 loopback、无 CORS、无公网端口。
- sudoers 不使用通配符、shell 或用户输入，只允许启动一个固定的 systemd unit。
- 同步服务不会读取私有笔记、TokenUsage 快照或本地开发机文件。

## 验收

- 未登录访问笔记页看不到按钮，直接 POST 返回 `401`。
- 登录后按钮可用；成功后页面重新加载并展示新 release 的 notes manifest 时间。
- Nginx、Astro、helper 和 systemd 各层都只接受允许的方法与路径。
- `pnpm build`、`pnpm audit --prod`、生产 health check 与 HTTPS 页面检查通过。
