const DEFAULT_SYNC_BUCKET = "ielts-sync";
const MAX_SYNC_PARTS = 500;

interface SupabaseSyncConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

export function getSupabaseSyncConfig(): SupabaseSyncConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_SYNC_BUCKET || DEFAULT_SYNC_BUCKET;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase sync is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { url, serviceRoleKey, bucket };
}

export function normalizeSyncCode(syncCode: unknown) {
  if (typeof syncCode !== "string") {
    throw new Error("Enter a sync code first.");
  }

  const trimmed = syncCode.trim();
  if (trimmed.length < 6) {
    throw new Error("Sync code must be at least 6 characters.");
  }
  if (trimmed.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error("Sync code can only use letters, numbers, dots, dashes, and underscores.");
  }

  return trimmed;
}

export function getBackupObjectPath(syncCode: string) {
  return `${syncCode}/backup.json`;
}

export function getBackupManifestPath(syncCode: string) {
  return `${syncCode}/manifest.json`;
}

export function getBackupPartPath(syncCode: string, partIndex: number) {
  return `${syncCode}/parts/${String(partIndex).padStart(4, "0")}.part`;
}

export function normalizePartCount(partCount: unknown) {
  if (!Number.isInteger(partCount) || Number(partCount) < 1 || Number(partCount) > MAX_SYNC_PARTS) {
    throw new Error(`Backup must contain between 1 and ${MAX_SYNC_PARTS} parts.`);
  }
  return Number(partCount);
}

export function toAbsoluteStorageUrl(baseUrl: string, signedPath: string) {
  if (signedPath.startsWith("http://") || signedPath.startsWith("https://")) {
    return signedPath;
  }
  return `${baseUrl}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`;
}

export function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function getHeaders(config: SupabaseSyncConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function fetchSupabase(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(15_000)
  });
}

async function readSupabaseError(response: Response) {
  const text = await response.text();
  if (!text) {
    return `Supabase request failed with ${response.status}.`;
  }

  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text;
  }
}

export async function ensureSyncBucket(config: SupabaseSyncConfig) {
  const response = await fetchSupabase(`${config.url}/storage/v1/bucket`, {
    headers: getHeaders(config),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const buckets = (await response.json()) as Array<{ id?: string; name?: string }>;
  const exists = buckets.some((bucket) => bucket.id === config.bucket || bucket.name === config.bucket);
  if (exists) return;

  const created = await fetchSupabase(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: getHeaders(config),
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: false
    })
  });

  if (!created.ok && created.status !== 409) {
    throw new Error(await readSupabaseError(created));
  }
}

async function signUploadUrl(config: SupabaseSyncConfig, objectPath: string) {
  const response = await fetchSupabase(
    `${config.url}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`,
    {
      method: "POST",
      headers: {
        ...getHeaders(config),
        "x-upsert": "true"
      },
      body: JSON.stringify({})
    }
  );

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const payload = (await response.json()) as { url?: string; signedURL?: string; signedUrl?: string };
  const signedPath = payload.url || payload.signedURL || payload.signedUrl;
  if (!signedPath) {
    throw new Error("Supabase did not return a signed upload URL.");
  }

  return toAbsoluteStorageUrl(config.url, signedPath);
}

async function signDownloadUrl(config: SupabaseSyncConfig, objectPath: string) {
  const response = await fetchSupabase(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`,
    {
      method: "POST",
      headers: getHeaders(config),
      body: JSON.stringify({ expiresIn: 600 })
    }
  );

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const payload = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const signedPath = payload.signedURL || payload.signedUrl;
  if (!signedPath) {
    throw new Error("No cloud backup found for this sync code.");
  }

  return toAbsoluteStorageUrl(config.url, signedPath);
}

export async function createSignedUploadUrl(config: SupabaseSyncConfig, objectPath: string) {
  await ensureSyncBucket(config);
  return signUploadUrl(config, objectPath);
}

export async function createSignedUploadUrls(config: SupabaseSyncConfig, objectPaths: string[]) {
  await ensureSyncBucket(config);
  return Promise.all(objectPaths.map((objectPath) => signUploadUrl(config, objectPath)));
}

export async function createSignedDownloadUrl(config: SupabaseSyncConfig, objectPath: string) {
  await ensureSyncBucket(config);
  return signDownloadUrl(config, objectPath);
}

export async function createSignedDownloadUrls(config: SupabaseSyncConfig, objectPaths: string[]) {
  await ensureSyncBucket(config);
  return Promise.all(objectPaths.map((objectPath) => signDownloadUrl(config, objectPath)));
}
