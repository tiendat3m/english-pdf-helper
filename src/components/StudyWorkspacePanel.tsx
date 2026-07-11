"use client";

import { CheckCircle2, Circle, Layers3, NotebookPen, Star, Target, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";
import { PAGE_STATUS_LABELS, PAGE_STATUS_STYLES } from "@/lib/constants";
import type { Annotation, BookRecord, PageStatus, PageStatusRecord, StickyNoteAnnotation, VocabularyRecord } from "@/lib/types";

interface StudyWorkspacePanelProps {
  book: BookRecord | null;
  currentPage: number;
  annotations: Annotation[];
  vocabulary: VocabularyRecord[];
  pageStatuses: PageStatusRecord[];
  onAddQuickNote: (text: string) => void;
  onJumpToPage: (page: number) => void;
}

const statusIcons: Record<PageStatus, ComponentType<{ className?: string }>> = {
  "not-started": Circle,
  learning: Target,
  done: CheckCircle2,
  "need-review": TriangleAlert
};

const statusOrder: PageStatus[] = ["not-started", "learning", "done", "need-review"];

export default function StudyWorkspacePanel({
  book,
  currentPage,
  annotations,
  vocabulary,
  pageStatuses,
  onAddQuickNote,
  onJumpToPage
}: StudyWorkspacePanelProps) {
  const pageNotes = annotations.filter(
    (annotation): annotation is StickyNoteAnnotation =>
      annotation.type === "note" && annotation.bookId === book?.id && annotation.pageNumber === currentPage
  );
  const bookVocabulary = vocabulary.filter((item) => item.sourceBookId === book?.id);
  const currentPageVocabulary = bookVocabulary.filter((item) => item.sourcePage === currentPage).slice(0, 5);
  const recentVocabulary = bookVocabulary.filter((item) => item.sourcePage !== currentPage).slice(0, 6);
  const bookStatuses = pageStatuses
    .filter((status) => status.bookId === book?.id)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const currentStatus = bookStatuses.find((status) => status.pageNumber === currentPage)?.status ?? "not-started";
  const CurrentStatusIcon = statusIcons[currentStatus];
  const statusCounts = statusOrder.map((status) => ({
    status,
    count: bookStatuses.filter((item) => item.status === status).length
  }));

  return (
    <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-stone-200 bg-[#fbf7ee]/92 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90 xl:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Study Board</p>
          <h2 className="mt-1 text-xl font-black text-stone-950 dark:text-stone-50">Page {currentPage}</h2>
        </div>
        <div className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-black ${PAGE_STATUS_STYLES[currentStatus]}`}>
          <CurrentStatusIcon className="h-3.5 w-3.5" />
          {PAGE_STATUS_LABELS[currentStatus]}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile label="Notes" value={pageNotes.length} />
        <StatTile label="Page vocab" value={currentPageVocabulary.length} />
        <StatTile label="Book vocab" value={bookVocabulary.length} />
      </div>

      <section className="mt-4 rounded-lg border border-amber-200 bg-[#fff5b8] p-3 shadow-tool dark:border-amber-900 dark:bg-amber-950">
        <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-amber-50">
          <NotebookPen className="h-4 w-4" />
          Page notebook
        </div>
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const textarea = form.elements.namedItem("quickNote") as HTMLTextAreaElement;
            const text = textarea.value.trim();
            if (text) {
              onAddQuickNote(text);
              textarea.value = "";
            }
          }}
        >
          <textarea
            name="quickNote"
            placeholder="Task idea, grammar pattern, correction..."
            className="h-24 w-full resize-none rounded-md border border-amber-200 bg-white/85 p-2 text-sm leading-5 outline-none focus:border-sage dark:border-amber-800 dark:bg-stone-950"
          />
          <button type="submit" className="mt-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white dark:bg-paper dark:text-stone-950">
            Save note
          </button>
        </form>
        <div className="mt-3 space-y-2">
          {pageNotes.length ? (
            pageNotes.map((note) => (
              <div key={note.id} className="rounded-md bg-white/85 p-2 text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-200">
                {note.text}
              </div>
            ))
          ) : (
            <p className="text-xs leading-5 text-stone-600 dark:text-amber-100">Notes saved on this page will collect here.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white/92 p-3 shadow-tool dark:border-stone-800 dark:bg-stone-900/92">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
            <Star className="h-4 w-4 text-sage" />
            Vocabulary
          </div>
          {currentPageVocabulary.length > 0 && <span className="text-[11px] font-black text-sage">page match</span>}
        </div>
        <div className="mt-3 space-y-2">
          {(currentPageVocabulary.length ? currentPageVocabulary : recentVocabulary).length ? (
            (currentPageVocabulary.length ? currentPageVocabulary : recentVocabulary).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJumpToPage(item.sourcePage)}
                className="w-full rounded-md bg-stone-50 p-2 text-left text-xs transition hover:bg-skysoft/60 dark:bg-stone-950 dark:hover:bg-stone-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-black text-stone-900 dark:text-stone-50">{item.word}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-sage dark:bg-stone-900">
                    p. {item.sourcePage}
                  </span>
                </div>
                {item.ipa && <div className="mt-1 text-[11px] font-semibold text-sage">{item.ipa}</div>}
                <div className="mt-1 line-clamp-2 text-stone-500 dark:text-stone-400">
                  {item.vietnameseMeaning || item.meaning || "Meaning pending"}
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">Saved words from this book will appear here.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white/92 p-3 shadow-tool dark:border-stone-800 dark:bg-stone-900/92">
        <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
          <Layers3 className="h-4 w-4 text-sage" />
          Review map
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {statusCounts.map((item) => {
            const Icon = statusIcons[item.status];
            return (
              <div key={item.status} className={`flex min-h-12 flex-col items-center justify-center rounded-md border text-[11px] font-black ${PAGE_STATUS_STYLES[item.status]}`}>
                <Icon className="h-3.5 w-3.5" />
                {item.count}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {bookStatuses.slice(0, 25).map((status) => {
            const Icon = statusIcons[status.status];
            return (
              <button
                key={status.id}
                type="button"
                title={`${PAGE_STATUS_LABELS[status.status]} page ${status.pageNumber}`}
                onClick={() => onJumpToPage(status.pageNumber)}
                className={`flex h-11 flex-col items-center justify-center rounded-md border text-[11px] font-black ${PAGE_STATUS_STYLES[status.status]}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {status.pageNumber}
              </button>
            );
          })}
          {!bookStatuses.length && (
            <p className="col-span-5 text-xs leading-5 text-stone-500 dark:text-stone-400">
              Mark pages from the library sidebar to build a progress map.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white/90 p-2 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="text-lg font-black text-stone-950 dark:text-stone-50">{value}</div>
      <div className="mt-0.5 text-[10px] font-black uppercase text-stone-500 dark:text-stone-400">{label}</div>
    </div>
  );
}
