"use client";

import {
  Eraser,
  FileDown,
  Highlighter,
  Minus,
  NotebookPen,
  PenLine,
  Plus,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { HIGHLIGHT_COLORS, PEN_COLORS } from "@/lib/constants";
import type { HighlightColor, StrokeColor, ToolMode } from "@/lib/types";

interface ToolbarProps {
  tool: ToolMode;
  penColor: StrokeColor;
  highlighterColor: HighlightColor;
  thickness: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolMode) => void;
  onPenColorChange: (color: StrokeColor) => void;
  onHighlighterColorChange: (color: HighlightColor) => void;
  onThicknessChange: (thickness: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}

const toolButtons: Array<{ tool: ToolMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { tool: "pen", label: "Pen", icon: PenLine },
  { tool: "highlighter", label: "Highlighter", icon: Highlighter },
  { tool: "note", label: "Sticky Note", icon: NotebookPen },
  { tool: "eraser", label: "Eraser", icon: Eraser }
];

export default function Toolbar({
  tool,
  penColor,
  highlighterColor,
  thickness,
  canUndo,
  canRedo,
  onToolChange,
  onPenColorChange,
  onHighlighterColorChange,
  onThicknessChange,
  onUndo,
  onRedo,
  onSave,
  onZoomIn,
  onZoomOut,
  onFitWidth
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white/90 p-2 shadow-tool backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
      <div className="flex items-center gap-1">
        {toolButtons.map((item) => {
          const Icon = item.icon;
          const active = tool === item.tool;
          return (
            <button
              key={item.tool}
              type="button"
              title={`${item.label} (${item.tool[0].toUpperCase()})`}
              onClick={() => onToolChange(item.tool)}
              className={`grid h-9 w-9 place-items-center rounded-md transition ${
                active
                  ? "bg-ink text-white dark:bg-paper dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-8 w-px bg-stone-200 dark:bg-stone-700" />

      <div className="flex items-center gap-1" aria-label="Pen colors">
        {(Object.keys(PEN_COLORS) as StrokeColor[]).map((color) => (
          <button
            key={color}
            type="button"
            title={`Pen ${color}`}
            onClick={() => onPenColorChange(color)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              penColor === color ? "border-ink dark:border-paper" : "border-transparent"
            }`}
            style={{ backgroundColor: PEN_COLORS[color] }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1" aria-label="Highlighter colors">
        {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
          <button
            key={color}
            type="button"
            title={`Highlight ${color}`}
            onClick={() => onHighlighterColorChange(color)}
            className={`h-7 w-7 rounded-full border-2 transition ${
              highlighterColor === color ? "border-ink dark:border-paper" : "border-transparent"
            }`}
            style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
          />
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-200">
        <Minus className="h-3.5 w-3.5" />
        <input
          aria-label="Thickness"
          type="range"
          min="1"
          max="6"
          step="1"
          value={thickness}
          onChange={(event) => onThicknessChange(Number(event.target.value))}
          className="h-1 w-24 accent-sage"
        />
        <Plus className="h-3.5 w-3.5" />
      </label>

      <div className="mx-1 h-8 w-px bg-stone-200 dark:bg-stone-700" />

      <button className="toolbar-icon" type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="h-4 w-4" />
      </button>
      <button className="toolbar-icon" type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="h-4 w-4" />
      </button>
      <button className="toolbar-icon" type="button" title="Save" onClick={onSave}>
        <Save className="h-4 w-4" />
      </button>

      <div className="mx-1 h-8 w-px bg-stone-200 dark:bg-stone-700" />

      <button className="toolbar-icon" type="button" title="Zoom in (+)" onClick={onZoomIn}>
        <ZoomIn className="h-4 w-4" />
      </button>
      <button className="toolbar-icon" type="button" title="Zoom out (-)" onClick={onZoomOut}>
        <ZoomOut className="h-4 w-4" />
      </button>
      <button className="toolbar-icon" type="button" title="Fit width" onClick={onFitWidth}>
        <FileDown className="h-4 w-4" />
      </button>

      <style jsx>{`
        .toolbar-icon {
          display: grid;
          height: 2.25rem;
          width: 2.25rem;
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
