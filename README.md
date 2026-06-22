# IELTS PDF Notes

```bash
npm install next react react-dom react-pdf pdfjs-dist react-konva konva idb uuid lucide-react
npm install -D typescript @types/react @types/react-dom @types/node tailwindcss postcss autoprefixer eslint eslint-config-next
npm run dev
```

IELTS PDF Notes is evolving into an IELTS OS: a local-first study workspace for IELTS PDF books. It combines a focused PDF reader, pen and highlighter annotations, sticky notes, bookmarks, page status tracking, vocabulary capture, progress review, warm paper reading, split-screen study, and daily motivation.

## Features

- Import local PDF books and store the original Blob in IndexedDB.
- Reopen saved PDFs after refresh with last page and zoom restored.
- Render large PDFs through `react-pdf` and a browser-only PDF.js worker.
- Annotate pages with pressure-aware pen strokes, transparent highlighter strokes, sticky notes, and eraser actions.
- Create text-aware rectangle highlights that detect covered PDF text and offer Vocabulary, Note, and AI Explain actions.
- Save bookmarks by IELTS category and mark pages as Not Started, Learning, Done, or Need Review.
- Select text in the PDF text layer and save it into an Anki-inspired vocabulary table.
- Track books, studied pages, notes, vocabulary, streak, recent activity, and overall progress.
- Use keyboard shortcuts: `P`, `H`, `N`, `E`, `Ctrl+Z`, `Ctrl+Y`, `+`, `-`, and Space for pan mode.
- Switch between Light, Warm Paper, and Dark themes.
- Use Focus mode for a centered PDF or Split mode for PDF + Notebook + Vocabulary + Review Map.
- Use Stylus-only mode for XP-Pen, Huion, Wacom, and tablet writing sessions.
- Clear all annotations on the current page, with undo/redo recovery.
- Track a daily page goal, target IELTS 8.0, and current estimated band.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## AI Study Coach

Create `.env` before using AI actions. Gemini is preferred for the free-tier path:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
```

Restart `npm run dev` after changing environment variables.

In the PDF viewer, select text in the rendered PDF text layer. The AI Study Coach can generate vocabulary notes, explanations, grammar notes, or sticky study notes. Results can be saved to the Vocabulary tab or as a sticky note on the current PDF page.

## Build

```bash
npm run build
```

## Local Storage Model

The app has no backend. IndexedDB stores books, annotations, bookmarks, page statuses, vocabulary, and activity history. Original PDFs are never modified; annotations are separate records keyed by book and page.

## Main Source Map

- `src/app/page.tsx` starts the client app.
- `src/components/Dashboard.tsx` owns app state, tabs, shortcuts, and persistence calls.
- `src/components/PdfViewer.tsx` renders PDF pages and captures selected vocabulary text.
- `src/components/AnnotationLayer.tsx` handles Konva drawing, text-aware highlight rectangles, sticky notes, pressure, and erasing.
- `src/components/PdfSidebar.tsx` manages library search, bookmarks, vocabulary highlights, and page status.
- `src/components/StudyWorkspacePanel.tsx` provides the split-screen notebook, book vocabulary, and review map.
- `src/components/VocabularyPanel.tsx` provides search, filter, sort, and status review.
- `src/components/ProgressPanel.tsx` summarizes learning progress.
- `src/lib/db.ts` is the IndexedDB API.
- `src/lib/pdfWorker.ts` configures the browser-only PDF.js worker.

## Notes For Large PDFs

The MVP renders one page at a time, which keeps memory predictable for 300+ page books. Future versions can add prefetching for neighboring pages and thumbnail indexing without changing the storage model.
