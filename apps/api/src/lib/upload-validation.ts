import { fileTypeFromBuffer } from "file-type";

// Shared content validation for every path that accepts user files (HTTP
// upload, email-in attachments). Rejects when the buffer's magic bytes
// contradict the filename extension — closes the loop on allowlist bypasses
// (e.g., renaming .exe → .pdf).

// Mapping from extension to the MIME types we trust file-type to detect.
// CSV / TXT / EML have no magic bytes — file-type returns undefined for
// them and we fall back to extension-only checking (safe: those are plain
// text, not executable).
export const EXT_TO_TRUSTED_MIMES: Record<string, string[]> = {
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", // older xlsx detected as raw zip
  ],
  ".xls": ["application/vnd.ms-excel", "application/x-cfb"],
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  ".doc": ["application/msword", "application/x-cfb"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".msg": ["application/vnd.ms-outlook", "application/x-cfb"],
};

// True when the extension has no reliable magic-byte signature. We accept
// these on filename trust alone (they're plain text — no exec risk).
export function isTextLikeExt(ext: string): boolean {
  return ext === ".csv" || ext === ".txt" || ext === ".eml" || ext === ".json";
}

/** Magic-byte check. ok=true when the content is plausible for the extension. */
export async function validateUploadContent(
  ext: string,
  buffer: Buffer
): Promise<{ ok: boolean; detected: string | null }> {
  if (isTextLikeExt(ext)) return { ok: true, detected: null };
  const detected = await fileTypeFromBuffer(buffer);
  const trusted = EXT_TO_TRUSTED_MIMES[ext] ?? [];
  if (!detected || !trusted.includes(detected.mime)) {
    return { ok: false, detected: detected?.mime ?? null };
  }
  return { ok: true, detected: detected.mime };
}
