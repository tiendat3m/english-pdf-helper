import { NextResponse } from "next/server";
import {
  createSignedUploadUrls,
  getBackupManifestPath,
  getBackupPartPath,
  getSupabaseSyncConfig,
  normalizePartCount,
  normalizeSyncCode
} from "@/lib/supabaseStorageSync";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string; partCount?: number };
    const syncCode = normalizeSyncCode(body.syncCode);
    const partCount = normalizePartCount(body.partCount);
    const config = getSupabaseSyncConfig();
    const paths = [
      ...Array.from({ length: partCount }, (_, index) => getBackupPartPath(syncCode, index)),
      getBackupManifestPath(syncCode)
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
