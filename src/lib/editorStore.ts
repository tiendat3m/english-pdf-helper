import type { EditorState, ToolMode } from "./types";
import { DEFAULT_ZOOM } from "./constants";

export const initialEditorState: EditorState = {
  activeTab: "learn",
  activeBookId: null,
  currentPage: 1,
  zoom: DEFAULT_ZOOM,
  tool: "pen",
  penColor: "black",
  highlighterColor: "yellow",
  thickness: 2,
  theme: "warm",
  workspaceMode: "split",
  inputMode: "all",
  dailyPageGoal: 5,
  targetBand: 8,
  currentBand: 6.5,
  searchQuery: ""
};

export function shortcutToTool(key: string): ToolMode | null {
  const normalized = key.toLowerCase();
  if (normalized === "p") {
    return "pen";
  }
  if (normalized === "h") {
    return "highlighter";
  }
  if (normalized === "n") {
    return "note";
  }
  if (normalized === "e") {
    return "eraser";
  }
  return null;
}
