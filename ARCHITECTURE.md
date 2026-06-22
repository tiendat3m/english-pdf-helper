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
- `VocabularyRecord`: word, meaning, example, source book/page, and review status.
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

## Persistence Flow

Most interactions update React state optimistically, then persist to IndexedDB. The original PDF Blob remains untouched. Reopening a book restores the last page and zoom from the book record.

## SSR Boundaries

The following modules should remain browser-only:

- `PdfViewer`
- `AnnotationLayer`
- `src/lib/pdfWorker.ts`
- `src/lib/db.ts`

These modules use browser APIs such as `window`, `IndexedDB`, canvas, PDF workers, and pointer events.
