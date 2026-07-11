"use client";

import type { ComponentType } from "react";
import {
  Eraser,
  FileDown,
  Highlighter,
  Minus,
  NotebookPen,
  Paintbrush,
  PenLine,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { HIGHLIGHT_COLORS, PEN_COLORS } from "@/lib/constants";
import type { BrushStyle, HighlightColor, StrokeColor, ToolMode } from "@/lib/types";

interface ToolbarProps {
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  brushStyle: BrushStyle;
  thickness: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolMode) => void;
  onPenColorChange: (color: StrokeColor) => void;
  onHighlighterColorChange: (color: HighlightColor) => void;
  onBrushStyleChange: (brush: BrushStyle) => void;
  onThicknessChange: (thickness: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClearPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}

const toolButtons: Array<{ tool: ToolMode; label: string; shortcut: string; icon: ComponentType<{ className?: string }> }> = [
  { tool: "pen", label: "Pen", shortcut: "P", icon: PenLine },
  { tool: "highlighter", label: "Mark", shortcut: "H", icon: Highlighter },
  { tool: "note", label: "Note", shortcut: "N", icon: NotebookPen },
  { tool: "eraser", label: "Erase", shortcut: "E", icon: Eraser }
];

const brushOptions: Array<{ value: BrushStyle; label: string }> = [
  { value: "ballpoint", label: "Ballpoint" },
  { value: "pencil", label: "Pencil" },
  { value: "fountain", label: "Fountain" },
  { value: "marker", label: "Marker" }
];

const stylusPresets: Array<{ label: string; brush: BrushStyle; thickness: number }> = [
  { label: "XS", brush: "ballpoint", thickness: 0.75 },
  { label: "Fine", brush: "pencil", thickness: 0.9 },
  { label: "Study", brush: "ballpoint", thickness: 1.15 },
  { label: "Bold", brush: "fountain", thickness: 1.6 }
];

const penLabels: Record<StrokeColor, string> = {
  black: "Ink black",
  slate: "Graphite",
  blue: "IELTS blue",
  red: "Correction red",
  green: "Done green",
  purple: "Grammar purple"
};

const highlightLabels: Record<HighlightColor, string> = {
  yellow: "Vocabulary yellow",
  green: "Done green",
  pink: "Mistake pink",
  blue: "Grammar blue",
  orange: "Review orange"
};

export default function Toolbar({
  tool,
  penColor,
  highlighterColor,
  brushStyle,
  thickness,
  canUndo,
  canRedo,
  onToolChange,
  onPenColorChange,
  onHighlighterColorChange,
  onBrushStyleChange,
  onThicknessChange,
  onUndo,
  onRedo,
  onSave,
  onClearPage,
  onZoomIn,
  onZoomOut,
  onFitWidth
}: ToolbarProps) {
  const showingPenColors = tool !== "highlighter";
  const colorEntries = showingPenColors
    ? (Object.keys(PEN_COLORS) as StrokeColor[]).map((color) => ({ color, value: PEN_COLORS[color], label: penLabels[color] }))
    : (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => ({
        color,
        value: HIGHLIGHT_COLORS[color],
        label: highlightLabels[color]
      }));

  function applyPreset(brush: BrushStyle, nextThickness: number) {
    onBrushStyleChange(brush);
    onThicknessChange(nextThickness);
    onToolChange("pen");
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white/92 p-2 shadow-tool backdrop-blur dark:border-stone-700 dark:bg-stone-900/92">
      <div className="flex items-center gap-1 rounded-md bg-stone-100/80 p-1 dark:bg-stone-800/80">
        {toolButtons.map((item) => {
          const Icon = item.icon;
          const active = tool === item.tool;
          return (
            <button
              key={item.tool}
              type="button"
              title={`${item.label} (${item.shortcut})`}
              onClick={() => onToolChange(item.tool)}
              className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-black transition ${
                active
                  ? "bg-ink text-white shadow-sm dark:bg-paper dark:text-stone-950"
                  : "text-stone-600 hover:bg-white dark:text-stone-200 dark:hover:bg-stone-900"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden h-8 w-px bg-stone-200 dark:bg-stone-700 md:block" />

      <div className="flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <Paintbrush className="h-4 w-4 text-sage" />
        <select
          aria-label="Brush style"
          value={brushStyle}
          onChange={(event) => onBrushStyleChange(event.target.value as BrushStyle)}
          className="h-8 bg-transparent text-xs font-black text-stone-700 outline-none dark:text-stone-100"
        >
          {brushOptions.map((brush) => (
            <option key={brush.value} value={brush.value}>
              {brush.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1 rounded-md bg-stone-100/80 p-1 dark:bg-stone-800/80" aria-label="XP-Pen presets">
        {stylusPresets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={`${preset.label}: ${preset.brush}, ${preset.thickness}px`}
            onClick={() => applyPreset(preset.brush, preset.thickness)}
            className={`h-8 rounded-md px-2 text-xs font-black transition ${
              tool === "pen" && brushStyle === preset.brush && Math.abs(thickness - preset.thickness) < 0.01
                ? "bg-sage text-white shadow-sm"
                : "text-stone-600 hover:bg-white dark:text-stone-200 dark:hover:bg-stone-900"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="hidden h-8 w-px bg-stone-200 dark:bg-stone-700 lg:block" />

      <div className="flex items-center gap-1" aria-label={showingPenColors ? "Pen colors" : "Highlighter colors"}>
        {colorEntries.map((entry) => {
          const active = showingPenColors ? penColor === entry.color : highlighterColor === entry.color;
          return (
            <button
              key={entry.color}
              type="button"
              title={entry.label}
              onClick={() => {
                if (showingPenColors) {
                  onPenColorChange(entry.color as StrokeColor);
                } else {
                  onHighlighterColorChange(entry.color as HighlightColor);
                }
              }}
              className={`grid h-8 w-8 place-items-center rounded-full border-2 transition ${
                active ? "border-ink shadow-sm dark:border-paper" : "border-transparent hover:border-stone-300 dark:hover:border-stone-500"
              }`}
            >
              <span className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: entry.value }} />
            </button>
          );
        })}
      </div>

      <label className="flex min-w-48 items-center gap-2 rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-200">
        <Minus className="h-3.5 w-3.5" />
        <input
          aria-label="Thickness"
          type="range"
          min="0.45"
          max="3.2"
          step="0.05"
          value={thickness}
          onChange={(event) => onThicknessChange(Number(event.target.value))}
          className="h-1 w-24 accent-sage"
        />
        <Plus className="h-3.5 w-3.5" />
        <span className="w-9 text-right tabular-nums">{thickness.toFixed(2)}</span>
      </label>

      <div className="ml-auto flex items-center gap-1 rounded-md border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <button className="toolbar-icon" type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button className="toolbar-icon" type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </button>
        <button className="toolbar-icon" type="button" title="Save" onClick={onSave}>
          <Save className="h-4 w-4" />
        </button>
        <button className="toolbar-icon danger-icon" type="button" title="Clear all annotations on this page" onClick={onClearPage}>
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="mx-1 h-7 w-px bg-stone-200 dark:bg-stone-700" />
        <button className="toolbar-icon" type="button" title="Zoom in (+)" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="toolbar-icon" type="button" title="Zoom out (-)" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button className="toolbar-icon" type="button" title="Fit width" onClick={onFitWidth}>
          <FileDown className="h-4 w-4" />
        </button>
      </div>

      <style jsx>{`
        .toolbar-icon {
          display: grid;
          height: 2rem;
          width: 2rem;
          place-items: center;
          border-radius: 0.375rem;
          color: rgb(87 83 78);
          transition: background-color 150ms ease, color 150ms ease, opacity 150ms ease;
        }
        .toolbar-icon:hover:not(:disabled) {
          background: rgb(245 245 244);
        }
        .toolbar-icon:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }
        .danger-icon {
          color: rgb(190 18 60);
        }
        .danger-icon:hover:not(:disabled) {
          background: rgb(255 241 242);
        }
        :global(.dark) .toolbar-icon {
          color: rgb(231 229 228);
        }
        :global(.dark) .toolbar-icon:hover:not(:disabled) {
          background: rgb(41 37 36);
        }
      `}</style>
    </div>
  );
}
