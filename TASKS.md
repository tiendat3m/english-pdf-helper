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
- Added IPA and Vietnamese meaning fields to saved vocabulary.
- Split IPA and Vietnamese meaning into their own Vocabulary table columns and added browser pronunciation playback.
- Implemented progress metrics and recent activity.
- Added warm paper mode and dark mode.
- Implemented soft delete for saved books with Recently Deleted restore and 30-day permanent cleanup.
- Added individual and bulk permanent delete actions for Recently Deleted books.
- Replaced native permanent-delete confirm alerts with an in-app confirmation dialog.
- Added an AI on/off toggle for highlight actions and improved text joining for fragmented PDF text spans.
- Added close and Escape dismissal for the highlight action popup.
- Tightened highlight text filtering so nearby list numbers are not captured when only a word is highlighted.
- Stripped leading exercise/list numbers from detected highlight text when a PDF span combines the number and word.
- Added Ctrl + mouse wheel PDF zoom with a native non-passive wheel listener so it does not trigger browser page zoom.
- Smoothed Ctrl-wheel zoom by throttling zoom updates and added a high-contrast drawing cursor for pen/highlighter tools.
- Switched Ctrl-wheel zoom to a CSS preview scale and delayed PDF.js re-render until wheel input settles.
- Improved XP-Pen/Huion stylus feel with pointer capture, coalesced pointer samples, lighter point filtering, and stroke stabilization.
- Made pen strokes thinner by default with finer thickness controls for small tablets like XP-Pen XS.
- Added a collapsible left library sidebar for a wider handwriting/PDF workspace.
- Implemented AI Study Coach for selected PDF text with vocabulary, explanation, grammar, and sticky-note saving.
- Switched AI Study Coach to prefer Gemini free-tier API keys, with OpenAI kept as an optional fallback.
- Switched AI Study Coach provider routing to prefer Ollama local models, with Gemini/OpenAI as optional fallbacks.
- Added Ollama cloud support for `https://ollama.com/api` and GLM-5 cloud models.
- Implemented IELTS OS shell: Focus/Split workspace, right-side notebook, vocabulary panel, review map, daily page goal, and band tracker.
- Improved handwriting mode with stylus-only input and smoother stroke capture for XP-Pen/Huion/Wacom workflows.
- Added clear-page action with undo/redo recovery for messy handwriting sessions.
- Added text-aware rectangle highlighting with selected text capture, Vocabulary, Note, and AI Explain contextual actions.
- Added documentation for future agents.

## Recommended Next Tasks

- Add PDF text search across the loaded document.
- Add thumbnail rail with cached page previews.
- Add spaced repetition review dates and due cards.
- Add backup export/import for local IndexedDB data.
- Add more robust palm rejection and stylus-only drawing controls.
- Add automated component tests around storage and editor state.
- Add Playwright smoke tests for import, annotate, vocabulary save, and refresh restore.
