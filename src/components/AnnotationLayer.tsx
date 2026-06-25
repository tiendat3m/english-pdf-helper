"use client";

import { useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Stage } from "react-konva";
import { v4 as uuid } from "uuid";
import { HIGHLIGHT_COLORS, PEN_COLORS } from "@/lib/constants";
import type {
  Annotation,
  BrushStyle,
  HighlightAnnotation,
  HighlightColor,
  InputMode,
  NormalizedRect,
  PdfTextItem,
  Point,
  StickyNoteAnnotation,
  StrokeColor,
  ToolMode
} from "@/lib/types";
import { nowIso } from "@/lib/utils";

type StagePointerEvent = {
  target: {
    getStage: () => {
      getPointerPosition: () => { x: number; y: number } | null;
      container: () => HTMLDivElement;
    } | null;
  };
  evt: PointerEvent;
};

interface AnnotationLayerProps {
  bookId: string;
  pageNumber: number;
  pageSize: { width: number; height: number };
  annotations: Annotation[];
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  brushStyle: BrushStyle;
  thickness: number;
  inputMode: InputMode;
  textItems: PdfTextItem[];
  getLiveTextItems?: () => PdfTextItem[];
  onAddAnnotation: (annotation: Annotation) => void;
  onHighlightCreated: (annotation: HighlightAnnotation, anchor: Point) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
}

function normalizePoint(point: { x: number; y: number; pressure: number }, pageSize: { width: number; height: number }): Point {
  return {
    x: Math.max(0, Math.min(1, point.x / pageSize.width)),
    y: Math.max(0, Math.min(1, point.y / pageSize.height)),
    pressure: point.pressure
  };
}

function distanceToStroke(point: Point, stroke: Point[]) {
  return Math.min(
    ...stroke.map((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y))
  );
}

const ERASER_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M7 17l8-8a3 3 0 014 0l3 3a3 3 0 010 4l-5 5H9l-2-2a1.4 1.4 0 010-2z' fill='%23f9a8d4' stroke='%231f2933' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M10 14l6 6' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E\") 9 20, cell";

const NOTE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M6 5h14l3 3v15H6V5z' fill='%23fde68a' stroke='%231f2933' stroke-width='1.4' stroke-linejoin='round'/%3E%3Cpath d='M20 5v4h4M14 11v7M10.5 14.5h7' stroke='%231f2933' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\") 14 14, copy";

function svgCursor(svg: string, x: number, y: number, fallback: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

function penCursor(color: string) {
  return svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M5 23l4-1 13-13-3-3L6 19l-1 4z" fill="${color}" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 4l3 3" stroke="#f8fafc" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    5,
    23,
    "crosshair"
  );
}

function highlighterCursor(color: string) {
  return svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><path d="M6 22l5 3 13-13-5-5L6 20v2z" fill="${color}" stroke="#1f2933" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 24h9" stroke="${color}" stroke-width="4" stroke-linecap="round"/></svg>`,
    5,
    24,
    "crosshair"
  );
}

function cursorForTool(tool: ToolMode, penColor: StrokeColor, highlighterColor: HighlightColor) {
  switch (tool) {
    case "pen":
      return penCursor(PEN_COLORS[penColor]);
    case "highlighter":
      return highlighterCursor(HIGHLIGHT_COLORS[highlighterColor]);
    case "eraser":
      return ERASER_CURSOR;
    case "note":
      return NOTE_CURSOR;
    case "pan":
    default:
      return "grab";
  }
}

export default function AnnotationLayer({
  bookId,
  pageNumber,
  pageSize,
  annotations,
  tool,
  penColor,
  highlighterColor,
  brushStyle,
  thickness,
  inputMode,
  textItems,
  getLiveTextItems,
  onAddAnnotation,
  onHighlightCreated,
  onUpdateAnnotation,
  onDeleteAnnotation
}: AnnotationLayerProps) {
  const [draft, setDraft] = useState<Point[]>([]);
  const [highlightDraft, setHighlightDraft] = useState<{ start: Point; end: Point } | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);

  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.bookId === bookId && annotation.pageNumber === pageNumber),
    [annotations, bookId, pageNumber]
  );

  function shouldIgnorePointer(event: PointerEvent) {
    return inputMode === "stylus" && event.pointerType !== "pen";
  }

  function smoothPoints(points: Point[]) {
    if (points.length < 3) {
      return points;
    }

    const smoothed: Point[] = [points[0]];
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      smoothed.push({
        x: (previous.x + current.x * 2 + next.x) / 4,
        y: (previous.y + current.y * 2 + next.y) / 4,
        pressure: current.pressure
      });
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
  }

  function stabilizePoints(points: Point[]) {
    if (points.length < 4) {
      return points;
    }

    const stabilized: Point[] = [points[0]];
    for (let index = 1; index < points.length; index += 1) {
      const previous = stabilized[stabilized.length - 1];
      const current = points[index];
      stabilized.push({
        x: previous.x * 0.28 + current.x * 0.72,
        y: previous.y * 0.28 + current.y * 0.72,
        pressure: current.pressure
      });
    }
    return stabilized;
  }

  function getBrushProfile(brush: BrushStyle = "ballpoint") {
    switch (brush) {
      case "pencil":
        return { widthScale: 0.72, opacity: 0.68, pressureScale: 0.2, tension: 0.28 };
      case "marker":
        return { widthScale: 1.55, opacity: 0.82, pressureScale: 0.12, tension: 0.36 };
      case "fountain":
        return { widthScale: 0.92, opacity: 1, pressureScale: 0.82, tension: 0.48 };
      case "ballpoint":
      default:
        return { widthScale: 1, opacity: 1, pressureScale: 0.4, tension: 0.42 };
    }
  }

  function normalizeRect(start: Point, end: Point): NormalizedRect {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return {
      x,
      y,
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y)
    };
  }

  function rectsOverlap(first: NormalizedRect, second: NormalizedRect) {
    return (
      first.x < second.x + second.width &&
      first.x + first.width > second.x &&
      first.y < second.y + second.height &&
      first.y + first.height > second.y
    );
  }

  function strokeBox(points: Point[]): NormalizedRect | null {
    if (!points.length) {
      return null;
    }

    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    };
  }

  function hasHandwritingForRect(rect: NormalizedRect) {
    const padding = Math.max(rect.height * 0.5, 0.004);
    const expandedRect = {
      x: Math.max(0, rect.x - padding),
      y: Math.max(0, rect.y - padding),
      width: Math.min(1, rect.width + padding * 2),
      height: Math.min(1, rect.height + padding * 2)
    };

    return pageAnnotations.some((annotation) => {
      if (annotation.type !== "stroke" || annotation.tool !== "pen") {
        return false;
      }
      const box = strokeBox(annotation.points);
      return Boolean(box && rectsOverlap(expandedRect, box));
    });
  }

  function overlapRatio(first: NormalizedRect, second: NormalizedRect) {
    const xOverlap = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
    const yOverlap = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
    const overlapArea = xOverlap * yOverlap;
    const secondArea = Math.max(second.width * second.height, 0.000001);
    return overlapArea / secondArea;
  }

  function horizontalOverlapRatio(first: NormalizedRect, second: NormalizedRect) {
    const xOverlap = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
    return xOverlap / Math.max(second.width, 0.000001);
  }

  function verticalOverlapRatio(first: NormalizedRect, second: NormalizedRect) {
    const yOverlap = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
    return yOverlap / Math.max(second.height, 0.000001);
  }

  function isListMarker(text: string) {
    return /^\d+[\).]?$/.test(text.trim());
  }

  function shouldIncludeTextItem(rect: NormalizedRect, item: PdfTextItem) {
    const verticalPadding = Math.max(rect.height * 0.35, item.box.height * 0.12, 0.002);
    const expandedRect = {
      x: rect.x,
      y: Math.max(0, rect.y - verticalPadding),
      width: rect.width,
      height: Math.min(1, rect.height + verticalPadding * 2)
    };

    if (!rectsOverlap(expandedRect, item.box)) {
      return false;
    }

    const areaOverlap = overlapRatio(expandedRect, item.box);
    const horizontalOverlap = horizontalOverlapRatio(expandedRect, item.box);
    const verticalOverlap = verticalOverlapRatio(expandedRect, item.box);
    const itemCenterX = item.box.x + item.box.width / 2;
    const itemCenterY = item.box.y + item.box.height / 2;
    const rectLeftTolerance = Math.max(0.002, rect.width * 0.08);
    const centerIsInsideHighlightLine = itemCenterY >= expandedRect.y && itemCenterY <= expandedRect.y + expandedRect.height;

    if (isListMarker(item.text)) {
      return areaOverlap >= 0.7 && horizontalOverlap >= 0.72 && itemCenterX >= rect.x - rectLeftTolerance;
    }

    return horizontalOverlap >= 0.22 && (verticalOverlap >= 0.24 || centerIsInsideHighlightLine);
  }

  function lineBox(line: PdfTextItem[]): NormalizedRect {
    const left = Math.min(...line.map((item) => item.box.x));
    const top = Math.min(...line.map((item) => item.box.y));
    const right = Math.max(...line.map((item) => item.box.x + item.box.width));
    const bottom = Math.max(...line.map((item) => item.box.y + item.box.height));
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    };
  }

  function verticalOverlapAmount(first: NormalizedRect, second: NormalizedRect) {
    return Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  }

  function filterLinesForHighlight(rect: NormalizedRect, lines: PdfTextItem[][]) {
    if (lines.length <= 1) {
      return lines;
    }

    const rectCenterY = rect.y + rect.height / 2;
    const scored = lines.map((line) => {
      const box = lineBox(line);
      const overlap = verticalOverlapAmount(rect, box);
      const score = overlap / Math.max(box.height, 0.000001);
      const centerDistance = Math.abs(rectCenterY - (box.y + box.height / 2));
      return { line, box, score, centerDistance };
    });

    const averageLineHeight = scored.reduce((sum, item) => sum + item.box.height, 0) / scored.length;
    const best = scored.reduce((winner, item) => {
      if (item.score > winner.score) {
        return item;
      }
      if (item.score === winner.score && item.centerDistance < winner.centerDistance) {
        return item;
      }
      return winner;
    }, scored[0]);

    if (rect.height <= averageLineHeight * 1.6) {
      return [best.line];
    }

    const threshold = Math.max(0.16, best.score * 0.45);
    return scored.filter((item) => item.score >= threshold).map((item) => item.line);
  }

  function shouldJoinWithoutSpace(previous: PdfTextItem, current: PdfTextItem) {
    const previousRight = previous.box.x + previous.box.width;
    const gap = current.box.x - previousRight;
    const lineHeight = Math.max(previous.box.height, current.box.height);
    const tightGap = Math.max(0.0025, lineHeight * 0.22);
    const previousText = previous.text.trim();
    const currentText = current.text.trim();

    if (gap < 0) {
      return true;
    }

    if (gap > tightGap) {
      return false;
    }

    return /^[A-Za-z]+$/.test(previousText) && /^[A-Za-z]+$/.test(currentText);
  }

  function joinTextLine(items: PdfTextItem[]) {
    return items.reduce((line, item, index) => {
      const text = item.text.trim();
      if (!text) {
        return line;
      }
      if (index === 0) {
        return text;
      }

      const previous = items[index - 1];
      return `${line}${shouldJoinWithoutSpace(previous, item) ? "" : " "}${text}`;
    }, "");
  }

  function stripLeadingListMarker(text: string) {
    return text.replace(/^\s*\d+[\).]?\s+(?=[A-Za-z])/u, "").trim();
  }

  function getTextForRect(rect: NormalizedRect) {
    const liveItems = getLiveTextItems?.() ?? [];
    const sourceItems = liveItems.length > 0 ? liveItems : textItems;
    const matchedItems = sourceItems
      .filter((item) => shouldIncludeTextItem(rect, item))
      .sort((a, b) => {
        const lineDelta = a.box.y - b.box.y;
        if (Math.abs(lineDelta) > 0.012) {
          return lineDelta;
        }
        return a.box.x - b.box.x || a.order - b.order;
      });

    const lineThreshold = 0.012;
    const lines = matchedItems.reduce<PdfTextItem[][]>((groups, item) => {
      const line = groups.find((group) => Math.abs(group[0].box.y - item.box.y) <= lineThreshold);
      if (line) {
        line.push(item);
      } else {
        groups.push([item]);
      }
      return groups;
    }, []);

    return filterLinesForHighlight(rect, lines)
      .map((line) => stripLeadingListMarker(joinTextLine(line.sort((a, b) => a.box.x - b.box.x || a.order - b.order))))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/\s+\/\s+/g, " / ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePressure(event: PointerEvent) {
    return event.pressure > 0 ? Math.max(0.2, Math.min(1, event.pressure)) : 0.5;
  }

  function capturePointer(event: PointerEvent) {
    const target = event.currentTarget;
    if (target instanceof Element && "setPointerCapture" in target) {
      target.setPointerCapture(event.pointerId);
    }
  }

  function releasePointer(event?: PointerEvent) {
    const target = event?.currentTarget;
    if (event && target instanceof Element && "releasePointerCapture" in target) {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
    activePointerId.current = null;
  }

  function getStagePoint(event: StagePointerEvent) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return null;
    }
    return normalizePoint({ ...pointer, pressure: normalizePressure(event.evt) }, pageSize);
  }

  function getStagePoints(event: StagePointerEvent) {
    const stage = event.target.getStage();
    const container = stage?.container();
    if (!stage || !container) {
      return [];
    }

    const containerRect = container.getBoundingClientRect();
    const coalescedEvents = event.evt.getCoalescedEvents?.() ?? [event.evt];
    return coalescedEvents.map((pointerEvent) =>
      normalizePoint(
        {
          x: pointerEvent.clientX - containerRect.left,
          y: pointerEvent.clientY - containerRect.top,
          pressure: normalizePressure(pointerEvent)
        },
        pageSize
      )
    );
  }

  function appendDraftPoints(points: Point[], pointerType: string) {
    setDraft((current) => {
      const minDistance = pointerType === "pen" ? 0.0009 : 0.0018;
      return points.reduce<Point[]>((next, point) => {
        const last = next[next.length - 1];
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < minDistance) {
          return next;
        }
        return [...next, point];
      }, current);
    });
  }

  function handlePointerDown(event: StagePointerEvent) {
    if (shouldIgnorePointer(event.evt)) {
      return;
    }

    event.evt.preventDefault();
    activePointerId.current = event.evt.pointerId;
    capturePointer(event.evt);
    const point = getStagePoint(event);
    if (!point) {
      return;
    }

    if (tool === "eraser") {
      const match = [...pageAnnotations].reverse().find((annotation) => {
        if (annotation.type === "note") {
          return Math.abs(annotation.x - point.x) < 0.06 && Math.abs(annotation.y - point.y) < 0.05;
        }
        if (annotation.type === "highlight") {
          return (
            point.x >= annotation.rect.x &&
            point.x <= annotation.rect.x + annotation.rect.width &&
            point.y >= annotation.rect.y &&
            point.y <= annotation.rect.y + annotation.rect.height
          );
        }
        return distanceToStroke(point, annotation.points) < 0.025;
      });
      if (match) {
        onDeleteAnnotation(match.id);
      }
      return;
    }

    if (tool === "note") {
      onAddAnnotation({
        id: uuid(),
        bookId,
        pageNumber,
        type: "note",
        x: point.x,
        y: point.y,
        text: "New note",
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      return;
    }

    if (tool === "highlighter") {
      setHighlightDraft({ start: point, end: point });
      return;
    }

    if (tool === "pen") {
      setDraft([point]);
    }
  }

  function handlePointerMove(event: StagePointerEvent) {
    if (shouldIgnorePointer(event.evt)) {
      return;
    }

    if (activePointerId.current !== null && event.evt.pointerId !== activePointerId.current) {
      return;
    }

    if (tool === "highlighter" && highlightDraft) {
      const points = getStagePoints(event);
      const point = points[points.length - 1] ?? getStagePoint(event);
      if (point) {
        setHighlightDraft((current) => (current ? { ...current, end: point } : current));
      }
      return;
    }

    if (!draft.length || tool !== "pen") {
      return;
    }

    const points = getStagePoints(event);
    if (points.length) {
      appendDraftPoints(points, event.evt.pointerType);
    }
  }

  function commitDraft(event?: StagePointerEvent) {
    releasePointer(event?.evt);

    if (tool === "highlighter" && highlightDraft) {
      const rect = normalizeRect(highlightDraft.start, highlightDraft.end);
      setHighlightDraft(null);

      if (rect.width < 0.004 || rect.height < 0.004) {
        return;
      }

      const selectedText = getTextForRect(rect);
      const selectedTextSource = selectedText ? "pdf-text" : hasHandwritingForRect(rect) ? "handwriting" : "visual";
      const annotation: HighlightAnnotation = {
        id: uuid(),
        bookId,
        pageNumber,
        type: "highlight",
        color: HIGHLIGHT_COLORS[highlighterColor],
        opacity: 0.28,
        rect,
        selectedText,
        selectedTextSource,
        createdAt: nowIso()
      };

      onAddAnnotation(annotation);
      onHighlightCreated(annotation, {
        x: Math.min(rect.x + rect.width, 0.92),
        y: Math.min(rect.y + rect.height, 0.92),
        pressure: 0.5
      });
      return;
    }

    if (draft.length < 2 || tool !== "pen") {
      setDraft([]);
      return;
    }

    const points = smoothPoints(stabilizePoints(draft));

    onAddAnnotation({
      id: uuid(),
      bookId,
      pageNumber,
      type: "stroke",
      tool: "pen",
      color: PEN_COLORS[penColor],
      width: thickness,
      opacity: getBrushProfile(brushStyle).opacity,
      brush: brushStyle,
      points,
      createdAt: nowIso()
    });
    setDraft([]);
  }

  function linePoints(points: Point[]) {
    return points.flatMap((point) => [point.x * pageSize.width, point.y * pageSize.height]);
  }

  function scaledWidth(width: number, points: Point[], brush: BrushStyle = "ballpoint") {
    const pressure = points.reduce((sum, point) => sum + point.pressure, 0) / Math.max(points.length, 1);
    const profile = getBrushProfile(brush);
    return Math.max(0.45, width * profile.widthScale * (0.55 + pressure * profile.pressureScale) * (pageSize.width / 900));
  }

  function updateNote(annotation: StickyNoteAnnotation, patch: Partial<StickyNoteAnnotation>) {
    onUpdateAnnotation({ ...annotation, ...patch, updatedAt: nowIso() });
  }

  const drawingCursor = tool === "pan" ? "pointer-events-none" : "";

  return (
    <div
      className={`absolute inset-0 z-30 ${drawingCursor}`}
      style={{
        width: pageSize.width,
        height: pageSize.height,
        touchAction: tool === "pan" ? "auto" : "none",
        userSelect: tool === "pan" ? "auto" : "none",
        WebkitUserSelect: tool === "pan" ? "auto" : "none",
        cursor: cursorForTool(tool, penColor, highlighterColor)
      }}
    >
      <Stage
        width={pageSize.width}
        height={pageSize.height}
        className={tool === "pan" ? "pointer-events-none" : "touch-none"}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitDraft}
        onPointerCancel={commitDraft}
        onPointerLeave={commitDraft}
      >
        <Layer>
          {pageAnnotations.map((annotation) => {
            if (annotation.type === "note") {
              return (
                <Rect
                  key={annotation.id}
                  x={annotation.x * pageSize.width}
                  y={annotation.y * pageSize.height}
                  width={132}
                  height={88}
                  cornerRadius={10}
                  fill="#fff3a5"
                  opacity={0.18}
                />
              );
            }
            if (annotation.type === "highlight") {
              return (
                <Rect
                  key={annotation.id}
                  x={annotation.rect.x * pageSize.width}
                  y={annotation.rect.y * pageSize.height}
                  width={annotation.rect.width * pageSize.width}
                  height={annotation.rect.height * pageSize.height}
                  fill={annotation.color}
                  opacity={annotation.opacity}
                  listening={false}
                  globalCompositeOperation="multiply"
                />
              );
            }
            return (
              <Line
                key={annotation.id}
                points={linePoints(annotation.points)}
                stroke={annotation.color}
                strokeWidth={scaledWidth(annotation.width, annotation.points, annotation.brush)}
                opacity={annotation.opacity}
                tension={getBrushProfile(annotation.brush).tension}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={annotation.tool === "highlighter" ? "multiply" : "source-over"}
              />
            );
          })}
          {highlightDraft && (
            <Rect
              x={Math.min(highlightDraft.start.x, highlightDraft.end.x) * pageSize.width}
              y={Math.min(highlightDraft.start.y, highlightDraft.end.y) * pageSize.height}
              width={Math.abs(highlightDraft.start.x - highlightDraft.end.x) * pageSize.width}
              height={Math.abs(highlightDraft.start.y - highlightDraft.end.y) * pageSize.height}
              fill={HIGHLIGHT_COLORS[highlighterColor]}
              opacity={0.28}
              globalCompositeOperation="multiply"
            />
          )}
          {draft.length > 1 && (
            <Line
              points={linePoints(draft)}
              stroke={PEN_COLORS[penColor]}
              strokeWidth={scaledWidth(thickness, draft, brushStyle)}
              opacity={getBrushProfile(brushStyle).opacity}
              tension={getBrushProfile(brushStyle).tension}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="source-over"
            />
          )}
        </Layer>
      </Stage>

      {pageAnnotations
        .filter((annotation): annotation is StickyNoteAnnotation => annotation.type === "note")
        .map((annotation) => (
          <div
            key={annotation.id}
            className="absolute w-36 rounded-lg bg-[#fff3a5] p-2 text-xs text-stone-800 shadow-paper transition hover:-translate-y-0.5"
            style={{ left: annotation.x * pageSize.width, top: annotation.y * pageSize.height }}
            onPointerDown={(event) => {
              setDraggingNoteId(annotation.id);
              dragOffset.current = {
                x: event.clientX - annotation.x * pageSize.width,
                y: event.clientY - annotation.y * pageSize.height
              };
            }}
            onPointerMove={(event) => {
              if (draggingNoteId !== annotation.id) {
                return;
              }
              const rect = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!rect) {
                return;
              }
              updateNote(annotation, {
                x: Math.max(0, Math.min(0.9, (event.clientX - rect.left - dragOffset.current.x) / pageSize.width)),
                y: Math.max(0, Math.min(0.9, (event.clientY - rect.top - dragOffset.current.y) / pageSize.height))
              });
            }}
            onPointerUp={() => setDraggingNoteId(null)}
          >
            <textarea
              value={annotation.text}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => updateNote(annotation, { text: event.target.value })}
              className="h-16 w-full resize-none bg-transparent outline-none"
              aria-label="Sticky note text"
            />
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDeleteAnnotation(annotation.id)}
              className="mt-1 rounded-md px-2 py-1 text-[11px] font-bold text-stone-600 hover:bg-amber-200"
            >
              Delete
            </button>
          </div>
        ))}
    </div>
  );
}
