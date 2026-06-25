export type MainTab = "learn" | "vocabulary" | "progress";

export type ToolMode = "pan" | "pen" | "highlighter" | "note" | "eraser";

export type WorkspaceMode = "focus" | "split";

export type InputMode = "all" | "stylus";

export type ThemeMode = "light" | "warm" | "dark";

export type StrokeColor = "black" | "blue" | "red";

export type HighlightColor = "yellow" | "green" | "pink";

export type BrushStyle = "ballpoint" | "pencil" | "marker" | "fountain";

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

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextItem {
  id: string;
  text: string;
  order: number;
  box: NormalizedRect;
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
  brush?: BrushStyle;
  points: Point[];
  createdAt: string;
}

export interface HighlightAnnotation {
  id: string;
  bookId: string;
  pageNumber: number;
  type: "highlight";
  color: string;
  opacity: number;
  rect: NormalizedRect;
  selectedText: string;
  selectedTextSource?: "pdf-text" | "handwriting" | "visual";
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

export type Annotation = StrokeAnnotation | HighlightAnnotation | StickyNoteAnnotation;

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
  ipa?: string;
  partOfSpeech?: string;
  meaning: string;
  vietnameseMeaning?: string;
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
  type:
    | "book-opened"
    | "book-deleted"
    | "book-restored"
    | "book-permanently-deleted"
    | "page-status"
    | "vocabulary"
    | "note"
    | "bookmark";
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
  brushStyle: BrushStyle;
  thickness: number;
  theme: ThemeMode;
  workspaceMode: WorkspaceMode;
  sidebarCollapsed: boolean;
  inputMode: InputMode;
  aiEnabled: boolean;
  dailyPageGoal: number;
  targetBand: number;
  currentBand: number;
  searchQuery: string;
}
