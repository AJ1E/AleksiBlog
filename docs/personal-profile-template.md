# 个人信息填空表

这份文档是以后替换网站个人信息的来源。请只填写可以公开展示的信息，不要写密码、token、私钥、身份证号、真实内网地址或任何敏感凭据。

填完后，我会按这份表小步修改网站：先改站点基础信息和 About 页，再改文章默认作者、首页文案、项目页文案，最后再考虑 favicon/头像等视觉资产。

## 1. 站点基础信息

| 字段 | 请填写 |
| --- | --- |
| 网站名称 | Aleksi's Blog|
| 网站英文名或短标识 | 暂无 |
| 网站一句话描述 | 个人博客、工作台、看板、知识库，All in one |
| 网站较长描述 | 暂无 |
| 作者显示名 | Aleksi |
| 作者英文名或昵称 | AleksiZheng |
| 公开邮箱 | aleksi_z@163.com |
| GitHub 链接 | https://github.com/AJ1E |
| 其他主页链接 | 暂无 |
| RSS 链接 | 暂无，后续添加 RSS 后再填 |

建议：

- 网站名称尽量短，适合放在导航栏。
- 一句话描述适合放在 `<meta name="description">`、首页和关于页。
- 公开邮箱可以先留空，避免垃圾邮件。

## 2. 导航栏目

当前导航：

- 文章：`/blog/`
- 项目：`/projects/`
- 关于：`/about/`

请填写是否保留：

| 栏目 | 保留/隐藏 | 是否改名 | 新名称 |
| --- | --- | --- | --- |
| 文章 | 保留 | 暂不改名 |  |
| 项目 | 保留 | 暂不改名 |  |
| 关于 | 保留 | 暂不改名 |  |

是否需要新增导航栏目：

| 新栏目名称 | 链接 | 说明 |
| --- | --- | --- |
|  |  |  |

## 3. About 页信息

| 字段 | 请填写 |
| --- | --- |
| About 页主标题 | 关于 Aleksi |
| 主标题中想强调的词 | Aleksi |
| About 页简介第一段 | 这里会慢慢变成我的个人博客、工作台、看板和知识库。 |
| About 页简介第二段 | 我会在这里记录学习过程、工具折腾、项目实践，以及那些值得反复回看的想法。 |
| 身份/角色 | Personal Blog Builder |
| 组织/学校/工作室/个人标签 | Aleksi's Blog |
| 所在地 | 暂不公开 |
| 关注方向 | Blog · Knowledge Base · AI Tools |
| 兴趣关键词 | Writing · Automation · Self-hosting |
| 目前正在做的事 | 基于 Astro 博客模板搭建自己的长期个人空间 |

About 页卡片建议保留 3-4 个主题。请填写你想展示的主题：

| 卡片标题 | 卡片说明 |
| --- | --- |
| Writing System | 用 Astro、MDX 和内容集合整理文章，让写作、归档和后续维护尽量简单。 |
| Personal Workspace | 保留原项目的工作台能力，逐步把订阅、项目、看板和常用工具收进一个页面。 |
| AI Tooling | 记录 AI 工具、自动化流程和开发经验，把折腾过程沉淀成可复用的笔记。 |
| Self-hosting | 学习更安全、稳定的自托管方式，让公开页面和私有后端保持清晰边界。 |

技术栈或工具展示：

| 分组名称 | 想展示的工具/技术 |
| --- | --- |
| Web / Blog | Astro、React、TypeScript、MDX、Content Collections |
| AI / Tools | Codex、Claude Code、Gemini CLI、Cursor |
| Writing / Knowledge | Markdown、MDX、个人知识库、长文写作 |
| Infra / Self-host | Docker、Cloudflare Tunnel、Caddy、Tailscale |

## 4. 首页文案

| 字段 | 请填写 |
| --- | --- |
| 首页 slogan | 暂时保留当前首页结构和文案，只替换明显品牌名 |
| 首页副标题/说明 | 暂时保留 |
| 文章区标题 | 最近文章 |
| 文章区说明 | 暂时保留 |
| 项目区标题 | 我的项目 |
| 项目区说明 | 目前长期进行的项目 |
| 订阅/dashboard 区域是否保留 | 保留 |
| 服务器/IP/AI 用量区域是否保留 | 保留 |

如果暂时不确定，建议第一阶段先保留结构但减少展示存在感，不急着删功能。

## 5. 文章默认作者信息

新文章 frontmatter 默认作者：

| 字段 | 请填写 |
| --- | --- |
| `author.name` | Aleksi |
| `author.avatar` | /uploads/aleksi-avatar.jpg |
| `author.bio` | 记录个人博客、工具折腾和知识管理实践。 |

说明：

- `author.avatar` 当前是一个短文本头像，例如 `D` 或你的昵称首字母。
- 如果以后换成真实图片头像，需要另行规划样式和图片路径。

## 6. 社交链接

文章作者卡片和 About 页可展示这些链接：

| 平台 | 链接 | 是否展示 |
| --- | --- | --- |
| GitHub | https://github.com/AJ1E | 展示 |
| Twitter / X |  |  |
| Bilibili |  |  |
| Zhihu |  |  |
| Email | aleksi_z@163.com | 展示 |
| RSS | 暂无，后续添加 RSS 后再展示 |  |
| 其他 |  |  |

## 7. 头像、favicon 和图片

| 资产 | 文件路径或说明 |
| --- | --- |
| 头像图片 | /uploads/aleksi-avatar.jpg，来源："D:\Pictures\eva\玩偶香香.jpg" |
| favicon / 网站图标 |  |
| 首页背景或代表图 |  |
| About 页图像 | "D:\Pictures\eva\玩偶香香.jpg" |

建议路径：

- 普通图片放在 `public/uploads/`。
- favicon 使用 `public/favicon.svg`，后续替换前先备份当前文件。

## 8. 暂时隐藏或保留的模块

| 模块 | 保留/隐藏/以后再说 | 备注 |
| --- | --- | --- |
| 订阅管理 | 保留 | 第一阶段不隐藏 |
| API 工具卡片 | 保留 | 第一阶段不隐藏 |
| 服务器看板 | 保留 | 第一阶段不隐藏 |
| AI 用量 | 保留 | 第一阶段不隐藏 |
| IP 风险 | 保留 | 第一阶段不隐藏 |
| 登录保护 | 保留 | 不改认证逻辑 |
| 项目展示 | 保留 | 第一阶段不隐藏 |

## 9. 第一阶段验收标准

请确认你希望第一阶段做到哪些：

- [ ] 网站名、作者、邮箱、GitHub 已替换。
- [ ] About 页不再是模板说明。
- [ ] 文章默认作者信息已替换。
- [ ] 首页不再明显显示 `Kai Space` 或 `Demo Author`。
- [ ] 示例文章是否保留已有决定。
- [ ] `pnpm build` 通过。

## 10. 备注

这里写你还没想清楚、但希望后续保留的想法：

-
