# Tasks

## Completed In Initial MVP

- Created a Next.js App Router, TypeScript, and Tailwind CSS app.
- Installed and configured `react-pdf`, `pdfjs-dist`, `react-konva`, `konva`, `idb`, `uuid`, and `lucide-react`.
- Added IndexedDB persistence for books, annotations, bookmarks, page statuses, vocabulary, and activity.
- Built the Learn home page with Continue Learning, Recent Books, and statistics.
- Built the Learn workspace with sidebar, toolbar, PDF viewer, and page controls.
- Implemented PDF import, saved PDFs, open PDF, page navigation, zoom, last-page restore, and zoom restore.
- Implemented pen, highlighter, sticky notes, eraser, undo, redo, and save controls.
- Implemented page status and bookmark categories.
- Implemented vocabulary capture, search, filter, sort, status updates, and delete.
- Implemented progress metrics and recent activity.
- Added warm paper mode and dark mode.
- Added documentation for future agents.

## Recommended Next Tasks

- Add PDF text search across the loaded document.
- Add thumbnail rail with cached page previews.
- Add spaced repetition review dates and due cards.
- Add backup export/import for local IndexedDB data.
- Add more robust palm rejection and stylus-only drawing controls.
- Add automated component tests around storage and editor state.
- Add Playwright smoke tests for import, annotate, vocabulary save, and refresh restore.
