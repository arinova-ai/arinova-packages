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
  ".zip": "application/zip",
};

export function mimeTypeForFile(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function createFileBlob(
  filePath: string,
  options: { type?: string; maxBytes?: number } = {},
): Promise<Blob> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("Upload byte limit must be a positive safe integer");
  }
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Upload path is not a regular file: ${filePath}`);
  if (info.size > maxBytes) {
    throw new Error(
      `Upload file is ${info.size} bytes; the safety limit is ${maxBytes} bytes`,
    );
  }
  return openAsBlob(filePath, {
    type: options.type ?? mimeTypeForFile(filePath),
  });
}

export async function appendFileToForm(
  form: FormData,
  fieldName: string,
  filePath: string,
  options: { type?: string; maxBytes?: number } = {},
): Promise<void> {
  form.append(
    fieldName,
    await createFileBlob(filePath, options),
    basename(filePath),
  );
}
