"use client";

import { Search, Trash2 } from "lucide-react";
import type { VocabularyRecord, VocabStatus } from "@/lib/types";

interface VocabularyPanelProps {
  vocabulary: VocabularyRecord[];
  search: string;
  filter: VocabStatus | "all";
  sort: "newest" | "word" | "status";
  onSearchChange: (value: string) => void;
  onFilterChange: (value: VocabStatus | "all") => void;
  onSortChange: (value: "newest" | "word" | "status") => void;
  onStatusChange: (record: VocabularyRecord, status: VocabStatus) => void;
  onDelete: (id: string) => void;
}

const statuses: Array<VocabStatus | "all"> = ["all", "new", "learning", "mastered"];

export default function VocabularyPanel({
  vocabulary,
  search,
  filter,
  sort,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onStatusChange,
  onDelete
}: VocabularyPanelProps) {
  const visible = vocabulary
    .filter((item) => {
      const haystack =
        `${item.word} ${item.ipa ?? ""} ${item.meaning} ${item.vietnameseMeaning ?? ""} ${item.example} ${item.sourceBookTitle}`.toLowerCase();
      return haystack.includes(search.toLowerCase()) && (filter === "all" || item.status === filter);
    })
    .sort((a, b) => {
      if (sort === "word") {
        return a.word.localeCompare(b.word);
      }
      if (sort === "status") {
        return a.status.localeCompare(b.status);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <main className="min-h-screen p-5 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Anki-inspired review</p>
            <h1 className="mt-2 text-3xl font-bold text-stone-950 dark:text-stone-50">Vocabulary</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search words"
                className="w-44 bg-transparent outline-none"
              />
            </label>
            <select
              value={filter}
              onChange={(event) => onFilterChange(event.target.value as VocabStatus | "all")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All status" : status}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as "newest" | "word" | "status")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <option value="newest">Newest</option>
              <option value="word">Word</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-paper dark:border-stone-800 dark:bg-stone-950">
          <div className="grid grid-cols-[1.1fr_1.6fr_1.4fr_1fr_0.8fr_44px] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
            <span>Word</span>
            <span>Meaning</span>
            <span>Example</span>
            <span>Source</span>
            <span>Status</span>
            <span />
          </div>
          {visible.length ? (
            visible.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-3 border-b border-stone-100 px-4 py-4 text-sm last:border-b-0 dark:border-stone-800 md:grid-cols-[1.1fr_1.6fr_1.4fr_1fr_0.8fr_44px]"
              >
                <div>
                  <div className="font-bold text-stone-950 dark:text-stone-50">{item.word}</div>
                  {item.ipa && <div className="mt-1 text-xs font-semibold text-sage">{item.ipa}</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-stone-700 dark:text-stone-200">{item.meaning || "Add English meaning during review"}</div>
                  <div className="text-xs leading-5 text-stone-500 dark:text-stone-400">{item.vietnameseMeaning || "Thêm nghĩa tiếng Việt"}</div>
                </div>
                <div className="text-stone-600 dark:text-stone-300">{item.example || "Add your own sentence"}</div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  <div className="font-semibold">{item.sourceBookTitle}</div>
                  <div>Page {item.sourcePage}</div>
                </div>
                <select
                  value={item.status}
                  onChange={(event) => onStatusChange(item, event.target.value as VocabStatus)}
                  className="h-9 rounded-md border border-stone-200 bg-white px-2 text-xs font-bold capitalize dark:border-stone-700 dark:bg-stone-900"
                >
                  <option value="new">new</option>
                  <option value="learning">learning</option>
                  <option value="mastered">mastered</option>
                </select>
                <button
                  type="button"
                  title="Delete vocabulary"
                  onClick={() => onDelete(item.id)}
                  className="grid h-9 w-9 place-items-center rounded-md text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-sm text-stone-500 dark:text-stone-400">
              Select text in a PDF to start building your IELTS vocabulary deck.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
