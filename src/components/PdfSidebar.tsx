"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookOpen, Clock3, GraduationCap, PanelLeftClose, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import PdfUploader from "./PdfUploader";
import { BOOKMARK_CATEGORIES, DELETED_BOOK_RETENTION_DAYS, PAGE_STATUS_LABELS, PAGE_STATUS_STYLES } from "@/lib/constants";
import type { BookRecord, BookmarkRecord, PageStatus, PageStatusRecord, VocabularyRecord } from "@/lib/types";
import { formatFileSize, formatPercent } from "@/lib/utils";

interface PdfSidebarProps {
  books: BookRecord[];
  deletedBooks: BookRecord[];
  activeBookId: string | null;
  searchQuery: string;
  bookmarks: BookmarkRecord[];
  pageStatuses: PageStatusRecord[];
  vocabulary: VocabularyRecord[];
  currentPage: number;
  onSearchChange: (value: string) => void;
  onCollapse: () => void;
  onImport: (file: File) => void;
  onOpenBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onRestoreBook: (bookId: string) => void;
  onPermanentDeleteBooks: (bookIds: string[]) => void;
  onAddBookmark: (category: BookmarkRecord["category"]) => void;
  onSetPageStatus: (status: PageStatus) => void;
  onJumpToPage: (page: number) => void;
}

const statuses: PageStatus[] = ["not-started", "learning", "done", "need-review"];

export default function PdfSidebar({
  books,
  deletedBooks,
  activeBookId,
  searchQuery,
  bookmarks,
  pageStatuses,
  vocabulary,
  currentPage,
  onSearchChange,
  onCollapse,
  onImport,
  onOpenBook,
  onDeleteBook,
  onRestoreBook,
  onPermanentDeleteBooks,
  onAddBookmark,
  onSetPageStatus,
  onJumpToPage
}: PdfSidebarProps) {
  const filteredBooks = books.filter((book) => book.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const pageStatus = pageStatuses.find((status) => status.bookId === activeBookId && status.pageNumber === currentPage);
  const activeBookmarks = bookmarks.filter((bookmark) => bookmark.bookId === activeBookId);
  const activeVocabulary = vocabulary.filter((item) => item.sourceBookId === activeBookId).slice(0, 5);
  const deletedBookIds = useMemo(() => deletedBooks.map((book) => book.id), [deletedBooks]);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<string[]>([]);
  const [pendingPermanentDeleteIds, setPendingPermanentDeleteIds] = useState<string[]>([]);
  const selectedDeletedCount = selectedDeletedIds.length;
  const isAllDeletedSelected = deletedBookIds.length > 0 && selectedDeletedCount === deletedBookIds.length;
  const pendingPermanentDeleteBooks = deletedBooks.filter((book) => pendingPermanentDeleteIds.includes(book.id));

  useEffect(() => {
    setSelectedDeletedIds((current) => current.filter((bookId) => deletedBookIds.includes(bookId)));
  }, [deletedBookIds]);

  function getDeletedDaysLeft(book: BookRecord) {
    if (!book.deletedAt) {
      return DELETED_BOOK_RETENTION_DAYS;
    }
    const elapsedMs = Date.now() - new Date(book.deletedAt).getTime();
    return Math.max(0, DELETED_BOOK_RETENTION_DAYS - Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  }

  function toggleDeletedBook(bookId: string) {
    setSelectedDeletedIds((current) => (current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId]));
  }

  function toggleAllDeletedBooks() {
    setSelectedDeletedIds(isAllDeletedSelected ? [] : deletedBookIds);
  }

  function requestPermanentDelete(bookIds: string[]) {
    if (!bookIds.length) {
      return;
    }

    setPendingPermanentDeleteIds(bookIds);
  }

  function confirmPermanentDelete() {
    if (!pendingPermanentDeleteIds.length) {
      return;
    }

    onPermanentDeleteBooks(pendingPermanentDeleteIds);
    setSelectedDeletedIds((current) => current.filter((bookId) => !pendingPermanentDeleteIds.includes(bookId)));
    setPendingPermanentDeleteIds([]);
  }

  return (
    <>
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-r border-stone-200 bg-white/82 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-950/82 lg:w-80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Learn</p>
          <h2 className="mt-1 text-xl font-bold text-stone-950 dark:text-stone-50">IELTS Library</h2>
        </div>
        <button
          type="button"
          title="Close library sidebar"
          onClick={onCollapse}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-sage dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
        <Search className="h-4 w-4" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search books"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>

      <PdfUploader compact onImport={onImport} />

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <BookOpen className="h-4 w-4 text-sage" />
          Saved Books
        </div>
        <div className="space-y-2">
          {filteredBooks.length ? (
            filteredBooks.map((book) => (
              <div
                key={book.id}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  book.id === activeBookId
                    ? "border-sage bg-skysoft/55 dark:border-sage dark:bg-sage/20"
                    : "border-stone-200 bg-white hover:border-sage/60 dark:border-stone-700 dark:bg-stone-900"
                }`}
              >
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => onOpenBook(book.id)} className="min-w-0 flex-1 text-left">
                    <div className="line-clamp-2 text-sm font-bold text-stone-900 dark:text-stone-50">{book.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                      <span>Page {book.lastPage || 1}</span>
                      <span>{formatFileSize(book.size)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    title="Move to Recently Deleted"
                    onClick={() => onDeleteBook(book.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div className="h-full rounded-full bg-sage" style={{ width: formatPercent(book.progress) }} />
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-700">
              Import your first IELTS book to begin.
            </p>
          )}
        </div>
      </section>

      {deletedBooks.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
              <Trash2 className="h-4 w-4 text-sage" />
              Recently Deleted
            </div>
            <button
              type="button"
              onClick={toggleAllDeletedBooks}
              className="text-xs font-bold text-sage transition hover:text-ink dark:hover:text-paper"
            >
              {isAllDeletedSelected ? "Clear" : "Select all"}
            </button>
          </div>
          {selectedDeletedCount > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-200">{selectedDeletedCount} selected</span>
              <button
                type="button"
                onClick={() => requestPermanentDelete(selectedDeletedIds)}
                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white transition hover:bg-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected
              </button>
            </div>
          )}
          <div className="space-y-2">
            {deletedBooks.map((book) => (
              <div key={book.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedDeletedIds.includes(book.id)}
                    onChange={() => toggleDeletedBook(book.id)}
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-sage"
                    aria-label={`Select ${book.title} for permanent delete`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-bold text-stone-700 dark:text-stone-100">{book.title}</div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      Deletes in {getDeletedDaysLeft(book)} days
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRestoreBook(book.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-600 transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => requestPermanentDelete([book.id])}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:bg-stone-950 dark:hover:bg-rose-950"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <GraduationCap className="h-4 w-4 text-sage" />
          Page Status
        </div>
        <div className="grid grid-cols-2 gap-2">
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onSetPageStatus(status)}
              className={`rounded-md border px-2 py-2 text-xs font-bold transition ${PAGE_STATUS_STYLES[status]} ${
                pageStatus?.status === status ? "ring-2 ring-sage/45" : ""
              }`}
            >
              {PAGE_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <Bookmark className="h-4 w-4 text-sage" />
          Bookmarks
        </div>
        <div className="flex flex-wrap gap-2">
          {BOOKMARK_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onAddBookmark(category)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600 transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              {category}
            </button>
          ))}
        </div>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {activeBookmarks.map((bookmark) => (
            <button
              key={bookmark.id}
              type="button"
              onClick={() => onJumpToPage(bookmark.pageNumber)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <span>{bookmark.category}</span>
              <span>p. {bookmark.pageNumber}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
          <Clock3 className="h-4 w-4 text-sage" />
          Vocabulary Highlights
        </div>
        {activeVocabulary.length ? (
          <div className="space-y-2">
            {activeVocabulary.map((item) => (
              <div key={item.id} className="rounded-md bg-paper p-2 text-xs text-stone-700 shadow-sm dark:bg-stone-800 dark:text-stone-100">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{item.word}</span>
                  {item.ipa && <span className="shrink-0 text-[11px] font-semibold text-sage">{item.ipa}</span>}
                </div>
                <div className="line-clamp-2">{item.vietnameseMeaning || item.meaning || "Meaning pending"}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-stone-500 dark:text-stone-400">Highlighted words you save will appear here.</p>
        )}
      </section>
    </aside>
    {pendingPermanentDeleteIds.length > 0 && (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/35 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="permanent-delete-title"
          className="w-full max-w-md rounded-lg border border-rose-100 bg-white p-5 shadow-paper dark:border-rose-900 dark:bg-stone-950"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-200">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="permanent-delete-title" className="text-lg font-black text-stone-950 dark:text-stone-50">
                Delete forever?
              </h2>
              <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">
                This will permanently delete {pendingPermanentDeleteIds.length === 1 ? "this book" : `${pendingPermanentDeleteIds.length} books`} and all
                related notes, annotations, vocabulary, and progress.
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-36 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-900">
            {pendingPermanentDeleteBooks.map((book) => (
              <div key={book.id} className="line-clamp-2 text-sm font-bold text-stone-800 dark:text-stone-100">
                {book.title}
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingPermanentDeleteIds([])}
              className="rounded-lg px-4 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPermanentDelete}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700"
            >
              Delete forever
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
