import { NextResponse } from "next/server";
import { createSignedUploadUrl, getBackupObjectPath, getSupabaseSyncConfig, normalizeSyncCode } from "@/lib/supabaseStorageSync";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { syncCode?: string };
    const syncCode = normalizeSyncCode(body.syncCode);
    const config = getSupabaseSyncConfig();
    const signedUrl = await createSignedUploadUrl(config, getBackupObjectPath(syncCode));

    return NextResponse.json({ signedUrl, expiresIn: 600 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create upload URL." },
      { status: 400 }
    );
  }
}
