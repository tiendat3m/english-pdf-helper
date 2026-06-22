import type { AppData, BookRecord, PageStatusRecord, StudyActivity } from "./types";

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function formatPercent(value: number) {
  return `${Math.round(clamp(value, 0, 100))}%`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stripPdfExtension(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

export function bookProgress(book: BookRecord) {
  if (!book.totalPages) {
    return 0;
  }
  return clamp((book.lastPage / book.totalPages) * 100, 0, 100);
}

export function getOverallProgress(books: BookRecord[]) {
  if (!books.length) {
    return 0;
  }
  return books.reduce((sum, book) => sum + book.progress, 0) / books.length;
}

export function getStudyStreak(activities: StudyActivity[]) {
  const days = new Set(activities.map((activity) => activity.createdAt.slice(0, 10)));
  if (!days.size) {
    return 0;
  }

  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function countStudiedPages(statuses: PageStatusRecord[]) {
  return statuses.filter((item) => item.status === "done" || item.status === "learning").length;
}

export function countDonePagesToday(statuses: PageStatusRecord[]) {
  const today = nowIso().slice(0, 10);
  return statuses.filter((item) => item.status === "done" && item.updatedAt.slice(0, 10) === today).length;
}

export function estimateBand(overallProgress: number, masteredVocabulary: number, notesCount: number) {
  const progressBoost = clamp(overallProgress / 100, 0, 1) * 0.8;
  const vocabBoost = clamp(masteredVocabulary / 500, 0, 1) * 0.5;
  const noteBoost = clamp(notesCount / 250, 0, 1) * 0.2;
  return clamp(5.5 + progressBoost + vocabBoost + noteBoost, 4, 8.5);
}

export function emptyAppData(): AppData {
  return {
    books: [],
    annotations: [],
    bookmarks: [],
    pageStatuses: [],
    vocabulary: [],
    activities: []
  };
}
