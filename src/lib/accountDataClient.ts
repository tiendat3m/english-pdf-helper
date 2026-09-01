import type { Annotation, AppData, BookRecord, BookmarkRecord, PageStatusRecord, VocabularyRecord } from "@/lib/types";

type AccountCollection = "annotations" | "bookmarks" | "pageStatuses" | "vocabulary" | "activities";

type AccountRecord = Annotation | BookmarkRecord | PageStatusRecord | VocabularyRecord | AppData["activities"][number];

interface AccountAuth {
  isAuthEnabled: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}

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

function canUseAccountData(auth: AccountAuth) {
  return auth.isAuthEnabled && auth.isSignedIn && Boolean(auth.userId);
}

async function requestAccountData<T>(auth: AccountAuth, init: RequestInit = {}) {
  if (!canUseAccountData(auth)) {
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }

  const token = await auth.getToken().catch(() => null);
  const response = await fetch("/api/account-data", {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  form.append("cacheControl", "0");
  form.append("", blob, fileName);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: form
  });

  if (!response.ok) {
    throw new Error("Could not upload PDF to account storage.");
  }
}

async function downloadBookBlob(book: AccountBookPayload) {
  if (!book.downloadUrl) {
    return null;
  }

  const response = await fetch(book.downloadUrl, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  return {
    ...book,
    blob: await response.blob()
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

export async function loadAccountData(auth: AccountAuth) {
  const payload = await requestAccountData<AccountDataResponse>(auth, { method: "GET" });
  if (!payload) {
    return null;
  }

  const books = (await Promise.all(payload.data.books.map(downloadBookBlob))).filter((book): book is BookRecord =>
    Boolean(book)
  );

  return {
    ...payload.data,
    books
  };
}

export async function upsertAccountBook(auth: AccountAuth, book: BookRecord, options: { uploadPdf?: boolean } = {}) {
  const payload = await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "upsertBook",
      book: toAccountBookPayload(book),
      needsUpload: Boolean(options.uploadPdf)
    })
  });

  const uploadUrl = payload?.uploadUrls?.[0]?.uploadUrl;
  if (options.uploadPdf && uploadUrl) {
    await uploadPdfToSignedUrl(uploadUrl, book.blob, book.fileName);
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

export async function saveAccountData(auth: AccountAuth, data: AppData, options: { uploadPdfs?: boolean } = {}) {
  const books = data.books.map(toAccountBookPayload);
  const payload = await requestAccountData<AccountMutationResponse>(auth, {
    method: "POST",
    body: JSON.stringify({
      operation: "upsertData",
      books,
      annotations: data.annotations,
      bookmarks: data.bookmarks,
      pageStatuses: data.pageStatuses,
      vocabulary: data.vocabulary,
      activities: data.activities,
      needsUpload: Boolean(options.uploadPdfs)
    })
  });

  if (options.uploadPdfs && payload?.uploadUrls?.length) {
    const bookById = new Map(data.books.map((book) => [book.id, book]));
    await Promise.all(
      payload.uploadUrls.map((upload) => {
        const book = bookById.get(upload.bookId);
        if (!book) {
          return Promise.resolve();
        }
        return uploadPdfToSignedUrl(upload.uploadUrl, book.blob, upload.fileName);
      })
    );
  }
}
