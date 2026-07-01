"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { v4 as uuid } from "uuid";
import type {
  Annotation,
  AppData,
  BookRecord,
  BookmarkRecord,
  PageStatus,
  PageStatusRecord,
  StudyActivity,
  VocabularyRecord
} from "./types";
import { DELETED_BOOK_RETENTION_DAYS } from "./constants";
import { bookProgress, emptyAppData, nowIso, stripPdfExtension } from "./utils";

interface IeltsPdfNotesDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { "by-last-opened": string };
  };
  annotations: {
    key: string;
    value: Annotation;
    indexes: { "by-book-page": [string, number] };
  };
  bookmarks: {
    key: string;
    value: BookmarkRecord;
    indexes: { "by-book": string };
  };
  pageStatuses: {
    key: string;
    value: PageStatusRecord;
    indexes: { "by-book-page": [string, number] };
  };
  vocabulary: {
    key: string;
    value: VocabularyRecord;
    indexes: { "by-source": string; "by-status": string };
  };
  activities: {
    key: string;
    value: StudyActivity;
    indexes: { "by-date": string };
  };
}

const DB_NAME = "ielts-pdf-notes";
const DB_VERSION = 1;
const BACKUP_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<IeltsPdfNotesDB>> | null = null;

type BackupBookRecord = Omit<BookRecord, "blob"> & {
  blobDataUrl: string;
  blobType: string;
};

export interface AppDataBackup {
  app: "ielts-pdf-notes";
  version: number;
  exportedAt: string;
  data: Omit<AppData, "books"> & {
    books: BackupBookRecord[];
  };
}

interface RestoreBackupOptions {
  replace?: boolean;
}

const BACKUP_STORE_NAMES = ["books", "annotations", "bookmarks", "pageStatuses", "vocabulary", "activities"] as const;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<IeltsPdfNotesDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const books = db.createObjectStore("books", { keyPath: "id" });
        books.createIndex("by-last-opened", "lastOpenedAt");

        const annotations = db.createObjectStore("annotations", { keyPath: "id" });
        annotations.createIndex("by-book-page", ["bookId", "pageNumber"]);

        const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
        bookmarks.createIndex("by-book", "bookId");

        const pageStatuses = db.createObjectStore("pageStatuses", { keyPath: "id" });
        pageStatuses.createIndex("by-book-page", ["bookId", "pageNumber"]);

        const vocabulary = db.createObjectStore("vocabulary", { keyPath: "id" });
        vocabulary.createIndex("by-source", "sourceBookId");
        vocabulary.createIndex("by-status", "status");

        const activities = db.createObjectStore("activities", { keyPath: "id" });
        activities.createIndex("by-date", "createdAt");
      }
    });
  }
  return dbPromise;
}

export async function loadAppData(): Promise<AppData> {
  if (typeof window === "undefined") {
    return emptyAppData();
  }

  const db = await getDb();
  await purgeExpiredDeletedBooks(db);
  const [books, annotations, bookmarks, pageStatuses, vocabulary, activities] = await Promise.all([
    db.getAll("books"),
    db.getAll("annotations"),
    db.getAll("bookmarks"),
    db.getAll("pageStatuses"),
    db.getAll("vocabulary"),
    db.getAll("activities")
  ]);

  return {
    books: books.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    annotations,
    bookmarks,
    pageStatuses,
    vocabulary: vocabulary.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    activities: activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 80)
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read PDF blob."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Could not restore a PDF from backup.");
  }
  return response.blob();
}

function isAppDataBackup(value: unknown): value is AppDataBackup {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppDataBackup>;
  return candidate.app === "ielts-pdf-notes" && typeof candidate.version === "number" && Boolean(candidate.data);
}

export async function createAppDataBackup(): Promise<AppDataBackup> {
  const current = await loadAppData();
  const books = await Promise.all(
    current.books.map(async (book) => {
      const { blob, ...metadata } = book;
      return {
        ...metadata,
        blobDataUrl: await blobToDataUrl(blob),
        blobType: blob.type || "application/pdf"
      };
    })
  );

  const backup: AppDataBackup = {
    app: "ielts-pdf-notes",
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    data: {
      ...current,
      books
    }
  };

  return backup;
}

export function appDataBackupToBlob(backup: AppDataBackup) {
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export async function exportAppDataBackup() {
  return appDataBackupToBlob(await createAppDataBackup());
}

export async function restoreAppDataBackup(backup: unknown, options: RestoreBackupOptions = {}) {
  if (!isAppDataBackup(backup)) {
    throw new Error("This backup is not an IELTS PDF Notes backup.");
  }

  const db = await getDb();
  const restoredBooks = await Promise.all(
    backup.data.books.map(async (book) => {
      const metadata: BookRecord = {
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
        deletedAt: book.deletedAt,
        blob: await dataUrlToBlob(book.blobDataUrl)
      };
      return metadata;
    })
  );

  const tx = db.transaction(BACKUP_STORE_NAMES, "readwrite");
  const replaceOperations = options.replace ? BACKUP_STORE_NAMES.map((storeName) => tx.objectStore(storeName).clear()) : [];
  await Promise.all([
    ...replaceOperations,
    ...restoredBooks.map((book) => tx.objectStore("books").put(book)),
    ...backup.data.annotations.map((annotation) => tx.objectStore("annotations").put(annotation)),
    ...backup.data.bookmarks.map((bookmark) => tx.objectStore("bookmarks").put(bookmark)),
    ...backup.data.pageStatuses.map((status) => tx.objectStore("pageStatuses").put(status)),
    ...backup.data.vocabulary.map((record) => tx.objectStore("vocabulary").put(record)),
    ...backup.data.activities.map((activity) => tx.objectStore("activities").put(activity)),
    tx.done
  ]);

  await addActivity({
    type: "book-restored",
    label: `Imported backup from ${backup.exportedAt.slice(0, 10)}`
  });
}

export async function importAppDataBackup(file: File) {
  await restoreAppDataBackup(JSON.parse(await file.text()));
}

export async function importBook(file: File) {
  const db = await getDb();
  const time = nowIso();
  const book: BookRecord = {
    id: uuid(),
    title: stripPdfExtension(file.name),
    fileName: file.name,
    blob: file,
    size: file.size,
    createdAt: time,
    updatedAt: time,
    lastOpenedAt: time,
    lastPage: 1,
    totalPages: 0,
    zoom: 1.15,
    progress: 0
  };

  await db.put("books", book);
  await addActivity({
    type: "book-opened",
    label: `Imported ${book.title}`
  });
  return book;
}

export async function saveBook(book: BookRecord) {
  const db = await getDb();
  await db.put("books", { ...book, updatedAt: nowIso(), progress: bookProgress(book) });
}

export async function touchBook(book: BookRecord, patch: Partial<BookRecord>) {
  const next = { ...book, ...patch, updatedAt: nowIso(), lastOpenedAt: nowIso() };
  await saveBook(next);
  return next;
}

export async function softDeleteBook(bookId: string) {
  const db = await getDb();
  const book = await db.get("books", bookId);
  if (!book) {
    return null;
  }

  const deletedBook: BookRecord = {
    ...book,
    deletedAt: nowIso(),
    updatedAt: nowIso()
  };

  await db.put("books", deletedBook);
  await addActivity({ type: "book-deleted", label: `Moved ${book.title} to Recently Deleted` });
  return deletedBook;
}

export async function restoreBook(bookId: string) {
  const db = await getDb();
  const book = await db.get("books", bookId);
  if (!book) {
    return null;
  }

  const restoredBook: BookRecord = {
    ...book,
    updatedAt: nowIso(),
    lastOpenedAt: nowIso()
  };
  delete restoredBook.deletedAt;

  await db.put("books", restoredBook);
  await addActivity({ type: "book-restored", label: `Restored ${book.title}` });
  return restoredBook;
}

async function purgeExpiredDeletedBooks(db: IDBPDatabase<IeltsPdfNotesDB>) {
  const books = await db.getAll("books");
  const cutoff = Date.now() - DELETED_BOOK_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const expiredBooks = books.filter((book) => book.deletedAt && new Date(book.deletedAt).getTime() <= cutoff);

  await Promise.all(expiredBooks.map((book) => permanentlyDeleteBook(db, book.id)));
}

async function permanentlyDeleteBook(db: IDBPDatabase<IeltsPdfNotesDB>, bookId: string) {
  const [annotations, bookmarks, pageStatuses, vocabulary] = await Promise.all([
    db.getAll("annotations"),
    db.getAll("bookmarks"),
    db.getAll("pageStatuses"),
    db.getAll("vocabulary")
  ]);

  const tx = db.transaction(["books", "annotations", "bookmarks", "pageStatuses", "vocabulary"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(bookId),
    ...annotations.filter((item) => item.bookId === bookId).map((item) => tx.objectStore("annotations").delete(item.id)),
    ...bookmarks.filter((item) => item.bookId === bookId).map((item) => tx.objectStore("bookmarks").delete(item.id)),
    ...pageStatuses.filter((item) => item.bookId === bookId).map((item) => tx.objectStore("pageStatuses").delete(item.id)),
    ...vocabulary.filter((item) => item.sourceBookId === bookId).map((item) => tx.objectStore("vocabulary").delete(item.id)),
    tx.done
  ]);
}

export async function permanentlyDeleteBooks(bookIds: string[]) {
  const db = await getDb();
  const uniqueBookIds = Array.from(new Set(bookIds));
  const books = await Promise.all(uniqueBookIds.map((bookId) => db.get("books", bookId)));
  const deletedBooks = books.filter((book): book is BookRecord => Boolean(book?.deletedAt));

  await Promise.all(deletedBooks.map((book) => permanentlyDeleteBook(db, book.id)));
  if (deletedBooks.length) {
    await addActivity({
      type: "book-permanently-deleted",
      label: `Permanently deleted ${deletedBooks.length} book${deletedBooks.length === 1 ? "" : "s"}`
    });
  }
}

export async function saveAnnotation(annotation: Annotation) {
  const db = await getDb();
  await db.put("annotations", annotation);
  await addActivity({
    type: annotation.type === "note" ? "note" : "page-status",
    label: annotation.type === "note" ? "Added a sticky note" : "Saved an annotation"
  });
}

export async function deleteAnnotation(id: string) {
  const db = await getDb();
  await db.delete("annotations", id);
}

export async function saveBookmark(bookmark: BookmarkRecord) {
  const db = await getDb();
  await db.put("bookmarks", bookmark);
  await addActivity({ type: "bookmark", label: `Bookmarked page ${bookmark.pageNumber}` });
}

export async function savePageStatus(bookId: string, pageNumber: number, status: PageStatus) {
  const db = await getDb();
  const index = db.transaction("pageStatuses").store.index("by-book-page");
  const existing = await index.get([bookId, pageNumber]);
  const record: PageStatusRecord = {
    id: existing?.id ?? uuid(),
    bookId,
    pageNumber,
    status,
    updatedAt: nowIso()
  };

  await db.put("pageStatuses", record);
  await addActivity({ type: "page-status", label: `Marked page ${pageNumber} as ${status}` });
  return record;
}

export async function saveVocabulary(record: VocabularyRecord) {
  const db = await getDb();
  await db.put("vocabulary", record);
  await addActivity({ type: "vocabulary", label: `Saved vocabulary: ${record.word}` });
}

export async function deleteVocabulary(id: string) {
  const db = await getDb();
  await db.delete("vocabulary", id);
}

export async function addActivity(input: Omit<StudyActivity, "id" | "createdAt">) {
  const db = await getDb();
  await db.put("activities", {
    id: uuid(),
    createdAt: nowIso(),
    ...input
  });
}
