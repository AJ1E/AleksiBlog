import { useEffect, useMemo, useState } from "react";

type BucketlistKind = "movie" | "tv" | "book" | "destination";

type BucketlistItem = {
  id: string;
  kind: BucketlistKind;
  rank?: number;
  imdbId?: string;
  titleZh: string;
  titleEn: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  genres: string[];
  summary: string;
  imdbUrl?: string;
  poster?: string;
};

type Props = {
  items: BucketlistItem[];
};

const PAGE_SIZE = 10;
const STORAGE_KEY = "aleksi:bucketlist:watched:v1";
const ALL_CATEGORIES: Array<{ id: BucketlistKind; label: string }> = [
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV Shows" },
  { id: "book", label: "Books" },
  { id: "destination", label: "Destinations" }
];

function formatRuntime(minutes?: number) {
  if (!minutes) return "片长待补";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder ? `${remainder}m` : ""}`.trim();
}

function imdbHref(item: BucketlistItem) {
  if (item.imdbUrl) return item.imdbUrl;
  if (item.imdbId) return `https://www.imdb.com/title/${item.imdbId}/`;
  return `https://www.imdb.com/find/?q=${encodeURIComponent(item.titleEn)}`;
}

function readUrlState() {
  if (typeof window === "undefined") return { query: "", category: "movie" as BucketlistKind, page: 1 };
  const params = new URLSearchParams(window.location.search);
  const requestedPage = Number(params.get("page"));
  return {
    query: params.get("q") ?? "",
    category: (params.get("category") as BucketlistKind | null) ?? "movie",
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  };
}

export default function BucketlistMovies({ items }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BucketlistKind>("movie");
  const [page, setPage] = useState(1);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const urlState = readUrlState();
    setQuery(urlState.query);
    setCategory(ALL_CATEGORIES.some((option) => option.id === urlState.category) ? urlState.category : "movie");
    setPage(urlState.page);

    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) setWatched(new Set(stored.filter((value): value is string => typeof value === "string")));
    } catch {
      // A blocked or malformed localStorage entry should not prevent the list from rendering.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    if (category !== "movie") params.set("category", category);
    else params.delete("category");
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, [category, hydrated, page, query]);

  const categoryCounts = useMemo(
    () => new Map(ALL_CATEGORIES.map((option) => [option.id, items.filter((item) => item.kind === option.id).length])),
    [items]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.kind !== category) return false;
      if (!needle) return true;
      return [
        item.titleZh,
        item.titleEn,
        item.releaseYear ? String(item.releaseYear) : "",
        item.summary,
        ...item.genres
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [category, items, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeCategory(next: BucketlistKind) {
    if ((categoryCounts.get(next) ?? 0) === 0) return;
    setCategory(next);
    setPage(1);
  }

  function changeQuery(next: string) {
    setQuery(next);
    setPage(1);
  }

  function toggleWatched(id: string) {
    const next = new Set(watched);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWatched(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // The visual state still works when browser storage is unavailable.
    }
  }

  return (
    <section className="bucketlist-browser" aria-label="Bucketlist 清单">
      <div className="bucketlist-browser__toolbar">
        <div className="article-archive-search bucketlist-browser__search">
          <span className="article-archive-search__icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="搜索电影标题、年份、类型..."
            aria-label="搜索电影标题、年份、类型"
          />
          {query && (
            <button type="button" onClick={() => changeQuery("")} aria-label="清除搜索">×</button>
          )}
        </div>

        <div className="bucketlist-browser__filters" role="tablist" aria-label="清单分类">
          {ALL_CATEGORIES.map((option) => {
            const count = categoryCounts.get(option.id) ?? 0;
            const isActive = category === option.id;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? "is-active" : undefined}
                disabled={count === 0}
                onClick={() => changeCategory(option.id)}
                key={option.id}
              >
                {option.label}
                <small>{count || "Soon"}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bucketlist-browser__summary">
        <span>
          当前显示 <strong>{filtered.length}</strong> / {items.filter((item) => item.kind === category).length} 部
        </span>
        <span className="bucketlist-browser__source">IMDb Top 250 · 本地快照</span>
      </div>

      {visibleItems.length === 0 ? (
        <div className="bucketlist-empty">
          <span aria-hidden="true">⌁</span>
          <p>没有找到符合条件的电影。</p>
          <button type="button" onClick={() => changeQuery("")}>清除搜索</button>
        </div>
      ) : (
        <div className="bucketlist-movie-list">
          {visibleItems.map((item) => {
            const isWatched = watched.has(item.id);
            const link = imdbHref(item);
            return (
              <article className={`bucketlist-movie ${isWatched ? "is-watched" : ""}`} key={item.id}>
                <div className="bucketlist-movie__rank" aria-label={`第 ${item.rank ?? ""} 名`}>
                  {String(item.rank ?? "—").padStart(3, "0")}
                </div>
                <div className="bucketlist-movie__poster">
                  {item.poster ? (
                    <img
                      src={item.poster}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => { event.currentTarget.hidden = true; }}
                    />
                  ) : null}
                  <div className="bucketlist-movie__poster-fallback" aria-hidden="true">
                    <span>{String(item.rank ?? "—").padStart(2, "0")}</span>
                    <small>IMDb</small>
                  </div>
                </div>
                <div className="bucketlist-movie__body">
                  <div className="bucketlist-movie__eyebrow">
                    <span>IMDb Top 250</span>
                    <span>{item.releaseYear ?? "年份待补"}</span>
                  </div>
                  <h2>
                    <a href={link} target="_blank" rel="noreferrer noopener">{item.titleZh}</a>
                  </h2>
                  <p className="bucketlist-movie__english">
                    <a href={link} target="_blank" rel="noreferrer noopener">{item.titleEn}</a>
                  </p>
                  <div className="bucketlist-movie__meta">
                    <span>{item.releaseYear ?? "年份待补"}</span>
                    <span>{formatRuntime(item.runtimeMinutes)}</span>
                    {item.genres.map((genre) => <span key={genre}>{genre}</span>)}
                  </div>
                  <p className="bucketlist-movie__summary">{item.summary}</p>
                </div>
                <button
                  type="button"
                  className="bucketlist-movie__watched"
                  aria-label={isWatched ? `取消标记：${item.titleZh}` : `标记已看：${item.titleZh}`}
                  aria-pressed={isWatched}
                  title={isWatched ? "取消已看" : "标记已看"}
                  onClick={() => toggleWatched(item.id)}
                >
                  <span aria-hidden="true">{isWatched ? "✓" : "○"}</span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="bucketlist-pagination" aria-label="电影列表分页">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
            上一页
          </button>
          <div className="bucketlist-pagination__pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                type="button"
                className={currentPage === pageNumber ? "is-active" : undefined}
                aria-current={currentPage === pageNumber ? "page" : undefined}
                onClick={() => setPage(pageNumber)}
                key={pageNumber}
              >
                {pageNumber}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>
            下一页
          </button>
        </nav>
      )}
    </section>
  );
}
