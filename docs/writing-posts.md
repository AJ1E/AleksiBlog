# 写文章与维护文章手册

这份文档是日常写博客最常用的手册。你只要记住一个核心规则：文章放在 `src/content/blog/`，图片放在 `public/uploads/`，改完至少跑一次 `pnpm build`。

## 核心规则

- 每篇文章是一个 `.mdx` 文件。
- 文章 URL 来自文件名，不来自标题。
- 图片使用站点路径，例如 `/uploads/my-cover.png`。
- 发布前运行 `pnpm build`，让 Astro 检查 frontmatter、MDX 和内容集合 schema。

## 路径对应关系

```text
src/content/blog/my-post.mdx
-> /blog/my-post/

public/uploads/cover.png
-> /uploads/cover.png
```

常用目录：

- `src/content/blog/`：博客文章。
- `public/uploads/`：封面图和正文配图。
- `scripts/new-post.mjs`：新建文章脚手架。
- `src/content/blog/_template.mdx.example`：手写文章时可以参考的模板。

## 新建文章

推荐使用脚手架：

```bash
pnpm new:post
```

它会询问标题、slug、摘要、分类、标签、阅读时长、发布时间、封面图等信息，然后生成：

```text
src/content/blog/<slug>.mdx
```

你也可以手动创建文件：

```text
src/content/blog/my-post.mdx
```

最小 frontmatter 示例：

```mdx
---
title: 我的第一篇文章
subtitle: 可选副标题
excerpt: 这里写首页和列表页会显示的摘要。
publishedAt: 2026-07-06
category: 随笔
tags:
  - 博客
  - Astro
readTime: 6 分钟
author:
  name: Your Name
  avatar: Y
  bio: 这里写一句简短作者介绍。
---

## 正文标题

这里开始写正文。
```

## 常用字段说明

- `title`：文章标题。
- `subtitle`：副标题，可选。
- `excerpt`：摘要，首页和列表页会用到。
- `publishedAt`：发布时间。
- `updatedAt`：更新时间，可选。
- `category`：分类。
- `tags`：标签数组。
- `readTime`：阅读时长。
- `featured`：是否精选。
- `draft`：是否草稿；设置为 `true` 时不公开显示。
- `cover`：封面图路径。
- `coverPosition`：封面图裁切位置，例如 `center top`。
- `author`：作者信息。

这些字段由 `src/content.config.ts` 校验。字段缺失、日期格式错误、缩进错误，通常会在 `pnpm build` 时暴露。

## 图片规则

所有博客图片统一放在：

```text
public/uploads/
```

例如：

```text
public/uploads/my-cover.png
```

在文章 frontmatter 里这样写：

```mdx
cover: /uploads/my-cover.png
```

如果图片主体不在正中间，可以加：

```mdx
coverPosition: center top
```

常见值：

- `center center`
- `center top`
- `center bottom`
- `left center`
- `right center`

正文里插图可以用 MDX 组件：

```mdx
<Figure
  src="/uploads/my-cover.png"
  alt="图片说明"
  caption="图片注释"
/>
```

注意：

- 不要把图片放进 `src/content/blog/`。
- 不要在文章里写本地磁盘路径。
- 推荐封面图宽度至少 `1200px`。
- 图片路径从 `/uploads/` 开始，而不是从 `public/` 开始。

## 修改已有文章

文章 URL 和文件名对应：

```text
/blog/my-post/
-> src/content/blog/my-post.mdx
```

改标题或摘要：

```mdx
title: 新标题
excerpt: 新摘要
```

这会影响页面展示，但不会改变 URL。

改 URL：

```text
src/content/blog/old-slug.mdx
-> src/content/blog/new-slug.mdx
```

隐藏文章：

```mdx
draft: true
```

标记文章有明显更新：

```mdx
updatedAt: 2026-07-06
```

## 可用 MDX 组件

文章里可以使用这些组件：

- `Callout`
- `CodeBlock`
- `Figure`
- `QuoteBlock`
- `StatGrid`
- `Steps`

如果不确定怎么写，参考：

```text
src/content/blog/_template.mdx.example
```

## 推荐写作流程

1. 先想清楚标题、摘要、分类、标签。
2. 运行 `pnpm new:post` 创建文章骨架。
3. 把封面图和配图放到 `public/uploads/`。
4. 先写结构，再补正文细节。
5. 本地运行 `pnpm dev` 看页面效果。
6. 发布前运行 `pnpm build`。

## 本地检查

开发预览：

```bash
pnpm dev
```

重点检查：

- `/`
- `/blog`
- `/blog/<slug>/`
- `/blog/tags/<tag>/`

发布前构建：

```bash
pnpm build
```

这一步会帮助发现：

- frontmatter 缺字段。
- YAML 缩进错误。
- MDX 语法错误。
- 标签没有闭合。
- 图片路径错误。
- 页面生成失败。

## 常见错误

- 把图片放进 `src/content/blog/`，而不是 `public/uploads/`。
- `cover` 写成本地磁盘路径。
- 改了文章标题，却以为 URL 会自动改变。
- 忘记把 `draft: true` 去掉。
- frontmatter 缩进不对。
- 日期写成无法识别的格式。

## 大改动前先写说明

普通文章不用写 spec。下面这些改动建议先在 `docs/specs/` 写一份说明：

- 重做博客信息架构。
- 改文章字段 schema。
- 批量迁移文章。
- 改文章 URL 规则。
- 改图片存储规则。
- 接入 CMS 或外部内容源。

更多长期维护原则见 `docs/site-development-guide.md`。
