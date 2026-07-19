"use client";

import { BookOpen, CheckCircle2, Download, Eye, EyeOff, Layers3, Plus, RotateCcw, Search, Sparkles, Trash2, Upload, Volume2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { VocabDifficulty, VocabularyRecord, VocabStatus } from "@/lib/types";

interface VocabularyPanelProps {
  vocabulary: VocabularyRecord[];
  search: string;
  filter: VocabStatus | "all";
  sort: "newest" | "word" | "status";
  onSearchChange: (value: string) => void;
  onFilterChange: (value: VocabStatus | "all") => void;
  onSortChange: (value: "newest" | "word" | "status") => void;
  onStatusChange: (record: VocabularyRecord, status: VocabStatus) => void;
  onUpdate: (record: VocabularyRecord) => void;
  onDelete: (id: string) => void;
  onAddWord: (word: string) => void;
  onExportCsv: () => void;
  onImportCsv: (file: File) => void;
}

const statuses: Array<VocabStatus | "all"> = ["all", "new", "learning", "mastered"];
const VISIBLE_STEP = 50;
const statusStyles: Record<VocabStatus, string> = {
  new: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  learning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  mastered: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
};
const difficultyLabels: Record<VocabDifficulty, string> = {
  "band-5": "Band 5",
  "band-6": "Band 6",
  "band-7": "Band 7",
  "band-8": "Band 8"
};

type SpeechLang = "en" | "vi";

function cleanTextForSpeech(text: string) {
  return text
    .replace(/\s*\((?:v|n|adj|adv|verb|noun|adjective|adverb|phrase|phr|phrasal verb|collocation|prep|preposition|conj|conjunction)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function speakText(text: string, lang: SpeechLang = "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const cleanText = cleanTextForSpeech(text);
  if (!cleanText || cleanText === "-") {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices();
  const voicePrefixes = lang === "vi" ? ["vi", "en-gb", "en-us", "en"] : ["en-gb", "en-us", "en"];
  utterance.voice =
    voicePrefixes
      .map((prefix) => voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)))
      .find(Boolean) ?? null;
  utterance.lang = utterance.voice?.lang ?? (lang === "vi" ? "vi-VN" : "en-US");
  utterance.rate = lang === "vi" ? 0.9 : 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function speakWord(word: string) {
  speakText(word, "en");
}

function normalizeWord(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isDue(record: VocabularyRecord) {
  if (!record.dueAt) {
    return record.status !== "mastered";
  }
  return new Date(record.dueAt).getTime() <= Date.now();
}

function nextDueLabel(record: VocabularyRecord) {
  if (!record.dueAt) {
    return record.status === "mastered" ? "not scheduled" : "due now";
  }
  const dueTime = new Date(record.dueAt).getTime();
  const diffDays = Math.ceil((dueTime - Date.now()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) {
    return "due now";
  }
  return `due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

export default function VocabularyPanel({
  vocabulary,
  search,
  filter,
  sort,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onStatusChange,
  onUpdate,
  onDelete,
  onAddWord,
  onExportCsv,
  onImportCsv
}: VocabularyPanelProps) {
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [viewMode, setViewMode] = useState<"review" | "manage">("manage");
  const [quizMode, setQuizMode] = useState<"meaning" | "vietnamese" | "example" | "spelling">("meaning");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState("all");
  const [visibleLimit, setVisibleLimit] = useState(VISIBLE_STEP);

  const topicOptions = useMemo(
    () =>
      Array.from(new Set(vocabulary.map((item) => item.topic?.trim()).filter((topic): topic is string => Boolean(topic)))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [vocabulary]
  );
  const hasUntagged = useMemo(() => vocabulary.some((item) => !item.topic?.trim()), [vocabulary]);

  const visible = useMemo(
    () =>
      vocabulary
        .filter((item) => {
          const topic = item.topic?.trim() || "Untagged";
          const matchesTopic = topicFilter === "all" || topicFilter === topic;
          const haystack =
            `${item.word} ${item.ipa ?? ""} ${item.partOfSpeech ?? ""} ${item.meaning} ${item.vietnameseMeaning ?? ""} ${item.synonyms ?? ""} ${item.antonyms ?? ""} ${item.topic ?? ""} ${item.subtopic ?? ""} ${(item.tags ?? []).join(" ")} ${item.difficulty ?? ""} ${item.example} ${item.sourceBookTitle}`.toLowerCase();
          return matchesTopic && haystack.includes(search.toLowerCase()) && (filter === "all" || item.status === filter);
        })
        .sort((a, b) => {
          if (sort === "word") {
            return a.word.localeCompare(b.word);
          }
          if (sort === "status") {
            return a.status.localeCompare(b.status);
          }
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [filter, search, sort, topicFilter, vocabulary]
  );

  const displayed = visible.slice(0, visibleLimit);
  const dueCards = visible.filter(isDue);
  const currentCard = dueCards.length ? dueCards[reviewIndex % dueCards.length] : visible[0] ?? null;
  const selectedRecord = visible.find((item) => item.id === selectedRecordId) ?? visible[0] ?? null;
  const counts = {
    new: vocabulary.filter((item) => item.status === "new").length,
    learning: vocabulary.filter((item) => item.status === "learning").length,
    mastered: vocabulary.filter((item) => item.status === "mastered").length
  };

  useEffect(() => {
    if (!visible.length) {
      setSelectedRecordId(null);
      return;
    }
    if (!selectedRecordId || !visible.some((item) => item.id === selectedRecordId)) {
      setSelectedRecordId(visible[0].id);
    }
  }, [selectedRecordId, visible]);

  useEffect(() => {
    setVisibleLimit(VISIBLE_STEP);
  }, [filter, search, sort, topicFilter]);

  function submitNewWord() {
    const word = normalizeWord(newWord);
    if (!word) {
      return;
    }
    onAddWord(word);
    setNewWord("");
    setIsAddingWord(false);
  }

  function rateCard(record: VocabularyRecord, status: VocabStatus) {
    onStatusChange(record, status);
    setIsAnswerVisible(false);
    setReviewIndex((current) => current + 1);
  }

  function updateField(record: VocabularyRecord, field: keyof VocabularyRecord, value: string) {
    const nextValue = value.trim();
    if (record[field] === nextValue) {
      return;
    }
    onUpdate({ ...record, [field]: nextValue, updatedAt: new Date().toISOString() });
  }

  function updateTags(record: VocabularyRecord, value: string) {
    const tags = value
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if ((record.tags ?? []).join(", ") === tags.join(", ")) {
      return;
    }
    onUpdate({ ...record, tags, updatedAt: new Date().toISOString() });
  }

  function reviewPrompt(record: VocabularyRecord) {
    if (quizMode === "vietnamese") {
      return record.vietnameseMeaning || record.meaning || record.word;
    }
    if (quizMode === "example") {
      return record.example || record.meaning || record.word;
    }
    if (quizMode === "spelling") {
      return record.vietnameseMeaning || record.meaning || "Listen and spell this word";
    }
    return record.word;
  }

  useEffect(() => {
    if (viewMode !== "review" || !currentCard) {
      return;
    }

    function handleReviewKeys(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsAnswerVisible((current) => !current);
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        onStatusChange(currentCard, "new");
        setIsAnswerVisible(false);
        setReviewIndex((current) => current + 1);
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        onStatusChange(currentCard, "learning");
        setIsAnswerVisible(false);
        setReviewIndex((current) => current + 1);
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        onStatusChange(currentCard, "mastered");
        setIsAnswerVisible(false);
        setReviewIndex((current) => current + 1);
      }
    }

    window.addEventListener("keydown", handleReviewKeys);
    return () => window.removeEventListener("keydown", handleReviewKeys);
  }, [currentCard, onStatusChange, viewMode]);

  return (
    <main className="min-h-screen p-5 md:p-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Anki-inspired review</p>
            <h1 className="mt-2 text-3xl font-black text-stone-950 dark:text-stone-50">Vocabulary</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAddingWord && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitNewWord();
                }}
                className="flex items-center gap-2 rounded-lg border border-sage/40 bg-white px-2 py-1.5 shadow-sm dark:border-sage/60 dark:bg-stone-900"
              >
                <input
                  autoFocus
                  value={newWord}
                  onChange={(event) => setNewWord(event.target.value)}
                  placeholder="New word or phrase"
                  className="w-44 bg-transparent px-1 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-white dark:bg-paper dark:text-stone-950"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Explain
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => setIsAddingWord((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            >
              <Plus className="h-4 w-4" />
              Add word
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
              <Upload className="h-4 w-4" />
              Import
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    onImportCsv(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              {(["manage", "review"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-black capitalize transition ${
                    viewMode === mode
                      ? "bg-ink text-white dark:bg-paper dark:text-stone-950"
                      : "text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  {mode === "manage" ? "Manage" : "Review"}
                </button>
              ))}
            </div>
            {viewMode === "review" && (
              <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                {(["meaning", "vietnamese", "example", "spelling"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setQuizMode(mode);
                      setIsAnswerVisible(false);
                    }}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-black capitalize transition ${
                      quizMode === mode
                        ? "bg-skysoft text-stone-900 dark:bg-sage/20 dark:text-stone-50"
                        : "text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
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
              onChange={(event) => {
                onFilterChange(event.target.value as VocabStatus | "all");
                setReviewIndex(0);
                setIsAnswerVisible(false);
              }}
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

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <DeckStat label="Due now" value={dueCards.length} icon={RotateCcw} />
          <DeckStat label="New" value={counts.new} icon={Plus} />
          <DeckStat label="Learning" value={counts.learning} icon={Layers3} />
          <DeckStat label="Mastered" value={counts.mastered} icon={CheckCircle2} />
        </section>

        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-3 shadow-tool dark:border-stone-800 dark:bg-stone-950">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">Topics</span>
            <TopicChip label="All topics" active={topicFilter === "all"} count={vocabulary.length} onClick={() => setTopicFilter("all")} />
            {hasUntagged && (
              <TopicChip
                label="Untagged"
                active={topicFilter === "Untagged"}
                count={vocabulary.filter((item) => !item.topic?.trim()).length}
                onClick={() => setTopicFilter("Untagged")}
              />
            )}
            {topicOptions.slice(0, 14).map((topic) => (
              <TopicChip
                key={topic}
                label={topic}
                active={topicFilter === topic}
                count={vocabulary.filter((item) => item.topic?.trim() === topic).length}
                onClick={() => setTopicFilter(topic)}
              />
            ))}
            {topicOptions.length > 14 && (
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-500 dark:bg-stone-900 dark:text-stone-300">
                +{topicOptions.length - 14} more
              </span>
            )}
          </div>
        </section>

        {viewMode === "review" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.78fr_0.22fr]">
            <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              {currentCard ? (
                <div className="min-h-[460px]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black capitalize ${statusStyles[currentCard.status]}`}>
                        {currentCard.status}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-500 dark:bg-stone-900 dark:text-stone-300">
                        {nextDueLabel(currentCard)}
                      </span>
                      <span className="text-xs font-bold text-stone-500 dark:text-stone-400">
                        {currentCard.sourcePage > 0 ? `${currentCard.sourceBookTitle} - page ${currentCard.sourcePage}` : "Manual word"}
                      </span>
                      </div>
                      <p className="mt-5 text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">
                        {quizMode === "spelling" ? "Spell the word" : quizMode === "vietnamese" ? "Recall English" : quizMode === "example" ? "Use this context" : "Recall meaning"}
                      </p>
                      <h2 className="mt-2 text-4xl font-black text-stone-950 dark:text-stone-50">{reviewPrompt(currentCard)}</h2>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {currentCard.ipa && <span className="text-lg font-bold text-sage">{currentCard.ipa}</span>}
                        {currentCard.partOfSpeech && (
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black capitalize text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            {currentCard.partOfSpeech}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => speakWord(currentCard.word)}
                          className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-black text-sage shadow-sm transition hover:border-sage dark:border-stone-700 dark:bg-stone-900"
                        >
                          <Volume2 className="h-4 w-4" />
                          Listen
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAnswerVisible((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white shadow-tool dark:bg-paper dark:text-stone-950"
                    >
                      {isAnswerVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {isAnswerVisible ? "Hide" : "Show answer"}
                    </button>
                  </div>

                  <div className={`mt-8 grid gap-4 transition ${isAnswerVisible ? "opacity-100" : "opacity-35 blur-[2px]"}`}>
                    <AnswerBlock label="English meaning" value={currentCard.meaning || "Meaning pending"} />
                    <AnswerBlock label="Word" value={currentCard.word} />
                    <AnswerBlock label="Vietnamese" value={currentCard.vietnameseMeaning || "Add Vietnamese meaning"} speakLang="vi" />
                    <div className="grid gap-4 md:grid-cols-2">
                      <AnswerBlock label="Synonyms" value={currentCard.synonyms || "-"} />
                      <AnswerBlock label="Antonyms" value={currentCard.antonyms || "-"} />
                    </div>
                    <AnswerBlock label="Example" value={currentCard.example || "Add your own IELTS sentence"} />
                  </div>

                  <div className="mt-8 grid gap-3 md:grid-cols-3">
                    <ReviewButton label="Again" detail="Keep as new" onClick={() => rateCard(currentCard, "new")} />
                    <ReviewButton label="Learning" detail="See it again" onClick={() => rateCard(currentCard, "learning")} />
                    <ReviewButton label="Mastered" detail="Move out of due deck" onClick={() => rateCard(currentCard, "mastered")} strong />
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[420px] place-items-center text-center">
                  <div>
                    <BookOpen className="mx-auto h-10 w-10 text-sage" />
                    <h2 className="mt-4 text-2xl font-black text-stone-950 dark:text-stone-50">No vocabulary yet</h2>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Highlight PDF text or add a word manually to build your review deck.</p>
                  </div>
                </div>
              )}
            </div>

            <aside className="rounded-lg border border-stone-200 bg-white p-4 shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <div className="text-sm font-black text-stone-950 dark:text-stone-50">Next up</div>
              <div className="mt-3 space-y-2">
                {(dueCards.length ? dueCards : visible).slice(0, 8).map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      const target = dueCards.length ? dueCards : visible;
                      setReviewIndex(Math.max(0, target.findIndex((candidate) => candidate.id === item.id)));
                      setIsAnswerVisible(false);
                    }}
                    className={`w-full rounded-md p-2 text-left text-xs transition ${
                      currentCard?.id === item.id ? "bg-skysoft text-stone-950" : "bg-stone-50 hover:bg-skysoft/60 dark:bg-stone-900 dark:hover:bg-stone-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black">{index + 1}. {item.word}</span>
                      <span className="text-[10px] font-black capitalize text-sage">{item.status}</span>
                    </div>
                    <div className="mt-1 line-clamp-1 text-stone-500">{item.vietnameseMeaning || item.meaning || "Meaning pending"}</div>
                  </button>
                ))}
              </div>
            </aside>
          </section>
        )}

        {viewMode === "manage" && (
          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="min-w-0 rounded-lg border border-stone-200 bg-white shadow-paper dark:border-stone-800 dark:bg-stone-950">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4 dark:border-stone-800">
                <div>
                  <h2 className="text-lg font-black text-stone-950 dark:text-stone-50">Word bank</h2>
                  <p className="mt-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                    Showing {displayed.length} of {visible.length} - click a word to edit the full card.
                  </p>
                </div>
                <span className="rounded-full bg-skysoft px-3 py-1 text-xs font-black text-stone-700 dark:bg-sage/20 dark:text-stone-100">
                  {filter === "all" ? "All status" : filter}
                </span>
              </div>

              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {visible.length ? (
                  displayed.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedRecordId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedRecordId(item.id);
                        }
                      }}
                      className={`grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-skysoft/45 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_160px] ${
                        selectedRecord?.id === item.id ? "bg-skysoft/70 dark:bg-sage/15" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          title={`Pronounce ${item.word}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            speakWord(item.word);
                          }}
                          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-sage transition hover:bg-white dark:hover:bg-stone-900"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-stone-950 dark:text-stone-50">{item.word}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-stone-500">
                            {item.ipa && <span className="text-sage">{item.ipa}</span>}
                            {item.partOfSpeech && <span className="capitalize">{item.partOfSpeech}</span>}
                            {item.topic && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-black text-sage dark:bg-stone-900">{item.topic}</span>}
                            <span>{nextDueLabel(item)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm leading-5 text-stone-700 dark:text-stone-200">
                          {item.vietnameseMeaning || item.meaning || "Meaning pending"}
                        </div>
                        <div className="mt-1 line-clamp-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                          {item.example || item.synonyms || item.sourceBookTitle}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 md:justify-end">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black capitalize ${statusStyles[item.status]}`}>
                          {item.status}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-stone-500 dark:bg-stone-900">
                          p. {item.sourcePage || "-"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-stone-500 dark:text-stone-400">
                    Select text in a PDF to start building your IELTS vocabulary deck.
                  </div>
                )}
                {displayed.length < visible.length && (
                  <div className="border-t border-stone-100 p-4 text-center dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((current) => current + VISIBLE_STEP)}
                      className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-black text-stone-700 shadow-sm transition hover:border-sage hover:text-sage dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    >
                      Load {Math.min(VISIBLE_STEP, visible.length - displayed.length)} more words
                    </button>
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-lg border border-stone-200 bg-white p-4 shadow-paper dark:border-stone-800 dark:bg-stone-950 xl:sticky xl:top-24 xl:self-start">
              {selectedRecord ? (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Selected card</p>
                      <EditableField
                        value={selectedRecord.word}
                        onCommit={(value) => updateField(selectedRecord, "word", value)}
                        className="mt-2 text-2xl font-black text-stone-950 dark:text-stone-50"
                      />
                    </div>
                    <button
                      type="button"
                      title={`Pronounce ${selectedRecord.word}`}
                      onClick={() => speakWord(selectedRecord.word)}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-sage transition hover:border-sage dark:border-stone-700"
                    >
                      <Volume2 className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <DetailField label="IPA">
                      <EditableField
                        value={selectedRecord.ipa || ""}
                        placeholder="/word/"
                        onCommit={(value) => updateField(selectedRecord, "ipa", value)}
                        className="text-sm font-semibold text-sage"
                      />
                    </DetailField>
                    <DetailField label="Part">
                      <EditableField
                        value={selectedRecord.partOfSpeech || ""}
                        placeholder="noun, phrase..."
                        onCommit={(value) => updateField(selectedRecord, "partOfSpeech", value)}
                        className="text-sm font-semibold capitalize text-stone-700 dark:text-stone-200"
                      />
                    </DetailField>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <DetailField label="Topic">
                      <EditableField
                        value={selectedRecord.topic || ""}
                        placeholder="Education, Work..."
                        onCommit={(value) => updateField(selectedRecord, "topic", value)}
                        className="text-sm font-semibold text-stone-700 dark:text-stone-200"
                      />
                    </DetailField>
                    <DetailField label="Subtopic">
                      <EditableField
                        value={selectedRecord.subtopic || ""}
                        placeholder="University, stative verbs..."
                        onCommit={(value) => updateField(selectedRecord, "subtopic", value)}
                        className="text-sm font-semibold text-stone-700 dark:text-stone-200"
                      />
                    </DetailField>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_140px] gap-3">
                    <DetailField label="Tags">
                      <EditableField
                        value={(selectedRecord.tags ?? []).join(", ")}
                        placeholder="academic, formal"
                        onCommit={(value) => updateTags(selectedRecord, value)}
                        className="text-sm font-semibold text-stone-700 dark:text-stone-200"
                      />
                    </DetailField>
                    <DetailField label="Band">
                      <select
                        value={selectedRecord.difficulty ?? ""}
                        onChange={(event) =>
                          onUpdate({
                            ...selectedRecord,
                            difficulty: event.target.value ? (event.target.value as VocabDifficulty) : undefined,
                            updatedAt: new Date().toISOString()
                          })
                        }
                        className="h-9 w-full rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold outline-none transition hover:border-stone-200 focus:border-sage focus:bg-white dark:focus:bg-stone-900"
                      >
                        <option value="">Auto</option>
                        {Object.entries(difficultyLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </DetailField>
                  </div>

                  <div className="mt-3 space-y-3">
                    <DetailField label="English meaning" action={<ListenButton text={selectedRecord.meaning || ""} title="Listen to English meaning" />}>
                      <EditableArea value={selectedRecord.meaning || ""} placeholder="Add English meaning" onCommit={(value) => updateField(selectedRecord, "meaning", value)} />
                    </DetailField>
                    <DetailField label="Vietnamese" action={<ListenButton text={selectedRecord.vietnameseMeaning || ""} lang="vi" title="Listen to Vietnamese meaning" />}>
                      <EditableArea value={selectedRecord.vietnameseMeaning || ""} placeholder="Add Vietnamese meaning" onCommit={(value) => updateField(selectedRecord, "vietnameseMeaning", value)} />
                    </DetailField>
                    <div className="grid grid-cols-2 gap-3">
                      <DetailField label="Synonyms" action={<ListenButton text={selectedRecord.synonyms || ""} title="Listen to synonyms" />}>
                        <EditableArea value={selectedRecord.synonyms || ""} placeholder="similar words" onCommit={(value) => updateField(selectedRecord, "synonyms", value)} small />
                      </DetailField>
                      <DetailField label="Antonyms" action={<ListenButton text={selectedRecord.antonyms || ""} title="Listen to antonyms" />}>
                        <EditableArea value={selectedRecord.antonyms || ""} placeholder="opposites" onCommit={(value) => updateField(selectedRecord, "antonyms", value)} small />
                      </DetailField>
                    </div>
                    <DetailField label="Example" action={<ListenButton text={selectedRecord.example || ""} title="Listen to example" />}>
                      <EditableArea value={selectedRecord.example || ""} placeholder="Add IELTS example sentence" onCommit={(value) => updateField(selectedRecord, "example", value)} />
                    </DetailField>
                  </div>

                  <div className="mt-4 rounded-lg bg-paper p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    <div className="font-black text-stone-900 dark:text-stone-50">{selectedRecord.sourceBookTitle}</div>
                    <div>Page {selectedRecord.sourcePage || "Manual"} - {nextDueLabel(selectedRecord)}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <select
                      value={selectedRecord.status}
                      onChange={(event) => onStatusChange(selectedRecord, event.target.value as VocabStatus)}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-xs font-bold capitalize dark:border-stone-700 dark:bg-stone-900"
                    >
                      <option value="new">new</option>
                      <option value="learning">learning</option>
                      <option value="mastered">mastered</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = dueCards.length ? dueCards : visible;
                          setReviewIndex(Math.max(0, target.findIndex((candidate) => candidate.id === selectedRecord.id)));
                          setIsAnswerVisible(false);
                          setViewMode("review");
                        }}
                        className="rounded-lg bg-ink px-3 py-2 text-xs font-black text-white dark:bg-paper dark:text-stone-950"
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        title="Delete vocabulary"
                        onClick={() => onDelete(selectedRecord.id)}
                        className="grid h-9 w-9 place-items-center rounded-md text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-80 place-items-center text-center">
                  <div>
                    <BookOpen className="mx-auto h-10 w-10 text-sage" />
                    <h2 className="mt-4 text-xl font-black text-stone-950 dark:text-stone-50">No card selected</h2>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Choose a word from the bank to edit it.</p>
                  </div>
                </div>
              )}
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}

function EditableField({
  value,
  placeholder,
  onCommit,
  className = ""
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      className={`w-full rounded-md border border-transparent bg-transparent px-1 py-1 outline-none transition hover:border-stone-200 focus:border-sage focus:bg-white dark:focus:bg-stone-900 ${className}`}
    />
  );
}

function EditableArea({
  value,
  placeholder,
  onCommit,
  small = false
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  small?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      className={`w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-1 leading-5 outline-none transition hover:border-stone-200 focus:border-sage focus:bg-white dark:focus:bg-stone-900 ${
        small ? "h-20 text-xs text-stone-600 dark:text-stone-300" : "h-24 text-sm text-stone-700 dark:text-stone-200"
      }`}
    />
  );
}

function DetailField({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="block rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ListenButton({ text, lang = "en", title = "Listen" }: { text: string; lang?: SpeechLang; title?: string }) {
  if (!text.trim() || text.trim() === "-") {
    return null;
  }

  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        speakText(text, lang);
      }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sage transition hover:bg-white hover:text-ink dark:hover:bg-stone-950 dark:hover:text-paper"
    >
      <Volume2 className="h-3.5 w-3.5" />
    </button>
  );
}

function TopicChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black transition ${
        active
          ? "border-sage bg-skysoft text-stone-950 dark:bg-sage/20 dark:text-stone-50"
          : "border-stone-200 bg-stone-50 text-stone-600 hover:border-sage hover:text-sage dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
      }`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-950 dark:text-stone-300">{count}</span>
    </button>
  );
}

function DeckStat({ label, value, icon: Icon }: { label: string; value: number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-tool dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {label}
        <Icon className="h-4 w-4 text-sage" />
      </div>
      <div className="mt-3 text-2xl font-black text-stone-950 dark:text-stone-50">{value}</div>
    </div>
  );
}

function AnswerBlock({ label, value, speakLang = "en" }: { label: string; value: string; speakLang?: SpeechLang }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
        <ListenButton text={value} lang={speakLang} title={`Listen to ${label.toLowerCase()}`} />
      </div>
      <div className="mt-2 text-sm leading-6 text-stone-800 dark:text-stone-100">{value}</div>
    </div>
  );
}

function ReviewButton({ label, detail, onClick, strong = false }: { label: string; detail: string; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
        strong
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-stone-200 bg-white text-stone-800 hover:border-sage dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
      }`}
    >
      <div className="text-sm font-black">{label}</div>
      <div className="mt-1 text-xs font-semibold opacity-70">{detail}</div>
    </button>
  );
}
