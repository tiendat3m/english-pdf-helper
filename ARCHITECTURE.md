# Architecture

## Overview

IELTS PDF Notes is a Next.js App Router application with a browser-only learning workspace. There is no backend. All durable user data lives in IndexedDB through `idb`.

## Layers

1. App shell: `src/app/layout.tsx` and `src/app/page.tsx`.
2. Product controller: `src/components/Dashboard.tsx`.
3. Feature components: PDF viewer, sidebar, toolbar, vocabulary, and progress.
4. Local data layer: `src/lib/db.ts`.
5. Shared model and constants: `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/utils.ts`.

## Data Model

- `BookRecord`: PDF Blob, title, file metadata, last page, total pages, zoom, and progress.
- `Annotation`: stroke or sticky note records, keyed by book and page.
- `BookmarkRecord`: category and page.
- `PageStatusRecord`: page learning state.
- `VocabularyRecord`: word, IPA, English meaning, Vietnamese meaning, example, source book/page, and review status.
- `StudyActivity`: recent activity timeline.

## PDF Rendering

`PdfViewer` uses `react-pdf` for `Document` and `Page`. The PDF.js worker is configured in `src/lib/pdfWorker.ts` using:

```ts
new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
```

The viewer is loaded with `next/dynamic({ ssr: false })` from `Dashboard` to prevent PDF.js from running during static prerendering.

## Annotation Rendering

`AnnotationLayer` sits absolutely over the rendered PDF canvas. Stroke points are normalized from `0` to `1` for both axes, which keeps pen and highlighter marks correct after zoom or viewport changes.

Pen pressure is read from `PointerEvent.pressure`. The renderer averages pressure to adjust stroke width when available and falls back to `0.5`.

Stylus-only mode filters input to `PointerEvent.pointerType === "pen"`, which helps XP-Pen, Huion, Wacom, and touch-screen users avoid accidental palm/touch marks. Stroke capture also drops very-close points and applies light smoothing before saving.

Highlighter mode creates normalized rectangle annotations instead of freehand strokes. `PdfViewer` reads the rendered PDF text layer spans after page render, stores normalized text item boxes, and passes them to `AnnotationLayer`. When a highlight rectangle is committed, overlapping text items are joined in reading order and saved as `selectedText` on the highlight annotation. Empty text still saves as a visual highlight. If there is no selectable PDF text, `PdfViewer` crops the highlighted canvas area for AI solve/explain actions, which helps scanned books and image-only pages. If the highlight overlaps user pen strokes, the annotation is marked as handwriting-sourced, but the app does not OCR handwriting into editable text yet.

## IELTS OS Workspace

The Learn screen supports Focus and Split modes. Focus keeps the PDF centered. Split adds `StudyWorkspacePanel`, which shows a page notebook, book vocabulary, and review map beside the PDF, inspired by MarginNote and LiquidText.

## Persistence Flow

Most interactions update React state optimistically, then persist to IndexedDB. The original PDF Blob remains untouched. Reopening a book restores the last page and zoom from the book record.

## AI Study Coach

`src/app/api/ai/ielts/route.ts` is a server-only Next route that calls Ollama first when `AI_PROVIDER=ollama` or `OLLAMA_MODEL` / `OLLAMA_BASE_URL` is configured. It supports local Ollama and Ollama cloud at `https://ollama.com/api`, uses `/api/chat` with `stream: false` and `format: "json"`, then can fall back to Gemini or OpenAI when those providers are configured. The browser sends selected PDF text, or a cropped highlight image when no text layer exists, plus an action mode; the route returns compact JSON for vocabulary, explanation, grammar, exercise solving, or sticky-note creation. Image selections require a vision-capable provider/model, such as an Ollama model configured through `OLLAMA_VISION_MODEL`; handwriting still needs a future OCR/vision pass.

The browser never receives provider API keys. Set `OLLAMA_MODEL`, `GEMINI_MODEL`, or `OPENAI_MODEL` to change models without code changes.

## SSR Boundaries

The following modules should remain browser-only:

- `PdfViewer`
- `AnnotationLayer`
- `src/lib/pdfWorker.ts`
- `src/lib/db.ts`

These modules use browser APIs such as `window`, `IndexedDB`, canvas, PDF workers, and pointer events.
