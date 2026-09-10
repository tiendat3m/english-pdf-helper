# Account PDF Persistence

Book metadata lives in `account_books`. PDF bytes live separately in the private
Storage bucket at `users/<clerk-user-id>/books/<book-id>.pdf`. A database row alone
does not mean the PDF was uploaded. Clerk sign-out must not remove either copy.

## Invariants

- Import keeps the PDF in that account's IndexedDB workspace and sets
  `pdfUploadPending`. The flag survives reloads and failed uploads.
- Upload success requires both a successful PUT and `confirmBookUpload`, which
  verifies the stored object's byte length and PDF signature. Only then may the
  pending flag be cleared, in the originating account's workspace.
- Uploads retry at most three times per attempt. Login and reconnect retry pending
  PDFs automatically. Existing confirmed files are not uploaded on every login.
- Metadata refresh reuses local PDF bytes. A failed remote read must not replace
  a usable local file with an empty Blob.
- Missing objects and failed downloads are different states. Network, permission,
  timeout, or signing failures do not prove a file was deleted.
- Cancelled account loads cannot merge into another workspace. File recovery must
  not scan other signed-in accounts.

## Regression Checks

Run `npm run test:account-pdf` and `npm run build`. The regression suite covers
offline uploads, missing upload URLs, server confirmation, truncated downloads,
cache preservation, account changes during an upload, and a two-device round trip.
The tests use isolated IndexedDB databases and mocked HTTP responses, never live
account records.

For a production report, check the row's `storage_path` and sign that exact object
with server credentials. Do not log credentials or signed URLs. If the object is
actually absent, recover only a matching original PDF or a known account backup;
do not replace metadata, notes, vocabulary, or progress. Verify recovered bytes
against the source before reporting recovery complete.

An upload to Storage is not instantaneous. If the originating browser closes before
the upload completes, its local copy remains pending until that account is opened
on that device again. Another device cannot download bytes that never reached the
server.
