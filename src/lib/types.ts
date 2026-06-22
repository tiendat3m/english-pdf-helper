export type MainTab = "learn" | "vocabulary" | "progress";

export type ToolMode = "pan" | "pen" | "highlighter" | "note" | "eraser";

export type WorkspaceMode = "focus" | "split";

export type InputMode = "all" | "stylus";

export type StrokeColor = "black" | "blue" | "red";

export type HighlightColor = "yellow" | "green" | "pink";

export type PageStatus = "not-started" | "learning" | "done" | "need-review";

export type BookmarkCategory =
  | "Grammar"
  | "Vocabulary"
  | "Listening"
  | "Reading"
  | "Writing"
  | "Speaking"
  | "Mistake"
  | "Review later";

export type VocabStatus = "new" | "learning" | "mastered";

export interface BookRecord {
  id: string;
  title: string;
  fileName: string;
  blob: Blob;
  size: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  lastPage: number;
  totalPages: number;
  zoom: number;
  progress: number;
  deletedAt?: string;
}

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface StrokeAnnotation {
  id: string;
  bookId: string;
  pageNumber: number;
  type: "stroke";
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  opacity: number;
  points: Point[];
  createdAt: string;
}

export interface StickyNoteAnnotation {
  id: string;
  bookId: string;
  pageNumber: number;
  type: "note";
  x: number;
  y: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type Annotation = StrokeAnnotation | StickyNoteAnnotation;

export interface BookmarkRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  category: BookmarkCategory;
  label: string;
  createdAt: string;
}

export interface PageStatusRecord {
  id: string;
  bookId: string;
  pageNumber: number;
  status: PageStatus;
  updatedAt: string;
}

export interface VocabularyRecord {
  id: string;
  word: string;
  meaning: string;
  example: string;
  sourceBookId: string;
  sourceBookTitle: string;
  sourcePage: number;
  status: VocabStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudyActivity {
  id: string;
  type: "book-opened" | "book-deleted" | "book-restored" | "page-status" | "vocabulary" | "note" | "bookmark";
  label: string;
  createdAt: string;
}

export interface AppData {
  books: BookRecord[];
  annotations: Annotation[];
  bookmarks: BookmarkRecord[];
  pageStatuses: PageStatusRecord[];
  vocabulary: VocabularyRecord[];
  activities: StudyActivity[];
}

export interface EditorState {
  activeTab: MainTab;
  activeBookId: string | null;
  currentPage: number;
  zoom: number;
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  thickness: number;
  isDarkMode: boolean;
  isPaperMode: boolean;
  workspaceMode: WorkspaceMode;
  inputMode: InputMode;
  dailyPageGoal: number;
  targetBand: number;
  currentBand: number;
  searchQuery: string;
}
