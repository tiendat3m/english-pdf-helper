import { NextResponse } from "next/server";
import { auth, verifyToken } from "@clerk/nextjs/server";
import {
  createSignedDownloadUrl,
  createSignedDownloadUrls,
  getBackupManifestPath,
  getBackupObjectPath,
  getBackupPartPath,
  getSupabaseSyncConfig,
  normalizePartCount,
  normalizeSyncCode
} from "@/lib/supabaseStorageSync";

const isClerkServerConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

type SyncMode = "account" | "fallback";

function toAccountStoragePrefix(userId: string) {
  return `users/${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

async function getStoragePrefix(request: Request, syncCode?: string, syncMode: SyncMode = "account") {
  if (syncMode === "fallback") {
    return normalizeSyncCode(syncCode);
  }

  if (isClerkServerConfigured) {
    try {
      const { userId } = await auth();
      if (userId) {
        return toAccountStoragePrefix(userId);
      }
    } catch {
      // Fall through to bearer token verification.
    }

    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearerToken && process.env.CLERK_SECRET_KEY) {
      try {
        const payload = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY });
        if (payload.sub) {
          return toAccountStoragePrefix(payload.sub);
        }
      } catch {
        // Keep account mode separate from fallback sync-code mode.
      }
    }
  }

  throw new Error("Sign in again before using account cloud.");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string; partCount?: number; syncMode?: SyncMode };
    const storagePrefix = await getStoragePrefix(request, body.syncCode, body.syncMode);
    const config = getSupabaseSyncConfig();

    if (body.partCount !== undefined) {
      const partCount = normalizePartCount(body.partCount);
      const partUrls = await createSignedDownloadUrls(
        config,
        Array.from({ length: partCount }, (_, index) => getBackupPartPath(storagePrefix, index))
      );
      return NextResponse.json({ kind: "parts", partUrls, expiresIn: 600 });
    }

    try {
      const signedUrl = await createSignedDownloadUrl(config, getBackupManifestPath(storagePrefix));
      return NextResponse.json({ kind: "chunked", signedUrl, expiresIn: 600 });
    } catch {
      const signedUrl = await createSignedDownloadUrl(config, getBackupObjectPath(storagePrefix));
      return NextResponse.json({ kind: "legacy", signedUrl, expiresIn: 600 });
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create download URL." },
      { status: 400 }
    );
  }
}
