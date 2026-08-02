import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import {
  atomicWrite,
  codepointCompare,
  domainsFromFeed,
  download,
  entriesEqual,
  isAllowlisted,
  parseAllowlist,
  render,
  selectEntries,
  stableSample,
  validDomain,
} from "../scripts/url-deny-lib.mjs";

let server: Server;
let baseUrl: string;
let flakyRequests = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.end("alpha.example\nzulu.example\n");
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "/ok" }).end();
    } else if (request.url === "/not-found") {
      response.writeHead(404).end("missing");
    } else if (request.url === "/large") {
      response.end("x".repeat(128));
    } else if (request.url === "/slow") {
      setTimeout(() => response.end("late.example"), 100);
    } else if (request.url === "/flaky") {
      flakyRequests += 1;
      if (flakyRequests < 3) response.writeHead(503).end("retry");
      else response.end("recovered.example");
    } else if (request.url === "/insecure-redirect") {
      response.writeHead(302, { location: "http://example.com/feed" }).end();
    } else {
      response.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("URL deny pure helpers", () => {
  it.each([
    ["example.com", true],
    ["sub.example.co.uk", true],
    ["0.0.0.0", false],
    ["192.0.2.1", false],
    ["co.uk", false],
    ["example..com", false],
    ["-bad.example", false],
  ])("validDomain(%s) = %s", (domain, expected) => {
    expect(validDomain(domain)).toBe(expected);
  });

  it("parses TOML literal strings and inline comments without allowing an empty result", () => {
    const body = `[[entries]]\ndomain = 'Example.COM' # trusted\n\n[[entries]]\ndomain = "github.com"\n`;
    expect(parseAllowlist(body, 2)).toEqual(["example.com", "github.com"]);
    expect(() => parseAllowlist("[meta]\nlist_name='empty'\n", 1)).toThrow(/expected at least/);
  });

  it("normalizes feeds and honors parent-domain allowlisting", () => {
    expect(domainsFromFeed("# comment\nGOOD.example\n0.0.0.0\nco.uk\ngood.example\n"))
      .toEqual(["good.example"]);
    expect(isAllowlisted("cdn.github.com", ["github.com"])).toBe(true);
    expect(isAllowlisted("notgithub.com", ["github.com"])).toBe(false);
  });

  it("samples deterministically across the full alphabet and sorts by codepoint", () => {
    const domains = Array.from({ length: 26 }, (_, index) => `${String.fromCharCode(97 + index)}.example`);
    const first = stableSample(domains, 8);
    expect(stableSample([...domains].reverse(), 8)).toEqual(first);
    expect(first.some((domain) => !domain.startsWith("a."))).toBe(true);
    expect(["z", "a", "ä"].sort(codepointCompare)).toEqual(["a", "z", "ä"]);
  });

  it("selects an exact per-source count without duplicates or allowlisted domains", () => {
    const selected = selectEntries([
      { url: "https://one.test", category: "one", body: "a.test\nb.test\nc.test\n" },
      { url: "https://two.test", category: "two", body: "b.test\nd.test\ne.test\n" },
    ], ["c.test"], 2);
    expect(selected).toHaveLength(4);
    expect(new Set(selected.map((entry) => entry.domain)).size).toBe(4);
    expect(selected.some((entry) => entry.domain === "c.test")).toBe(false);
  });

  it("renders a stable, round-trippable TOML snapshot with indexed sources", () => {
    const sources = [{ url: "https://one.test" }, { url: "https://two.test" }];
    const entries = [{ domain: "a.test", category: "scam-host", sourceRef: 1 }];
    const output = render(entries, { version: "1.2.3", date: "2026-08-02", sources });
    const parsed = parseToml(output) as { meta: { version: string; source_refs: string[] }; entries: Array<{ source_ref: number }> };
    expect(parsed.meta).toMatchObject({ version: "1.2.3", source_refs: ["https://one.test", "https://two.test"] });
    expect(parsed.entries[0]?.source_ref).toBe(1);
    expect(output).not.toContain("audit    =");
    expect(render(entries, { version: "1.2.3", date: "2026-08-02", sources })).toBe(output);
    expect(entriesEqual(parsed.entries.map((entry) => ({ ...entry, domain: "a.test", category: "scam-host" })), entries)).toBe(true);
  });

  it("round-trips the shipped generated file byte-for-byte", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", "dict", "url_deny.toml");
    const current = readFileSync(path, "utf8");
    const parsed = parseToml(current) as {
      meta: { version: string; last_updated: string; source_refs: string[] };
      entries: Array<{ domain: string; category: string; source_ref: number }>;
    };
    expect(render(parsed.entries, {
      version: parsed.meta.version,
      date: parsed.meta.last_updated,
      sources: parsed.meta.source_refs.map((url) => ({ url })),
    })).toBe(current);
  });
});

describe("URL deny downloader", () => {
  const local = { allowHttpLocalhost: true, retryDelayMs: 1 };

  it("follows local fixture redirects and rejects insecure production URLs", async () => {
    await expect(download(`${baseUrl}/redirect`, local)).resolves.toContain("alpha.example");
    await expect(download(`${baseUrl}/ok`)).rejects.toThrow(/non-HTTPS/);
    await expect(download(`${baseUrl}/insecure-redirect`, local)).rejects.toThrow(/non-HTTPS/);
  });

  it("reports 404 and response-size failures", async () => {
    await expect(download(`${baseUrl}/not-found`, local)).rejects.toThrow(/HTTP 404/);
    await expect(download(`${baseUrl}/large`, { ...local, maxResponseBytes: 16 })).rejects.toThrow(/exceeded 16 bytes/);
  });

  it("enforces a total timeout and retries transient failures", async () => {
    await expect(download(`${baseUrl}/slow`, { ...local, attempts: 1, timeoutMs: 20 })).rejects.toThrow();
    flakyRequests = 0;
    await expect(download(`${baseUrl}/flaky`, local)).resolves.toContain("recovered.example");
    expect(flakyRequests).toBe(3);
  });

  it("atomically writes, syncs, and leaves no temporary file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arinova-url-deny-"));
    try {
      const output = join(directory, "output.toml");
      await atomicWrite(output, "complete\n");
      await expect(readFile(output, "utf8")).resolves.toBe("complete\n");
      expect(await readdir(directory)).toEqual(["output.toml"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes the temporary file when the final rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arinova-url-deny-failure-"));
    try {
      const targetDirectory = join(directory, "occupied");
      await mkdir(targetDirectory);
      await expect(atomicWrite(targetDirectory, "content")).rejects.toThrow();
      expect((await readdir(directory)).filter((name) => name.includes(".tmp-"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
