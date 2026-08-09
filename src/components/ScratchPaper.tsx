"use client";

import dynamic from "next/dynamic";
import { NotebookPen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Annotation,
  BrushStyle,
  HighlightColor,
  InputMode,
  StrokeColor,
  ToolMode
} from "@/lib/types";

const AnnotationLayer = dynamic(() => import("./AnnotationLayer"), { ssr: false });

export const SCRATCH_BOOK_ID = "__ielts_listening_scratch_paper__";
export const SCRATCH_PAGE_NUMBER = 1;

const PAPER_RATIO = 1.35;
const MIN_PAPER_WIDTH = 340;
const MAX_PAPER_WIDTH = 1180;

interface ScratchPaperProps {
  annotations: Annotation[];
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  brushStyle: BrushStyle;
  thickness: number;
  inputMode: InputMode;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onDeleteAnnotations: (ids: string[]) => void;
  onClear: () => void;
}

export default function ScratchPaper({
  annotations,
  tool,
  penColor,
  highlighterColor,
  brushStyle,
  thickness,
  inputMode,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDeleteAnnotations,
  onClear
}: ScratchPaperProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [paperWidth, setPaperWidth] = useState(860);
  const scratchAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.bookId === SCRATCH_BOOK_ID && annotation.pageNumber === SCRATCH_PAGE_NUMBER),
    [annotations]
  );
  const pageSize = useMemo(
    () => ({
      width: paperWidth,
      height: Math.round(paperWidth * PAPER_RATIO)
    }),
    [paperWidth]
  );

  useEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setPaperWidth(Math.max(MIN_PAPER_WIDTH, Math.min(MAX_PAPER_WIDTH, element.clientWidth - 12)));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="min-h-0 flex-1 overflow-auto bg-[#f3efe5] p-4 dark:bg-stone-950 sm:p-6" ref={shellRef}>
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sage">Listening Scratch</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-stone-950 dark:text-stone-50">
            <NotebookPen className="h-5 w-5 text-sage" />
            White scratch paper
          </h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!scratchAnnotations.length}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:bg-stone-900 dark:text-rose-200 dark:hover:bg-rose-950"
        >
          <Trash2 className="h-4 w-4" />
          Clear all
        </button>
      </div>

      <div
        className="relative mx-auto overflow-hidden rounded-sm border border-stone-200 bg-white shadow-paper dark:border-stone-700"
        style={pageSize}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(120,113,108,0.08)_1px,transparent_1px)] bg-[length:100%_34px]" />
        <AnnotationLayer
          bookId={SCRATCH_BOOK_ID}
          pageNumber={SCRATCH_PAGE_NUMBER}
          pageSize={pageSize}
          annotations={annotations}
          tool={tool}
          penColor={penColor}
          highlighterColor={highlighterColor}
          brushStyle={brushStyle}
          thickness={thickness}
          inputMode={inputMode}
          textItems={[]}
          onAddAnnotation={onAddAnnotation}
          onHighlightCreated={() => undefined}
          onUpdateAnnotation={onUpdateAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
          onDeleteAnnotations={onDeleteAnnotations}
        />
      </div>
    </section>
  );
}
