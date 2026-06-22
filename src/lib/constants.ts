import type { BookmarkCategory, HighlightColor, PageStatus, StrokeColor } from "./types";

export const APP_NAME = "IELTS PDF Notes";

export const DEFAULT_ZOOM = 1.15;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;
export const ZOOM_STEP = 0.12;
export const DELETED_BOOK_RETENTION_DAYS = 30;

export const PEN_COLORS: Record<StrokeColor, string> = {
  black: "#1f2933",
  blue: "#2563eb",
  red: "#dc2626"
};

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#86efac",
  pink: "#f9a8d4"
};

export const BOOKMARK_CATEGORIES: BookmarkCategory[] = [
  "Grammar",
  "Vocabulary",
  "Listening",
  "Reading",
  "Writing",
  "Speaking",
  "Mistake",
  "Review later"
];

export const PAGE_STATUS_LABELS: Record<PageStatus, string> = {
  "not-started": "Not Started",
  learning: "Learning",
  done: "Done",
  "need-review": "Need Review"
};

export const PAGE_STATUS_STYLES: Record<PageStatus, string> = {
  "not-started": "border-stone-300 bg-white text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300",
  learning: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200",
  done: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-200",
  "need-review": "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-200"
};

export const SAMPLE_BOOKS = [
  { title: "English Vocabulary in Use", lastPage: "52", progress: 42 },
  { title: "Grammar in Use", lastPage: "25", progress: 18 },
  { title: "Cambridge IELTS 19", lastPage: "Test 2", progress: 36 }
];
