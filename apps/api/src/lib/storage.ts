import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../env.js";

// ---------------------------------------------------------------------------
// Object storage (S3 / Cloudflare R2) for uploaded SOURCE files.
//
// Why: the API and the Worker run as SEPARATE services in prod, each with its
// own local disk. The API writes the upload; the Worker reads it to parse. On
// local disk the Worker can't see the API's file → ENOENT → the upload flips
// to "failed". A shared bucket fixes that (Railway volumes can't span two
// services). When the four S3_* vars are unset we fall back to local disk so
// single-host dev keeps working with no config.
// ---------------------------------------------------------------------------

type S3Config = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

function s3Config(): S3Config | null {
  const {
    S3_BUCKET,
    S3_ENDPOINT,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
    S3_REGION,
  } = env;
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    return null;
  }
  return {
    bucket: S3_BUCKET,
    endpoint: S3_ENDPOINT,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION,
  };
}

let s3Singleton: S3Client | null = null;
function s3Client(cfg: S3Config): S3Client {
  if (!s3Singleton) {
    s3Singleton = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true, // R2 / MinIO friendly
    });
  }
  return s3Singleton;
}

/** True when source files are backed by a bucket rather than local disk. */
export function isObjectStorageEnabled(): boolean {
  return s3Config() !== null;
}

// Object key mirrors the on-disk layout so the two backends are interchangeable:
//   <workspaceId>/sources/<category>/<sourceId><ext>
function sourceObjectKey(workspaceId: string, relPath: string): string {
  if (!UUID_RE.test(workspaceId)) {
    throw new Error(`invalid workspace id: ${workspaceId}`);
  }
  return `${workspaceId}/${relPath}`;
}

// Anchor relative STORAGE_PATH to the monorepo root, not the api process cwd,
// so files land predictably regardless of how the api is launched.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const STORAGE_PATH = isAbsolute(env.STORAGE_PATH)
  ? env.STORAGE_PATH
  : resolve(monorepoRoot, env.STORAGE_PATH);

// Multi-tenant: every file lives under a per-workspace subtree
// (<STORAGE_PATH>/<workspaceId>/sources/...). Workspace IDs are
// UUIDs we generate ourselves, so they're safe to use as path segments.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function workspaceRoot(workspaceId: string): string {
  if (!UUID_RE.test(workspaceId)) {
    throw new Error(`invalid workspace id: ${workspaceId}`);
  }
  return join(STORAGE_PATH, workspaceId);
}

export function workspaceSourcesRoot(workspaceId: string): string {
  return join(workspaceRoot(workspaceId), "sources");
}

export const EXT_TO_CATEGORY: Record<string, string> = {
  ".xlsx": "spreadsheets",
  ".xls": "spreadsheets",
  ".csv": "spreadsheets",
  ".pdf": "documents",
  ".docx": "documents",
  ".doc": "documents",
  ".txt": "documents",
  ".eml": "communications",
  ".msg": "communications",
  ".jpg": "images",
  ".jpeg": "images",
  ".png": "images",
  ".webp": "images",
  ".json": "exports",
};

// Extensions the ingestion pipeline can actually PARSE today — must stay in
// sync with services/ingestion/parse.ts. The upload route gates on this set
// (not the broader EXT_TO_CATEGORY roadmap) so a user can't burn a scarce
// source-quota slot on a file the worker would only fail to process. Still
// missing: .doc/.msg (legacy binary formats) and images (need OCR/vision).
export const SUPPORTED_UPLOAD_EXTS = new Set([
  ".csv",
  ".xlsx",
  ".xls",
  ".pdf",
  ".docx",
  ".txt",
  ".eml",
]);

export function categorize(filename: string): { category: string; ext: string } {
  const ext = extname(filename).toLowerCase();
  return { category: EXT_TO_CATEGORY[ext] ?? "other", ext };
}

// Strip path separators, control chars, and NULL bytes from a user-supplied
// filename before storing it in the DB. Caps length at 255 chars.
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim();
  return cleaned.slice(0, 255) || "unnamed";
}

export async function saveSourceFile(
  workspaceId: string,
  sourceId: string,
  originalFilename: string,
  data: Buffer
): Promise<{ relPath: string; absPath: string; category: string }> {
  const { category, ext } = categorize(originalFilename);
  const safeName = `${sourceId}${ext || ""}`;
  // relPath is workspace-relative — i.e. "sources/<category>/<file>". The
  // workspace prefix (disk root or S3 key prefix) is added back on read.
  const relPath = join("sources", category, safeName);

  const cfg = s3Config();
  if (cfg) {
    const key = sourceObjectKey(workspaceId, relPath);
    await s3Client(cfg).send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: data })
    );
    return { relPath, absPath: `s3://${cfg.bucket}/${key}`, category };
  }

  const dir = join(workspaceSourcesRoot(workspaceId), category);
  await mkdir(dir, { recursive: true });
  const absPath = join(dir, safeName);
  await writeFile(absPath, data);
  return { relPath, absPath, category };
}

// Read an uploaded source file's bytes, from the bucket or local disk. This is
// the read half that the Worker uses to parse — the whole reason object storage
// exists here. Absolute paths (legacy/tests) always read from disk.
export async function readSourceFile(
  workspaceId: string,
  relPath: string
): Promise<Buffer> {
  if (relPath.split("/").some((seg) => seg === "..")) {
    throw new Error(`invalid source path: ${relPath}`);
  }
  const cfg = s3Config();
  if (cfg && !isAbsolute(relPath)) {
    const res = await s3Client(cfg).send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: sourceObjectKey(workspaceId, relPath),
      })
    );
    if (!res.Body) throw new Error(`empty S3 body for ${relPath}`);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
  const abs = isAbsolute(relPath)
    ? relPath
    : join(workspaceRoot(workspaceId), relPath);
  return readFile(abs);
}

export function sourceFilePath(workspaceId: string, relPath: string): string {
  if (relPath.split("/").some((seg) => seg === "..")) {
    throw new Error(`invalid source path: ${relPath}`);
  }
  return join(workspaceRoot(workspaceId), relPath);
}
