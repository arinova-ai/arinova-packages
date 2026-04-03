import { readFile, access } from "node:fs/promises";
import { basename, resolve, isAbsolute } from "node:path";

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp)$/i;

/**
 * Match image file paths in text.
 * Handles absolute (/Users/.../foo.png) and relative (imagen/foo.png) paths.
 */
const PATH_RE = /(?:(?:\/[\w.@~ -]+)+|(?:[\w.-]+\/)+[\w.-]+)\.(?:png|jpe?g|gif|webp)\b/gi;

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/** Upload function signature matching agent SDK's uploadFile. */
export type UploadFn = (
  file: Uint8Array,
  fileName: string,
  fileType?: string,
) => Promise<{ url: string }>;

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan text for local image file paths, upload each via the provided
 * upload function (R2 storage), and replace the path with the public URL.
 */
export async function replaceImagePaths(
  text: string,
  workDir: string,
  uploadFn: UploadFn,
  log?: (msg: string) => void,
): Promise<string> {
  const matches = text.match(PATH_RE);
  if (!matches) return text;

  const unique = [...new Set(matches)];

  const results = await Promise.all(
    unique.map(async (rawPath) => {
      const absPath = isAbsolute(rawPath) ? rawPath : resolve(workDir, rawPath);
      if (!IMAGE_EXT.test(absPath) || !(await fileExists(absPath))) return null;

      try {
        log?.(`image-upload: uploading ${absPath}`);
        const data = await readFile(absPath);
        const fileName = basename(absPath);
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
        const fileType = MIME_TYPES[ext] ?? "application/octet-stream";
        const result = await uploadFn(new Uint8Array(data), fileName, fileType);
        log?.(`image-upload: → ${result.url}`);
        return { rawPath, url: result.url };
      } catch (err) {
        log?.(`image-upload: failed for ${absPath}: ${err}`);
        return null;
      }
    }),
  );

  let out = text;
  for (const r of results) {
    if (r) out = out.split(r.rawPath).join(r.url);
  }
  return out;
}
