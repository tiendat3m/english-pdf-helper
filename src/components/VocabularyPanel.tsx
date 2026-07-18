"use client";

import { BookOpen, CheckCircle2, Eye, EyeOff, Layers3, Plus, RotateCcw, Search, Sparkles, Trash2, Volume2 } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
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
  onUpdate: (record: VocabularyRecord) => void;
  onDelete: (id: string) => void;
  onAddWord: (word: string) => void;
}

const statuses: Array<VocabStatus | "all"> = ["all", "new", "learning", "mastered"];
const statusStyles: Record<VocabStatus, string> = {
  new: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  learning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  mastered: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
};

function speakWord(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(word);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice =
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-gb")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null;
  utterance.lang = utterance.voice?.lang ?? "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
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
  onAddWord
}: VocabularyPanelProps) {
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [viewMode, setViewMode] = useState<"review" | "table">("review");
  const [quizMode, setQuizMode] = useState<"meaning" | "vietnamese" | "example" | "spelling">("meaning");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  const visible = useMemo(
    () =>
      vocabulary
        .filter((item) => {
          const haystack =
            `${item.word} ${item.ipa ?? ""} ${item.partOfSpeech ?? ""} ${item.meaning} ${item.vietnameseMeaning ?? ""} ${item.synonyms ?? ""} ${item.antonyms ?? ""} ${item.example} ${item.sourceBookTitle}`.toLowerCase();
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
        }),
    [filter, search, sort, vocabulary]
  );

  const dueCards = visible.filter(isDue);
  const currentCard = dueCards.length ? dueCards[reviewIndex % dueCards.length] : visible[0] ?? null;
  const counts = {
    new: vocabulary.filter((item) => item.status === "new").length,
    learning: vocabulary.filter((item) => item.status === "learning").length,
    mastered: vocabulary.filter((item) => item.status === "mastered").length
  };

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
            <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              {(["review", "table"] as const).map((mode) => (
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
                  {mode}
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
                    <AnswerBlock label="Vietnamese" value={currentCard.vietnameseMeaning || "Add Vietnamese meaning"} />
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

        {viewMode === "table" && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-paper dark:border-stone-800 dark:bg-stone-950">
            <div className="min-w-[1480px]">
              <div className="grid grid-cols-[1fr_0.65fr_0.7fr_1.2fr_1.05fr_0.9fr_0.9fr_1.15fr_1fr_0.75fr_44px] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                <span>Word</span>
                <span>IPA</span>
                <span>Part</span>
                <span>Meaning</span>
                <span>Vietnamese</span>
                <span>Synonyms</span>
                <span>Antonyms</span>
                <span>Example</span>
                <span>Source</span>
                <span>Status</span>
                <span />
              </div>
              {visible.length ? (
                visible.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_0.65fr_0.7fr_1.2fr_1.05fr_0.9fr_0.9fr_1.15fr_1fr_0.75fr_44px] gap-3 border-b border-stone-100 px-4 py-4 text-sm last:border-b-0 dark:border-stone-800"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        title={`Pronounce ${item.word}`}
                        onClick={() => speakWord(item.word)}
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-sage transition hover:bg-skysoft/70 dark:hover:bg-stone-800"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                      <EditableField
                        value={item.word}
                        onCommit={(value) => updateField(item, "word", value)}
                        className="min-w-0 font-bold text-stone-950 dark:text-stone-50"
                      />
                    </div>
                    <EditableField value={item.ipa || ""} placeholder="Add IPA" onCommit={(value) => updateField(item, "ipa", value)} className="text-xs font-semibold leading-5 text-sage" />
                    <EditableField value={item.partOfSpeech || ""} placeholder="-" onCommit={(value) => updateField(item, "partOfSpeech", value)} className="text-xs font-bold capitalize leading-5 text-stone-600 dark:text-stone-300" />
                    <EditableArea value={item.meaning || ""} placeholder="Add English meaning" onCommit={(value) => updateField(item, "meaning", value)} />
                    <EditableArea value={item.vietnameseMeaning || ""} placeholder="Add Vietnamese meaning" onCommit={(value) => updateField(item, "vietnameseMeaning", value)} />
                    <EditableArea value={item.synonyms || ""} placeholder="-" onCommit={(value) => updateField(item, "synonyms", value)} small />
                    <EditableArea value={item.antonyms || ""} placeholder="-" onCommit={(value) => updateField(item, "antonyms", value)} small />
                    <EditableArea value={item.example || ""} placeholder="Add your own sentence" onCommit={(value) => updateField(item, "example", value)} />
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      <div className="font-semibold">{item.sourceBookTitle}</div>
                      <div>{item.sourcePage > 0 ? `Page ${item.sourcePage}` : "Manual"}</div>
                      <div>{nextDueLabel(item)}</div>
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

function AnswerBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
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
