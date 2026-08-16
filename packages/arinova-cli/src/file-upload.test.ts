import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileBlob } from "./file-upload.js";

describe("file-backed uploads", () => {
  it("preserves file bytes and MIME type without buffering the file first", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arinova-file-blob-"));
    const filePath = join(directory, "asset.png");
    writeFileSync(filePath, new Uint8Array([137, 80, 78, 71]));
    try {
      const blob = await createFileBlob(filePath);
      expect(blob.type).toBe("image/png");
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
        new Uint8Array([137, 80, 78, 71]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a file that exceeds the configured upload cap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arinova-file-cap-"));
    const filePath = join(directory, "large.bin");
    writeFileSync(filePath, new Uint8Array([1, 2, 3, 4]));
    try {
      await expect(createFileBlob(filePath, { maxBytes: 3 })).rejects.toThrow(
        "safety limit is 3 bytes",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
