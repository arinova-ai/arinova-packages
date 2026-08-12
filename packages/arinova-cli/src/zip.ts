import { deflateRawSync } from "node:zlib";

// Minimal, dependency-free ZIP writer. Produces a standard archive the
// server's `zip` crate reads directly, so builds work on every platform
// without a system `zip` binary.

export interface ZipEntry {
  /** Entry name, e.g. "theme.js" or (when enabled) "assets/icon.svg". */
  name: string;
  data: Buffer;
}

export interface CreateZipOptions {
  /** Theme archives are flat; managed Space archives may contain directories. */
  allowNested?: boolean;
  /** Default is STORED for backwards compatibility with theme bundles. */
  compression?: "stored" | "deflate";
}

export function isSafeZipEntryName(name: string): boolean {
  return Boolean(
    name &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0"),
  );
}

export function isSafeNestedZipEntryName(name: string): boolean {
  return Boolean(
    name &&
    Buffer.byteLength(name, "utf8") <= 512 &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !name.includes(":") &&
    name.split("/").every((segment) =>
      Boolean(
        segment &&
        segment !== "." &&
        segment !== ".." &&
        Buffer.byteLength(segment, "utf8") <= 255,
      )
    ),
  );
}

const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a deterministic ZIP archive (STORED unless deflate is requested). */
export function createZip(entries: ZipEntry[], options: CreateZipOptions = {}): Buffer {
  if (entries.length > 0xffff) throw new Error("ZIP64 is required for more than 65535 entries");
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // Fixed DOS timestamp (1980-01-01 00:00:00) for reproducible output.
  const dosTime = 0;
  const dosDate = 0x21;

  for (const entry of entries) {
    const safeName = options.allowNested
      ? isSafeNestedZipEntryName(entry.name)
      : isSafeZipEntryName(entry.name);
    if (!safeName) {
      throw new Error(`Unsafe ZIP entry name: ${JSON.stringify(entry.name)}`);
    }
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const size = entry.data.length;
    const compressed = options.compression === "deflate"
      ? deflateRawSync(entry.data, { level: 9 })
      : entry.data;
    const compressedSize = compressed.length;
    const method = options.compression === "deflate" ? 8 : 0;
    if (nameBuf.length > 0xffff) throw new Error(`ZIP entry name is too long: ${entry.name.slice(0, 80)}`);
    if (size > 0xffffffff) throw new Error(`ZIP64 is required for files larger than 4 GiB: ${entry.name}`);
    if (compressedSize > 0xffffffff) throw new Error(`ZIP64 is required for compressed files larger than 4 GiB: ${entry.name}`);
    if (offset > 0xffffffff) throw new Error("ZIP64 is required for archives larger than 4 GiB");
    const crc = crc32(entry.data);
    const flags = 0x0800; // Entry names are encoded as UTF-8.

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    chunks.push(local, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central dir signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset
    central.push(centralHeader, nameBuf);

    offset += local.length + nameBuf.length + compressedSize;
  }

  const centralBuf = Buffer.concat(central);
  const centralSize = centralBuf.length;
  const centralOffset = offset;
  if (centralSize > 0xffffffff || centralOffset > 0xffffffff) {
    throw new Error("ZIP64 is required for archives larger than 4 GiB");
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, centralBuf, eocd]);
}
