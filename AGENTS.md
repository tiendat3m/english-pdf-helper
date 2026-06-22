# Agent Handoff

This repository is structured so another coding agent can continue development quickly.

## Working Agreements

- Keep the app local-first for the MVP. Do not add a backend unless product requirements change.
- Do not mutate PDF files. Store annotations, status, vocabulary, and activity separately.
- Preserve browser-only boundaries around `react-pdf`, `pdfjs-dist`, `konva`, and `react-konva`.
- Prefer small focused components and typed records in `src/lib/types.ts`.
- Run `npm run build` after code changes that touch rendering, storage, or types.

## Important Files

- `src/components/Dashboard.tsx`: top-level state orchestration and keyboard shortcuts.
- `src/components/PdfViewer.tsx`: PDF rendering and text selection capture.
- `src/components/AnnotationLayer.tsx`: pointer input, pressure-aware drawing, notes, eraser.
- `src/lib/db.ts`: IndexedDB schema and persistence functions.
- `src/lib/constants.ts`: product constants, colors, statuses, and sample home books.

## Extension Points

- Add spaced-repetition scheduling fields to `VocabularyRecord`.
- Add export/import of IndexedDB data for backup.
- Add PDF thumbnails using a separate object store keyed by book and page.
- Add text search inside PDFs with `pdfjs` document APIs.
- Add cloud sync as a separate adapter layer after local behavior is stable.

## Cautions

- The PDF viewer is dynamically imported with `ssr: false` to avoid `pdfjs` server execution.
- Annotation coordinates are normalized to page dimensions, so render math must preserve that contract.
- Sticky notes use HTML overlays for editing; drawings use Konva.
- `saveAnnotation` is also used for note edits, so aggressive drag updates can create many writes.
