import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

async function getStoragePrefix(syncCode?: string) {
  if (isClerkServerConfigured) {
    try {
      const { userId } = await auth();
      if (userId) {
        return `users/${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      }
    } catch {
      // Fall back to manual sync-code mode below.
    }
  }

  return normalizeSyncCode(syncCode);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string; partCount?: number };
    const storagePrefix = await getStoragePrefix(body.syncCode);
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
