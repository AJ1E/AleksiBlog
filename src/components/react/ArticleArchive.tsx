import { useMemo, useState } from "react";

type PostItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  category: string;
  readTime: string;
  readMinutes: number;
  wordCount: number;
  dateLabel: string;
  dateMono: string;
  publishedAtMs: number;
  updatedLabel?: string;
  year: number;
  tags: string[];
  cover?: string;
  featured: boolean;
  authorName: string;
};

type Props = {
  posts: PostItem[];
};

const ACCENT_PALETTE = ["orange", "teal", "purple", "green", "blue"] as const;
type AccentKey = (typeof ACCENT_PALETTE)[number];

function hashString(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function categoryAccent(category: string): AccentKey {
  return ACCENT_PALETTE[hashString(category) % ACCENT_PALETTE.length];
}

function readingBucket(minutes: number) {
  if (minutes >= 10) return "长读";
  if (minutes >= 6) return "中读";
  return "短读";
}

function postStatus(post: PostItem): { label: string; tone: AccentKey } | null {
  if (post.featured) return { label: "精选", tone: "orange" };
  const days = (Date.now() - post.publishedAtMs) / 86400000;
  if (days <= 30) return { label: "新文", tone: "green" };
  return null;
}

function formatNumber(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function StatusPill({ tone, label }: { tone: AccentKey; label: string }) {
  return <span className={`status-pill status-pill--${tone}`}>● {label}</span>;
}

function TimelineItem({
  post,
  isLast,
  showYear,
}: {
  post: PostItem;
  isLast: boolean;
  showYear: boolean;
}) {
  const accent = categoryAccent(post.category);
  const status = postStatus(post);
  return (
    <div className={`article-archive-timeline-item accent-${accent}${isLast ? " is-last" : ""}`}>
      {showYear && <div className="article-archive-timeline-item__year">{post.year}</div>}
      <div className="article-archive-timeline-item__row">
        <div className="article-archive-timeline-item__rail">
          <span className="article-archive-timeline-item__dot" />
        </div>
        <a href={post.href} className="article-archive-timeline-item__card">
          <div className="article-archive-timeline-item__main">
            <div className="article-archive-timeline-item__head">
              <span className="article-archive-cat-tag">{post.category}</span>
              {status && <StatusPill tone={status.tone} label={status.label} />}
            </div>
            <h3 className="article-archive-timeline-item__title">{post.title}</h3>
            {post.subtitle && (
              <p className="article-archive-timeline-item__subtitle">{post.subtitle}</p>
            )}
            <p className="article-archive-timeline-item__excerpt">{post.excerpt}</p>
            <div className="article-archive-stack-row">
              {post.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="stack-pill">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          <div className="article-archive-timeline-item__meta">
            <div className="article-archive-timeline-item__meta-row">
              <span className="article-archive-timeline-item__meta-label">日期</span>
              <span className="mono">{post.dateMono}</span>
            </div>
            <div className="article-archive-timeline-item__meta-row">
              <span className="article-archive-timeline-item__meta-label">阅读</span>
              <span>{post.readTime}</span>
            </div>
            <div className="article-archive-timeline-item__meta-row">
              <span className="article-archive-timeline-item__meta-label">篇幅</span>
              <span>{readingBucket(post.readMinutes)}</span>
            </div>
            <div className="article-archive-timeline-item__meta-row">
              <span className="article-archive-timeline-item__meta-label">字数</span>
              <span className="mono">~{formatNumber(post.wordCount)}</span>
            </div>
            <span className="article-archive-timeline-item__cta">阅读 →</span>
          </div>
        </a>
      </div>
    </div>
  );
}

export default function ArticleArchive({ posts }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [lengthFilter, setLengthFilter] = useState("全部");

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(posts.map((post) => post.category)))],
    [posts]
  );

  const stats = useMemo(() => {
    const featuredCount = posts.filter((post) => post.featured).length;
    const categoriesCount = new Set(posts.map((post) => post.category)).size;
    const longReads = posts.filter((post) => post.readMinutes >= 10).length;
    const totalWords = posts.reduce((sum, post) => sum + post.wordCount, 0);
    return {
      total: posts.length,
      featured: featuredCount,
      categories: categoriesCount,
      longReads,
      totalWords,
    };
  }, [posts]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (category !== "全部" && post.category !== category) return false;
      if (lengthFilter !== "全部" && readingBucket(post.readMinutes) !== lengthFilter) return false;
      if (!normalizedQuery) return true;
      return [post.title, post.subtitle ?? "", post.excerpt, post.category, ...post.tags].some(
        (field) => field.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [category, lengthFilter, posts, query]);

  const hasFilters = category !== "全部" || lengthFilter !== "全部" || query.trim().length > 0;

  function clearFilters() {
    setQuery("");
    setCategory("全部");
    setLengthFilter("全部");
  }

  return (
    <section className="article-archive page-section">
      <header className="article-archive-header">
        <div className="article-archive-header__eyebrow">
          <div className="article-archive-header__line" />
          <span>Articles · 文章归档</span>
        </div>
        <h1 className="article-archive-header__title">
          我的文章
          <span>× {stats.total}</span>
        </h1>
        <p className="article-archive-header__copy">
          技术笔记、工具折腾、阅读思考。
        </p>
        <div className="article-archive-header__stats">
          <div className="accent-orange">
            <strong>{stats.total}</strong>
            <span>总篇数</span>
          </div>
          <div className="accent-teal">
            <strong>{stats.categories}</strong>
            <span>分类</span>
          </div>
          <div className="accent-green">
            <strong>{stats.featured}</strong>
            <span>精选</span>
          </div>
          <div className="accent-purple">
            <strong>{stats.longReads}</strong>
            <span>长读</span>
          </div>
          <div className="accent-blue">
            <strong>~{formatNumber(stats.totalWords)}</strong>
            <span>累计字数</span>
          </div>
        </div>
      </header>

      <div className="article-archive-controls">
        <div className="article-archive-controls__row">
          <div className="article-archive-search">
            <span className="article-archive-search__icon">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、摘要、标签…"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                ✕
              </button>
            )}
          </div>

          <div className="article-archive-filters">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={category === item ? "is-active" : undefined}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="article-archive-controls__spacer" />

          <select value={lengthFilter} onChange={(event) => setLengthFilter(event.target.value)}>
            <option value="全部">所有长度</option>
            <option value="短读">短读 · &lt;6 分钟</option>
            <option value="中读">中读 · 6-10 分钟</option>
            <option value="长读">长读 · 10 分钟+</option>
          </select>
        </div>

        <div className="article-archive-controls__summary">
          <span>
            {filtered.length === posts.length ? (
              <>
                共 <strong>{posts.length}</strong> 篇文章
              </>
            ) : (
              <>
                筛选结果 <strong>{filtered.length}</strong> / {posts.length}
              </>
            )}
          </span>
          {hasFilters && (
            <button type="button" onClick={clearFilters}>
              清除筛选
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="home-empty article-archive-empty">
          <div>◌</div>
          <p>没有找到符合条件的文章</p>
          <button type="button" onClick={clearFilters}>
            清除筛选
          </button>
        </div>
      ) : (
        <div className="article-archive-timeline">
          {filtered.map((post, index) => {
            const prev = filtered[index - 1];
            const showYear = !prev || prev.year !== post.year;
            return (
              <TimelineItem
                key={post.id}
                post={post}
                isLast={index === filtered.length - 1}
                showYear={showYear}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
