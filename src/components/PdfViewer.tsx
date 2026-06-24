"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdfWorker";
import type {
  Annotation,
  BookRecord,
  BrushStyle,
  HighlightAnnotation,
  HighlightColor,
  InputMode,
  PdfTextItem,
  StickyNoteAnnotation,
  StrokeColor,
  ToolMode,
  VocabularyRecord
} from "@/lib/types";
import { clamp } from "@/lib/utils";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/constants";
import { v4 as uuid } from "uuid";

const AnnotationLayer = dynamic(() => import("./AnnotationLayer"), { ssr: false });

configurePdfWorker();

type PdfJsViewport = {
  width: number;
  height: number;
  transform: number[];
};

type PdfJsPage = {
  pageNumber?: number;
  getViewport: (params: { scale: number }) => PdfJsViewport;
  getTextContent: () => Promise<{ items: unknown[] }>;
};

type PdfJsTextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
};

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  if (!item || typeof item !== "object") {
    return false;
  }

  return (
    "str" in item &&
    typeof item.str === "string" &&
    "width" in item &&
    typeof item.width === "number" &&
    "height" in item &&
    typeof item.height === "number" &&
    "transform" in item &&
    Array.isArray(item.transform) &&
    item.transform.length >= 6
  );
}

function multiplyTransform(first: number[], second: number[]) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5]
  ];
}

function textSegments(text: string) {
  return Array.from(text.matchAll(/\S+/g)).map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

interface PdfPageErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onError: (error: Error) => void;
}

interface PdfPageErrorBoundaryState {
  hasError: boolean;
}

class PdfPageErrorBoundary extends Component<PdfPageErrorBoundaryProps, PdfPageErrorBoundaryState> {
  state: PdfPageErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: PdfPageErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md rounded-lg bg-white p-8 text-sm text-rose-600 shadow-tool dark:bg-stone-900">
          <div className="font-bold">This page could not be rendered.</div>
          <div className="mt-2 text-xs leading-5 text-rose-500">Try refreshing the page or reopening this book.</div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface PdfViewerProps {
  book: BookRecord | null;
  annotations: Annotation[];
  currentPage: number;
  zoom: number;
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  brushStyle: BrushStyle;
  thickness: number;
  inputMode: InputMode;
  aiEnabled: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onDocumentLoaded: (pages: number) => void;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onVocabularyCandidate: (
    record: Omit<VocabularyRecord, "id" | "meaning" | "example" | "status" | "createdAt" | "updatedAt">,
    mode?: "vocab" | "explain" | "grammar" | "note"
  ) => void;
}

export default function PdfViewer({
  book,
  annotations,
  currentPage,
  zoom,
  tool,
  penColor,
  highlighterColor,
  brushStyle,
  thickness,
  inputMode,
  aiEnabled,
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
  const zoomRef = useRef(zoom);
  const onZoomChangeRef = useRef(onZoomChange);
  const currentPageRef = useRef(currentPage);
  const renderWidthRef = useRef(0);
  const wheelDeltaRef = useRef(0);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const previewZoomRef = useRef<number | null>(null);
  const [baseWidth, setBaseWidth] = useState(860);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [previewZoom, setPreviewZoom] = useState<number | null>(null);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  const [highlightPopup, setHighlightPopup] = useState<{
    annotation: HighlightAnnotation;
    anchor: { x: number; y: number };
  } | null>(null);
  const renderWidth = useMemo(() => Math.round(baseWidth * zoom), [baseWidth, zoom]);
  const visualZoom = previewZoom ?? zoom;
  const previewScale = zoom > 0 ? visualZoom / zoom : 1;
  currentPageRef.current = currentPage;
  renderWidthRef.current = renderWidth;

  useEffect(() => {
    configurePdfWorker();
  }, []);

  useEffect(() => {
    const originalWarn = console.warn;
    const originalError = console.error;
    const shouldIgnoreTextLayerAbort = (args: unknown[]) => {
      const message = args
        .map((arg) => (arg instanceof Error ? `${arg.name} ${arg.message}` : String(arg)))
        .join(" ");

      return message.includes("AbortException") && /TextLayer task cancel(?:l)?ed/i.test(message);
    };

    // react-pdf logs cancelled TextLayer renders before our error callback can ignore them.
    console.warn = (...args: Parameters<typeof console.warn>) => {
      if (shouldIgnoreTextLayerAbort(args)) {
        return;
      }
      originalWarn(...args);
    };
    console.error = (...args: Parameters<typeof console.error>) => {
      if (shouldIgnoreTextLayerAbort(args)) {
        return;
      }
      originalError(...args);
    };

    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
    onZoomChangeRef.current = onZoomChange;
    if (previewZoomRef.current !== null && Math.abs(previewZoomRef.current - zoom) < 0.001) {
      previewZoomRef.current = null;
      setPreviewZoom(null);
    }
  }, [onZoomChange, zoom]);

  useEffect(() => {
      setPdfError(null);
      setIsDocumentReady(false);
      setPageSize({ width: 0, height: 0 });
      setTextItems([]);
      setHighlightPopup(null);
      setPreviewZoom(null);
      previewZoomRef.current = null;
  }, [book?.id]);

  useEffect(() => {
    setTextItems([]);
    setHighlightPopup(null);
    setPageSize({ width: 0, height: 0 });
    setPreviewZoom(null);
    previewZoomRef.current = null;
  }, [currentPage, renderWidth]);

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
      if (event.key === "Escape") {
        setHighlightPopup(null);
        return;
      }
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

  useEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return;
    }

    const applyWheelZoom = () => {
      wheelFrameRef.current = null;
      const delta = wheelDeltaRef.current;
      wheelDeltaRef.current = 0;

      if (!delta) {
        return;
      }

      const currentZoom = previewZoomRef.current ?? zoomRef.current;
      const zoomStep = delta < 0 ? 0.06 : -0.06;
      const nextZoom = clamp(currentZoom + zoomStep, MIN_ZOOM, MAX_ZOOM);

      if (nextZoom === currentZoom) {
        return;
      }

      const previousScrollRatio = element.scrollHeight > element.clientHeight ? element.scrollTop / (element.scrollHeight - element.clientHeight) : 0;
      previewZoomRef.current = nextZoom;
      setPreviewZoom(nextZoom);

      if (wheelCommitTimerRef.current !== null) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      wheelCommitTimerRef.current = window.setTimeout(() => {
        const committedZoom = previewZoomRef.current;
        wheelCommitTimerRef.current = null;
        if (committedZoom !== null) {
          zoomRef.current = committedZoom;
          onZoomChangeRef.current(committedZoom);
        }
      }, 140);

      window.requestAnimationFrame(() => {
        element.scrollTop = previousScrollRatio * Math.max(0, element.scrollHeight - element.clientHeight);
      });
    };

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      setHighlightPopup(null);
      wheelDeltaRef.current += event.deltaY;

      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = window.requestAnimationFrame(applyWheelZoom);
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      element.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
      }
      if (wheelCommitTimerRef.current !== null) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      wheelFrameRef.current = null;
      wheelCommitTimerRef.current = null;
      wheelDeltaRef.current = 0;
      previewZoomRef.current = null;
    };
  }, []);

  const pdfFile = useMemo(() => book?.blob ?? null, [book?.blob]);
  const pageRenderKey = `${book?.id ?? "no-book"}-${currentPage}-${renderWidth}`;
  const totalPages = book?.totalPages || 0;

  async function extractTextItemsFromPage(page: PdfJsPage) {
    const expectedPage = page.pageNumber ?? currentPageRef.current;
    const expectedRenderWidth = renderWidthRef.current;
    try {
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      if (expectedPage !== currentPageRef.current || expectedRenderWidth !== renderWidthRef.current) {
        return;
      }

      const items = textContent.items
        .filter(isPdfJsTextItem)
        .flatMap((item, order) => {
          const segments = textSegments(item.str);
          if (!segments.length) {
            return [];
          }
          const transform = multiplyTransform(viewport.transform, item.transform);
          const fontHeight = Math.max(Math.hypot(transform[2], transform[3]), Math.abs(item.height), 1);
          const width = Math.max(Math.abs(item.width), 1);
          const x = transform[4];
          const y = transform[5] - fontHeight;
          const textLength = Math.max(item.str.length, 1);

          return segments.map((segment, segmentIndex) => ({
            id: `${currentPage}-${order}-${segmentIndex}`,
            text: segment.text,
            order: order * 1000 + segmentIndex,
            box: {
              x: clamp((x + (segment.start / textLength) * width) / viewport.width, 0, 1),
              y: clamp(y / viewport.height, 0, 1),
              width: clamp(((segment.end - segment.start) / textLength) * width / viewport.width, 0, 1),
              height: clamp(fontHeight / viewport.height, 0, 1)
            }
          }));
        })
        .filter((item): item is PdfTextItem => item.box.width > 0 && item.box.height > 0);

      setTextItems(items);
    } catch (error) {
      if (error instanceof Error) {
        handleTextLayerError(error);
      }
    }
  }

  function getTextItemsFromLayer() {
    const canvas = pageShellRef.current?.querySelector("canvas");
    const textSpans = pageShellRef.current?.querySelectorAll(".react-pdf__Page__textContent span");
    if (!canvas || !textSpans?.length) {
      return [];
    }

    const pageRect = canvas.getBoundingClientRect();
    return Array.from(textSpans)
      .flatMap((span, order) => {
        const text = span.textContent?.trim() ?? "";
        if (!text) {
          return [];
        }

        const textNode = Array.from(span.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
        const segments = textSegments(textNode?.nodeValue ?? text);
        const fallbackRect = span.getBoundingClientRect();

        return segments
          .map((segment, segmentIndex) => {
            let rect = fallbackRect;
            if (textNode) {
              const range = document.createRange();
              range.setStart(textNode, segment.start);
              range.setEnd(textNode, segment.end);
              const rangeRect = range.getBoundingClientRect();
              if (rangeRect.width > 0 && rangeRect.height > 0) {
                rect = rangeRect;
              }
            }

            if (rect.width <= 0 || rect.height <= 0) {
              return null;
            }

            return {
              id: `${currentPageRef.current}-${order}-${segmentIndex}`,
              text: segment.text,
              order: order * 1000 + segmentIndex,
              box: {
                x: clamp((rect.left - pageRect.left) / pageRect.width, 0, 1),
                y: clamp((rect.top - pageRect.top) / pageRect.height, 0, 1),
                width: clamp(rect.width / pageRect.width, 0, 1),
                height: clamp(rect.height / pageRect.height, 0, 1)
              }
            };
          })
          .filter((item): item is PdfTextItem => Boolean(item));
      })
      .filter((item): item is PdfTextItem => item.box.width > 0 && item.box.height > 0);
  }

  function extractTextItemsFromLayer() {
    window.requestAnimationFrame(() => {
      const items = getTextItemsFromLayer();
      if (items.length > 0) {
        setTextItems(items);
      }
    });
  }

  function measurePage() {
    window.requestAnimationFrame(() => {
      const canvas = pageShellRef.current?.querySelector("canvas");
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setPageSize({ width: rect.width, height: rect.height });
      }
    });
  }

  function handleTextLayerError(error: Error) {
    const message = error.message.toLowerCase();
    if (error.name === "AbortException" || message.includes("cancelled") || message.includes("canceled")) {
      return;
    }
    setPdfError(error.message);
  }

  function handleHighlightCreated(annotation: HighlightAnnotation, anchor: { x: number; y: number }) {
    setHighlightPopup({ annotation, anchor });
  }

  function highlightVocabularyRecord(annotation: HighlightAnnotation) {
    return {
      word: annotation.selectedText || "Highlighted passage",
      sourceBookId: annotation.bookId,
      sourceBookTitle: book?.title ?? "Unknown PDF",
      sourcePage: annotation.pageNumber
    };
  }

  function highlightPopupText(annotation: HighlightAnnotation) {
    if (annotation.selectedText) {
      return annotation.selectedText;
    }
    if (annotation.selectedTextSource === "handwriting") {
      return "Handwriting selected. OCR is not enabled yet, so this ink is saved visually.";
    }
    return "No PDF text detected in this highlight.";
  }

  function noteTextForHighlight(annotation: HighlightAnnotation) {
    if (annotation.selectedText) {
      return annotation.selectedText;
    }
    if (annotation.selectedTextSource === "handwriting") {
      return "Handwriting selected";
    }
    return "Highlighted area";
  }

  function saveHighlightNote(annotation: HighlightAnnotation) {
    if (!book) {
      return;
    }

    const note: StickyNoteAnnotation = {
      id: uuid(),
      bookId: book.id,
      pageNumber: currentPage,
      type: "note",
      x: clamp(annotation.rect.x + annotation.rect.width + 0.02, 0.02, 0.82),
      y: clamp(annotation.rect.y, 0.02, 0.86),
      text: noteTextForHighlight(annotation),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onAddAnnotation(note);
    setHighlightPopup(null);
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
        <div
          className="mx-auto"
          style={{
            width: pageSize.width ? pageSize.width * previewScale : undefined,
            height: pageSize.height ? pageSize.height * previewScale : undefined
          }}
        >
          <div
            className="w-fit"
            ref={pageShellRef}
            style={{
              transform: previewScale === 1 ? undefined : `scale(${previewScale})`,
              transformOrigin: "top center",
              willChange: previewScale === 1 ? undefined : "transform"
            }}
          >
            {pdfFile ? (
              <Document
              key={book.id}
              file={pdfFile}
              loading={<div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool">Loading PDF...</div>}
              error={
                <div className="max-w-md rounded-lg bg-white p-8 text-sm text-rose-600 shadow-tool">
                  <div className="font-bold">This PDF could not be opened.</div>
                  {pdfError && <div className="mt-2 text-xs leading-5 text-rose-500">{pdfError}</div>}
                </div>
              }
              onLoadError={(error) => {
                setIsDocumentReady(false);
                setPdfError(error.message);
              }}
              onSourceError={(error) => {
                setIsDocumentReady(false);
                setPdfError(error.message);
              }}
              onLoadSuccess={({ numPages }) => {
                setIsDocumentReady(true);
                onDocumentLoaded(numPages);
              }}
            >
              <div className="relative isolate">
                {isDocumentReady ? (
                  <PdfPageErrorBoundary resetKey={pageRenderKey} onError={(error) => setPdfError(error.message)}>
                    <Page
                      key={pageRenderKey}
                      pageNumber={currentPage}
                      width={renderWidth}
                      renderAnnotationLayer
                      renderTextLayer
                      loading={<div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool">Rendering page...</div>}
                      onLoadError={(error) => setPdfError(error.message)}
                      onLoadSuccess={(page) => {
                        setPageSize({ width: 0, height: 0 });
                        void extractTextItemsFromPage(page);
                      }}
                      onRenderError={(error) => setPdfError(error.message)}
                      onRenderSuccess={measurePage}
                      onRenderTextLayerError={handleTextLayerError}
                      onRenderTextLayerSuccess={extractTextItemsFromLayer}
                    />
                  </PdfPageErrorBoundary>
                ) : (
                  <div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool dark:bg-stone-900 dark:text-stone-300">
                    Loading PDF document...
                  </div>
                )}
                {isDocumentReady && pageSize.width > 0 && (
                  <AnnotationLayer
                    bookId={book.id}
                    pageNumber={currentPage}
                    pageSize={pageSize}
                    annotations={annotations}
                    tool={isSpaceDown ? "pan" : tool}
                    penColor={penColor}
                    highlighterColor={highlighterColor}
                    brushStyle={brushStyle}
                    thickness={thickness}
                    inputMode={inputMode}
                    textItems={textItems}
                    getLiveTextItems={getTextItemsFromLayer}
                    onAddAnnotation={onAddAnnotation}
                    onHighlightCreated={handleHighlightCreated}
                    onUpdateAnnotation={onUpdateAnnotation}
                    onDeleteAnnotation={onDeleteAnnotation}
                  />
                )}
                {highlightPopup && pageSize.width > 0 && (
                  <div
                    className="absolute z-40 w-72 rounded-lg border border-stone-200 bg-white p-3 pr-10 text-sm shadow-paper dark:border-stone-700 dark:bg-stone-950"
                    style={{
                      left: Math.min(highlightPopup.anchor.x * pageSize.width + 8, pageSize.width - 300),
                      top: Math.min(highlightPopup.anchor.y * pageSize.height + 8, pageSize.height - 220)
                    }}
                  >
                    <button
                      type="button"
                      title="Close highlight popup"
                      onClick={() => setHighlightPopup(null)}
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="max-h-24 overflow-y-auto rounded-md bg-paper p-2 text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {highlightPopupText(highlightPopup.annotation)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        disabled={!highlightPopup.annotation.selectedText}
                        onClick={() => {
                          onVocabularyCandidate(highlightVocabularyRecord(highlightPopup.annotation), "vocab");
                          setHighlightPopup(null);
                        }}
                        className="rounded-md bg-ink px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-paper dark:text-stone-950"
                      >
                        Save Vocabulary
                      </button>
                      <button
                        type="button"
                        onClick={() => saveHighlightNote(highlightPopup.annotation)}
                        className="rounded-md border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:border-sage dark:border-stone-700 dark:text-stone-100"
                      >
                        Add Note
                      </button>
                      {aiEnabled && (
                        <button
                          type="button"
                          disabled={!highlightPopup.annotation.selectedText}
                          onClick={() => {
                            onVocabularyCandidate(highlightVocabularyRecord(highlightPopup.annotation), "explain");
                            setHighlightPopup(null);
                          }}
                          className="rounded-md border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:border-sage disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:text-stone-100"
                        >
                          Explain with AI
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </Document>
            ) : (
              <div className="rounded-lg bg-white p-8 text-sm text-stone-500 shadow-tool dark:bg-stone-900 dark:text-stone-300">
                Preparing local PDF...
              </div>
            )}
          </div>
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
          Zoom {Math.round(clamp(visualZoom, MIN_ZOOM, MAX_ZOOM) * 100)}%
        </div>
        <button type="button" className="sr-only" onClick={() => onZoomChange(1)}>
          Reset zoom
        </button>
      </div>
    </div>
  );
}
