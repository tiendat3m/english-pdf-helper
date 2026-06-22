"use client";

import { BarChart3, BookOpen, Flame, NotebookPen, Star, TrendingUp } from "lucide-react";
import type { AppData } from "@/lib/types";
import { countDonePagesToday, countStudiedPages, estimateBand, formatPercent, getOverallProgress, getStudyStreak } from "@/lib/utils";

interface ProgressPanelProps {
  data: AppData;
}

export default function ProgressPanel({ data }: ProgressPanelProps) {
  const overallProgress = getOverallProgress(data.books);
  const masteredVocabulary = data.vocabulary.filter((item) => item.status === "mastered").length;
  const notesCount = data.annotations.filter((annotation) => annotation.type === "note").length;
  const currentBand = estimateBand(overallProgress, masteredVocabulary, notesCount);
  const todayDonePages = countDonePagesToday(data.pageStatuses);
  const needReviewPages = data.pageStatuses.filter((status) => status.status === "need-review").length;

  const stats = [
    { label: "Study streak", value: `${getStudyStreak(data.activities)} days`, icon: Flame },
    { label: "Books studied", value: data.books.length.toString(), icon: BookOpen },
    { label: "Pages studied", value: countStudiedPages(data.pageStatuses).toString(), icon: BarChart3 },
    { label: "Vocabulary saved", value: data.vocabulary.length.toString(), icon: Star },
    { label: "Notes count", value: notesCount.toString(), icon: NotebookPen },
    { label: "Overall progress", value: formatPercent(overallProgress), icon: TrendingUp }
  ];

  return (
    <main className="min-h-screen p-5 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Band 8 journey</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-950 dark:text-stone-50">Progress</h1>
        </div>

        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-stone-950 dark:text-stone-50">IELTS 8.0 Tracker</h2>
                <span className="rounded-full bg-skysoft px-3 py-1 text-xs font-black text-stone-700 dark:bg-sage/20 dark:text-stone-100">
                  Current estimate {currentBand.toFixed(1)}
                </span>
              </div>
              <div className="mt-5 h-4 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-sage" style={{ width: formatPercent(overallProgress) }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm font-bold text-stone-500 dark:text-stone-400">
                <span>Overall {formatPercent(overallProgress)}</span>
                <span>Goal 8.0</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-lg bg-paper p-3 dark:bg-stone-900">
                <div className="text-xs font-bold uppercase tracking-wide text-sage">Today</div>
                <div className="mt-1 text-2xl font-black text-stone-950 dark:text-stone-50">{todayDonePages} pages</div>
              </div>
              <div className="rounded-lg bg-paper p-3 dark:bg-stone-900">
                <div className="text-xs font-bold uppercase tracking-wide text-sage">Need review</div>
                <div className="mt-1 text-2xl font-black text-stone-950 dark:text-stone-50">{needReviewPages}</div>
              </div>
              <div className="rounded-lg bg-paper p-3 dark:bg-stone-900">
                <div className="text-xs font-bold uppercase tracking-wide text-sage">Mastered words</div>
                <div className="mt-1 text-2xl font-black text-stone-950 dark:text-stone-50">{masteredVocabulary}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-lg border border-stone-200 bg-white p-5 shadow-tool dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-stone-500 dark:text-stone-400">{stat.label}</div>
                  <Icon className="h-5 w-5 text-sage" />
                </div>
                <div className="mt-4 text-3xl font-bold text-stone-950 dark:text-stone-50">{stat.value}</div>
              </div>
            );
          })}
        </div>

        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-950 dark:text-stone-50">Books</h2>
            <span className="text-sm font-semibold text-stone-500">{data.books.length} total</span>
          </div>
          <div className="mt-4 space-y-4">
            {data.books.length ? (
              data.books.map((book) => (
                <div key={book.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-stone-800 dark:text-stone-100">{book.title}</span>
                    <span className="text-stone-500">{formatPercent(book.progress)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div className="h-full rounded-full bg-sage" style={{ width: formatPercent(book.progress) }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">Import a PDF and mark pages as learning or done to fill this in.</p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
          <h2 className="text-lg font-bold text-stone-950 dark:text-stone-50">Recent activity</h2>
          <div className="mt-4 space-y-2">
            {data.activities.length ? (
              data.activities.slice(0, 10).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2 text-sm dark:bg-stone-900">
                  <span className="font-semibold text-stone-700 dark:text-stone-200">{activity.label}</span>
                  <span className="text-xs text-stone-500">{new Date(activity.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">Your study actions will appear here.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
