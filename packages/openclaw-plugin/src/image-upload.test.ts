import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceImagePaths } from "./image-upload.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "openclaw-image-upload-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("replaceImagePaths", () => {
  it("uploads existing relative image paths and replaces every occurrence", async () => {
    const workDir = await makeTempDir();
    await mkdir(join(workDir, "images"));
    await writeFile(join(workDir, "images", "diagram.png"), new Uint8Array([1, 2, 3]));
    const upload = vi.fn().mockResolvedValue({ url: "https://cdn.test/diagram.png" });

    const result = await replaceImagePaths(
      "See images/diagram.png and images/diagram.png",
      workDir,
      upload,
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "diagram.png",
      "image/png",
    );
    expect(result).toBe("See https://cdn.test/diagram.png and https://cdn.test/diagram.png");
  });

  it("resolves nested paths, infers MIME type, and leaves missing files unchanged", async () => {
    const workDir = await makeTempDir();
    await mkdir(join(workDir, "assets"));
    await writeFile(join(workDir, "assets", "photo.webp"), new Uint8Array([9]));
    const upload = vi.fn().mockResolvedValue({ url: "https://cdn.test/photo.webp" });

    const result = await replaceImagePaths(
      "assets/photo.webp missing/file.png",
      workDir,
      upload,
    );

    expect(upload).toHaveBeenCalledWith(
      new Uint8Array([9]),
      "photo.webp",
      "image/webp",
    );
    expect(result).toBe("https://cdn.test/photo.webp missing/file.png");
  });

  it("keeps original text when upload fails and logs the failure", async () => {
    const workDir = await makeTempDir();
    await mkdir(join(workDir, "images"));
    await writeFile(join(workDir, "images", "broken.jpg"), new Uint8Array([4]));
    const upload = vi.fn().mockRejectedValue(new Error("boom"));
    const log = vi.fn();

    const result = await replaceImagePaths("images/broken.jpg", workDir, upload, log);

    expect(result).toBe("images/broken.jpg");
    expect(log.mock.calls.some(([msg]: unknown[]) => String(msg).includes("failed"))).toBe(true);
  });

  it("returns text unchanged when no image paths are present", async () => {
    const upload = vi.fn();

    await expect(replaceImagePaths("plain text", "/tmp", upload)).resolves.toBe("plain text");
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects absolute, traversal, and escaping symlink paths", async () => {
    const workDir = await makeTempDir();
    const outsideDir = await makeTempDir();
    await writeFile(join(outsideDir, "secret.png"), new Uint8Array([7]));
    await symlink(join(outsideDir, "secret.png"), join(workDir, "linked.png"));
    const upload = vi.fn();

    const text = [
      join(outsideDir, "secret.png"),
      "../secret.png",
      "linked.png",
    ].join(" ");
    await expect(replaceImagePaths(text, workDir, upload)).resolves.toBe(text);
    expect(upload).not.toHaveBeenCalled();
  });

  it("caps each output batch and uploads sequentially", async () => {
    const workDir = await makeTempDir();
    await mkdir(join(workDir, "images"));
    for (let index = 0; index < 10; index++) {
      await writeFile(join(workDir, "images", `image-${index}.png`), new Uint8Array([index]));
    }
    let active = 0;
    let maxActive = 0;
    const upload = vi.fn(async (_data: Uint8Array, fileName: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { url: `https://cdn.test/${fileName}` };
    });
    const text = Array.from({ length: 10 }, (_, index) => `images/image-${index}.png`).join(" ");

    const result = await replaceImagePaths(text, workDir, upload);

    expect(upload).toHaveBeenCalledTimes(8);
    expect(maxActive).toBe(1);
    expect(result).toContain("https://cdn.test/image-7.png");
    expect(result).toContain("images/image-8.png");
  });
});
