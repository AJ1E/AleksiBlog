import { useMemo, useState } from "react";

type PostCardData = {
  id: string;
  href: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  dateLabel: string;
  tags: string[];
  cover?: string;
};

export default function SearchablePostGrid({ posts }: { posts: PostCardData[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return posts;
    return posts.filter((post) =>
      [post.title, post.excerpt, post.category, ...post.tags].some((field) =>
        field.toLowerCase().includes(trimmed)
      )
    );
  }, [posts, query]);

  return (
    <section className="page-section">
      <div className="home-section-divider">
        <div className="home-section-divider__line" />
        <span>最近文章</span>
        <div className="home-section-divider__line" />
      </div>
      <div className="home-search">
        <span className="home-search__icon">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文章标题、标签、分类…"
          className="home-search__input"
        />
        {query && (
          <button type="button" className="home-search__clear" onClick={() => setQuery("")}>
            ✕
          </button>
        )}
      </div>

      {filtered.length === 0 && <div className="home-empty">没有找到“{query}”相关文章</div>}

      <div className="post-grid">
        {filtered.map((post) => (
          <article className="post-card" key={post.id}>
            <a href={post.href}>
              <div className="post-card__inner">
                {post.cover ? (
                  <div className="post-card__cover">
                    <img src={post.cover} alt={post.title} loading="lazy" />
                  </div>
                ) : (
                  <div className="post-card__cover post-card__cover--placeholder">cover image</div>
                )}
                <span
                  className="category-badge"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {post.category}
                </span>
                <div className="meta-row muted" style={{ marginTop: 8 }}>
                  <span>{post.dateLabel}</span>
                  <span>{post.readTime}</span>
                </div>
                <h3 className="card-title card-title--post">{post.title}</h3>
                <p className="card-copy">{post.excerpt}</p>
                <div className="tag-row" style={{ marginTop: 14 }}>
                  {post.tags.map((tag) => (
                    <span className="pill" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </a>
          </article>
        ))}
      </div>

      <div className="home-more">
        <a className="button--ghost" href="/blog">
          查看更多文章
        </a>
      </div>
    </section>
  );
}
