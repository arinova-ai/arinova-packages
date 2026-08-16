import { describe, expect, it } from "vitest";
import { createZip, isSafeNestedZipEntryName, isSafeZipEntryName } from "./zip.js";

describe("ZIP safety", () => {
  it.each(["../evil", "a/b", "a\\b", "bad\0name", ".", ".."]) (
    "rejects unsafe entry name %j",
    (name) => expect(isSafeZipEntryName(name)).toBe(false),
  );

  it("accepts a flat Unicode entry and writes a ZIP", () => {
    expect(isSafeZipEntryName("預覽.png")).toBe(true);
    const archive = createZip([{ name: "預覽.png", data: Buffer.from("png") }]);
    expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(archive.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });

  it("allows safe nested Space entries only when explicitly enabled", () => {
    expect(isSafeNestedZipEntryName("assets/icons/play.svg")).toBe(true);
    for (const name of ["../evil", "/absolute", "a//b", "a/./b", "a/../b", "a\\b", "C:/x"]) {
      expect(isSafeNestedZipEntryName(name)).toBe(false);
    }
    expect(() => createZip([{ name: "assets/app.js", data: Buffer.from("js") }]))
      .toThrow(/Unsafe ZIP entry/);
    expect(createZip(
      [{ name: "assets/app.js", data: Buffer.from("js") }],
      { allowNested: true },
    ).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("fails clearly when ZIP32 entry and size bounds are exceeded", () => {
    const entry = { name: "x", data: Buffer.alloc(0) };
    expect(() => createZip(Array.from({ length: 65_536 }, () => entry)))
      .toThrow("more than 65535 entries");
    const oversized = { length: 0x1_0000_0000 } as Buffer;
    expect(() => createZip([{ name: "large.bin", data: oversized }]))
      .toThrow("files larger than 4 GiB");
  });
});
