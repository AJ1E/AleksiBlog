import { getCollection, type CollectionEntry } from "astro:content";

export function sortByDateDesc<T extends { data: { publishedAt: Date } }>(entries: T[]) {
  return [...entries].sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
}

export function formatDisplayDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

export async function getPublishedPosts() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return sortByDateDesc(posts);
}

export function tagParam(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/\//g, "-");
}

export function tagHref(tag: string) {
  return `/blog/tags/${tagParam(tag)}/`;
}

export function postsWithTag(posts: CollectionEntry<"blog">[], tag: string) {
  const needle = tag.toLowerCase();
  return posts.filter((post) =>
    post.data.tags.some((item) => item.toLowerCase() === needle)
  );
}

export function relatedPosts(
  posts: CollectionEntry<"blog">[],
  currentId: string,
  limit = 3
) {
  const current = posts.find((post) => post.id === currentId);
  const currentTags = new Set(current?.data.tags.map((tag) => tag.toLowerCase()) ?? []);

  return posts
    .filter((post) => post.id !== currentId)
    .sort((a, b) => {
      const aScore = a.data.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length;
      const bScore = b.data.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length;
      if (bScore !== aScore) return bScore - aScore;
      return b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();
    })
    .slice(0, limit);
}
