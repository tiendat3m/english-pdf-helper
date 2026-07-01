import { NextResponse } from "next/server";
import { createSignedDownloadUrl, getBackupObjectPath, getSupabaseSyncConfig, normalizeSyncCode } from "@/lib/supabaseStorageSync";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string };
    const syncCode = normalizeSyncCode(body.syncCode);
    const config = getSupabaseSyncConfig();
    const signedUrl = await createSignedDownloadUrl(config, getBackupObjectPath(syncCode));

    return NextResponse.json({ signedUrl, expiresIn: 600 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create download URL." },
      { status: 400 }
    );
  }
}
