import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const cli = resolve(__dirname, "../dist/index.js");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "arinova-smoke-"));
const requests: Array<{
  method?: string;
  path?: string;
  authorization?: string;
  body: string;
}> = [];
let endpoint = "";

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request: IncomingMessage, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const url = new URL(request.url ?? "/", endpoint);
  requests.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    authorization: request.headers.authorization,
    body,
  });
  if (url.pathname === "/api/agent/me") {
    json(response, 404, { error: { code: "NOT_FOUND", message: "not a bot" } });
  } else if (url.pathname === "/api/v1/creator/api-keys/whoami") {
    json(response, 200, { id: "user-1", username: "smoke" });
  } else if (url.pathname === "/api/v1/user/agents") {
    json(response, 200, [{ id: "agent-1", name: "Smoke Agent" }]);
  } else if (
    url.pathname === "/api/v1/calendars" &&
    request.method === "POST"
  ) {
    json(response, 201, { id: "calendar-1", name: "Smoke" });
  } else if (url.pathname === "/api/v1/image-assets/file-1/content") {
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.end(Buffer.from([0, 127, 255, 10]));
  } else if (url.pathname === "/api/v1/agent/chat/stream") {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write('data: {"type":"chunk","content":"hel"}\n\n');
    response.end('data: {"type":"chunk","content":"lo"}\n\ndata: [DONE]\n\n');
  } else {
    json(response, 404, { error: { code: "NOT_FOUND", message: url.pathname } });
  }
});

async function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execute(process.execPath, [
    cli,
    "--token",
    "ari_smoke_secret",
    "--api-url",
    endpoint,
    "--json",
    ...args,
  ], {
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 15_000,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

beforeAll(async () => {
  await new Promise<void>((resolveReady) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test port");
      endpoint = `http://127.0.0.1:${address.port}`;
      resolveReady();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => error ? reject(error) : resolveClosed());
  });
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("CLI fake-server smoke", () => {
  it("executes auth whoami", async () => {
    const result = await run(["auth", "whoami"]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      identityType: "user",
      userName: "smoke",
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain("ari_smoke_secret");
  });

  it("executes a list and create command", async () => {
    expect(JSON.parse((await run(["user", "agents"])).stdout)).toEqual([
      { id: "agent-1", name: "Smoke Agent" },
    ]);
    expect(JSON.parse((await run([
      "--yes", "calendar", "create", "--name", "Smoke",
    ])).stdout)).toMatchObject({ id: "calendar-1" });
  });

  it("downloads binary bytes without writing them to stdout", async () => {
    const output = join(temporaryDirectory, "asset.bin");
    const result = await run([
      "--yes", "image", "asset", "download", "file-1", "--output", output,
    ]);
    expect(result.stdout).toBe("");
    expect(readFileSync(output)).toEqual(Buffer.from([0, 127, 255, 10]));
  });

  it("streams NDJSON through a real subprocess", async () => {
    const result = await run([
      "--yes", "chat", "stream", "--agent-id", "agent-1", "--prompt", "hello",
    ]);
    expect(result.stdout.trim().split("\n").map(JSON.parse)).toEqual([
      { type: "chunk", content: "hel" },
      { type: "chunk", content: "lo" },
    ]);
  });

  it("sends auth and request bodies without leaking the token to output", () => {
    expect(requests.every((request) =>
      request.authorization === "Bearer ari_smoke_secret"
    )).toBe(true);
    expect(JSON.parse(requests.find((request) =>
      request.path === "/api/v1/calendars"
    )?.body ?? "{}")).toEqual({ name: "Smoke" });
  });

  it("fails closed for a non-interactive destructive command without --yes", async () => {
    await expect(execute(process.execPath, [
      cli,
      "--token", "ari_smoke_secret",
      "--api-url", endpoint,
      "--json",
      "calendar", "event", "delete", "event-1",
    ], { timeout: 15_000 })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("CONFIRMATION_REQUIRED"),
    });
    expect(requests.some((request) =>
      request.path === "/api/v1/calendar/events/event-1"
    )).toBe(false);
  });
});
