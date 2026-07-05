import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const blogDir = path.resolve("src/content/blog");
const publicDir = path.resolve("public");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[\\/]/g, "-")
    .replace(/-+/g, "-");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeYaml(value) {
  return value.replace(/"/g, '\\"');
}

function normalizeReadTime(value) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return `${trimmed} 分钟`;
  return trimmed;
}

async function normalizeCoverPath(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (path.isAbsolute(trimmed)) {
    try {
      await fs.access(trimmed);
      const relativeToPublic = path.relative(publicDir, trimmed);
      if (
        relativeToPublic &&
        !relativeToPublic.startsWith("..") &&
        !path.isAbsolute(relativeToPublic)
      ) {
        return `/${relativeToPublic.split(path.sep).join("/")}`;
      }
      throw new Error("封面图必须位于 public/ 目录下，或直接使用 /uploads/xxx.png 这种站点路径");
    } catch {
      const publicCandidate = path.join(publicDir, trimmed.slice(1));
      try {
        await fs.access(publicCandidate);
        return trimmed;
      } catch {
        throw new Error("封面图必须位于 public/ 目录下，或直接使用 /uploads/xxx.png 这种站点路径");
      }
    }
  }

  const expanded = trimmed.startsWith("~/")
    ? path.join(process.env.HOME || "", trimmed.slice(2))
    : trimmed;
  const absolute = path.resolve(expanded);
  const relativeToPublic = path.relative(publicDir, absolute);

  if (
    relativeToPublic &&
    !relativeToPublic.startsWith("..") &&
    !path.isAbsolute(relativeToPublic)
  ) {
    return `/${relativeToPublic.split(path.sep).join("/")}`;
  }

  throw new Error("封面图必须位于 public/ 目录下，或直接使用 /uploads/xxx.png 这种站点路径");
}

function articleTemplate({
  title,
  subtitle,
  excerpt,
  publishedAt,
  category,
  tags,
  readTime,
  cover
}) {
  const coverLine = cover ? `cover: ${cover}\n` : "";
  const tagLines = tags.map((tag) => `  - ${tag}`).join("\n");

  return `---
title: ${title}
subtitle: ${subtitle ? `"${escapeYaml(subtitle)}"` : '""'}
excerpt: "${escapeYaml(excerpt)}"
publishedAt: ${publishedAt}
category: ${category}
tags:
${tagLines || "  - 示例"}
readTime: ${readTime}
${coverLine}author:
  name: Demo Author
  avatar: D
  bio: Maintainer of a personal knowledge base and self-hosted workspace.
---

import Callout from "../../components/mdx/Callout.astro";
import CodeBlock from "../../components/mdx/CodeBlock.astro";
import Figure from "../../components/mdx/Figure.astro";
import QuoteBlock from "../../components/mdx/QuoteBlock.astro";
import StatGrid from "../../components/mdx/StatGrid.astro";
import Steps from "../../components/mdx/Steps.astro";

## 先写这一篇文章最重要的判断

这里先写开头。第一段只回答一个问题：这篇文章到底想说什么。

<Callout variant="tip" title="写作建议">
  先把结构写出来，再慢慢补内容。你不需要一开始就把每一段写满。
</Callout>

<StatGrid
  items={[
    { label: "背景", value: "Why", note: "为什么要写" },
    { label: "重点", value: "What", note: "最想说明的点" },
    { label: "结论", value: "Takeaway", note: "读完能带走什么" }
  ]}
/>

## 正文的第二部分

你可以继续用普通 MDX 段落，也可以直接插这些内容块：

<Steps>
  <li>步骤一。</li>
  <li>步骤二。</li>
  <li>步骤三。</li>
</Steps>

<CodeBlock
  lang="bash"
  title="命令示例"
  code={\`pnpm dev
pnpm build\`}
/>

<QuoteBlock cite="你的备注">
  这里适合放一句值得被强调的句子。
</QuoteBlock>

## 结尾

最后用一两段把这篇文章收回来。`;
}

async function ask(rl, label, fallback = "") {
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });

  try {
    const title = args.title || (await ask(rl, "文章标题"));
    if (!title) throw new Error("文章标题不能为空");

    const defaultSlug = slugify(args.slug || title) || `post-${today()}`;
    const slug = args.slug || (await ask(rl, "文件名 slug", defaultSlug));
    const subtitle = args.subtitle !== undefined ? args.subtitle : await ask(rl, "副标题", "");
    const excerpt =
      args.excerpt !== undefined
        ? args.excerpt
        : await ask(rl, "摘要", "这里写首页和归档页会显示的摘要。");
    const category = args.category || (await ask(rl, "分类", "技术"));
    const tagsRaw = args.tags || (await ask(rl, "标签（逗号分隔）", "示例,MDX"));
    const tags = tagsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const readTime = normalizeReadTime(
      args.readTime || (await ask(rl, "阅读时长", "5 分钟"))
    );
    const publishedAt = args.publishedAt || (await ask(rl, "发布日期", today()));
    const coverInput =
      args.cover !== undefined
        ? args.cover
        : await ask(rl, "封面图路径（如 /uploads/my-cover.png，可留空）", "");
    const cover = await normalizeCoverPath(coverInput);

    const filePath = path.join(blogDir, `${slug}.mdx`);

    try {
      await fs.access(filePath);
      throw new Error(`文件已存在: ${filePath}`);
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }

    const content = articleTemplate({
      title,
      subtitle,
      excerpt,
      publishedAt,
      category,
      tags,
      readTime,
      cover
    });

    await fs.writeFile(filePath, content, "utf8");

    output.write(`\n已创建: ${path.relative(process.cwd(), filePath)}\n`);
    if (cover) {
      output.write(`封面图: ${cover}\n`);
    } else {
      output.write("未设置封面图。后续可在 frontmatter 里补 `cover: /uploads/xxx.png`\n");
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
