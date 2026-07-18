"use client";

import { CheckCircle2, Circle, Download, Layers3, NotebookPen, Search, Star, Target, TriangleAlert } from "lucide-react";
import { useState, type ComponentType } from "react";
import { PAGE_STATUS_LABELS, PAGE_STATUS_STYLES } from "@/lib/constants";
import type { Annotation, BookRecord, HighlightAnnotation, PageStatus, PageStatusRecord, StickyNoteAnnotation, VocabularyRecord } from "@/lib/types";

interface StudyWorkspacePanelProps {
  book: BookRecord | null;
  currentPage: number;
  annotations: Annotation[];
  vocabulary: VocabularyRecord[];
  pageStatuses: PageStatusRecord[];
  onAddQuickNote: (text: string) => void;
  onJumpToPage: (page: number) => void;
  onSetPageStatus: (status: PageStatus) => void;
}

const statusIcons: Record<PageStatus, ComponentType<{ className?: string }>> = {
  "not-started": Circle,
  learning: Target,
  done: CheckCircle2,
  "need-review": TriangleAlert
};

const statusOrder: PageStatus[] = ["not-started", "learning", "done", "need-review"];

type PageMapFilter = "nearby" | "marked" | "review" | "vocab" | "all";

interface PageMapEntry {
  pageNumber: number;
  status: PageStatus;
  ink: number;
  marks: number;
  notes: number;
  vocab: number;
}

export default function StudyWorkspacePanel({
  book,
  currentPage,
  annotations,
  vocabulary,
  pageStatuses,
  onAddQuickNote,
  onJumpToPage,
  onSetPageStatus
}: StudyWorkspacePanelProps) {
  const [pageMapFilter, setPageMapFilter] = useState<PageMapFilter>("nearby");
  const [noteSearch, setNoteSearch] = useState("");
  const pageNotes = annotations.filter(
    (annotation): annotation is StickyNoteAnnotation =>
      annotation.type === "note" && annotation.bookId === book?.id && annotation.pageNumber === currentPage
  );
  const bookVocabulary = vocabulary.filter((item) => item.sourceBookId === book?.id);
  const currentPageVocabulary = bookVocabulary.filter((item) => item.sourcePage === currentPage).slice(0, 5);
  const recentVocabulary = bookVocabulary.filter((item) => item.sourcePage !== currentPage).slice(0, 6);
  const bookNotes = annotations
    .filter((annotation): annotation is StickyNoteAnnotation => annotation.type === "note" && annotation.bookId === book?.id)
    .filter((note) => note.text.toLowerCase().includes(noteSearch.toLowerCase()))
    .sort((a, b) => a.pageNumber - b.pageNumber || b.updatedAt.localeCompare(a.updatedAt));
  const bookHighlights = annotations.filter(
    (annotation): annotation is HighlightAnnotation => annotation.type === "highlight" && annotation.bookId === book?.id && Boolean(annotation.selectedText)
  );
  const bookStatuses = pageStatuses
    .filter((status) => status.bookId === book?.id)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const currentStatus = bookStatuses.find((status) => status.pageNumber === currentPage)?.status ?? "not-started";
  const CurrentStatusIcon = statusIcons[currentStatus];
  const pageAnnotations = annotations.filter((annotation) => annotation.bookId === book?.id && annotation.pageNumber === currentPage);
  const strokeCount = pageAnnotations.filter((annotation) => annotation.type === "stroke").length;
  const highlightCount = pageAnnotations.filter((annotation) => annotation.type === "highlight").length;
  const statusCounts = statusOrder.map((status) => ({
    status,
    count: bookStatuses.filter((item) => item.status === status).length
  }));
  const nextReviewPage = bookStatuses.find((status) => status.status === "need-review" && status.pageNumber !== currentPage);
  const bookAnnotations = annotations.filter((annotation) => annotation.bookId === book?.id);
  const pagesWithSignals = [
    currentPage,
    book?.lastPage ?? 0,
    book?.totalPages ?? 0,
    ...bookStatuses.map((status) => status.pageNumber),
    ...bookVocabulary.map((item) => item.sourcePage),
    ...bookAnnotations.map((annotation) => annotation.pageNumber)
  ];
  const pageLimit = Math.max(1, ...pagesWithSignals);
  const statusByPage = new Map(bookStatuses.map((status) => [status.pageNumber, status.status]));
  const activityByPage = new Map<number, Pick<PageMapEntry, "ink" | "marks" | "notes" | "vocab">>();

  function ensureActivity(pageNumber: number) {
    const existing = activityByPage.get(pageNumber);
    if (existing) {
      return existing;
    }
    const next = { ink: 0, marks: 0, notes: 0, vocab: 0 };
    activityByPage.set(pageNumber, next);
    return next;
  }

  bookAnnotations.forEach((annotation) => {
    const activity = ensureActivity(annotation.pageNumber);
    if (annotation.type === "stroke") {
      activity.ink += 1;
    } else if (annotation.type === "highlight") {
      activity.marks += 1;
    } else {
      activity.notes += 1;
    }
  });
  bookVocabulary.forEach((item) => {
    ensureActivity(item.sourcePage).vocab += 1;
  });

  const pageMap: PageMapEntry[] = Array.from({ length: pageLimit }, (_, index) => {
    const pageNumber = index + 1;
    const activity = activityByPage.get(pageNumber) ?? { ink: 0, marks: 0, notes: 0, vocab: 0 };
    return {
      pageNumber,
      status: statusByPage.get(pageNumber) ?? "not-started",
      ...activity
    };
  });
  const visiblePageMap = pageMap.filter((page) => {
    const hasAnnotation = page.ink + page.marks + page.notes > 0;
    const hasSignal = hasAnnotation || page.vocab > 0 || page.status !== "not-started";

    if (pageMapFilter === "all") {
      return true;
    }
    if (pageMapFilter === "review") {
      return page.status === "need-review";
    }
    if (pageMapFilter === "vocab") {
      return page.vocab > 0;
    }
    if (pageMapFilter === "marked") {
      return hasSignal;
    }
    return Math.abs(page.pageNumber - currentPage) <= 5 || hasSignal;
  });
  const pageMapFilters: Array<{ value: PageMapFilter; label: string }> = [
    { value: "nearby", label: "Near" },
    { value: "marked", label: "Marked" },
    { value: "review", label: "Review" },
    { value: "vocab", label: "Vocab" },
    { value: "all", label: "All" }
  ];

  function exportNotebookMarkdown() {
    if (!book) {
      return;
    }

    const lines = [
      `# ${book.title}`,
      "",
      "## Notes",
      ...bookNotes.flatMap((note) => [`### Page ${note.pageNumber}`, "", note.text, ""]),
      "## Highlights",
      ...bookHighlights.flatMap((highlight) => [`- Page ${highlight.pageNumber}: ${highlight.selectedText}`]),
      "",
      "## Vocabulary",
      ...bookVocabulary.flatMap((item) => [
        `### ${item.word}`,
        item.ipa ? `- IPA: ${item.ipa}` : "",
        item.partOfSpeech ? `- Part: ${item.partOfSpeech}` : "",
        item.meaning ? `- Meaning: ${item.meaning}` : "",
        item.vietnameseMeaning ? `- Vietnamese: ${item.vietnameseMeaning}` : "",
        item.synonyms ? `- Synonyms: ${item.synonyms}` : "",
        item.antonyms ? `- Antonyms: ${item.antonyms}` : "",
        item.example ? `- Example: ${item.example}` : "",
        `- Source: page ${item.sourcePage}`,
        ""
      ])
    ].filter((line) => line !== "");

    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "ielts-notebook"}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

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
        <StatTile label="Ink" value={strokeCount} />
        <StatTile label="Marks" value={highlightCount} />
      </div>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white/92 p-3 shadow-tool dark:border-stone-800 dark:bg-stone-900/92">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-black text-stone-800 dark:text-stone-100">Page status</div>
          {nextReviewPage && (
            <button
              type="button"
              onClick={() => onJumpToPage(nextReviewPage.pageNumber)}
              className="text-[11px] font-black text-sage transition hover:text-ink dark:hover:text-paper"
            >
              next review p. {nextReviewPage.pageNumber}
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {statusOrder.map((status) => {
            const Icon = statusIcons[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSetPageStatus(status)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[11px] font-black transition hover:-translate-y-0.5 ${PAGE_STATUS_STYLES[status]} ${
                  currentStatus === status ? "ring-2 ring-sage/35" : ""
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {PAGE_STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-amber-200 bg-[#fff5b8] p-3 shadow-tool dark:border-amber-900 dark:bg-amber-950">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-amber-50">
            <NotebookPen className="h-4 w-4" />
            Page notebook
          </div>
          <button
            type="button"
            onClick={exportNotebookMarkdown}
            disabled={!book}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-[11px] font-black text-stone-700 transition hover:border-sage hover:text-sage disabled:opacity-50 dark:border-amber-800 dark:bg-stone-950"
          >
            <Download className="h-3.5 w-3.5" />
            MD
          </button>
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
              <NotebookNoteCard key={note.id} note={note} />
            ))
          ) : (
            <p className="text-xs leading-5 text-stone-600 dark:text-amber-100">Notes saved on this page will collect here.</p>
          )}
        </div>
        <div className="mt-3 rounded-md border border-amber-200 bg-white/65 p-2 dark:border-amber-800 dark:bg-stone-950/60">
          <label className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-stone-500 dark:bg-stone-900">
            <Search className="h-3.5 w-3.5" />
            <input
              value={noteSearch}
              onChange={(event) => setNoteSearch(event.target.value)}
              placeholder="Search book notes"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
            {bookNotes.slice(0, 8).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onJumpToPage(note.pageNumber)}
                className="w-full rounded-md p-2 text-left text-xs leading-5 text-stone-700 transition hover:bg-amber-100 dark:text-stone-200 dark:hover:bg-stone-900"
              >
                <span className="font-black text-sage">p. {note.pageNumber}</span> {note.text}
              </button>
            ))}
            {!bookNotes.length && <p className="p-2 text-xs text-stone-500">No matching notes.</p>}
          </div>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatTile label="Page vocab" value={currentPageVocabulary.length} />
          <StatTile label="Book vocab" value={bookVocabulary.length} />
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
              <Layers3 className="h-4 w-4 text-sage" />
              Page map
            </div>
            <p className="mt-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400">Jump by status, notes, ink, marks, or vocab.</p>
          </div>
          <span className="rounded-full bg-skysoft px-2 py-1 text-[10px] font-black text-stone-700 dark:bg-sage/20 dark:text-stone-200">
            {visiblePageMap.length}
          </span>
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
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pageMapFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setPageMapFilter(filter.value)}
              className={`rounded-md border px-2 py-1 text-[10px] font-black transition ${
                pageMapFilter === filter.value
                  ? "border-sage bg-skysoft text-stone-900 dark:bg-sage/20 dark:text-stone-50"
                  : "border-stone-200 bg-white text-stone-500 hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1">
          {visiblePageMap.map((page) => {
            const Icon = statusIcons[page.status];
            const hasActivity = page.ink + page.marks + page.notes + page.vocab > 0;
            return (
              <button
                key={page.pageNumber}
                type="button"
                title={`${PAGE_STATUS_LABELS[page.status]} page ${page.pageNumber}`}
                onClick={() => onJumpToPage(page.pageNumber)}
                className={`relative flex h-12 flex-col items-center justify-center rounded-md border text-[11px] font-black transition hover:-translate-y-0.5 ${PAGE_STATUS_STYLES[page.status]} ${
                  currentPage === page.pageNumber ? "ring-2 ring-sage" : ""
                } ${hasActivity ? "shadow-sm" : "opacity-70"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {page.pageNumber}
                {hasActivity && (
                  <span className="absolute bottom-1 flex items-center gap-0.5">
                    {page.ink > 0 && <span title="Ink" className="h-1.5 w-1.5 rounded-full bg-stone-800 dark:bg-stone-200" />}
                    {page.marks > 0 && <span title="Highlight" className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    {page.notes > 0 && <span title="Note" className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    {page.vocab > 0 && <span title="Vocabulary" className="h-1.5 w-1.5 rounded-full bg-sage" />}
                  </span>
                )}
              </button>
            );
          })}
          {!visiblePageMap.length && (
            <p className="col-span-5 text-xs leading-5 text-stone-500 dark:text-stone-400">
              No pages match this filter yet.
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

function NotebookNoteCard({ note }: { note: StickyNoteAnnotation }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const lines = note.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const question = lines.find((line) => line.toLowerCase().startsWith("question:"))?.replace(/^question:\s*/i, "");
  const answerIndex = lines.findIndex((line) => line.toLowerCase().startsWith("answer:"));
  const answerLines = answerIndex >= 0 ? lines.slice(answerIndex) : [];
  const beforeAnswer = answerIndex >= 0 ? lines.slice(0, answerIndex) : lines;
  const isSolution = Boolean(question && answerLines.length);

  if (!isSolution) {
    return (
      <div className="whitespace-pre-wrap rounded-md bg-white/85 p-2 text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-200">
        {note.text}
      </div>
    );
  }

  return (
    <div className="rounded-md bg-white/85 p-2 text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-200">
      <div className="font-black text-stone-900 dark:text-stone-50">{question}</div>
      {beforeAnswer.slice(1).map((line) => (
        <div key={line} className="mt-1 text-stone-500 dark:text-stone-400">
          {line}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setShowAnswer((current) => !current)}
        className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-black text-stone-700 transition hover:border-sage hover:text-sage dark:border-amber-800 dark:bg-stone-950"
      >
        {showAnswer ? "Hide answer" : "Show answer"}
      </button>
      {showAnswer && (
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-skysoft/70 p-2 text-stone-800 dark:bg-sage/20 dark:text-stone-100">
          {answerLines.join("\n")}
        </div>
      )}
    </div>
  );
}
