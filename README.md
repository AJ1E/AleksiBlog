# AleksiBlog

AleksiBlog 是我的个人博客、工作台、看板和知识库项目。当前目标是先保留原项目简洁、干净、优雅的视觉风格，再逐步替换成自己的内容，并在后续按小步迭代的方式增加常见博客功能。

本项目基于 [C2jeremy/kai-space](https://github.com/C2jeremy/kai-space) 二次开发。原项目提供了 Astro 博客、内容集合、React islands、私有 dashboard 和本地 helper 后端等基础能力。

## 当前方向

- 以个人博客为主，私有 dashboard 为辅。
- 优先替换站点信息、作者信息、About 页面、文章内容和项目内容。
- 保持现有架构，不轻易重构目录或删除原功能。
- 安全相关能力继续通过 Astro BFF 访问，不直接暴露 helper 后端端口。

## 技术栈

- Astro SSR
- React islands
- TypeScript
- MDX 内容文章
- YAML 内容集合
- Node helper backends
- pnpm

## 本地运行

```bash
pnpm install
pnpm dev
```

默认访问：

```text
http://127.0.0.1:4321/
```

生产环境部署前，请设置真实的 `SITE_AUTH_PASSWORD` 和 `SITE_AUTH_SECRET`，并且不要提交 `.env`、数据库、token、日志、快照或任何敏感文件。

## 内容位置

- 博客文章：`src/content/blog/`
- 项目内容：`src/content/projects/`
- 站点基础信息：`src/data/site.ts`
- About 页面：`src/pages/about.astro`
- 长期维护说明：`docs/site-development-guide.md`
- 个人信息填空表：`docs/personal-profile-template.md`

## 致谢

感谢 [C2jeremy/kai-space](https://github.com/C2jeremy/kai-space) 提供的开源博客与 dashboard 模板。AleksiBlog 会在此基础上继续做个人化改造。
