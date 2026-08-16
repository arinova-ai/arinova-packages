import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openUploadFile } from "./file-upload.js";

describe("CLI file uploads", () => {
  it("uses a file-backed Blob and enforces the upload cap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "openclaw-upload-"));
    const filePath = join(directory, "note.txt");
    writeFileSync(filePath, "hello");
    try {
      const upload = await openUploadFile(filePath);
      expect(upload.fileName).toBe("note.txt");
      expect(upload.blob.type).toBe("text/plain");
      await expect(openUploadFile(filePath, 4)).rejects.toThrow(
        "safety limit is 4 bytes",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
