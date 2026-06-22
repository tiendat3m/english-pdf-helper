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

let dbPromise: Promise<IDBPDatabase<IeltsPdfNotesDB>> | null = null;

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
