# Decisions

## Local-First MVP

Decision: Store all app data in IndexedDB and avoid a backend.

Reason: The requested MVP must run locally, preserve privacy for user PDFs, and stay simple for future agents.

## Original PDFs Are Immutable

Decision: Store PDF Blobs and annotations in separate object stores.

Reason: This protects source books and allows annotations to evolve independently.

## One Page Rendered At A Time

Decision: Render the current PDF page only.

Reason: IELTS books can exceed 300 pages. One-page rendering keeps memory and canvas cost predictable.

## Normalized Annotation Coordinates

Decision: Store drawing and note positions as page-relative coordinates.

Reason: This keeps annotations aligned across zoom changes and responsive layouts.

## Browser-Only PDF And Konva Modules

Decision: Dynamically import `PdfViewer` with SSR disabled and dynamically import `AnnotationLayer` inside it.

Reason: PDF.js and Konva depend on browser APIs and can break static prerendering if evaluated on the server.

## HTML Sticky Notes

Decision: Render sticky notes as HTML overlays instead of pure Konva text.

Reason: Native text editing, textarea behavior, and delete controls are more reliable for an MVP.

## Optimistic Writes

Decision: Update React state before IndexedDB writes complete for most interactions.

Reason: Drawing and studying should feel immediate. IndexedDB writes are local and fast enough to persist right after state updates.

## Recently Deleted Books

Decision: Deleting a saved book marks it with `deletedAt` and hides it from the active library, vocabulary, and progress views. It remains restorable for 30 days, then local cleanup permanently removes the book and related annotations, bookmarks, page statuses, and vocabulary.

Reason: Users need a recovery path for accidental deletes, while local storage should not keep abandoned large PDF blobs forever.
