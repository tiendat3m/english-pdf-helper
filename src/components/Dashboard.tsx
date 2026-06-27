"use client";

import "@/lib/browserPolyfills";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Brain,
  Flame,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  NotebookPen,
  Play,
  Sparkles,
  Star,
  TrendingUp
} from "lucide-react";
import PdfUploader from "./PdfUploader";
import PdfSidebar from "./PdfSidebar";
import ProgressPanel from "./ProgressPanel";
import StudyWorkspacePanel from "./StudyWorkspacePanel";
import Toolbar from "./Toolbar";
import VocabularyPanel from "./VocabularyPanel";
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SAMPLE_BOOKS, ZOOM_STEP } from "@/lib/constants";
import {
  deleteAnnotation,
  deleteVocabulary,
  importBook,
  loadAppData,
  permanentlyDeleteBooks,
  restoreBook,
  saveAnnotation,
  saveBook,
  saveBookmark,
  savePageStatus,
  saveVocabulary,
  softDeleteBook,
  touchBook
} from "@/lib/db";
import { initialEditorState, shortcutToTool } from "@/lib/editorStore";
import type {
  Annotation,
  AppData,
  BookRecord,
  BookmarkCategory,
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
  example: string;
  grammar: string;
  vietnamese: string;
  suggestedNote: string;
}

type HistoryAction =
  | { type: "add"; annotations: Annotation[] }
  | { type: "delete"; annotations: Annotation[] };

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[620px] flex-1 place-items-center text-sm font-semibold text-stone-500">
      Preparing PDF workspace...
    </div>
  )
});

export default function Dashboard() {
  const [data, setData] = useState<AppData>(emptyAppData());
  const [editor, setEditor] = useState(initialEditorState);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    refreshData().finally(() => setIsLoading(false));
  }, []);

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
      vocabulary: data.vocabulary.filter((item) => activeBookIds.has(item.sourceBookId))
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
    const book = activeBooks.find((item) => item.id === bookId);
    if (!book) {
      return;
    }
    await touchBook(book, { lastOpenedAt: nowIso() });
    setEditor((current) => ({
      ...current,
      activeTab: "learn",
      activeBookId: book.id,
      currentPage: book.lastPage || 1,
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

  function removeAnnotation(id: string) {
    const existing = data.annotations.find((annotation) => annotation.id === id);
    if (existing) {
      setUndoStack((current) => [...current, { type: "delete", annotations: [existing] }]);
      setRedoStack([]);
    }
    setData((current) => ({ ...current, annotations: current.annotations.filter((item) => item.id !== id) }));
    void deleteAnnotation(id);
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

  async function analyzeSelection(selection: VocabularyDraft, mode: AiMode) {
    setAiMode(mode);
    setAiError(null);
    setIsAiLoading(true);

    try {
      const response = await fetch("/api/ai/ielts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          text: selection.selectedImageDataUrl && selection.word === "Highlighted passage" ? "" : selection.word,
          imageDataUrl: selection.selectedImageDataUrl,
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
        example: payload.example || "",
        grammar: payload.grammar || "",
        vietnamese: payload.vietnamese || "",
        suggestedNote: payload.suggestedNote || payload.summary || ""
      };

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

  function switchTab(tab: MainTab) {
    setEditor((current) => ({ ...current, activeTab: tab }));
    if (tab !== "learn") {
      setIsWorkspaceOpen(false);
    }
  }

  const stats = [
    { label: "Study streak", value: `${getStudyStreak(data.activities)} days`, icon: Flame },
    { label: "Total books", value: activeBooks.length.toString(), icon: BookOpen },
    { label: "Saved vocabulary", value: activeData.vocabulary.length.toString(), icon: Star },
    { label: "Notes count", value: activeData.annotations.filter((annotation) => annotation.type === "note").length.toString(), icon: NotebookPen },
    { label: "Overall progress", value: formatPercent(getOverallProgress(activeBooks)), icon: TrendingUp }
  ];

  const todayDonePages = activeData.pageStatuses.filter(
    (status) => status.status === "done" && status.updatedAt.slice(0, 10) === nowIso().slice(0, 10)
  ).length;
  const dailyGoalProgress = Math.min(100, (todayDonePages / Math.max(editor.dailyPageGoal, 1)) * 100);
  const needReviewCount = activeData.pageStatuses.filter((status) => status.status === "need-review").length;

  const recentBooks: Array<{ title: string; lastPage: string; progress: number; id?: string }> = activeBooks.length
    ? activeBooks.slice(0, 3).map((book) => ({
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => switchTab("learn")} className="flex items-center gap-3">
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
        </div>
      </header>

      {editor.activeTab === "learn" && !isWorkspaceOpen && (
        <main className="mx-auto max-w-7xl p-5 md:p-8">
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex min-h-[420px] flex-col justify-between rounded-lg border border-stone-200 bg-white p-6 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Continue Learning</p>
                <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight text-stone-950 dark:text-stone-50 md:text-5xl">IELTS OS</h1>
                <div className="mt-4 rounded-lg bg-paper p-4 dark:bg-stone-900">
                  <div className="text-xl font-black text-stone-950 dark:text-stone-50">{activeBook?.title ?? "Import your first IELTS book"}</div>
                  <div className="mt-2 flex items-center justify-between text-sm font-semibold text-stone-500 dark:text-stone-400">
                    <span>Last page: {activeBook?.lastPage ?? 1}</span>
                    <span>{activeBook ? formatPercent(activeBook.progress) : "0%"}</span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white dark:bg-stone-800">
                    <div className="h-full rounded-full bg-sage" style={{ width: activeBook ? formatPercent(activeBook.progress) : "0%" }} />
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                  <div className="flex items-center justify-between text-sm font-black text-stone-800 dark:text-stone-100">
                    <span>Today goal</span>
                    <span>{todayDonePages}/{editor.dailyPageGoal} pages done</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div className="h-full rounded-full bg-coral" style={{ width: `${dailyGoalProgress}%` }} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
                    Target IELTS {editor.targetBand.toFixed(1)} - current estimate {editor.currentBand.toFixed(1)} - {needReviewCount} pages need review
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (activeBook) {
                      void openBook(activeBook.id);
                    } else {
                      setIsWorkspaceOpen(true);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white shadow-tool transition hover:-translate-y-0.5 dark:bg-paper dark:text-stone-950"
                >
                  <Play className="h-4 w-4" />
                  Continue Learning
                </button>
                <PdfUploader onImport={handleImport} />
              </div>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <h2 className="text-lg font-bold text-stone-950 dark:text-stone-50">Recent Books</h2>
              <div className="mt-4 space-y-3">
                {recentBooks.map((book, index) => (
                  <button
                    key={`${book.title}-${index}`}
                    type="button"
                    onClick={() => (book.id ? void openBook(book.id) : undefined)}
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-sage dark:border-stone-800 dark:bg-stone-900"
                  >
                    <div className="font-bold text-stone-900 dark:text-stone-50">{book.title}</div>
                    <div className="mt-2 flex items-center justify-between text-sm text-stone-500">
                      <span>Last page: {book.lastPage}</span>
                      <span>Progress: {formatPercent(book.progress)}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white dark:bg-stone-800">
                      <div className="h-full rounded-full bg-sage" style={{ width: formatPercent(book.progress) }} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-skysoft/55 p-4 dark:bg-sage/15">
                <div className="text-sm font-black text-stone-900 dark:text-stone-50">IELTS OS Stack</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-stone-600 dark:text-stone-300">
                  <span>PDF Books</span>
                  <span>Handwriting</span>
                  <span>Vocabulary</span>
                  <span>Progress</span>
                  <span>Warm Paper</span>
                  <span>XP-Pen / Huion</span>
                </div>
              </div>
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
            <div className="border-b border-stone-200 bg-white/78 p-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/78">
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
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-stone-950 dark:text-stone-50">{activeBook?.title ?? "No book selected"}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {editor.workspaceMode === "split" ? "Split: PDF + Notebook + Vocabulary" : "Focus: PDF centered"} -{" "}
                      {editor.inputMode === "stylus" ? "Stylus only" : "Mouse, touch, and pen"} - {editor.aiEnabled ? "AI on" : "AI off"} -{" "}
                      {editor.sidebarCollapsed ? "Library hidden" : "Library open"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor((current) => ({ ...current, workspaceMode: current.workspaceMode === "split" ? "focus" : "split" }))
                    }
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                  >
                    {editor.workspaceMode === "split" ? "Split" : "Focus"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor((current) => ({ ...current, inputMode: current.inputMode === "stylus" ? "all" : "stylus" }))}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                  >
                    {editor.inputMode === "stylus" ? "Stylus only" : "All input"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor((current) => ({ ...current, aiEnabled: !current.aiEnabled }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-black shadow-sm transition ${
                      editor.aiEnabled
                        ? "border-sage bg-skysoft/55 text-stone-800 dark:bg-sage/20 dark:text-stone-100"
                        : "border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                    }`}
                  >
                    {editor.aiEnabled ? "AI on" : "AI off"}
                  </button>
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
