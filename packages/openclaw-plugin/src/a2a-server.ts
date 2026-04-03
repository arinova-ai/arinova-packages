import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ArinovaChatInboundMessage } from "./types.js";

const DEFAULT_A2A_PORT = 8790;
const DEFAULT_A2A_HOST = "0.0.0.0";
const MAX_BODY_BYTES = 1024 * 1024;
const BODY_TIMEOUT_MS = 30_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("Request body timeout"));
    }, BODY_TIMEOUT_MS);
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        clearTimeout(timer);
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export type A2AServerOptions = {
  port?: number;
  host?: string;
  agentName?: string;
  agentDescription?: string;
  /**
   * Called when an A2A task/sendSubscribe request arrives.
   * The handler must write SSE events to the response and call res.end() when done.
   */
  onTask: (params: {
    message: ArinovaChatInboundMessage;
    res: ServerResponse;
  }) => void | Promise<void>;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
};

/**
 * Parse the A2A JSON-RPC request body.
 * Expected format:
 * {
 *   "jsonrpc": "2.0",
 *   "id": "<messageId>",
 *   "method": "tasks/sendSubscribe",
 *   "params": {
 *     "id": "<taskId>",
 *     "message": {
 *       "role": "user",
 *       "parts": [{ "type": "text", "text": "..." }]
 *     }
 *   }
 * }
 */
function parseA2ARequest(body: string): ArinovaChatInboundMessage | null {
  try {
    const data = JSON.parse(body);
    if (data.jsonrpc !== "2.0") return null;
    if (!data.method?.startsWith("tasks/")) return null;

    const taskId = String(data.params?.id ?? data.id ?? "");
    const parts = data.params?.message?.parts;
    if (!Array.isArray(parts)) return null;

    let text = "";
    for (const part of parts) {
      if (part.type === "text" && typeof part.text === "string") {
        text += part.text;
      }
    }

    if (!text.trim()) return null;

    return {
      taskId,
      text: text.trim(),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Write an A2A SSE event to the response.
 * Format matches what Arinova's client.ts:66-93 expects:
 *   data: {"result":{"id":"<id>","status":{"state":"working|completed","message":{"role":"agent","parts":[{"type":"text","text":"<text>"}]}}}}
 */
export function writeA2ASSEEvent(
  res: ServerResponse,
  taskId: string,
  state: "working" | "completed",
  text: string,
): void {
  const event = {
    result: {
      id: taskId,
      status: {
        state,
        message: {
          role: "agent",
          parts: [{ type: "text", text }],
        },
      },
    },
  };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function createA2AServer(opts: A2AServerOptions): {
  server: Server;
  start: () => Promise<void>;
  stop: () => void;
} {
  const port = opts.port ?? DEFAULT_A2A_PORT;
  const host = opts.host ?? DEFAULT_A2A_HOST;
  const { onTask, onError, abortSignal } = opts;

  const agentCard = {
    name: opts.agentName ?? "OpenClaw Agent",
    description: opts.agentDescription ?? "OpenClaw AI assistant via Arinova Chat",
    url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    version: "1.0.0",
    capabilities: {
      streaming: true,
    },
    skills: [
      {
        id: "chat",
        name: "Chat",
        description: "General conversation and task assistance",
      },
    ],
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    // Agent card
    if (req.url === "/.well-known/agent.json" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agentCard));
      return;
    }

    // A2A task endpoint
    if (req.url === "/tasks/send" && req.method === "POST") {
      try {
        const body = await readBody(req);

        const message = parseA2ARequest(body);
        if (!message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid A2A request" }));
          return;
        }

        // Set up SSE response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        try {
          await onTask({ message, res });
        } catch (err) {
          const errorText = err instanceof Error ? err.message : String(err);
          if (!res.writableEnded) {
            writeA2ASSEEvent(res, message.taskId, "completed", `Error: ${errorText}`);
            res.end();
          }
          onError?.(err instanceof Error ? err : new Error(errorText));
        }
      } catch (err) {
        if (err instanceof Error && err.message === "Payload too large") {
          if (!res.headersSent) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Payload too large" }));
          }
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const start = (): Promise<void> => {
    return new Promise((resolve) => {
      server.listen(port, host, () => resolve());
    });
  };

  const stop = () => {
    server.close();
  };

  if (abortSignal) {
    abortSignal.addEventListener("abort", stop, { once: true });
  }

  return { server, start, stop };
}
