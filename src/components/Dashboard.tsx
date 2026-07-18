"use client";

import "@/lib/browserPolyfills";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Brain,
  CalendarDays,
  CircleDot,
  CloudDownload,
  CloudUpload,
  Download,
  Flame,
  GraduationCap,
  Home,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  NotebookPen,
  PenLine,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload
} from "lucide-react";
import PdfUploader from "./PdfUploader";
import PdfSidebar from "./PdfSidebar";
import ProgressPanel from "./ProgressPanel";
import StudyWorkspacePanel from "./StudyWorkspacePanel";
import Toolbar from "./Toolbar";
import VocabularyPanel from "./VocabularyPanel";
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SAMPLE_BOOKS, ZOOM_STEP } from "@/lib/constants";
import {
  createAppDataBackup,
  deleteAnnotation,
  deleteVocabulary,
  exportAppDataBackup,
  importBook,
  importAppDataBackup,
  loadAppData,
  permanentlyDeleteBooks,
  restoreBook,
  saveAnnotation,
  saveBook,
  saveBookmark,
  savePageStatus,
  saveVocabulary,
  softDeleteBook,
  restoreAppDataBackup,
  touchBook
} from "@/lib/db";
import { initialEditorState, shortcutToTool } from "@/lib/editorStore";
import type {
  Annotation,
  AppData,
  BookRecord,
  BookmarkCategory,
  EditorState,
  MainTab,
  PageStatus,
  VocabularyRecord,
  VocabStatus
} from "@/lib/types";
import { emptyAppData, formatPercent, getOverallProgress, getStudyStreak, nowIso } from "@/lib/utils";
import { v4 as uuid } from "uuid";

type VocabularyDraft = Omit<
  VocabularyRecord,
  | "id"
  | "ipa"
  | "partOfSpeech"
  | "meaning"
  | "vietnameseMeaning"
  | "synonyms"
  | "antonyms"
  | "example"
  | "status"
  | "createdAt"
  | "updatedAt"
> & {
  selectedImageDataUrl?: string;
};

type AiMode = "vocab" | "explain" | "grammar" | "note" | "solve";

interface AiResult {
  title: string;
  summary: string;
  ipa: string;
  partOfSpeech: string;
  meaning: string;
  synonyms: string;
  antonyms: string;
  usage: string;
  collocations: string;
  commonMistake: string;
  example: string;
  grammar: string;
  vietnamese: string;
  suggestedNote: string;
}

type HistoryAction =
  | { type: "add"; annotations: Annotation[] }
  | { type: "delete"; annotations: Annotation[] };

interface AiCacheEntry {
  key: string;
  result: AiResult;
  updatedAt: string;
}

const MANUAL_VOCABULARY_SOURCE_ID = "manual-vocabulary";
const SYNC_CODE_STORAGE_KEY = "ielts-pdf-notes-sync-code";
const WORKSPACE_SESSION_STORAGE_KEY = "ielts-pdf-notes-workspace-session";
const AI_CACHE_STORAGE_KEY = "ielts-pdf-notes-ai-cache";
const MAX_AI_CACHE_ENTRIES = 80;
const CLOUD_SYNC_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CLOUD_SYNC_PARTS = 500;
const WORKSPACE_URL_KEYS = ["tab", "book", "page", "zoom", "workspace", "sidebar", "open"];

interface CloudUploadUrlsResponse {
  partUrls: string[];
  manifestUrl: string;
  expiresIn: number;
}

interface CloudDownloadIndexResponse {
  kind: "chunked" | "legacy";
  signedUrl: string;
  expiresIn: number;
}

interface CloudDownloadPartsResponse {
  kind: "parts";
  partUrls: string[];
  expiresIn: number;
}

interface CloudBackupManifest {
  version: 1;
  format: "chunked-json";
  partCount: number;
  byteLength: number;
  createdAt: string;
}

type WorkspaceSession = Partial<
  Pick<EditorState, "activeTab" | "activeBookId" | "currentPage" | "zoom" | "workspaceMode" | "sidebarCollapsed">
> & {
  isWorkspaceOpen?: boolean;
};

function clampPage(page: number) {
  return Math.max(1, Math.floor(page));
}

function clampZoom(zoom: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function isMainTab(value: string | null): value is MainTab {
  return value === "learn" || value === "vocabulary" || value === "progress";
}

function isWorkspaceMode(value: string | null): value is EditorState["workspaceMode"] {
  return value === "focus" || value === "split";
}

function parsePositiveNumber(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readWorkspaceSessionFromUrl(): WorkspaceSession | null {
  const params = new URLSearchParams(window.location.search);
  if (!WORKSPACE_URL_KEYS.some((key) => params.has(key))) {
    return null;
  }

  const session: WorkspaceSession = {};
  const tab = params.get("tab");
  const page = parsePositiveNumber(params.get("page"));
  const zoom = parsePositiveNumber(params.get("zoom"));
  const workspaceMode = params.get("workspace");
  const sidebar = params.get("sidebar");
  const open = params.get("open");
  const book = params.get("book");

  if (isMainTab(tab)) {
    session.activeTab = tab;
  }
  if (book) {
    session.activeBookId = book;
  }
  if (page) {
    session.currentPage = clampPage(page);
  }
  if (zoom) {
    session.zoom = clampZoom(zoom);
  }
  if (isWorkspaceMode(workspaceMode)) {
    session.workspaceMode = workspaceMode;
  }
  if (sidebar === "hidden" || sidebar === "open") {
    session.sidebarCollapsed = sidebar === "hidden";
  }
  if (open === "1" || open === "0") {
    session.isWorkspaceOpen = open === "1";
  }

  return session;
}

function readStoredWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as WorkspaceSession;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function mergeWorkspaceSession(editor: EditorState, session: WorkspaceSession): EditorState {
  return {
    ...editor,
    activeTab: session.activeTab ?? editor.activeTab,
    activeBookId: session.activeBookId ?? editor.activeBookId,
    currentPage: session.currentPage ? clampPage(session.currentPage) : editor.currentPage,
    zoom: session.zoom ? clampZoom(session.zoom) : editor.zoom,
    workspaceMode: session.workspaceMode ?? editor.workspaceMode,
    sidebarCollapsed: typeof session.sidebarCollapsed === "boolean" ? session.sidebarCollapsed : editor.sidebarCollapsed
  };
}

function createWorkspaceSession(editor: EditorState, isWorkspaceOpen: boolean): WorkspaceSession {
  return {
    activeTab: editor.activeTab,
    activeBookId: editor.activeBookId,
    currentPage: editor.currentPage,
    zoom: editor.zoom,
    workspaceMode: editor.workspaceMode,
    sidebarCollapsed: editor.sidebarCollapsed,
    isWorkspaceOpen
  };
}

function writeStoredWorkspaceSession(editor: EditorState, isWorkspaceOpen: boolean) {
  localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(createWorkspaceSession(editor, isWorkspaceOpen)));
}

function getWorkspaceNavigationKey(editor: EditorState, isWorkspaceOpen: boolean) {
  return [editor.activeTab, editor.activeBookId ?? "", isWorkspaceOpen ? "open" : "home", editor.currentPage, editor.workspaceMode].join("|");
}

function buildWorkspaceUrl(editor: EditorState, isWorkspaceOpen: boolean) {
  const url = new URL(window.location.href);
  WORKSPACE_URL_KEYS.forEach((key) => url.searchParams.delete(key));

  if (editor.activeTab !== "learn") {
    url.searchParams.set("tab", editor.activeTab);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  if (!isWorkspaceOpen) {
    url.searchParams.set("tab", "learn");
    url.searchParams.set("open", "0");
    return `${url.pathname}${url.search}${url.hash}`;
  }

  url.searchParams.set("tab", "learn");
  url.searchParams.set("open", "1");
  if (editor.activeBookId) {
    url.searchParams.set("book", editor.activeBookId);
  }
  url.searchParams.set("page", String(editor.currentPage));
  url.searchParams.set("zoom", editor.zoom.toFixed(2));
  url.searchParams.set("workspace", editor.workspaceMode);
  url.searchParams.set("sidebar", editor.sidebarCollapsed ? "hidden" : "open");

  return `${url.pathname}${url.search}${url.hash}`;
}

function aiCacheKey(mode: AiMode, text: string) {
  return `${mode}:${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function readAiCacheEntry(key: string): AiResult | null {
  try {
    const entries = JSON.parse(localStorage.getItem(AI_CACHE_STORAGE_KEY) ?? "[]") as AiCacheEntry[];
    const match = entries.find((entry) => entry.key === key);
    return match?.result ?? null;
  } catch {
    return null;
  }
}

function writeAiCacheEntry(key: string, result: AiResult) {
  try {
    const entries = JSON.parse(localStorage.getItem(AI_CACHE_STORAGE_KEY) ?? "[]") as AiCacheEntry[];
    const nextEntries = [
      { key, result, updatedAt: nowIso() },
      ...entries.filter((entry) => entry.key !== key)
    ].slice(0, MAX_AI_CACHE_ENTRIES);
    localStorage.setItem(AI_CACHE_STORAGE_KEY, JSON.stringify(nextEntries));
  } catch {
    // AI cache is a quota saver only; ignore storage pressure or private-mode failures.
  }
}

async function getResponseMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message || payload.error || fallback;
  } catch {
    return fallback;
  }
}

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[620px] flex-1 place-items-center text-sm font-semibold text-stone-500">
      Preparing PDF workspace...
    </div>
  )
});

export default function Dashboard() {
  const backupInputRef = useRef<HTMLInputElement>(null);
  const suppressUrlSyncRef = useRef(false);
  const lastNavigationKeyRef = useRef("");
  const [data, setData] = useState<AppData>(emptyAppData());
  const [editor, setEditor] = useState(initialEditorState);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [aiSelection, setAiSelection] = useState<VocabularyDraft | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>("vocab");
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [vocabularyMeta, setVocabularyMeta] = useState({
    ipa: "",
    partOfSpeech: "",
    meaning: "",
    vietnameseMeaning: "",
    synonyms: "",
    antonyms: "",
    example: ""
  });
  const [vocabSearch, setVocabSearch] = useState("");
  const [vocabFilter, setVocabFilter] = useState<VocabStatus | "all">("all");
  const [vocabSort, setVocabSort] = useState<"newest" | "word" | "status">("newest");
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [syncCode, setSyncCode] = useState("");
  const [isSyncCodeLoaded, setIsSyncCodeLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    refreshData().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const urlSession = readWorkspaceSessionFromUrl();
    const storedSession = urlSession ?? readStoredWorkspaceSession();

    if (storedSession) {
      setEditor((current) => mergeWorkspaceSession(current, storedSession));
      setIsWorkspaceOpen(
        typeof storedSession.isWorkspaceOpen === "boolean"
          ? storedSession.isWorkspaceOpen
          : storedSession.activeTab === "learn" && Boolean(storedSession.activeBookId)
      );
    }

    setIsNavigationReady(true);
  }, []);

  useEffect(() => {
    function handlePopState() {
      const urlSession = readWorkspaceSessionFromUrl();
      suppressUrlSyncRef.current = true;

      if (!urlSession) {
        setEditor((current) => ({ ...current, activeTab: "learn" }));
        setIsWorkspaceOpen(false);
        return;
      }

      setEditor((current) => mergeWorkspaceSession(current, urlSession));
      setIsWorkspaceOpen(
        typeof urlSession.isWorkspaceOpen === "boolean"
          ? urlSession.isWorkspaceOpen
          : urlSession.activeTab === "learn" && Boolean(urlSession.activeBookId)
      );
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isNavigationReady) {
      return;
    }

    writeStoredWorkspaceSession(editor, isWorkspaceOpen);

    const nextNavigationKey = getWorkspaceNavigationKey(editor, isWorkspaceOpen);
    const nextUrl = buildWorkspaceUrl(editor, isWorkspaceOpen);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (suppressUrlSyncRef.current) {
      suppressUrlSyncRef.current = false;
      lastNavigationKeyRef.current = nextNavigationKey;
      return;
    }

    if (nextUrl !== currentUrl) {
      const shouldPush = Boolean(lastNavigationKeyRef.current) && lastNavigationKeyRef.current !== nextNavigationKey;
      window.history[shouldPush ? "pushState" : "replaceState"]({ source: "ielts-pdf-notes" }, "", nextUrl);
    }

    lastNavigationKeyRef.current = nextNavigationKey;
  }, [editor, isNavigationReady, isWorkspaceOpen]);

  useEffect(() => {
    setSyncCode(localStorage.getItem(SYNC_CODE_STORAGE_KEY) ?? "");
    setIsSyncCodeLoaded(true);
  }, []);

  useEffect(() => {
    if (!isSyncCodeLoaded) {
      return;
    }

    const nextCode = syncCode.trim();
    if (nextCode) {
      localStorage.setItem(SYNC_CODE_STORAGE_KEY, nextCode);
    } else {
      localStorage.removeItem(SYNC_CODE_STORAGE_KEY);
    }
  }, [isSyncCodeLoaded, syncCode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", editor.theme === "dark");
    document.documentElement.classList.toggle("theme-warm", editor.theme === "warm");
  }, [editor.theme]);

  const activeBooks = useMemo(() => data.books.filter((book) => !book.deletedAt), [data.books]);
  const activeBookIds = useMemo(() => new Set(activeBooks.map((book) => book.id)), [activeBooks]);
  const deletedBooks = useMemo(
    () => data.books.filter((book) => book.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [data.books]
  );
  const activeData = useMemo(
    () => ({
      ...data,
      books: activeBooks,
      annotations: data.annotations.filter((annotation) => activeBookIds.has(annotation.bookId)),
      bookmarks: data.bookmarks.filter((bookmark) => activeBookIds.has(bookmark.bookId)),
      pageStatuses: data.pageStatuses.filter((status) => activeBookIds.has(status.bookId)),
      vocabulary: data.vocabulary.filter((item) => activeBookIds.has(item.sourceBookId) || item.sourceBookId === MANUAL_VOCABULARY_SOURCE_ID)
    }),
    [activeBookIds, activeBooks, data]
  );

  const activeBook = useMemo(
    () => activeBooks.find((book) => book.id === editor.activeBookId) ?? activeBooks[0] ?? null,
    [activeBooks, editor.activeBookId]
  );

  useEffect(() => {
    if ((!editor.activeBookId || !activeBooks.some((book) => book.id === editor.activeBookId)) && activeBooks[0]) {
      setEditor((current) => ({
        ...current,
        activeBookId: activeBooks[0].id,
        currentPage: activeBooks[0].lastPage || 1,
        zoom: activeBooks[0].zoom || DEFAULT_ZOOM
      }));
    }
  }, [activeBooks, editor.activeBookId]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (event.key === "+") {
        event.preventDefault();
        changeZoom(editor.zoom + ZOOM_STEP);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        changeZoom(editor.zoom - ZOOM_STEP);
        return;
      }

      const tool = shortcutToTool(event.key);
      if (tool) {
        setEditor((current) => ({ ...current, tool }));
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  async function refreshData() {
    const next = await loadAppData();
    setData(next);
    return next;
  }

  async function handleImport(file: File) {
    const book = await importBook(file);
    setEditor((current) => ({
      ...current,
      activeTab: "learn",
      activeBookId: book.id,
      currentPage: 1,
      zoom: DEFAULT_ZOOM
    }));
    setIsWorkspaceOpen(true);
    await refreshData();
  }

  async function openBook(bookId: string) {
    await openBookAtPage(bookId);
  }

  async function openBookAtPage(bookId: string, page?: number) {
    const book = activeBooks.find((item) => item.id === bookId);
    if (!book) {
      return;
    }
    const nextPage = Math.max(1, Math.min(page ?? book.lastPage ?? 1, book.totalPages || page || book.lastPage || 1));
    await touchBook(book, { lastOpenedAt: nowIso() });
    setEditor((current) => ({
      ...current,
      activeTab: "learn",
      activeBookId: book.id,
      currentPage: nextPage,
      zoom: book.zoom || DEFAULT_ZOOM
    }));
    setIsWorkspaceOpen(true);
    await refreshData();
  }

  async function handleDeleteBook(bookId: string) {
    const deletedBook = await softDeleteBook(bookId);
    if (!deletedBook) {
      return;
    }

    const remainingBooks = activeBooks.filter((book) => book.id !== bookId);
    if (editor.activeBookId === bookId) {
      const nextBook = remainingBooks[0] ?? null;
      setEditor((current) => ({
        ...current,
        activeBookId: nextBook?.id ?? null,
        currentPage: nextBook?.lastPage ?? 1,
        zoom: nextBook?.zoom ?? DEFAULT_ZOOM
      }));
      if (!nextBook) {
        setIsWorkspaceOpen(false);
      }
    }
    await refreshData();
  }

  async function handleRestoreBook(bookId: string) {
    const restoredBook = await restoreBook(bookId);
    if (!restoredBook) {
      return;
    }

    setEditor((current) => ({
      ...current,
      activeBookId: restoredBook.id,
      currentPage: restoredBook.lastPage || 1,
      zoom: restoredBook.zoom || DEFAULT_ZOOM
    }));
    await refreshData();
  }

  async function handlePermanentDeleteBooks(bookIds: string[]) {
    if (!bookIds.length) {
      return;
    }

    await permanentlyDeleteBooks(bookIds);
    if (editor.activeBookId && bookIds.includes(editor.activeBookId)) {
      const nextBook = activeBooks.find((book) => !bookIds.includes(book.id)) ?? null;
      setEditor((current) => ({
        ...current,
        activeBookId: nextBook?.id ?? null,
        currentPage: nextBook?.lastPage ?? 1,
        zoom: nextBook?.zoom ?? DEFAULT_ZOOM
      }));
      if (!nextBook) {
        setIsWorkspaceOpen(false);
      }
    }
    await refreshData();
  }

  async function persistActiveBook(patch: Partial<BookRecord>) {
    if (!activeBook) {
      return;
    }
    const next = await touchBook(activeBook, patch);
    setData((current) => ({
      ...current,
      books: current.books.map((book) => (book.id === next.id ? next : book))
    }));
  }

  function changePage(page: number) {
    if (!activeBook) {
      return;
    }
    const nextPage = Math.max(1, Math.min(page, activeBook.totalPages || page));
    setEditor((current) => ({ ...current, currentPage: nextPage }));
    void persistActiveBook({ lastPage: nextPage });
  }

  function changeZoom(zoom: number) {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    setEditor((current) => ({ ...current, zoom: nextZoom }));
    void persistActiveBook({ zoom: nextZoom });
  }

  async function handleDocumentLoaded(totalPages: number) {
    if (!activeBook || activeBook.totalPages === totalPages) {
      return;
    }
    await persistActiveBook({ totalPages });
  }

  function addAnnotation(annotation: Annotation) {
    setData((current) => ({ ...current, annotations: [...current.annotations, annotation] }));
    setUndoStack((current) => [...current, { type: "add", annotations: [annotation] }]);
    setRedoStack([]);
    void saveAnnotation(annotation);
  }

  function updateAnnotation(annotation: Annotation) {
    setData((current) => ({
      ...current,
      annotations: current.annotations.map((item) => (item.id === annotation.id ? annotation : item))
    }));
    void saveAnnotation(annotation);
  }

  function removeAnnotations(ids: string[]) {
    if (!ids.length) {
      return;
    }

    const idSet = new Set(ids);
    const annotationsToDelete = data.annotations.filter((annotation) => idSet.has(annotation.id));
    if (!annotationsToDelete.length) {
      return;
    }

    setUndoStack((current) => [...current, { type: "delete", annotations: annotationsToDelete }]);
    setRedoStack([]);
    setData((current) => ({ ...current, annotations: current.annotations.filter((item) => !idSet.has(item.id)) }));
    void Promise.all(annotationsToDelete.map((annotation) => deleteAnnotation(annotation.id)));
  }

  function removeAnnotation(id: string) {
    removeAnnotations([id]);
  }

  function handleUndo() {
    const lastIndex = undoStack.findLastIndex((action) =>
      action.annotations.some((annotation) => annotation.bookId === activeBook?.id && annotation.pageNumber === editor.currentPage)
    );
    if (lastIndex < 0) {
      return;
    }

    const action = undoStack[lastIndex];
    setUndoStack((current) => current.filter((_, index) => index !== lastIndex));
    setRedoStack((current) => [...current, action]);

    if (action.type === "add") {
      const ids = new Set(action.annotations.map((annotation) => annotation.id));
      setData((current) => ({ ...current, annotations: current.annotations.filter((annotation) => !ids.has(annotation.id)) }));
      void Promise.all(action.annotations.map((annotation) => deleteAnnotation(annotation.id)));
      return;
    }

    setData((current) => ({ ...current, annotations: [...current.annotations, ...action.annotations] }));
    void Promise.all(action.annotations.map((annotation) => saveAnnotation(annotation)));
  }

  function handleRedo() {
    const lastIndex = redoStack.findLastIndex((action) =>
      action.annotations.some((annotation) => annotation.bookId === activeBook?.id && annotation.pageNumber === editor.currentPage)
    );
    if (lastIndex < 0) {
      return;
    }
    const action = redoStack[lastIndex];
    setRedoStack((current) => current.filter((_, index) => index !== lastIndex));
    setUndoStack((current) => [...current, action]);

    if (action.type === "add") {
      setData((current) => ({ ...current, annotations: [...current.annotations, ...action.annotations] }));
      void Promise.all(action.annotations.map((annotation) => saveAnnotation(annotation)));
      return;
    }

    const ids = new Set(action.annotations.map((annotation) => annotation.id));
    setData((current) => ({ ...current, annotations: current.annotations.filter((annotation) => !ids.has(annotation.id)) }));
    void Promise.all(action.annotations.map((annotation) => deleteAnnotation(annotation.id)));
  }

  function clearCurrentPageAnnotations() {
    if (!activeBook) {
      return;
    }

    const annotationsToDelete = data.annotations.filter((annotation) => {
      const samePage = annotation.bookId === activeBook.id && annotation.pageNumber === editor.currentPage;
      return samePage;
    });

    if (!annotationsToDelete.length) {
      return;
    }

    setUndoStack((current) => [...current, { type: "delete", annotations: annotationsToDelete }]);
    setRedoStack([]);
    const ids = new Set(annotationsToDelete.map((annotation) => annotation.id));
    setData((current) => ({ ...current, annotations: current.annotations.filter((annotation) => !ids.has(annotation.id)) }));
    void Promise.all(annotationsToDelete.map((annotation) => deleteAnnotation(annotation.id)));
  }

  async function handleSetPageStatus(status: PageStatus) {
    if (!activeBook) {
      return;
    }
    const record = await savePageStatus(activeBook.id, editor.currentPage, status);
    setData((current) => ({
      ...current,
      pageStatuses: [...current.pageStatuses.filter((item) => item.id !== record.id), record]
    }));
  }

  async function handleAddBookmark(category: BookmarkCategory) {
    if (!activeBook) {
      return;
    }
    const bookmark = {
      id: uuid(),
      bookId: activeBook.id,
      pageNumber: editor.currentPage,
      category,
      label: `${category} page ${editor.currentPage}`,
      createdAt: nowIso()
    };
    await saveBookmark(bookmark);
    setData((current) => ({ ...current, bookmarks: [...current.bookmarks, bookmark] }));
  }

  function applyAiResult(nextResult: AiResult) {
    setAiResult(nextResult);
    setVocabularyMeta({
      ipa: nextResult.ipa,
      partOfSpeech: nextResult.partOfSpeech,
      meaning: nextResult.meaning || nextResult.summary,
      vietnameseMeaning: nextResult.vietnamese,
      synonyms: nextResult.synonyms,
      antonyms: nextResult.antonyms,
      example: nextResult.example
    });
  }

  async function analyzeSelection(selection: VocabularyDraft, mode: AiMode) {
    setAiMode(mode);
    setAiError(null);
    setIsAiLoading(true);
    const selectedText = selection.word === "Highlighted passage" ? "" : selection.word.trim();
    const cacheKey = selectedText ? aiCacheKey(mode, selectedText) : "";

    if (cacheKey) {
      const cachedResult = readAiCacheEntry(cacheKey);
      if (cachedResult) {
        applyAiResult(cachedResult);
        setIsAiLoading(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/ai/ielts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          text: selectedText,
          imageDataUrl: selectedText ? undefined : selection.selectedImageDataUrl,
          sourceBookTitle: selection.sourceBookTitle,
          sourcePage: selection.sourcePage
        })
      });

      const payload = (await response.json()) as Partial<AiResult> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "AI request failed.");
      }

      const nextResult: AiResult = {
        title: payload.title || "AI study note",
        summary: payload.summary || "",
        ipa: payload.ipa || "",
        partOfSpeech: payload.partOfSpeech || "",
        meaning: payload.meaning || "",
        synonyms: payload.synonyms || "",
        antonyms: payload.antonyms || "",
        usage: payload.usage || "",
        collocations: payload.collocations || "",
        commonMistake: payload.commonMistake || "",
        example: payload.example || "",
        grammar: payload.grammar || "",
        vietnamese: payload.vietnamese || "",
        suggestedNote: payload.suggestedNote || payload.summary || ""
      };

      applyAiResult(nextResult);
      if (cacheKey) {
        writeAiCacheEntry(cacheKey, nextResult);
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not analyze this selection.");
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleAiAnalyze(mode: AiMode) {
    if (!aiSelection) {
      return;
    }

    await analyzeSelection(aiSelection, mode);
  }

  async function handleVocabularySave() {
    if (!aiSelection) {
      return;
    }
    const selectionRecord = { ...aiSelection };
    delete selectionRecord.selectedImageDataUrl;
    const record: VocabularyRecord = {
      ...selectionRecord,
      id: uuid(),
      ipa: vocabularyMeta.ipa || aiResult?.ipa || "",
      partOfSpeech: vocabularyMeta.partOfSpeech || aiResult?.partOfSpeech || "",
      meaning: vocabularyMeta.meaning || aiResult?.meaning || aiResult?.summary || "",
      vietnameseMeaning: vocabularyMeta.vietnameseMeaning || aiResult?.vietnamese || "",
      synonyms: vocabularyMeta.synonyms || aiResult?.synonyms || "",
      antonyms: vocabularyMeta.antonyms || aiResult?.antonyms || "",
      example: vocabularyMeta.example || aiResult?.example || "",
      status: "new",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveVocabulary(record);
    setData((current) => ({ ...current, vocabulary: [record, ...current.vocabulary] }));
    setAiSelection(null);
    setAiResult(null);
    setAiError(null);
    setVocabularyMeta({ ipa: "", partOfSpeech: "", meaning: "", vietnameseMeaning: "", synonyms: "", antonyms: "", example: "" });
  }

  function handleSaveAiNote() {
    if (!activeBook || !aiSelection) {
      return;
    }

    const text = [
      aiResult?.title || "AI note",
      aiResult?.suggestedNote || aiResult?.summary || aiSelection.word,
      aiResult?.usage ? `Usage: ${aiResult.usage}` : "",
      aiResult?.collocations ? `Collocations: ${aiResult.collocations}` : "",
      aiResult?.commonMistake ? `Common mistake: ${aiResult.commonMistake}` : "",
      aiResult?.vietnamese ? `VN: ${aiResult.vietnamese}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    addAnnotation({
      id: uuid(),
      bookId: activeBook.id,
      pageNumber: editor.currentPage,
      type: "note",
      x: 0.08,
      y: 0.08,
      text,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });

    setAiSelection(null);
    setAiResult(null);
    setAiError(null);
  }

  function handleAddQuickNote(text: string) {
    if (!activeBook) {
      return;
    }

    addAnnotation({
      id: uuid(),
      bookId: activeBook.id,
      pageNumber: editor.currentPage,
      type: "note",
      x: 0.12,
      y: 0.12,
      text,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  async function handleVocabularyStatus(record: VocabularyRecord, status: VocabStatus) {
    const next = { ...record, status, updatedAt: nowIso() };
    await saveVocabulary(next);
    setData((current) => ({
      ...current,
      vocabulary: current.vocabulary.map((item) => (item.id === record.id ? next : item))
    }));
  }

  async function handleVocabularyDelete(id: string) {
    await deleteVocabulary(id);
    setData((current) => ({ ...current, vocabulary: current.vocabulary.filter((item) => item.id !== id) }));
  }

  async function handleExportBackup() {
    setBackupStatus("Preparing backup...");
    try {
      const backupBlob = await exportAppDataBackup();
      const url = URL.createObjectURL(backupBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ielts-pdf-notes-backup-${nowIso().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupStatus("Backup exported.");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not export backup.");
    }
  }

  async function handleImportBackup(file: File) {
    setBackupStatus("Importing backup...");
    try {
      await importAppDataBackup(file);
      const next = await refreshData();
      const nextActiveBook = next.books.find((book) => !book.deletedAt) ?? null;
      if (nextActiveBook) {
        setEditor((current) => ({
          ...current,
          activeTab: "learn",
          activeBookId: nextActiveBook.id,
          currentPage: nextActiveBook.lastPage || 1,
          zoom: nextActiveBook.zoom || DEFAULT_ZOOM
        }));
        setIsWorkspaceOpen(true);
      }
      setBackupStatus("Backup imported.");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not import backup.");
    } finally {
      if (backupInputRef.current) {
        backupInputRef.current.value = "";
      }
    }
  }

  async function requestSignedSyncUrl<T>(
    endpoint: "/api/sync/upload-url" | "/api/sync/download-url",
    options: { partCount?: number } = {}
  ) {
    const code = syncCode.trim();
    if (!code) {
      throw new Error("Enter a sync code first.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncCode: code, ...options })
    });

    if (!response.ok) {
      throw new Error(await getResponseMessage(response, "Could not start cloud sync."));
    }

    return (await response.json()) as T;
  }

  async function uploadCloudBlob(signedUrl: string, blob: Blob, fileName: string) {
    const uploadBody = new FormData();
    uploadBody.append("cacheControl", "0");
    uploadBody.append("", blob, fileName);
    const response = await fetch(signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "true" },
      body: uploadBody
    });

    if (!response.ok) {
      throw new Error(await getResponseMessage(response, "Could not upload cloud backup."));
    }
  }

  async function handleCloudPush() {
    setIsSyncing(true);
    setBackupStatus("Pushing cloud backup...");
    try {
      const backupBlob = new Blob([JSON.stringify(await createAppDataBackup())], { type: "application/json" });
      const partCount = Math.ceil(backupBlob.size / CLOUD_SYNC_CHUNK_BYTES);
      if (partCount > MAX_CLOUD_SYNC_PARTS) {
        throw new Error("Cloud backup is too large to sync.");
      }

      const { partUrls, manifestUrl } = await requestSignedSyncUrl<CloudUploadUrlsResponse>(
        "/api/sync/upload-url",
        { partCount }
      );
      if (partUrls.length !== partCount || !manifestUrl) {
        throw new Error("Cloud sync returned an incomplete upload session.");
      }

      for (let index = 0; index < partCount; index += 1) {
        setBackupStatus(`Pushing cloud backup (${index + 1}/${partCount})...`);
        const start = index * CLOUD_SYNC_CHUNK_BYTES;
        const part = backupBlob.slice(start, Math.min(start + CLOUD_SYNC_CHUNK_BYTES, backupBlob.size));
        await uploadCloudBlob(partUrls[index], part, `${String(index).padStart(4, "0")}.part`);
      }

      const manifest: CloudBackupManifest = {
        version: 1,
        format: "chunked-json",
        partCount,
        byteLength: backupBlob.size,
        createdAt: new Date().toISOString()
      };
      await uploadCloudBlob(
        manifestUrl,
        new Blob([JSON.stringify(manifest)], { type: "application/json" }),
        "manifest.json"
      );

      setBackupStatus("Cloud backup pushed.");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not push cloud backup.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCloudPull() {
    setIsSyncing(true);
    setBackupStatus("Pulling cloud backup...");
    try {
      const index = await requestSignedSyncUrl<CloudDownloadIndexResponse>("/api/sync/download-url");
      let backup: unknown;

      if (index.kind === "legacy") {
        const downloadResponse = await fetch(index.signedUrl, { cache: "no-store" });
        if (!downloadResponse.ok) {
          throw new Error(await getResponseMessage(downloadResponse, "Could not download cloud backup."));
        }
        backup = await downloadResponse.json();
      } else {
        const manifestResponse = await fetch(index.signedUrl, { cache: "no-store" });
        if (!manifestResponse.ok) {
          throw new Error(await getResponseMessage(manifestResponse, "Could not download cloud manifest."));
        }
        const manifest = (await manifestResponse.json()) as Partial<CloudBackupManifest>;
        if (
          manifest.version !== 1 ||
          manifest.format !== "chunked-json" ||
          !Number.isInteger(manifest.partCount) ||
          !manifest.partCount ||
          manifest.partCount > MAX_CLOUD_SYNC_PARTS
        ) {
          throw new Error("Cloud backup manifest is invalid.");
        }

        const { partUrls } = await requestSignedSyncUrl<CloudDownloadPartsResponse>("/api/sync/download-url", {
          partCount: manifest.partCount
        });
        if (partUrls.length !== manifest.partCount) {
          throw new Error("Cloud sync returned an incomplete download session.");
        }

        const parts: Blob[] = [];
        for (let partIndex = 0; partIndex < partUrls.length; partIndex += 1) {
          setBackupStatus(`Pulling cloud backup (${partIndex + 1}/${partUrls.length})...`);
          const partResponse = await fetch(partUrls[partIndex], { cache: "no-store" });
          if (!partResponse.ok) {
            throw new Error(await getResponseMessage(partResponse, "Could not download a cloud backup part."));
          }
          parts.push(await partResponse.blob());
        }
        const backupBlob = new Blob(parts, { type: "application/json" });
        if (typeof manifest.byteLength === "number" && backupBlob.size !== manifest.byteLength) {
          throw new Error("Cloud backup is incomplete. Push it again from the source device.");
        }
        backup = JSON.parse(await backupBlob.text());
      }

      await restoreAppDataBackup(backup, { replace: true });
      const next = await refreshData();
      const nextActiveBook = next.books.find((book) => !book.deletedAt) ?? null;
      if (nextActiveBook) {
        setEditor((current) => ({
          ...current,
          activeTab: "learn",
          activeBookId: nextActiveBook.id,
          currentPage: nextActiveBook.lastPage || 1,
          zoom: nextActiveBook.zoom || DEFAULT_ZOOM
        }));
        setIsWorkspaceOpen(true);
      }
      setBackupStatus("Cloud backup pulled.");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "Could not pull cloud backup.");
    } finally {
      setIsSyncing(false);
    }
  }

  function resetAiDraft() {
    setAiResult(null);
    setAiError(null);
    setVocabularyMeta({ ipa: "", partOfSpeech: "", meaning: "", vietnameseMeaning: "", synonyms: "", antonyms: "", example: "" });
  }

  function handleManualVocabularyAdd(word: string) {
    const selection: VocabularyDraft = {
      word,
      sourceBookId: activeBook?.id ?? MANUAL_VOCABULARY_SOURCE_ID,
      sourceBookTitle: activeBook?.title ?? "Manual vocabulary",
      sourcePage: activeBook ? editor.currentPage : 0
    };

    setAiSelection(selection);
    setAiMode("explain");
    resetAiDraft();
    void analyzeSelection(selection, "explain");
  }

  function switchTab(tab: MainTab) {
    setEditor((current) => ({ ...current, activeTab: tab }));
  }

  function goHome() {
    setEditor((current) => ({ ...current, activeTab: "learn" }));
    setIsWorkspaceOpen(false);
  }

  const bookById = useMemo(() => new Map(activeBooks.map((book) => [book.id, book])), [activeBooks]);
  const sortedBooks = useMemo(
    () =>
      [...activeBooks].sort(
        (a, b) => (b.lastOpenedAt || b.updatedAt || b.createdAt).localeCompare(a.lastOpenedAt || a.updatedAt || a.createdAt)
      ),
    [activeBooks]
  );
  const continueBook = activeBook ?? sortedBooks[0] ?? null;
  const notesCount = activeData.annotations.filter((annotation) => annotation.type === "note").length;
  const dueVocabulary = activeData.vocabulary
    .filter((item) => item.status !== "mastered")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const masteredVocabularyCount = activeData.vocabulary.filter((item) => item.status === "mastered").length;
  const learningVocabularyCount = activeData.vocabulary.filter((item) => item.status === "learning").length;
  const newVocabularyCount = activeData.vocabulary.filter((item) => item.status === "new").length;
  const reviewPages = activeData.pageStatuses
    .filter((status) => status.status === "need-review" && bookById.has(status.bookId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((status) => ({ ...status, book: bookById.get(status.bookId)! }));
  const learningPages = activeData.pageStatuses.filter((status) => status.status === "learning").length;
  const recentActivities = data.activities.slice(0, 4);

  const stats = [
    { label: "Study streak", value: `${getStudyStreak(data.activities)} days`, icon: Flame },
    { label: "Total books", value: activeBooks.length.toString(), icon: BookOpen },
    { label: "Saved vocabulary", value: activeData.vocabulary.length.toString(), icon: Star },
    { label: "Notes count", value: notesCount.toString(), icon: NotebookPen },
    { label: "Overall progress", value: formatPercent(getOverallProgress(activeBooks)), icon: TrendingUp }
  ];

  const todayDonePages = activeData.pageStatuses.filter(
    (status) => status.status === "done" && status.updatedAt.slice(0, 10) === nowIso().slice(0, 10)
  ).length;
  const dailyGoalProgress = Math.min(100, (todayDonePages / Math.max(editor.dailyPageGoal, 1)) * 100);
  const needReviewCount = activeData.pageStatuses.filter((status) => status.status === "need-review").length;

  const recentBooks: Array<{ title: string; lastPage: string; progress: number; id?: string }> = activeBooks.length
    ? sortedBooks.slice(0, 4).map((book) => ({
        title: book.title,
        lastPage: book.lastPage.toString(),
        progress: book.progress,
        id: book.id
      }))
    : SAMPLE_BOOKS;

  const tabButton = (tab: MainTab, label: string) => (
    <button
      key={tab}
      type="button"
      onClick={() => switchTab(tab)}
      className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
        editor.activeTab === tab
          ? "bg-ink text-white dark:bg-paper dark:text-stone-950"
          : "text-stone-600 hover:bg-white/80 dark:text-stone-200 dark:hover:bg-stone-800"
      }`}
    >
      {label}
    </button>
  );

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm font-semibold text-stone-500">Opening IELTS PDF Notes...</div>;
  }

  return (
    <div
      className={`min-h-screen ${
        editor.theme === "warm" ? "bg-[#f9f6ee]" : editor.theme === "dark" ? "bg-stone-950" : "bg-slate-50"
      }`}
    >
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/86 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/86">
        <div className="mx-auto flex w-full max-w-[1580px] flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={goHome} className="flex items-center gap-3" title="Back to Learn home">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-sage text-white shadow-tool">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div className="text-lg font-black text-stone-950 dark:text-stone-50">IELTS PDF Notes</div>
              <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">Band 8 learning workspace</div>
            </div>
          </button>

          <nav className="flex rounded-lg bg-stone-100 p-1 dark:bg-stone-900">
            {tabButton("learn", "Learn")}
            {tabButton("vocabulary", "Vocabulary")}
            {tabButton("progress", "Progress")}
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              <input
                value={syncCode}
                onChange={(event) => setSyncCode(event.target.value)}
                placeholder="Sync code"
                aria-label="Cloud sync code"
                className="h-8 w-28 rounded-md bg-transparent px-2 text-xs font-bold text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 sm:w-36"
              />
              <button
                type="button"
                title="Push this browser data to cloud"
                disabled={isSyncing}
                onClick={() => void handleCloudPush()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-black text-stone-500 transition hover:bg-stone-100 hover:text-sage disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                Push
              </button>
              <button
                type="button"
                title="Pull cloud data into this browser"
                disabled={isSyncing}
                onClick={() => void handleCloudPull()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-black text-stone-500 transition hover:bg-stone-100 hover:text-sage disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <CloudDownload className="h-3.5 w-3.5" />
                Pull
              </button>
            </div>
            <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              <button
                type="button"
                title="Export local backup"
                onClick={() => void handleExportBackup()}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-black text-stone-500 transition hover:bg-stone-100 hover:text-sage dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                type="button"
                title="Import backup"
                onClick={() => backupInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-black text-stone-500 transition hover:bg-stone-100 hover:text-sage dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImportBackup(file);
                  }
                }}
              />
            </div>
            <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              {(["light", "warm", "dark"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  title={`Use ${theme} theme`}
                  onClick={() => setEditor((current) => ({ ...current, theme }))}
                  className={`rounded-md px-3 py-2 text-xs font-black capitalize transition ${
                    editor.theme === theme
                      ? "bg-ink text-white dark:bg-paper dark:text-stone-950"
                      : "text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
            {backupStatus && <div className="w-full text-right text-xs font-semibold text-sage">{backupStatus}</div>}
          </div>
        </div>
      </header>

      {editor.activeTab === "learn" && !isWorkspaceOpen && (
        <main className="mx-auto w-full max-w-[1580px] p-4 md:p-6 2xl:px-8">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Continue Learning</p>
                <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <h1 className="line-clamp-2 break-words text-2xl font-black leading-tight text-stone-950 dark:text-stone-50 md:text-3xl 2xl:text-4xl">
                      {continueBook?.title ?? "IELTS OS"}
                    </h1>
                    <p className="mt-2 text-sm font-semibold leading-6 text-stone-500 dark:text-stone-400">
                      {continueBook
                        ? `Page ${continueBook.lastPage}/${continueBook.totalPages || "..."} - ${formatPercent(continueBook.progress)} complete`
                        : "Import a PDF book to start your IELTS workspace."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-start gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (continueBook) {
                          void openBookAtPage(continueBook.id, continueBook.lastPage);
                        } else {
                          setIsWorkspaceOpen(true);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-tool transition hover:-translate-y-0.5 dark:bg-paper dark:text-stone-950"
                    >
                      <Play className="h-4 w-4" />
                      Continue
                    </button>
                    <PdfUploader onImport={handleImport} />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <StudyMetric
                    label="Today"
                    value={`${todayDonePages}/${editor.dailyPageGoal}`}
                    detail="pages done"
                    icon={CalendarDays}
                    accent="coral"
                  />
                  <StudyMetric
                    label="Due Vocab"
                    value={dueVocabulary.length.toString()}
                    detail={`${newVocabularyCount} new, ${learningVocabularyCount} learning`}
                    icon={Star}
                    accent="sage"
                  />
                  <StudyMetric
                    label="Review Pages"
                    value={needReviewCount.toString()}
                    detail={`${learningPages} still learning`}
                    icon={RotateCcw}
                    accent="rose"
                  />
                </div>

                <div className="mt-5 rounded-lg border border-stone-200 bg-paper/70 p-4 dark:border-stone-800 dark:bg-stone-900/80">
                  <div className="flex items-center justify-between text-sm font-black text-stone-800 dark:text-stone-100">
                    <span>Today focus</span>
                    <span>{formatPercent(dailyGoalProgress)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-stone-800">
                    <div className="h-full rounded-full bg-coral" style={{ width: `${dailyGoalProgress}%` }} />
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    <FocusAction
                      icon={Target}
                      label="Read next page"
                      detail={continueBook ? `Page ${continueBook.lastPage}` : "Import PDF"}
                      onClick={() => (continueBook ? void openBookAtPage(continueBook.id, continueBook.lastPage) : setIsWorkspaceOpen(true))}
                    />
                    <FocusAction
                      icon={ListChecks}
                      label="Review mistakes"
                      detail={reviewPages.length ? `${reviewPages.length} queued` : "No urgent pages"}
                      onClick={() => {
                        const first = reviewPages[0];
                        if (first) {
                          void openBookAtPage(first.bookId, first.pageNumber);
                        }
                      }}
                      disabled={!reviewPages.length}
                    />
                    <FocusAction
                      icon={Star}
                      label="Vocab reps"
                      detail={dueVocabulary.length ? `${dueVocabulary.length} due` : "Deck clear"}
                      onClick={() => {
                        setVocabFilter(learningVocabularyCount ? "learning" : newVocabularyCount ? "new" : "all");
                        switchTab("vocabulary");
                      }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <section className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                    <div className="flex items-center gap-2 text-sm font-black text-stone-900 dark:text-stone-50">
                      <BookOpen className="h-4 w-4 text-sage" />
                      Recent books
                    </div>
                    <div className="mt-3 grid gap-2">
                      {recentBooks.map((book, index) => (
                        <button
                          key={`${book.title}-${index}`}
                          type="button"
                          onClick={() => (book.id ? void openBook(book.id) : undefined)}
                          className="rounded-md border border-stone-200 bg-stone-50 p-3 text-left transition hover:border-sage dark:border-stone-800 dark:bg-stone-900"
                        >
                          <div className="truncate text-sm font-black text-stone-900 dark:text-stone-50">{book.title}</div>
                          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-stone-500">
                            <span>Page {book.lastPage}</span>
                            <span>{formatPercent(book.progress)}</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white dark:bg-stone-800">
                            <div className="h-full rounded-full bg-sage" style={{ width: formatPercent(book.progress) }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                    <div className="flex items-center gap-2 text-sm font-black text-stone-900 dark:text-stone-50">
                      <CircleDot className="h-4 w-4 text-sage" />
                      Recent activity
                    </div>
                    <div className="mt-3 space-y-2">
                      {recentActivities.length ? (
                        recentActivities.map((activity) => (
                          <div key={activity.id} className="rounded-md bg-stone-50 p-3 text-xs leading-5 dark:bg-stone-900">
                            <div className="font-bold text-stone-800 dark:text-stone-100">{activity.label}</div>
                            <div className="mt-1 text-stone-500">{new Date(activity.createdAt).toLocaleDateString()}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">Your study activity will appear here.</p>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-5">
              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Review Queue</p>
                    <h2 className="mt-2 text-lg font-black leading-tight text-stone-950 dark:text-stone-50 2xl:text-xl">Mistakes & weak pages</h2>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-200">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {reviewPages.length ? (
                    reviewPages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => void openBookAtPage(page.bookId, page.pageNumber)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-rose-100 bg-rose-50/70 p-3 text-left transition hover:border-rose-300 dark:border-rose-900 dark:bg-rose-950/30"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-stone-900 dark:text-stone-50">{page.book.title}</div>
                          <div className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-200">Page {page.pageNumber} needs review</div>
                        </div>
                        <Play className="h-4 w-4 shrink-0 text-rose-600" />
                      </button>
                    ))
                  ) : (
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      No weak pages queued right now.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Vocabulary Deck</p>
                    <h2 className="mt-2 text-lg font-black leading-tight text-stone-950 dark:text-stone-50 2xl:text-xl">Review words</h2>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-skysoft text-stone-900 dark:bg-sage/20 dark:text-stone-100">
                    <Star className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MiniStat label="New" value={newVocabularyCount} />
                  <MiniStat label="Learning" value={learningVocabularyCount} />
                  <MiniStat label="Mastered" value={masteredVocabularyCount} />
                </div>
                <div className="mt-4 space-y-2">
                  {dueVocabulary.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setVocabSearch(item.word);
                        setVocabFilter("all");
                        switchTab("vocabulary");
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md bg-stone-50 p-3 text-left transition hover:bg-skysoft/60 dark:bg-stone-900 dark:hover:bg-stone-800"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-stone-900 dark:text-stone-50">{item.word}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-stone-500">{item.vietnameseMeaning || item.meaning || "Meaning pending"}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black capitalize text-sage dark:bg-stone-950">
                        {item.status}
                      </span>
                    </button>
                  ))}
                  {!dueVocabulary.length && (
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      Deck clear. Add more words from highlights.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-stone-200 bg-white p-4 shadow-tool dark:border-stone-800 dark:bg-stone-950">
                  <div className="flex items-center justify-between text-sm font-semibold text-stone-500 dark:text-stone-400">
                    <span>{stat.label}</span>
                    <Icon className="h-4 w-4 text-sage" />
                  </div>
                  <div className="mt-3 text-2xl font-black text-stone-950 dark:text-stone-50">{stat.value}</div>
                </div>
              );
            })}
          </section>
        </main>
      )}

      {editor.activeTab === "learn" && isWorkspaceOpen && (
        <main className="flex h-[calc(100vh-73px)] min-h-[680px] flex-col lg:flex-row">
          {!editor.sidebarCollapsed && (
            <PdfSidebar
              books={activeBooks}
              deletedBooks={deletedBooks}
              activeBookId={activeBook?.id ?? null}
              searchQuery={editor.searchQuery}
              bookmarks={data.bookmarks}
              pageStatuses={data.pageStatuses}
              vocabulary={activeData.vocabulary}
              currentPage={editor.currentPage}
              onSearchChange={(value) => setEditor((current) => ({ ...current, searchQuery: value }))}
              onCollapse={() => setEditor((current) => ({ ...current, sidebarCollapsed: true }))}
              onImport={handleImport}
              onOpenBook={openBook}
              onDeleteBook={handleDeleteBook}
              onRestoreBook={handleRestoreBook}
              onPermanentDeleteBooks={handlePermanentDeleteBooks}
              onAddBookmark={handleAddBookmark}
              onSetPageStatus={handleSetPageStatus}
              onJumpToPage={changePage}
            />
          )}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-stone-200 bg-white/86 p-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/86">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <button
                    type="button"
                    title={editor.sidebarCollapsed ? "Open library sidebar" : "Close library sidebar"}
                    onClick={() => setEditor((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                  >
                    {editor.sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    title="Back to Learn home"
                    onClick={goHome}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-xs font-black text-stone-600 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                  >
                    <Home className="h-4 w-4" />
                    Home
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-stone-950 dark:text-stone-50">{activeBook?.title ?? "No book selected"}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Page {editor.currentPage} - {editor.workspaceMode === "split" ? "Study board open" : "Focus reading"} -{" "}
                      {editor.inputMode === "stylus" ? "stylus locked" : "all input"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-paper/70 p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor((current) => ({ ...current, workspaceMode: current.workspaceMode === "split" ? "focus" : "split" }))
                    }
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black transition ${
                      editor.workspaceMode === "split"
                        ? "bg-ink text-white dark:bg-paper dark:text-stone-950"
                        : "text-stone-600 hover:bg-white dark:text-stone-200 dark:hover:bg-stone-800"
                    }`}
                  >
                    <NotebookPen className="h-4 w-4" />
                    {editor.workspaceMode === "split" ? "Study board" : "Focus"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor((current) => ({ ...current, inputMode: current.inputMode === "stylus" ? "all" : "stylus" }))}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black transition ${
                      editor.inputMode === "stylus"
                        ? "bg-sage text-white"
                        : "text-stone-600 hover:bg-white dark:text-stone-200 dark:hover:bg-stone-800"
                    }`}
                  >
                    <PenLine className="h-4 w-4" />
                    {editor.inputMode === "stylus" ? "Stylus" : "All input"}
                  </button>
                  <button
                    type="button"
                    title="XP-Pen XS writing preset"
                    onClick={() =>
                      setEditor((current) => ({
                        ...current,
                        inputMode: "stylus",
                        tool: "pen",
                        brushStyle: "ballpoint",
                        thickness: 0.75,
                        penColor: current.penColor === "red" ? "black" : current.penColor
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black text-stone-600 transition hover:bg-white dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <PenLine className="h-4 w-4" />
                    XP-Pen XS
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor((current) => ({ ...current, aiEnabled: !current.aiEnabled }))}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black transition ${
                      editor.aiEnabled
                        ? "bg-skysoft text-stone-900 dark:bg-sage/30 dark:text-stone-100"
                        : "text-stone-500 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-800"
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                    {editor.aiEnabled ? "AI on" : "AI off"}
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <Toolbar
                  tool={editor.tool}
                  penColor={editor.penColor}
                  highlighterColor={editor.highlighterColor}
                  brushStyle={editor.brushStyle}
                  thickness={editor.thickness}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  onToolChange={(tool) => setEditor((current) => ({ ...current, tool }))}
                  onPenColorChange={(penColor) => setEditor((current) => ({ ...current, penColor }))}
                  onHighlighterColorChange={(highlighterColor) => setEditor((current) => ({ ...current, highlighterColor }))}
                  onBrushStyleChange={(brushStyle) => setEditor((current) => ({ ...current, brushStyle }))}
                  onThicknessChange={(thickness) => setEditor((current) => ({ ...current, thickness }))}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onSave={() => activeBook && void saveBook(activeBook)}
                  onClearPage={clearCurrentPageAnnotations}
                  onZoomIn={() => changeZoom(editor.zoom + ZOOM_STEP)}
                  onZoomOut={() => changeZoom(editor.zoom - ZOOM_STEP)}
                  onFitWidth={() => changeZoom(DEFAULT_ZOOM)}
                />
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <PdfViewer
                book={activeBook}
                annotations={data.annotations}
                currentPage={editor.currentPage}
                zoom={editor.zoom}
                tool={editor.tool}
                penColor={editor.penColor}
                highlighterColor={editor.highlighterColor}
                brushStyle={editor.brushStyle}
                thickness={editor.thickness}
                inputMode={editor.inputMode}
                aiEnabled={editor.aiEnabled}
                onPageChange={changePage}
                onZoomChange={changeZoom}
                onDocumentLoaded={handleDocumentLoaded}
                onAddAnnotation={addAnnotation}
                onUpdateAnnotation={updateAnnotation}
                onDeleteAnnotation={removeAnnotation}
                onDeleteAnnotations={removeAnnotations}
                onVocabularyCandidate={(selection, mode = "vocab") => {
                  setAiSelection(selection);
                  setAiMode(mode);
                  setAiResult(null);
                  setAiError(null);
                  setVocabularyMeta({ ipa: "", partOfSpeech: "", meaning: "", vietnameseMeaning: "", synonyms: "", antonyms: "", example: "" });
                  if (mode === "explain" || mode === "solve") {
                    void analyzeSelection(selection, mode);
                  }
                }}
              />
              {editor.workspaceMode === "split" && (
                <StudyWorkspacePanel
                  book={activeBook}
                  currentPage={editor.currentPage}
                  annotations={data.annotations}
                  vocabulary={activeData.vocabulary}
                  pageStatuses={data.pageStatuses}
                  onAddQuickNote={handleAddQuickNote}
                  onJumpToPage={changePage}
                  onSetPageStatus={handleSetPageStatus}
                />
              )}
            </div>
          </section>
        </main>
      )}

      {editor.activeTab === "vocabulary" && (
        <VocabularyPanel
          vocabulary={activeData.vocabulary}
          search={vocabSearch}
          filter={vocabFilter}
          sort={vocabSort}
          onSearchChange={setVocabSearch}
          onFilterChange={setVocabFilter}
          onSortChange={setVocabSort}
          onStatusChange={handleVocabularyStatus}
          onDelete={handleVocabularyDelete}
          onAddWord={handleManualVocabularyAdd}
        />
      )}

      {editor.activeTab === "progress" && <ProgressPanel data={activeData} />}

      {aiSelection && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-paper dark:bg-stone-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sage">
                  <Sparkles className="h-4 w-4" />
                  AI Study Coach
                </p>
                <h2 className="mt-2 text-2xl font-black text-stone-950 dark:text-stone-50">{aiSelection.word}</h2>
                {(vocabularyMeta.ipa || vocabularyMeta.partOfSpeech) && (
                  <p className="mt-1 text-sm font-semibold text-sage">
                    {[vocabularyMeta.partOfSpeech, vocabularyMeta.ipa].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  {aiSelection.sourceBookTitle} - page {aiSelection.sourcePage}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAiSelection(null);
                  setAiResult(null);
                  setAiError(null);
                }}
                className="rounded-md px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {([
                ["vocab", "Vocab"],
                ["solve", "Solve"],
                ["explain", "Explain"],
                ["grammar", "Grammar"],
                ["note", "Note"]
              ] as Array<[AiMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void handleAiAnalyze(mode)}
                  disabled={isAiLoading}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                    aiMode === mode
                      ? "border-sage bg-skysoft/60 text-stone-900 dark:bg-sage/20 dark:text-stone-50"
                      : "border-stone-200 bg-white text-stone-600 hover:border-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                  }`}
                >
                  <Brain className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {isAiLoading && (
              <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-900">
                AI is reading this selection...
              </div>
            )}

            {aiError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                {aiError}
              </div>
            )}

            {aiResult && (
              <section className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900">
                <h3 className="text-lg font-black text-stone-950 dark:text-stone-50">{aiResult.title}</h3>
                {aiResult.summary && <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-200">{aiResult.summary}</p>}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {aiResult.ipa && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">IPA</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.ipa}</p>
                    </div>
                  )}
                  {aiResult.partOfSpeech && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Part of speech</div>
                      <p className="mt-1 capitalize text-stone-700 dark:text-stone-200">{aiResult.partOfSpeech}</p>
                    </div>
                  )}
                  {aiResult.meaning && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Meaning</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.meaning}</p>
                    </div>
                  )}
                  {aiResult.synonyms && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Synonyms</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.synonyms}</p>
                    </div>
                  )}
                  {aiResult.antonyms && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Antonyms</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.antonyms}</p>
                    </div>
                  )}
                  {aiResult.usage && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">IELTS usage</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.usage}</p>
                    </div>
                  )}
                  {aiResult.collocations && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Collocations</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.collocations}</p>
                    </div>
                  )}
                  {aiResult.commonMistake && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Common mistake</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.commonMistake}</p>
                    </div>
                  )}
                  {aiResult.grammar && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Grammar</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.grammar}</p>
                    </div>
                  )}
                  {aiResult.example && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Example</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.example}</p>
                    </div>
                  )}
                  {aiResult.vietnamese && (
                    <div className="rounded-md bg-white p-3 text-sm dark:bg-stone-950">
                      <div className="text-xs font-bold uppercase tracking-wide text-sage">Vietnamese</div>
                      <p className="mt-1 text-stone-700 dark:text-stone-200">{aiResult.vietnamese}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                IPA
                <input
                  value={vocabularyMeta.ipa}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, ipa: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="/səbˈstænʃəl/"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                English meaning
                <input
                  value={vocabularyMeta.meaning}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, meaning: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="IELTS meaning"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                Part of speech
                <input
                  value={vocabularyMeta.partOfSpeech}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, partOfSpeech: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="noun, verb, adjective, phrase..."
                />
              </label>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                Vietnamese meaning
                <input
                  value={vocabularyMeta.vietnameseMeaning}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, vietnameseMeaning: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="Nghĩa tiếng Việt"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                  Synonyms
                  <input
                    value={vocabularyMeta.synonyms}
                    onChange={(event) => setVocabularyMeta((current) => ({ ...current, synonyms: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                    placeholder="large, significant, considerable"
                  />
                </label>
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                  Antonyms
                  <input
                    value={vocabularyMeta.antonyms}
                    onChange={(event) => setVocabularyMeta((current) => ({ ...current, antonyms: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                    placeholder="small, minor, insignificant"
                  />
                </label>
              </div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                Vocabulary example
                <textarea
                  value={vocabularyMeta.example}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, example: event.target.value }))}
                  className="mt-1 h-24 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="A sentence from the book or your own example"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiSelection(null);
                  setAiResult(null);
                  setAiError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAiNote}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              >
                Save Sticky Note
              </button>
              <button
                type="button"
                onClick={handleVocabularySave}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white dark:bg-paper dark:text-stone-950"
              >
                Save Word
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudyMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  accent: "sage" | "coral" | "rose";
}) {
  const accentClass = {
    sage: "bg-sage/12 text-sage",
    coral: "bg-coral/12 text-coral",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-200"
  }[accent];

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-md ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-black text-stone-950 dark:text-stone-50">{value}</div>
      <div className="mt-1 text-xs font-semibold text-stone-500 dark:text-stone-400">{detail}</div>
    </div>
  );
}

function FocusAction({
  icon: Icon,
  label,
  detail,
  onClick,
  disabled = false
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group rounded-md border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-sage hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-800 dark:bg-stone-950 dark:hover:bg-stone-900"
    >
      <div className="flex items-center gap-2 text-sm font-black text-stone-900 dark:text-stone-50">
        <Icon className="h-4 w-4 text-sage" />
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold text-stone-500 dark:text-stone-400">{detail}</div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-center dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xl font-black text-stone-950 dark:text-stone-50">{value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
    </div>
  );
}
