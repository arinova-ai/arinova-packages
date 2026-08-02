import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp)$/i;
const MAX_IMAGE_UPLOADS = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Match image file paths in text.
 * Handles absolute (/Users/.../foo.png) and relative (imagen/foo.png) paths.
 */
const PATH_RE = /(?:(?:\/[\w.@~ -]+)+|(?:[\w.-]+\/)+[\w.-]+)\.(?:png|jpe?g|gif|webp)\b/gi;

function sniffImageType(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  const signature = data.subarray(0, 6).toString("ascii");
  if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

/** Upload function signature matching agent SDK's uploadFile. */
export type UploadFn = (
  file: Uint8Array,
  fileName: string,
  fileType?: string,
) => Promise<{ url: string }>;

async function resolveContainedImage(workDir: string, rawPath: string): Promise<string | null> {
  try {
    const root = await realpath(workDir);
    const candidate = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
    const resolved = await realpath(candidate);
    const rel = relative(root, resolved);
    if (!rel || rel.startsWith("..") || isAbsolute(rel) || !IMAGE_EXT.test(resolved)) {
      return null;
    }
    const stat = await lstat(candidate);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null;
    return resolved;
  } catch {
    return null;
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

  const unique = [...new Set(matches)].slice(0, MAX_IMAGE_UPLOADS);

  const results: Array<{ rawPath: string; url: string } | null> = [];
  for (const rawPath of unique) {
      const absPath = await resolveContainedImage(workDir, rawPath);
      if (!absPath) {
        results.push(null);
        continue;
      }
      try {
        log?.(`image-upload: uploading ${absPath}`);
        const data = await readFile(absPath);
        const fileName = basename(absPath);
        const fileType = sniffImageType(data);
        if (!fileType) throw new Error("unsupported image content");
        const result = await uploadFn(new Uint8Array(data), fileName, fileType);
        log?.(`image-upload: → ${result.url}`);
        results.push({ rawPath, url: result.url });
      } catch (err) {
        log?.(`image-upload: failed for ${absPath}: ${err}`);
        results.push(null);
      }
  }

  const replacements = results
    .filter((item): item is { rawPath: string; url: string } => item !== null)
    .sort((a, b) => b.rawPath.length - a.rawPath.length);
  if (!replacements.length) return text;

  const urls = new Map(replacements.map(({ rawPath, url }) => [rawPath, url]));
  const pattern = replacements
    .map(({ rawPath }) => rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.replace(new RegExp(pattern, "g"), (rawPath) => urls.get(rawPath) ?? rawPath);
}
