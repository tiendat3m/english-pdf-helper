"use client";

import { useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Stage } from "react-konva";
import { v4 as uuid } from "uuid";
import { HIGHLIGHT_COLORS, PEN_COLORS } from "@/lib/constants";
import type { Annotation, HighlightColor, InputMode, Point, StickyNoteAnnotation, StrokeColor, ToolMode } from "@/lib/types";
import { nowIso } from "@/lib/utils";

interface AnnotationLayerProps {
  bookId: string;
  pageNumber: number;
  pageSize: { width: number; height: number };
  annotations: Annotation[];
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  thickness: number;
  inputMode: InputMode;
  onAddAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
}

function normalizePoint(point: { x: number; y: number; pressure: number }, pageSize: { width: number; height: number }): Point {
  return {
    x: point.x / pageSize.width,
    y: point.y / pageSize.height,
    pressure: point.pressure
  };
}

function distanceToStroke(point: Point, stroke: Point[]) {
  return Math.min(
    ...stroke.map((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y))
  );
}

export default function AnnotationLayer({
  bookId,
  pageNumber,
  pageSize,
  annotations,
  tool,
  penColor,
  highlighterColor,
  thickness,
  inputMode,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation
}: AnnotationLayerProps) {
  const [draft, setDraft] = useState<Point[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  function getStagePoint(event: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null }; evt: PointerEvent }) {
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return null;
    }
    return normalizePoint({ ...pointer, pressure: event.evt.pressure || 0.5 }, pageSize);
  }

  function handlePointerDown(event: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null }; evt: PointerEvent }) {
    if (shouldIgnorePointer(event.evt)) {
      return;
    }

    event.evt.preventDefault();
    const point = getStagePoint(event);
    if (!point) {
      return;
    }

    if (tool === "eraser") {
      const match = [...pageAnnotations].reverse().find((annotation) => {
        if (annotation.type === "note") {
          return Math.abs(annotation.x - point.x) < 0.06 && Math.abs(annotation.y - point.y) < 0.05;
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

    if (tool === "pen" || tool === "highlighter") {
      setDraft([point]);
    }
  }

  function handlePointerMove(event: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null }; evt: PointerEvent }) {
    if (shouldIgnorePointer(event.evt)) {
      return;
    }

    if (!draft.length || (tool !== "pen" && tool !== "highlighter")) {
      return;
    }
    const point = getStagePoint(event);
    if (point) {
      setDraft((current) => {
        const last = current[current.length - 1];
        const minDistance = tool === "highlighter" ? 0.003 : 0.0018;
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < minDistance) {
          return current;
        }
        return [...current, point];
      });
    }
  }

  function commitDraft() {
    if (draft.length < 2 || (tool !== "pen" && tool !== "highlighter")) {
      setDraft([]);
      return;
    }

    const points = smoothPoints(draft);

    onAddAnnotation({
      id: uuid(),
      bookId,
      pageNumber,
      type: "stroke",
      tool,
      color: tool === "pen" ? PEN_COLORS[penColor] : HIGHLIGHT_COLORS[highlighterColor],
      width: tool === "pen" ? thickness : Math.max(8, thickness * 5),
      opacity: tool === "pen" ? 1 : 0.28,
      points,
      createdAt: nowIso()
    });
    setDraft([]);
  }

  function linePoints(points: Point[]) {
    return points.flatMap((point) => [point.x * pageSize.width, point.y * pageSize.height]);
  }

  function scaledWidth(width: number, points: Point[]) {
    const pressure = points.reduce((sum, point) => sum + point.pressure, 0) / Math.max(points.length, 1);
    return Math.max(1, width * (0.7 + pressure * 0.6) * (pageSize.width / 900));
  }

  function updateNote(annotation: StickyNoteAnnotation, patch: Partial<StickyNoteAnnotation>) {
    onUpdateAnnotation({ ...annotation, ...patch, updatedAt: nowIso() });
  }

  const drawingCursor =
    tool === "pen" || tool === "highlighter"
      ? "cursor-crosshair"
      : tool === "eraser"
        ? "cursor-cell"
        : tool === "note"
          ? "cursor-copy"
          : "pointer-events-none";

  return (
    <div
      className={`absolute inset-0 z-30 ${drawingCursor}`}
      style={{
        width: pageSize.width,
        height: pageSize.height,
        touchAction: tool === "pan" ? "auto" : "none"
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
            return (
              <Line
                key={annotation.id}
                points={linePoints(annotation.points)}
                stroke={annotation.color}
                strokeWidth={scaledWidth(annotation.width, annotation.points)}
                opacity={annotation.opacity}
                tension={0.42}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={annotation.tool === "highlighter" ? "multiply" : "source-over"}
              />
            );
          })}
          {draft.length > 1 && (
            <Line
              points={linePoints(draft)}
              stroke={tool === "pen" ? PEN_COLORS[penColor] : HIGHLIGHT_COLORS[highlighterColor]}
              strokeWidth={scaledWidth(tool === "pen" ? thickness : Math.max(8, thickness * 5), draft)}
              opacity={tool === "pen" ? 1 : 0.28}
              tension={0.42}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={tool === "highlighter" ? "multiply" : "source-over"}
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
