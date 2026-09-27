import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";
import { llmConfig } from "../services/llm/settings.js";

// Uploaded source files live on local disk under STORAGE_PATH. In docker
// compose the API (writes) and the worker (reads) share one volume there.

// Anchor relative STORAGE_PATH to the monorepo root, not the api process cwd,
// so files land predictably regardless of how the api is launched.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const STORAGE_PATH = isAbsolute(env.STORAGE_PATH)
  ? env.STORAGE_PATH
  : resolve(monorepoRoot, env.STORAGE_PATH);

// Files live under a per-workspace subtree
// (<STORAGE_PATH>/<workspaceId>/sources/...). Workspace IDs are UUIDs we
// generate ourselves, so they're safe to use as path segments.

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

// Extensions the ingestion pipeline can ALWAYS parse — must stay in sync with
// services/ingestion/parse.ts. The upload route gates on supportedUploadExts()
// (not the broader EXT_TO_CATEGORY list) so a file the worker could only fail
// to process is refused at upload. Not supported: .doc/.msg (legacy binary).
export const SUPPORTED_UPLOAD_EXTS = new Set([
  ".csv",
  ".xlsx",
  ".xls",
  ".pdf",
  ".docx",
  ".txt",
  ".eml",
]);

// Image formats are parseable ONLY when a vision model is configured (a VLM
// transcribes them — see services/ingestion/parsers/image.ts). Gate them so a
// no-vision instance rejects images at upload instead of failing at ingest.
const IMAGE_UPLOAD_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** True when image ingest is available (a vision OR embeddings key is set). */
export function isImageIngestEnabled(): boolean {
  return Boolean(llmConfig().visionApiKey);
}

/** Extensions accepted at upload right now, given the current configuration. */
export function supportedUploadExts(): Set<string> {
  const exts = new Set(SUPPORTED_UPLOAD_EXTS);
  if (isImageIngestEnabled()) {
    for (const ext of IMAGE_UPLOAD_EXTS) exts.add(ext);
  }
  return exts;
}

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
  // workspace root is added back on read.
  const relPath = join("sources", category, safeName);

  const dir = join(workspaceSourcesRoot(workspaceId), category);
  await mkdir(dir, { recursive: true });
  const absPath = join(dir, safeName);
  await writeFile(absPath, data);
  return { relPath, absPath, category };
}

// Read an uploaded source file's bytes (the worker uses this to parse).
// Absolute paths (tests) are read as-is.
export async function readSourceFile(
  workspaceId: string,
  relPath: string
): Promise<Buffer> {
  if (relPath.split("/").some((seg) => seg === "..")) {
    throw new Error(`invalid source path: ${relPath}`);
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
