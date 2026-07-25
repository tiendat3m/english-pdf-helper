import { NextResponse } from "next/server";
import { auth, verifyToken } from "@clerk/nextjs/server";
import {
  createSignedUploadUrls,
  getBackupManifestPath,
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

      const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (bearerToken && process.env.CLERK_SECRET_KEY) {
        const payload = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY });
        if (payload.sub) {
          return toAccountStoragePrefix(payload.sub);
        }
      }
    } catch {
      // Keep account mode separate from fallback sync-code mode.
    }
  }

  throw new Error("Sign in again before using account cloud.");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string; partCount?: number; syncMode?: SyncMode };
    const storagePrefix = await getStoragePrefix(request, body.syncCode, body.syncMode);
    const partCount = normalizePartCount(body.partCount);
    const config = getSupabaseSyncConfig();
    const paths = [
      ...Array.from({ length: partCount }, (_, index) => getBackupPartPath(storagePrefix, index)),
      getBackupManifestPath(storagePrefix)
    ];
    const signedUrls = await createSignedUploadUrls(config, paths);
    const manifestUrl = signedUrls.pop();
    if (!manifestUrl) {
      throw new Error("Could not create the backup manifest upload URL.");
    }

    return NextResponse.json({ partUrls: signedUrls, manifestUrl, expiresIn: 600 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create upload URL." },
      { status: 400 }
    );
  }
}
