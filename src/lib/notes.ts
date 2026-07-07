import { getCollection, type CollectionEntry } from "astro:content";

export type NoteEntry = CollectionEntry<"notes">;

export async function getPublishedNotes() {
  const notes = await getCollection("notes", ({ data }) => !data.draft && data.folder !== "Root");
  return sortNotes(notes);
}

export function sortNotes(notes: NoteEntry[]) {
  return [...notes].sort((a, b) => {
    const aDate = Date.parse(a.data.updated || a.data.created || "");
    const bDate = Date.parse(b.data.updated || b.data.created || "");
    if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
      return bDate - aDate;
    }
    return a.data.title.localeCompare(b.data.title, "zh-CN");
  });
}

export function noteDisplayDate(note: NoteEntry) {
  const raw = note.data.updated || note.data.created;
  if (!raw) return "未标注";
  const date = new Date(raw);
  if (!Number.isFinite(date.valueOf())) return raw;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function noteHref(note: Pick<NoteEntry, "id">) {
  return `/notes/${note.id}/`;
}
