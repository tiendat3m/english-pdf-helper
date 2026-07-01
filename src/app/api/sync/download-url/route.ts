import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string; partCount?: number };
    const syncCode = normalizeSyncCode(body.syncCode);
    const config = getSupabaseSyncConfig();

    if (body.partCount !== undefined) {
      const partCount = normalizePartCount(body.partCount);
      const partUrls = await createSignedDownloadUrls(
        config,
        Array.from({ length: partCount }, (_, index) => getBackupPartPath(syncCode, index))
      );
      return NextResponse.json({ kind: "parts", partUrls, expiresIn: 600 });
    }

    try {
      const signedUrl = await createSignedDownloadUrl(config, getBackupManifestPath(syncCode));
      return NextResponse.json({ kind: "chunked", signedUrl, expiresIn: 600 });
    } catch {
      const signedUrl = await createSignedDownloadUrl(config, getBackupObjectPath(syncCode));
      return NextResponse.json({ kind: "legacy", signedUrl, expiresIn: 600 });
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create download URL." },
      { status: 400 }
    );
  }
}
