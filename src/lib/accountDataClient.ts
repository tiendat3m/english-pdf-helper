import type { Annotation, AppData, BookRecord, BookmarkRecord, PageStatusRecord, VocabularyRecord } from "@/lib/types";
import { markBookPdfUploaded } from "@/lib/db";

type AccountCollection = "annotations" | "bookmarks" | "pageStatuses" | "vocabulary" | "activities";

type AccountRecord = Annotation | BookmarkRecord | PageStatusRecord | VocabularyRecord | AppData["activities"][number];

interface AccountAuth {
  isAuthEnabled: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}

const pendingUploads = new Map<string, Promise<void>>();

type AccountBookPayload = Omit<BookRecord, "blob"> & {
  downloadUrl?: string | null;
};

interface AccountDataResponse {
  data: {
    books: AccountBookPayload[];
    annotations: Annotation[];
    bookmarks: BookmarkRecord[];
    pageStatuses: PageStatusRecord[];
    vocabulary: VocabularyRecord[];
    activities: AppData["activities"];
  };
}

interface AccountMutationResponse {
  uploadUrls?: Array<{
    bookId: string;
    uploadUrl: string;
    fileName: string;
  }>;
}

export interface AccountSaveResult {
  books: number;
  pdfUploads: number;
  skippedMissingPdfs: number;
}

function canUseAccountData(auth: AccountAuth) {
  return auth.isAuthEnabled && auth.isSignedIn && Boolean(auth.userId);
}

async function requestAccountData<T>(auth: AccountAuth, init: RequestInit = {}) {
  if (!canUseAccountData(auth)) {
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Offline. Changes are kept on this device until reconnect.");
  }

  const token = await auth.getToken().catch(() => null);
  const response = await fetch("/api/account-data", {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-account-user-id": auth.userId!,
      ...init.headers
    }
  });

  if (!response.ok) {
    let message = "Could not open account database.";
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message || message;
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function uploadPdfToSignedUrl(uploadUrl: string, blob: Blob, fileName: string) {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("file", blob, fileName);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: form,
    signal: AbortSignal.timeout(180_000)
  });

  if (!response.ok) {
    let message = "Could not upload PDF to account storage.";
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message || payload.error || message;
    } catch {
      // Keep the default message.
    }
    throw new Error(message);
  }
}

async function downloadBookBlob(book: AccountBookPayload, cached?: BookRecord, signal?: AbortSignal): Promise<BookRecord> {
  const { downloadUrl, ...metadata } = book;
  // A metadata refresh must never discard a usable PDF on this device.
  if (cached?.blob.size && cached.blob.size === book.size) {
    return {
      ...metadata, blob: cached.blob, fileUnavailable: false, fileError: undefined,
      pdfUploadPending: Boolean(cached.pdfUploadPending || book.fileError === "missing")
    };
  }
  if (downloadUrl) {
    try {
      const response = await fetch(downloadUrl, { cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error("PDF download failed.");
      const blob = await response.blob();
      if (!blob.size || (book.size > 0 && blob.size !== book.size) || await blob.slice(0, 5).text() !== "%PDF-") {
        throw new Error("PDF download is incomplete.");
      }
      return { ...metadata, blob, fileUnavailable: false, fileError: undefined, pdfUploadPending: false };
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return {
    ...metadata, blob: new Blob([], { type: "application/pdf" }), fileUnavailable: true,
    fileError: book.fileError ?? "download-failed", pdfUploadPending: false
  };
}

function toAccountBookPayload(book: BookRecord): Omit<BookRecord, "blob"> {
  return {
    id: book.id,
    title: book.title,
    fileName: book.fileName,
    size: book.size,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    lastOpenedAt: book.lastOpenedAt,
    lastPage: book.lastPage,
    totalPages: book.totalPages,
    zoom: book.zoom,
    progress: book.progress,
    deletedAt: book.deletedAt
  };
}

export async function loadAccountData(auth: AccountAuth, options: { cachedBooks?: BookRecord[]; signal?: AbortSignal } = {}) {
  const payload = await requestAccountData<AccountDataResponse>(auth, { method: "GET", signal: options.signal });
  if (!payload) {
    return null;
  }

  const cache = new Map(options.cachedBooks?.map((book) => [book.id, book]));
  const books: BookRecord[] = [];
  for (const book of payload.data.books) {
    if (options.signal?.aborted) throw new DOMException("Account changed", "AbortError");
    books.push(await downloadBookBlob(book, cache.get(book.id), options.signal));
  }

  return {
    ...payload.data,
    books
  };
}

export async function upsertAccountBook(auth: AccountAuth, book: BookRecord, options: { uploadPdf?: boolean } = {}) {
  if (!canUseAccountData(auth)) return;
  if (options.uploadPdf) {
    if (!book.blob.size) throw new Error("This device has no PDF file to upload.");
    const key = `${auth.userId}:${book.id}`;
    const existing = pendingUploads.get(key);
    if (existing) return existing;
    const upload = uploadAndVerifyAccountBook(auth, book);
    pendingUploads.set(key, upload);
    try { await upload; } finally { pendingUploads.delete(key); }
    return;
  }
  await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({ operation: "upsertBook", book: toAccountBookPayload(book), needsUpload: false })
  });
}

async function uploadAndVerifyAccountBook(auth: AccountAuth, book: BookRecord) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await requestAccountData<AccountMutationResponse>(auth, {
        method: "POST",
        body: JSON.stringify({ operation: "upsertBook", book: toAccountBookPayload(book), needsUpload: true })
      });
      const uploadUrl = payload?.uploadUrls?.[0]?.uploadUrl;
      if (!uploadUrl) throw new Error("Account storage did not provide an upload URL.");
      await uploadPdfToSignedUrl(uploadUrl, book.blob, book.fileName);
      const confirmation = await requestAccountData<{ verified: boolean }>(auth, {
        method: "POST", body: JSON.stringify({ operation: "confirmBookUpload", ids: [book.id] })
      });
      if (!confirmation?.verified) throw new Error("PDF upload was not confirmed.");
      await markBookPdfUploaded(`user_${auth.userId}`, book);
      return;
    } catch (error) {
      console.warn("[account-pdf] upload incomplete", { bookId: book.id, attempt: attempt + 1 });
      if (attempt === 2 || (typeof navigator !== "undefined" && !navigator.onLine)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

export async function upsertAccountRecords(auth: AccountAuth, collection: AccountCollection, records: AccountRecord[]) {
  if (!records.length) {
    return;
  }
  await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "upsertRecords",
      collection,
      records
    })
  });
}

export async function deleteAccountRecords(auth: AccountAuth, collection: AccountCollection, ids: string[]) {
  if (!ids.length) {
    return;
  }
  await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "deleteRecords",
      collection,
      ids
    })
  });
}

export async function deleteAccountBooks(auth: AccountAuth, ids: string[]) {
  if (!ids.length) {
    return;
  }
  await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "deleteBooks",
      ids
    })
  });
}

export async function saveAccountData(auth: AccountAuth, data: AppData, options: { uploadPdfs?: boolean; onlyPendingPdfs?: boolean } = {}): Promise<AccountSaveResult> {
  if (!canUseAccountData(auth)) return { books: 0, pdfUploads: 0, skippedMissingPdfs: 0 };
  const books = data.books.map(toAccountBookPayload);
  const uploadableBooks = data.books.filter((book) => book.blob.size > 0 && (!options.onlyPendingPdfs || book.pdfUploadPending));
  const skippedMissingPdfs = data.books.filter((book) => book.fileUnavailable || book.blob.size === 0).length;
  const metadataSave = requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "upsertData",
      books,
      annotations: data.annotations,
      bookmarks: data.bookmarks,
      pageStatuses: data.pageStatuses,
      vocabulary: data.vocabulary,
      activities: data.activities,
      uploadBookIds: []
    })
  });

  const results = await Promise.allSettled([
    metadataSave,
    ...(options.uploadPdfs ? uploadableBooks.map((book) => upsertAccountBook(auth, book, { uploadPdf: true })) : [])
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const pdfUploads = options.uploadPdfs ? uploadableBooks.length : 0;

  return {
    books: books.length,
    pdfUploads,
    skippedMissingPdfs
  };
}
