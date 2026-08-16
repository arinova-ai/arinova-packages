import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

export async function openUploadFile(
  filePath: string,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<{ blob: Blob; fileName: string }> {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Upload path is not a regular file: ${filePath}`);
  if (info.size > maxBytes) {
    throw new Error(
      `Upload file is ${info.size} bytes; the safety limit is ${maxBytes} bytes`,
    );
  }
  const type = MIME_TYPES[extname(filePath).toLowerCase()]
    ?? "application/octet-stream";
  return {
    blob: await openAsBlob(filePath, { type }),
    fileName: basename(filePath),
  };
}
