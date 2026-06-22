"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Flame,
  GraduationCap,
  Moon,
  NotebookPen,
  Play,
  Star,
  Sun,
  TrendingUp
} from "lucide-react";
import PdfUploader from "./PdfUploader";
import PdfSidebar from "./PdfSidebar";
import ProgressPanel from "./ProgressPanel";
import Toolbar from "./Toolbar";
import VocabularyPanel from "./VocabularyPanel";
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SAMPLE_BOOKS, ZOOM_STEP } from "@/lib/constants";
import {
  deleteAnnotation,
  deleteVocabulary,
  importBook,
  loadAppData,
  saveAnnotation,
  saveBook,
  saveBookmark,
  savePageStatus,
  saveVocabulary,
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

type VocabularyDraft = Omit<VocabularyRecord, "id" | "meaning" | "example" | "status" | "createdAt" | "updatedAt"> | null;

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
  const [undoStack, setUndoStack] = useState<Annotation[]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[]>([]);
  const [vocabularyDraft, setVocabularyDraft] = useState<VocabularyDraft>(null);
  const [vocabularyMeta, setVocabularyMeta] = useState({ meaning: "", example: "" });
  const [vocabSearch, setVocabSearch] = useState("");
  const [vocabFilter, setVocabFilter] = useState<VocabStatus | "all">("all");
  const [vocabSort, setVocabSort] = useState<"newest" | "word" | "status">("newest");

  useEffect(() => {
    refreshData().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", editor.isDarkMode);
  }, [editor.isDarkMode]);

  const activeBook = useMemo(
    () => data.books.find((book) => book.id === editor.activeBookId) ?? data.books[0] ?? null,
    [data.books, editor.activeBookId]
  );

  useEffect(() => {
    if (!editor.activeBookId && data.books[0]) {
      setEditor((current) => ({
        ...current,
        activeBookId: data.books[0].id,
        currentPage: data.books[0].lastPage || 1,
        zoom: data.books[0].zoom || DEFAULT_ZOOM
      }));
    }
  }, [data.books, editor.activeBookId]);

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
    const book = data.books.find((item) => item.id === bookId);
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
    setUndoStack((current) => [...current, annotation]);
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
      setRedoStack((current) => [...current, existing]);
    }
    setData((current) => ({ ...current, annotations: current.annotations.filter((item) => item.id !== id) }));
    void deleteAnnotation(id);
  }

  function handleUndo() {
    const last = [...undoStack]
      .reverse()
      .find((annotation) => annotation.bookId === activeBook?.id && annotation.pageNumber === editor.currentPage);
    if (!last) {
      return;
    }
    setUndoStack((current) => current.filter((annotation) => annotation.id !== last.id));
    setRedoStack((current) => [...current, last]);
    setData((current) => ({ ...current, annotations: current.annotations.filter((annotation) => annotation.id !== last.id) }));
    void deleteAnnotation(last.id);
  }

  function handleRedo() {
    const last = redoStack[redoStack.length - 1];
    if (!last) {
      return;
    }
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, last]);
    setData((current) => ({ ...current, annotations: [...current.annotations, last] }));
    void saveAnnotation(last);
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

  async function handleVocabularySave() {
    if (!vocabularyDraft) {
      return;
    }
    const record: VocabularyRecord = {
      ...vocabularyDraft,
      id: uuid(),
      meaning: vocabularyMeta.meaning,
      example: vocabularyMeta.example,
      status: "new",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveVocabulary(record);
    setData((current) => ({ ...current, vocabulary: [record, ...current.vocabulary] }));
    setVocabularyDraft(null);
    setVocabularyMeta({ meaning: "", example: "" });
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
    { label: "Total books", value: data.books.length.toString(), icon: BookOpen },
    { label: "Saved vocabulary", value: data.vocabulary.length.toString(), icon: Star },
    { label: "Notes count", value: data.annotations.filter((annotation) => annotation.type === "note").length.toString(), icon: NotebookPen },
    { label: "Overall progress", value: formatPercent(getOverallProgress(data.books)), icon: TrendingUp }
  ];

  const recentBooks: Array<{ title: string; lastPage: string; progress: number; id?: string }> = data.books.length
    ? data.books.slice(0, 3).map((book) => ({
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
    <div className={editor.isPaperMode ? "min-h-screen bg-paper/35 dark:bg-transparent" : "min-h-screen"}>
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Toggle paper mode"
              onClick={() => setEditor((current) => ({ ...current, isPaperMode: !current.isPaperMode }))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
              Paper
            </button>
            <button
              type="button"
              title="Toggle dark mode"
              onClick={() => setEditor((current) => ({ ...current, isDarkMode: !current.isDarkMode }))}
              className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
              {editor.isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {editor.activeTab === "learn" && !isWorkspaceOpen && (
        <main className="mx-auto max-w-7xl p-5 md:p-8">
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex min-h-[420px] flex-col justify-between rounded-lg border border-stone-200 bg-white p-6 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Continue Learning</p>
                <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight text-stone-950 dark:text-stone-50 md:text-5xl">
                  Study IELTS books with notes, highlights, and a vocabulary deck.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-stone-600 dark:text-stone-300">
                  Keep the PDF at the center, mark pages by status, save words for review, and return to exactly where you stopped.
                </p>
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
          <PdfSidebar
            books={data.books}
            activeBookId={activeBook?.id ?? null}
            searchQuery={editor.searchQuery}
            bookmarks={data.bookmarks}
            pageStatuses={data.pageStatuses}
            vocabulary={data.vocabulary}
            currentPage={editor.currentPage}
            onSearchChange={(value) => setEditor((current) => ({ ...current, searchQuery: value }))}
            onImport={handleImport}
            onOpenBook={openBook}
            onAddBookmark={handleAddBookmark}
            onSetPageStatus={handleSetPageStatus}
            onJumpToPage={changePage}
          />
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-stone-200 bg-white/78 p-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/78">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-stone-950 dark:text-stone-50">{activeBook?.title ?? "No book selected"}</div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">Original PDF is never modified. Notes are stored locally in IndexedDB.</div>
                </div>
                <Toolbar
                  tool={editor.tool}
                  penColor={editor.penColor}
                  highlighterColor={editor.highlighterColor}
                  thickness={editor.thickness}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  onToolChange={(tool) => setEditor((current) => ({ ...current, tool }))}
                  onPenColorChange={(penColor) => setEditor((current) => ({ ...current, penColor }))}
                  onHighlighterColorChange={(highlighterColor) => setEditor((current) => ({ ...current, highlighterColor }))}
                  onThicknessChange={(thickness) => setEditor((current) => ({ ...current, thickness }))}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onSave={() => activeBook && void saveBook(activeBook)}
                  onZoomIn={() => changeZoom(editor.zoom + ZOOM_STEP)}
                  onZoomOut={() => changeZoom(editor.zoom - ZOOM_STEP)}
                  onFitWidth={() => changeZoom(DEFAULT_ZOOM)}
                />
              </div>
            </div>
            <PdfViewer
              book={activeBook}
              annotations={data.annotations}
              currentPage={editor.currentPage}
              zoom={editor.zoom}
              tool={editor.tool}
              penColor={editor.penColor}
              highlighterColor={editor.highlighterColor}
              thickness={editor.thickness}
              onPageChange={changePage}
              onZoomChange={changeZoom}
              onDocumentLoaded={handleDocumentLoaded}
              onAddAnnotation={addAnnotation}
              onUpdateAnnotation={updateAnnotation}
              onDeleteAnnotation={removeAnnotation}
              onVocabularyCandidate={setVocabularyDraft}
            />
          </section>
        </main>
      )}

      {editor.activeTab === "vocabulary" && (
        <VocabularyPanel
          vocabulary={data.vocabulary}
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

      {editor.activeTab === "progress" && <ProgressPanel data={data} />}

      {vocabularyDraft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-paper dark:bg-stone-950">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Add to Vocabulary?</p>
            <h2 className="mt-2 text-2xl font-black text-stone-950 dark:text-stone-50">{vocabularyDraft.word}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                Meaning
                <input
                  value={vocabularyMeta.meaning}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, meaning: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="IELTS meaning"
                />
              </label>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-200">
                Example
                <textarea
                  value={vocabularyMeta.example}
                  onChange={(event) => setVocabularyMeta((current) => ({ ...current, example: event.target.value }))}
                  className="mt-1 h-24 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 font-normal outline-none focus:border-sage dark:border-stone-700 dark:bg-stone-900"
                  placeholder="A sentence from the book or your own example"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVocabularyDraft(null)}
                className="rounded-lg px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Cancel
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
