# Writing Posts

这份文档是这个博客的实际维护手册。现在站点已经回到纯静态内容模式，不依赖单独后台。日常写作和修改都直接围绕内容文件进行。

## Core Rule

先记住这条最重要的规则：

- 文章放在 `src/content/blog/`
- 图片放在 `public/uploads/`
- 修改完成后至少运行一次 `pnpm build`

如果只看一句话，这就是这套博客的维护方式。

## Directory Map

和写博客最相关的路径只有这几个：

- `src/content/blog/`: 每篇文章一个 `.mdx` 文件
- `public/uploads/`: 封面图和正文配图
- `scripts/new-post.mjs`: 新建文章脚手架
- `src/content/blog/_template.mdx.example`: 手工起稿模板

内容和页面的映射关系是固定的：

```text
src/content/blog/my-post.mdx
-> /blog/my-post/

public/uploads/cover.png
-> /uploads/cover.png
```

注意：页面 URL 来自文件名，不来自标题。

## Create A New Post

最推荐的方式是直接运行：

```bash
pnpm new:post
```

它会交互式询问：

- 标题
- slug
- 副标题
- 摘要
- 分类
- 标签
- 阅读时长
- 发布日期
- 封面图路径

生成结果在：

```text
src/content/blog/<slug>.mdx
```

如果你想一次性从命令行传完，也可以这样：

```bash
pnpm new:post \
  --title "我的新文章" \
  --slug my-new-post \
  --subtitle "一句副标题" \
  --category 技术 \
  --tags Astro,MDX,博客 \
  --readTime "8 分钟" \
  --excerpt "这里写首页和列表页摘要。" \
  --publishedAt 2026-04-29 \
  --cover /uploads/my-cover.png
```

## Write A Post Manually

如果你不想用脚手架，也可以直接手工新建：

```text
src/content/blog/my-post.mdx
```

最小 frontmatter 结构如下：

```mdx
---
title: 文章标题
subtitle: 可选副标题
excerpt: 这里写摘要
publishedAt: 2026-04-29
category: 技术
tags:
  - Astro
  - MDX
readTime: 6 分钟
author:
  name: Demo Author
  avatar: D
  bio: Maintainer of a personal knowledge base and self-hosted workspace.
---

## 正文标题

这里开始写正文。
```

常用字段说明：

- `title`: 文章标题
- `subtitle`: 副标题，可选
- `excerpt`: 首页和列表页摘要
- `publishedAt`: 发布日期
- `updatedAt`: 更新日期，可选
- `category`: 分类
- `tags`: 标签数组
- `readTime`: 阅读时长
- `featured`: 是否精选
- `draft`: 是否草稿
- `cover`: 封面图路径
- `coverPosition`: 可选，控制封面图裁切重心，比如 `center top`
- `author`: 作者信息

## Cover Images And Inline Images

所有图片都统一放到：

```text
public/uploads/
```

比如：

```text
public/uploads/my-cover.png
```

在 frontmatter 里这样写：

```mdx
cover: /uploads/my-cover.png
```

如果主体不在图片正中间，还可以额外写：

```mdx
coverPosition: center top
```

常见值：

- `center center`
- `center top`
- `center bottom`
- `left center`
- `right center`

在正文里这样写：

```mdx
<Figure
  src="/uploads/my-cover.png"
  alt="图片说明"
  caption="图注"
/>
```

规则很简单：

- `public/` 下的内容会作为静态资源直接输出
- 在文章里写的是站点路径，不是本地磁盘路径
- 推荐封面图宽度至少 `1200px`
- 封面图现在会按固定容器比例显示，不需要每次手工裁成完全一致
- 如果自动裁切的位置不理想，再用 `coverPosition` 微调主体位置

脚手架也支持你输入本地绝对路径。如果图片本来就在 `public/` 下，它会自动转换成 `/uploads/...`。

## Editing Existing Posts

修改老文章时，先找到对应文件。

例如：

```text
/blog/claude-workflow/
-> src/content/blog/claude-workflow.mdx

/blog/ip-risk-api-compare/
-> src/content/blog/ip-risk-api-compare.mdx
```

常见修改动作如下。

### Change Title Or Excerpt

直接改 frontmatter：

```mdx
title: 新标题
excerpt: 新摘要
```

这会影响页面展示，但不会改 URL。

### Change URL

如果你想改 `/blog/<slug>/`，要改文件名，不是改标题：

```text
src/content/blog/my-old-post.mdx
-> src/content/blog/my-new-post.mdx
```

### Hide A Post Temporarily

把文章设成草稿：

```mdx
draft: true
```

这样它不会出现在公开页面。

### Add Or Replace A Cover

先放图片，再补：

```mdx
cover: /uploads/my-cover.png
```

### Mark A Real Update

如果文章经过了明显重写，建议补：

```mdx
updatedAt: 2026-04-29
```

## Writing Style

新文章默认已经带好这些可复用组件：

- `Callout`
- `CodeBlock`
- `Figure`
- `QuoteBlock`
- `StatGrid`
- `Steps`

如果想完全手工开始，可以参考：

```text
src/content/blog/_template.mdx.example
```

## Recommended Workflow

这是比较稳的一套日常流程：

1. 先把标题、摘要、分类、标签想清楚。
2. 运行 `pnpm new:post` 创建骨架。
3. 把封面图和配图放到 `public/uploads/`。
4. 先写出文章结构，再补正文细节。
5. 本地运行 `pnpm dev` 看展示效果。
6. 最后运行 `pnpm build` 做发布前检查。

## Local Verification

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

这一步会帮助你发现：

- frontmatter 缺字段
- YAML 缩进错误
- MDX 语法错误
- 标签未闭合
- 图片路径错误
- 页面生成失败

## Common Mistakes

最常见的问题如下：

- 把图片放进了 `src/content/blog/`，而不是 `public/uploads/`
- `cover` 写成了本地磁盘路径
- 改了标题，却以为文章链接会自动变化
- 忘了把 `draft: true` 去掉
- frontmatter 缩进不对

## Related Page

站内还有一篇更面向读者展示的说明文章：

```text
/blog/how-to-manage-this-blog/
```

如果你希望把维护方式公开说明给别人看，可以直接引用那篇页面。
