# Architecture

## Overview

IELTS PDF Notes is a Next.js App Router application with a browser-first learning workspace. IndexedDB through `idb` remains the primary durable store. Optional server routes provide AI calls and signed Supabase Storage URLs without moving normal app state to a backend.

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
- `VocabularyRecord`: word, IPA, English meaning, Vietnamese meaning, example, source book/page, review status, and optional spaced-repetition fields (`dueAt`, `lastReviewedAt`, `reviewCount`, `ease`).
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

Highlighter mode creates normalized rectangle annotations instead of freehand strokes. `PdfViewer` reads the rendered PDF text layer spans after page render, stores normalized text item boxes, and passes them to `AnnotationLayer`. When a highlight rectangle is committed, overlapping text items are joined in reading order and saved as `selectedText` on the highlight annotation. Empty text still saves as a visual highlight. If there is no selectable PDF text, `PdfViewer` crops the printed PDF canvas and runs browser OCR with `tesseract.js`; successful OCR updates the highlight as `selectedTextSource: "ocr"` so scanned books can still create vocabulary. A second cropped image that includes annotation overlays is kept only in UI memory for AI solve/explain actions, which helps image-only pages and handwritten answers without bloating IndexedDB.

## IELTS OS Workspace

The Learn screen supports Focus and Split modes. Focus keeps the PDF centered. Split adds `StudyWorkspacePanel`, which shows a page notebook, book vocabulary, and page map beside the PDF, inspired by MarginNote and LiquidText. The home dashboard also has a daily study session modal that groups reading, weak-page review, and due vocabulary into one short checklist.

## Persistence Flow

Most interactions update React state optimistically, then persist to IndexedDB. The original PDF Blob remains untouched. Reopening a book restores the last page and zoom from the book record.

## Backup And Cross-Device Sync

`src/lib/db.ts` serializes the complete IndexedDB state, including PDF blobs, into a versioned JSON backup. File export/import remains available for offline backup.

Optional cloud sync stores that same snapshot in a private Supabase Storage bucket. The server-only routes under `src/app/api/sync` create short-lived signed upload/download URLs; the browser then transfers the potentially large backup directly to Supabase instead of sending PDF data through a Vercel Function.

Configure:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_SYNC_BUCKET=ielts-sync
```

The bucket is created as private on first use when the service role has Storage permissions. New backups are split into 8 MiB objects under `<sync-code>/parts/` and committed by uploading `<sync-code>/manifest.json` last. This avoids the provider's per-object size limit while keeping the service-role key off the client. Pull still supports the earlier `<sync-code>/backup.json` format.

Use a long, hard-to-guess sync code because this MVP does not have user accounts yet. `Push` overwrites the cloud snapshot; `Pull` replaces the current browser database with that snapshot.

## AI Study Coach

`src/app/api/ai/ielts/route.ts` is a server-only Next route that can run in `AI_PROVIDER=auto` mode. In auto mode it tries configured text providers in the request order chosen in the app's AI settings, defaulting to Groq, Gemini, Ollama, then OpenAI. Image selections default to Gemini, Ollama, Groq, then OpenAI because Groq is text-only in this app. The route continues to the next provider when one hits quota/rate limits or returns an error. It supports local Ollama and Ollama cloud at `https://ollama.com/api`, Gemini's generateContent API, Groq's OpenAI-compatible chat completions endpoint, and OpenAI Responses. The browser sends selected PDF text, OCR text from scanned highlights, or a cropped highlight image when no text was recovered, plus an action mode; the route returns compact JSON for vocabulary, explanation, grammar, exercise solving, or sticky-note creation. Image selections require a vision-capable provider/model, such as an Ollama model configured through `OLLAMA_VISION_MODEL` (`gemma4` is Ollama's documented vision example) or Gemini. If no vision model is configured, scanned/image-only selections fail fast with a clear setup message instead of being sent to the text model. Handwritten answers still depend on a future OCR/vision pass.

The browser never receives provider API keys. Set `OLLAMA_MODEL`, `GEMINI_MODEL`, or `OPENAI_MODEL` to change models without code changes.

## SSR Boundaries

The following modules should remain browser-only:

- `PdfViewer`
- `AnnotationLayer`
- `src/lib/pdfWorker.ts`
- `src/lib/db.ts`

These modules use browser APIs such as `window`, `IndexedDB`, canvas, PDF workers, and pointer events.
