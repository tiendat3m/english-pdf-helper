"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdfWorker";
import type { Annotation, BookRecord, HighlightColor, StrokeColor, ToolMode, VocabularyRecord } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/constants";

const AnnotationLayer = dynamic(() => import("./AnnotationLayer"), { ssr: false });

configurePdfWorker();

interface PdfViewerProps {
  book: BookRecord | null;
  annotations: Annotation[];
  currentPage: number;
  zoom: number;
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  thickness: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onDocumentLoaded: (pages: number) => void;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onVocabularyCandidate: (record: Omit<VocabularyRecord, "id" | "meaning" | "example" | "status" | "createdAt" | "updatedAt">) => void;
}

export default function PdfViewer({
  book,
  annotations,
  currentPage,
  zoom,
  tool,
  penColor,
  highlighterColor,
  thickness,
  onPageChange,
  onZoomChange,
  onDocumentLoaded,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onVocabularyCandidate
}: PdfViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const pageShellRef = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [baseWidth, setBaseWidth] = useState(860);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    configurePdfWorker();
  }, []);

  useEffect(() => {
    if (!book) {
      setObjectUrl(null);
      return;
    }
    setPdfError(null);
    const url = URL.createObjectURL(book.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book]);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      const width = Math.max(320, Math.min(960, element.clientWidth - 64));
      setBaseWidth(width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpaceDown(event.type === "keydown");
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, []);

  const renderWidth = useMemo(() => Math.round(baseWidth * zoom), [baseWidth, zoom]);
  const totalPages = book?.totalPages || 0;

  function measurePage() {
    window.requestAnimationFrame(() => {
      const canvas = pageShellRef.current?.querySelector("canvas");
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setPageSize({ width: rect.width, height: rect.height });
      }
    });
  }

  function handleSelectionCapture() {
    const selection = window.getSelection();
    const text = selection?.toString().trim().replace(/\s+/g, " ");
    if (!text || !book || text.length > 80 || text.split(" ").length > 5) {
      return;
    }
    onVocabularyCandidate({
      word: text,
      sourceBookId: book.id,
      sourceBookTitle: book.title,
      sourcePage: currentPage
    });
    selection?.removeAllRanges();
  }

  if (!book) {
    return (
      <div className="grid min-h-[620px] flex-1 place-items-center p-8">
        <div className="max-w-md rounded-lg border border-dashed border-stone-300 bg-white/70 p-8 text-center shadow-tool dark:border-stone-700 dark:bg-stone-900/70">
          <FileText className="mx-auto h-12 w-12 text-sage" />
          <h2 className="mt-4 text-2xl font-bold text-stone-950 dark:text-stone-50">Open an IELTS book</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
            Import a PDF from the sidebar. Your file stays in this browser and annotations are saved separately.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={shellRef}
        className={`min-h-0 flex-1 overflow-auto p-6 ${isSpaceDown ? "cursor-grab" : ""}`}
        onMouseUp={handleSelectionCapture}
      >
        <div className="mx-auto w-fit" ref={pageShellRef}>
          {objectUrl && (
            <Document
              file={objectUrl}
              loading={<div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool">Loading PDF...</div>}
              error={
                <div className="max-w-md rounded-lg bg-white p-8 text-sm text-rose-600 shadow-tool">
                  <div className="font-bold">This PDF could not be opened.</div>
                  {pdfError && <div className="mt-2 text-xs leading-5 text-rose-500">{pdfError}</div>}
                </div>
              }
              onLoadError={(error) => setPdfError(error.message)}
              onSourceError={(error) => setPdfError(error.message)}
              onLoadSuccess={({ numPages }) => onDocumentLoaded(numPages)}
            >
              <div className="relative">
                <Page
                  pageNumber={currentPage}
                  width={renderWidth}
                  renderAnnotationLayer
                  renderTextLayer
                  loading={<div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool">Rendering page...</div>}
                  onRenderSuccess={measurePage}
                />
                {pageSize.width > 0 && (
                  <AnnotationLayer
                    bookId={book.id}
                    pageNumber={currentPage}
                    pageSize={pageSize}
                    annotations={annotations}
                    tool={isSpaceDown ? "pan" : tool}
                    penColor={penColor}
                    highlighterColor={highlighterColor}
                    thickness={thickness}
                    onAddAnnotation={onAddAnnotation}
                    onUpdateAnnotation={onUpdateAnnotation}
                    onDeleteAnnotation={onDeleteAnnotation}
                  />
                )}
              </div>
            </Document>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-stone-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/85">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-sage disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700 dark:bg-stone-800 dark:text-stone-100">
          Page {currentPage} / {totalPages || "..."}
        </div>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-sage disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          disabled={!!totalPages && currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="ml-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
          Zoom {Math.round(clamp(zoom, MIN_ZOOM, MAX_ZOOM) * 100)}%
        </div>
        <button type="button" className="sr-only" onClick={() => onZoomChange(1)}>
          Reset zoom
        </button>
      </div>
    </div>
  );
}
