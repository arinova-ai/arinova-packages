import { spawn } from "node:child_process";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = resolve(__dirname, "../dist/index.js");
const TOKEN = "test-token-not-validated";

interface CapturedRequest {
  pathname: string;
  query: Record<string, string>;
}

interface MockServer {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

/**
 * Start a mock HTTP server that scripts responses for /api/v1/kanban/cards.
 * Each call to /api/v1/kanban/cards consumes one entry from `pages`.
 * If pages run out, returns 200 [] (server-style empty page).
 */
async function startMockServer(pages: unknown[][]): Promise<MockServer> {
  const requests: CapturedRequest[] = [];
  let pageIdx = 0;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    requests.push({ pathname: u.pathname, query });

    if (u.pathname === "/api/v1/kanban/cards" && req.method === "GET") {
      const body = pageIdx < pages.length ? pages[pageIdx] : [];
      pageIdx += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  };

  const server: Server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("mock server failed to bind");
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    requests,
    close: () =>
      new Promise<void>((res, rej) =>
        server.close((err) => (err ? rej(err) : res())),
      ),
  };
}

/**
 * Spawn the CLI as a child process. Async so the parent event loop stays free
 * to handle requests against the in-process mock server (execSync would block).
 */
function runCli(apiUrl: string, args: string[]): Promise<{ stdout: string; stderr: string; status: number }> {
  return new Promise((resolveP) => {
    const child = spawn(
      "node",
      [CLI, "--token", TOKEN, "--api-url", apiUrl, "--json", ...args],
      { env: { ...process.env, NODE_NO_WARNINGS: "1" } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf-8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf-8");
    });
    child.on("close", (code) => {
      resolveP({ stdout, stderr, status: code ?? 1 });
    });
  });
}

function makeCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    columnId: "11111111-1111-1111-1111-111111111111",
    columnName: "Backlog",
    title: "card",
    description: null,
    priority: null,
    dueDate: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    labels: [],
    ...overrides,
  };
}

function fillerCards(n: number, idPrefix = "ffffffff"): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({
      id: `${idPrefix}-${String(i).padStart(4, "0")}-0000-0000-000000000000`,
      title: `filler-${i}`,
    }),
  );
}

describe("kanban card list — mocked server", () => {
  let server: MockServer | null = null;

  beforeEach(() => {
    server = null;
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  it("numeric-looking search remains a bounded server-side query", async () => {
    server = await startMockServer([
      [
        makeCard({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "card with 1234 in title" }),
      ],
    ]);

    const result = await runCli(server.url, ["kanban", "card", "list", "--search", "1234"]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as Array<{ id: string; title: string }>;
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("card with 1234 in title");

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].query.search).toBe("1234");
    expect(server.requests[0].query.limit).toBe("50");
  });

  it("hex-looking words do not trigger an implicit full-table scan", async () => {
    server = await startMockServer([
      [makeCard({ id: "deadbeef-1234-5678-9abc-def012345678", title: "target" })],
    ]);

    const result = await runCli(server.url, ["kanban", "card", "list", "--search", "deadbeef"]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as Array<{ id: string }>;
    expect(out).toHaveLength(1);
    expect(out[0].id.startsWith("deadbeef")).toBe(true);

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].query.search).toBe("deadbeef");
    expect(server.requests[0].query.offset).toBe("0");
  });

  // Casey REQUEST_CHANGES test 3
  it("--all stops cleanly when total is exact multiple of 100 (extra empty page)", async () => {
    server = await startMockServer([
      fillerCards(100), // page 1: full
      [], // page 2: empty → terminate
    ]);

    const result = await runCli(server.url, ["kanban", "card", "list", "--all"]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as unknown[];
    expect(out).toHaveLength(100);

    // Must probe one extra page after a full page to detect end-of-list.
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].query.offset).toBe("0");
    expect(server.requests[1].query.offset).toBe("100");
  });

  // Casey REQUEST_CHANGES test 4
  it("non-hex search hits server search once, no full scan", async () => {
    server = await startMockServer([
      [
        makeCard({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "kanban-related" }),
        makeCard({ id: "bbbbbbbb-0000-0000-0000-000000000002", title: "kanban tools" }),
      ],
    ]);

    const result = await runCli(server.url, ["kanban", "card", "list", "--search", "kanban"]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout) as unknown[];
    expect(out).toHaveLength(2);

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].query.search).toBe("kanban");
    expect(server.requests[0].query.offset).toBe("0");
    expect(server.requests[0].query.limit).toBe("50");
  });
});
