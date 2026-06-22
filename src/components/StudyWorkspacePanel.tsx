"use client";

import { CheckCircle2, Circle, NotebookPen, Star, Target, TriangleAlert } from "lucide-react";
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
  const bookVocabulary = vocabulary.filter((item) => item.sourceBookId === book?.id).slice(0, 8);
  const bookStatuses = pageStatuses
    .filter((status) => status.bookId === book?.id)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .slice(0, 24);

  return (
    <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-stone-200 bg-white/82 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-950/82 xl:block">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Split Workspace</p>
        <h2 className="mt-1 text-xl font-black text-stone-950 dark:text-stone-50">Notebook</h2>
      </div>

      <section className="mt-4 rounded-lg border border-amber-200 bg-[#fff6bd] p-3 shadow-tool dark:border-amber-900 dark:bg-amber-950">
        <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-amber-50">
          <NotebookPen className="h-4 w-4" />
          Page {currentPage} notes
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
            placeholder="Write a Task 2 idea, collocation, grammar reminder..."
            className="h-24 w-full resize-none rounded-md border border-amber-200 bg-white/80 p-2 text-sm outline-none focus:border-sage dark:border-amber-800 dark:bg-stone-950"
          />
          <button type="submit" className="mt-2 rounded-md bg-ink px-3 py-2 text-xs font-bold text-white dark:bg-paper dark:text-stone-950">
            Save note
          </button>
        </form>
        <div className="mt-3 space-y-2">
          {pageNotes.length ? (
            pageNotes.map((note) => (
              <div key={note.id} className="rounded-md bg-white/80 p-2 text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-200">
                {note.text}
              </div>
            ))
          ) : (
            <p className="text-xs leading-5 text-stone-600 dark:text-amber-100">Sticky notes on this page will collect here.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-3 shadow-tool dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
          <Star className="h-4 w-4 text-sage" />
          Vocabulary
        </div>
        <div className="mt-3 space-y-2">
          {bookVocabulary.length ? (
            bookVocabulary.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onJumpToPage(item.sourcePage)}
                className="w-full rounded-md bg-stone-50 p-2 text-left text-xs transition hover:bg-skysoft/60 dark:bg-stone-950 dark:hover:bg-stone-800"
              >
                <div className="font-black text-stone-900 dark:text-stone-50">{item.word}</div>
                <div className="mt-1 line-clamp-2 text-stone-500 dark:text-stone-400">{item.meaning || "Meaning pending"}</div>
                <div className="mt-1 font-semibold text-sage">page {item.sourcePage} - {item.status}</div>
              </button>
            ))
          ) : (
            <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">Highlighted vocabulary from this book will show here.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-3 shadow-tool dark:border-stone-800 dark:bg-stone-900">
        <div className="text-sm font-black text-stone-800 dark:text-stone-100">Review Map</div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {bookStatuses.length ? (
            bookStatuses.map((status) => {
              const Icon = statusIcons[status.status];
              return (
                <button
                  key={status.id}
                  type="button"
                  title={`${PAGE_STATUS_LABELS[status.status]} page ${status.pageNumber}`}
                  onClick={() => onJumpToPage(status.pageNumber)}
                  className={`flex h-12 flex-col items-center justify-center rounded-md border text-[11px] font-black ${PAGE_STATUS_STYLES[status.status]}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {status.pageNumber}
                </button>
              );
            })
          ) : (
            <p className="col-span-4 text-xs leading-5 text-stone-500 dark:text-stone-400">
              Mark pages as Learning, Done, or Need Review to build a map.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
