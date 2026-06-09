import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createA2AServer, writeA2ASSEEvent } from "./a2a-server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function startTestServer(
  options: Partial<Parameters<typeof createA2AServer>[0]> = {},
) {
  const instance = createA2AServer({
    host: "127.0.0.1",
    port: 0,
    onTask: ({ res }) => {
      res.end();
    },
    ...options,
  });
  await instance.start();
  servers.push(instance.server);
  const address = instance.server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not expose a TCP address");
  }
  return {
    ...instance,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function a2aBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: "rpc-1",
    method: "tasks/sendSubscribe",
    params: {
      id: "task-1",
      message: {
        role: "user",
        parts: [
          { type: "text", text: "Hello " },
          { type: "text", text: "agent" },
        ],
      },
    },
    ...overrides,
  });
}

describe("createA2AServer HTTP routes", () => {
  it("serves health and agent card responses", async () => {
    const { baseUrl } = await startTestServer({
      agentName: "Office Agent",
      agentDescription: "Handles office tasks",
    });

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");

    const card = await fetch(`${baseUrl}/.well-known/agent.json`);
    expect(card.status).toBe(200);
    await expect(card.json()).resolves.toMatchObject({
      name: "Office Agent",
      description: "Handles office tasks",
      capabilities: { streaming: true },
      skills: [expect.objectContaining({ id: "chat" })],
    });
  });

  it("parses A2A task requests and streams the onTask response", async () => {
    const onTask = vi.fn(({ message, res }) => {
      writeA2ASSEEvent(res, message.taskId, "working", `Received: ${message.text}`);
      res.end();
    });
    const { baseUrl } = await startTestServer({ onTask });

    const res = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: a2aBody(),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(onTask).toHaveBeenCalledWith({
      message: expect.objectContaining({
        taskId: "task-1",
        text: "Hello agent",
        timestamp: expect.any(Number),
      }),
      res: expect.any(Object),
    });
    expect(await res.text()).toContain('"text":"Received: Hello agent"');
  });

  it("rejects malformed JSON-RPC request bodies", async () => {
    const onTask = vi.fn();
    const { baseUrl } = await startTestServer({ onTask });

    const res = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: "tasks/sendSubscribe" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid A2A request" });
    expect(onTask).not.toHaveBeenCalled();
  });

  it("requires a bearer token when authToken is configured", async () => {
    const onTask = vi.fn(({ res }) => {
      res.end();
    });
    const { baseUrl } = await startTestServer({
      authToken: "secret-token",
      onTask,
    });

    const missing = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: a2aBody(),
    });
    const wrong = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: a2aBody(),
      headers: { Authorization: "Bearer wrong" },
    });
    const ok = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: a2aBody(),
      headers: { Authorization: "Bearer secret-token" },
    });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(ok.status).toBe(200);
    expect(onTask).toHaveBeenCalledTimes(1);
  });

  it("maps onTask failures to completed SSE error events and calls onError", async () => {
    const onError = vi.fn();
    const { baseUrl } = await startTestServer({
      onTask: () => {
        throw new Error("handler failed");
      },
      onError,
    });

    const res = await fetch(`${baseUrl}/tasks/send`, {
      method: "POST",
      body: a2aBody(),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"text":"Error: handler failed"');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "handler failed" }));
  });

  it("returns 404 for unknown routes and handles CORS preflight", async () => {
    const { baseUrl } = await startTestServer();

    const options = await fetch(`${baseUrl}/tasks/send`, { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");

    const missing = await fetch(`${baseUrl}/unknown`);
    expect(missing.status).toBe(404);
  });
});
