import { NextResponse } from "next/server";
import { auth, verifyToken } from "@clerk/nextjs/server";
import { createSignedDownloadUrl, createSignedUploadUrl, getSupabaseSyncConfig } from "@/lib/supabaseStorageSync";
import type { Annotation, AppData, BookRecord, BookmarkRecord, PageStatusRecord, VocabularyRecord } from "@/lib/types";

export const runtime = "nodejs";

type AccountCollection = "annotations" | "bookmarks" | "pageStatuses" | "vocabulary" | "activities";

type StoredBook = Omit<BookRecord, "blob">;
type StoredActivity = AppData["activities"][number];
type StoredRecord = Annotation | BookmarkRecord | PageStatusRecord | VocabularyRecord | StoredActivity;

const isClerkServerConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const TABLES: Record<AccountCollection, string> = {
  annotations: "account_annotations",
  bookmarks: "account_bookmarks",
  pageStatuses: "account_page_statuses",
  vocabulary: "account_vocabulary",
  activities: "account_activities"
};

function toAccountStoragePrefix(userId: string) {
  return `users/${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function getBookStoragePath(userId: string, bookId: string) {
  return `${toAccountStoragePrefix(userId)}/books/${bookId}.pdf`;
}

async function getAccountUserId(request: Request) {
  if (!isClerkServerConfigured) {
    throw new Error("Account database needs Clerk server keys.");
  }

  try {
    const session = await auth();
    if (session.userId) {
      return session.userId;
    }
  } catch {
    // Fall through to bearer token verification.
  }

  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken && process.env.CLERK_SECRET_KEY) {
    try {
      const payload = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY });
      if (payload.sub) {
        return payload.sub;
      }
    } catch {
      // The response below is clearer for the client.
    }
  }

  throw new Error("Sign in again before using account database.");
}

function getHeaders(prefer?: string) {
  const config = getSupabaseSyncConfig();
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function readSupabaseError(response: Response) {
  const text = await response.text();
  if (!text) {
    return `Supabase request failed with ${response.status}.`;
  }

  try {
    const payload = JSON.parse(text) as { message?: string; error?: string };
    return payload.message || payload.error || text;
  } catch {
    return text;
  }
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const config = getSupabaseSyncConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function userFilter(userId: string) {
  return `user_id=eq.${encodeURIComponent(userId)}`;
}

async function selectRows<T>(userId: string, table: string) {
  return supabaseRest<T[]>(`${table}?${userFilter(userId)}&select=*`, {
    method: "GET",
    headers: getHeaders()
  });
}

async function upsertRows(table: string, rows: unknown[]) {
  if (!rows.length) {
    return;
  }

  await supabaseRest(`${table}?on_conflict=user_id,id`, {
    method: "POST",
    headers: getHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(rows)
  });
}

async function deleteRows(userId: string, table: string, ids: string[]) {
  for (const id of ids) {
    await supabaseRest(`${table}?${userFilter(userId)}&id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getHeaders()
    });
  }
}

function toStoredBookRow(userId: string, book: StoredBook) {
  return {
    user_id: userId,
    id: book.id,
    title: book.title,
    file_name: book.fileName,
    size: book.size,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
    last_opened_at: book.lastOpenedAt,
    last_page: book.lastPage,
    total_pages: book.totalPages,
    zoom: book.zoom,
    progress: book.progress,
    deleted_at: book.deletedAt ?? null,
    storage_path: getBookStoragePath(userId, book.id)
  };
}

function fromStoredBookRow(row: Record<string, unknown>): StoredBook & { storagePath: string } {
  return {
    id: String(row.id),
    title: String(row.title),
    fileName: String(row.file_name),
    size: Number(row.size) || 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: String(row.last_opened_at),
    lastPage: Number(row.last_page) || 1,
    totalPages: Number(row.total_pages) || 0,
    zoom: Number(row.zoom) || 1.15,
    progress: Number(row.progress) || 0,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
    storagePath: String(row.storage_path)
  };
}

function toRecordRow(userId: string, record: StoredRecord) {
  const maybeBookRecord = record as Partial<{ bookId: string; sourceBookId: string; pageNumber: number; updatedAt: string; createdAt: string }>;
  return {
    user_id: userId,
    id: record.id,
    book_id: maybeBookRecord.bookId ?? maybeBookRecord.sourceBookId ?? null,
    page_number: typeof maybeBookRecord.pageNumber === "number" ? maybeBookRecord.pageNumber : null,
    created_at: maybeBookRecord.createdAt ?? new Date().toISOString(),
    updated_at: maybeBookRecord.updatedAt ?? maybeBookRecord.createdAt ?? new Date().toISOString(),
    data: record
  };
}

function fromRecordRow<T>(row: { data?: T }) {
  return row.data as T;
}

async function signedUploadUrls(userId: string, books: StoredBook[], needsUpload: boolean) {
  if (!needsUpload) {
    return [];
  }

  const config = getSupabaseSyncConfig();
  return Promise.all(
    books.map(async (book) => ({
      bookId: book.id,
      fileName: book.fileName,
      uploadUrl: await createSignedUploadUrl(config, getBookStoragePath(userId, book.id))
    }))
  );
}

export async function GET(request: Request) {
  try {
    const userId = await getAccountUserId(request);
    const config = getSupabaseSyncConfig();
    const [bookRows, annotationRows, bookmarkRows, pageStatusRows, vocabularyRows, activityRows] = await Promise.all([
      selectRows<Record<string, unknown>>(userId, "account_books"),
      selectRows<{ data: Annotation }>(userId, TABLES.annotations),
      selectRows<{ data: BookmarkRecord }>(userId, TABLES.bookmarks),
      selectRows<{ data: PageStatusRecord }>(userId, TABLES.pageStatuses),
      selectRows<{ data: VocabularyRecord }>(userId, TABLES.vocabulary),
      selectRows<{ data: StoredActivity }>(userId, TABLES.activities)
    ]);

    const books = await Promise.all(
      bookRows.map(async (row) => {
        const book = fromStoredBookRow(row);
        let downloadUrl: string | null = null;
        try {
          downloadUrl = await createSignedDownloadUrl(config, book.storagePath);
        } catch {
          downloadUrl = null;
        }
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
          deletedAt: book.deletedAt,
          downloadUrl
        };
      })
    );

    return NextResponse.json({
      data: {
        books,
        annotations: annotationRows.map(fromRecordRow),
        bookmarks: bookmarkRows.map(fromRecordRow),
        pageStatuses: pageStatusRows.map(fromRecordRow),
        vocabulary: vocabularyRows.map(fromRecordRow),
        activities: activityRows.map(fromRecordRow)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not load account database." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAccountUserId(request);
    const body = (await request.json()) as {
      operation?: string;
      book?: StoredBook;
      books?: StoredBook[];
      collection?: AccountCollection;
      records?: StoredRecord[];
      ids?: string[];
      annotations?: Annotation[];
      bookmarks?: BookmarkRecord[];
      pageStatuses?: PageStatusRecord[];
      vocabulary?: VocabularyRecord[];
      activities?: StoredActivity[];
      needsUpload?: boolean;
    };

    if (body.operation === "upsertBook" && body.book) {
      await upsertRows("account_books", [toStoredBookRow(userId, body.book)]);
      const uploadUrls = await signedUploadUrls(userId, [body.book], Boolean(body.needsUpload));
      return NextResponse.json({ uploadUrls });
    }

    if (body.operation === "upsertRecords" && body.collection && Array.isArray(body.records)) {
      await upsertRows(TABLES[body.collection], body.records.map((record) => toRecordRow(userId, record)));
      return NextResponse.json({});
    }

    if (body.operation === "deleteRecords" && body.collection && Array.isArray(body.ids)) {
      await deleteRows(userId, TABLES[body.collection], body.ids.map(String));
      return NextResponse.json({});
    }

    if (body.operation === "deleteBooks" && Array.isArray(body.ids)) {
      await deleteRows(userId, "account_books", body.ids.map(String));
      return NextResponse.json({});
    }

    if (body.operation === "upsertData") {
      const books = Array.isArray(body.books) ? body.books : [];
      await Promise.all([
        upsertRows("account_books", books.map((book) => toStoredBookRow(userId, book))),
        upsertRows(TABLES.annotations, (body.annotations ?? []).map((record) => toRecordRow(userId, record))),
        upsertRows(TABLES.bookmarks, (body.bookmarks ?? []).map((record) => toRecordRow(userId, record))),
        upsertRows(TABLES.pageStatuses, (body.pageStatuses ?? []).map((record) => toRecordRow(userId, record))),
        upsertRows(TABLES.vocabulary, (body.vocabulary ?? []).map((record) => toRecordRow(userId, record))),
        upsertRows(TABLES.activities, (body.activities ?? []).map((record) => toRecordRow(userId, record)))
      ]);

      const uploadUrls = await signedUploadUrls(userId, books, Boolean(body.needsUpload));
      return NextResponse.json({ uploadUrls });
    }

    throw new Error("Unsupported account database operation.");
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not save account database." },
      { status: 400 }
    );
  }
}
