import { useMemo, useState } from "react";

type NoteItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  sourcePath: string;
  dateLabel: string;
};

type Props = {
  notes: NoteItem[];
};

const ALL_FILTER = "全部";

function shortFolder(folder: string) {
  return folder === "Root" ? "根目录" : folder;
}

function folderTone(folder: string) {
  const normalized = folder.split("/")[0].toLowerCase();
  if (normalized === "finance") return "finance";
  if (normalized === "computer") return "computer";
  return "default";
}

export default function NotesVault({ notes }: Props) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState(ALL_FILTER);
  const [tag, setTag] = useState(ALL_FILTER);

  const folders = useMemo(() => [ALL_FILTER, ...Array.from(new Set(notes.map((note) => note.folder)))], [notes]);
  const scopedNotes = useMemo(
    () => (folder === ALL_FILTER ? notes : notes.filter((note) => note.folder === folder)),
    [folder, notes],
  );
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of scopedNotes) {
      for (const item of note.tags) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  }, [scopedNotes]);

  const stats = useMemo(() => ({
    total: notes.length,
    folders: new Set(notes.map((note) => note.folder)).size,
    tags: new Set(notes.flatMap((note) => note.tags)).size,
    finance: notes.filter((note) => note.folder.toLowerCase().includes("finance")).length,
  }), [notes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes.filter((note) => {
      if (folder !== ALL_FILTER && note.folder !== folder) return false;
      if (tag !== ALL_FILTER && !note.tags.includes(tag)) return false;
      if (!needle) return true;
      return [
        note.title,
        note.description,
        note.folder,
        note.sourcePath,
        ...note.tags,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [folder, notes, query, tag]);

  function clearFilters() {
    setQuery("");
    setFolder(ALL_FILTER);
    setTag(ALL_FILTER);
  }

  return (
    <section className="notes-vault page-section">
      <div className="notes-vault__intro">
        <header className="notes-vault__header">
          <div className="article-archive-header__eyebrow">
            <span className="article-archive-header__line"></span>
            Notes · Obsidian Vault
          </div>
          <h1 className="article-archive-header__title">
            我的笔记
            <span>× {stats.total}</span>
          </h1>
          <p className="article-archive-header__copy">
            从 GitHub 上的 Obsidian 仓库同步，按文件夹预先分类，用标签和搜索继续筛选学习笔记、金融资料和工具记录。
          </p>
          <div className="article-archive-header__stats">
            <div className="accent-teal">
              <strong>{stats.total}</strong>
              <span>笔记</span>
            </div>
            <div className="accent-blue">
              <strong>{stats.folders}</strong>
              <span>文件夹</span>
            </div>
            <div className="accent-green">
              <strong>{stats.tags}</strong>
              <span>标签</span>
            </div>
            <div className="accent-purple">
              <strong>{stats.finance}</strong>
              <span>金融笔记</span>
            </div>
          </div>
        </header>

        <div className="article-archive-controls notes-vault__controls">
          <div className="article-archive-controls__row">
            <div className="article-archive-search">
              <span className="article-archive-search__icon">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索笔记标题、路径、标签..."
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="article-archive-controls__summary">
            <span>
              当前显示 <strong>{filtered.length}</strong> / {notes.length} 篇笔记
            </span>
            {(query || folder !== ALL_FILTER || tag !== ALL_FILTER) && (
              <button type="button" onClick={clearFilters}>清除筛选</button>
            )}
          </div>
        </div>
      </div>

      <div className="notes-vault__workspace">
        <aside className="notes-vault__sidebar notes-vault__sidebar--folders" aria-label="笔记文件夹">
          <div className="notes-vault__sidebar-title">Folders</div>
          <div className="notes-vault__folder-list">
            {folders.map((item) => (
              <button
                type="button"
                key={item}
                className={folder === item ? "is-active" : undefined}
                onClick={() => setFolder(item)}
              >
                <span>{shortFolder(item)}</span>
                <small>{item === ALL_FILTER ? notes.length : notes.filter((note) => note.folder === item).length}</small>
              </button>
            ))}
          </div>
        </aside>

        <div className="notes-vault__results">
          {filtered.length === 0 ? (
            <div className="home-empty article-archive-empty">
              <div>○</div>
              <p>没有找到符合条件的笔记</p>
              <button type="button" onClick={clearFilters}>清除筛选</button>
            </div>
          ) : (
            <div className="notes-vault__grid">
              {filtered.map((note) => (
                <a className={`notes-vault-card is-${folderTone(note.folder)}`} href={note.href} key={note.id}>
                  <div className="notes-vault-card__top">
                    <span className="notes-vault-card__folder">{shortFolder(note.folder)}</span>
                    <span className="notes-vault-card__date">{note.dateLabel}</span>
                  </div>
                  <h2>{note.title}</h2>
                  <p>{note.description || "这篇笔记暂时没有摘要，点进去看看正文内容。"}</p>
                  <div className="notes-vault-card__path">{note.sourcePath}</div>
                  {note.tags.length > 0 && (
                    <div className="article-archive-stack-row">
                      {note.tags.slice(0, 5).map((item) => (
                        <span className="stack-pill" key={item}>#{item}</span>
                      ))}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        <aside className="notes-vault__sidebar notes-vault__sidebar--tags" aria-label="笔记标签">
          <div className="notes-vault__sidebar-title">Tags</div>
          <div className="notes-vault__tag-list">
            <button
              type="button"
              className={tag === ALL_FILTER ? "is-active" : undefined}
              onClick={() => setTag(ALL_FILTER)}
            >
              <span>全部标签</span>
              <small>{scopedNotes.length}</small>
            </button>
            {tagCounts.map(([item, count]) => (
              <button
                type="button"
                key={item}
                className={tag === item ? "is-active" : undefined}
                onClick={() => setTag(item)}
              >
                <span>#{item}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
