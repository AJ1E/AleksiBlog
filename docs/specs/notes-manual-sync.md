# 登录保护的笔记同步

## 目标

允许已登录的站点所有者从“我的笔记”页面手动同步 `AJ1E/ObsdianNotes`，并在同步完成后立即显示新笔记。访客不能看到或调用此操作，浏览器也不能直接访问 GitHub 或服务器内部服务。

## 设计

1. 笔记仍在构建期由 `scripts/sync-notes.mjs` 从公开只读仓库生成到 `.cache/notes/`；根目录 Markdown 继续排除。
2. 页面只在 Astro 已确认登录态时显示“同步笔记”按钮和最近同步时间。
3. 点击按钮只会发送同源 `POST /api/notes/sync`。Astro BFF 再转发到仅监听 `127.0.0.1:8790` 的 notes helper；Astro 只信任 Nginx 为 `aleksiz.com` 与 `www.aleksiz.com` 写入的 HTTPS 转发头。
4. helper 不接收任何浏览器参数；它只能通过精确 sudoers 规则启动 `aleksiz-notes-sync.service`。
5. 同步服务读取当前 release 的提交哈希，并调用发布脚本以该固定提交重新构建。手动同步不拉取博客代码或读取部署密钥；它只拉取最新笔记，不会把 GitHub `main` 中尚未确认发布的博客代码带上线。
6. Nginx 对该 POST 单独限流；helper 有五分钟冷却。失败仅向浏览器返回通用提示，详细错误留在服务器日志。
7. Git 拉取无交互且有超时。生产环境优先使用 GitHub 官方 `codeload.github.com` ZIP 下载源，本地仍优先 Git；两者互为后备。普通代码发布会继承上一版笔记快照，防止 GitHub 短暂不可达导致笔记消失；手动同步则要求成功抓到新内容，否则当前版本保持不变。

## 自动同步

- `aleksiz-notes-sync.timer` 每六小时启动一次同一个 `aleksiz-notes-sync.service`，并增加最多 20 分钟的随机延后。
- `Persistent=true` 让服务器在离线、重启后补跑错过的同步；自动任务仍只重建当前已发布的博客提交，不会拉取或发布 GitHub 中尚未审核的博客代码。
- 手动同步和定时同步共用同一 service。systemd 会避免同一时间重复运行；手动入口仍需登录、同源 POST、Nginx 限流和五分钟冷却。

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
