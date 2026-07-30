import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";

function encodeFrame(text) {
  const payload = Buffer.from(text);
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  if (payload.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  throw new Error("test frame too large");
}

function decodeFrames(buffer) {
  const messages = [];
  let closeFrames = 0;
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      throw new Error("64-bit websocket frames are not supported in this smoke test");
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;
    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    if (opcode === 0x1) messages.push(payload.toString("utf8"));
    if (opcode === 0x8) closeFrames += 1;
    offset += frameLength;
  }
  return { messages, closeFrames, rest: buffer.subarray(offset) };
}

export class FakeArinovaServer {
  constructor() {
    this.messages = [];
    this.httpRequests = [];
    this.socket = null;
    this.autoPong = true;
    this.buffer = Buffer.alloc(0);
    this.server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, "http://127.0.0.1");
      this.httpRequests.push({
        method: req.method,
        path: url.pathname,
        search: url.search,
        contentType: req.headers["content-type"] || "",
        body
      });

      if (url.pathname === "/api/v1/messages/conv-1") {
        if (url.search === "") {
          return this.json(res, 200, { messages: [], hasMore: false });
        }
        if (url.searchParams.get("before") === "duplicate-json") {
          return this.rawJson(res, 200, '{"messages":[],"messages":[{"id":"dupe"}],"hasMore":false}');
        }
        assert.equal(url.searchParams.get("limit"), "1");
        return this.json(res, 200, {
          messages: [
            {
              id: "hist-1",
              conversationId: "conv-1",
              seq: 1,
              role: "user",
              content: "history",
              status: "sent",
              senderAgentId: "agent-helper",
              senderAgentName: "Helper",
              senderUserId: "user-1",
              senderUsername: "User",
              replyToId: "reply-1",
              threadId: "thread-1",
              createdAt: "2026-06-29T01:00:00.000Z",
              updatedAt: "2026-06-29T01:00:01.000Z",
              attachments: [
                {
                  id: "hist-att-1",
                  fileName: "history.txt",
                  fileType: "text/plain",
                  fileSize: 5,
                  url: "https://files.example/history.txt"
                }
              ]
            }
          ],
          hasMore: true,
          nextCursor: "hist-1"
        });
      }
      if (url.pathname === "/api/v1/files/upload") {
        assert.match(String(req.headers["content-type"]), /multipart\/form-data/);
        if (body.toString("latin1").includes("duplicate-json.bin")) {
          return this.rawJson(res, 200, '{"url":"https://file/a","url":"https://file/b","fileName":"duplicate-json.bin","fileType":"application/octet-stream","fileSize":2}');
        }
        assert.match(body.toString("latin1"), /task\.txt/);
        return this.json(res, 200, { url: "https://file/task.txt", fileName: "task.txt", fileType: "text/plain", fileSize: 2 });
      }

      this.json(res, 404, { error: `unhandled ${req.method} ${url.pathname}` });
    });
    this.server.on("upgrade", (req, socket) => {
      assert.equal(req.url, "/ws/agent");
      const key = req.headers["sec-websocket-key"];
      const accept = crypto
        .createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      this.socket = socket;
      socket.on("data", (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const decoded = decodeFrames(this.buffer);
        this.buffer = decoded.rest;
        for (const message of decoded.messages) {
          const parsed = JSON.parse(message);
          if (parsed.type === "agent_auth" || parsed.type === "ping") {
            this.socket = socket;
          }
          this.messages.push(parsed);
          if (parsed.type === "ping" && this.autoPong) {
            this.send({ type: "pong" });
          }
        }
        if (decoded.closeFrames > 0) {
          socket.destroy();
        }
      });
    });
  }

  json(res, status, body) {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": String(payload.length)
    });
    res.end(payload);
  }

  rawJson(res, status, raw) {
    const payload = Buffer.from(raw);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": String(payload.length)
    });
    res.end(payload);
  }

  async listen() {
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    return this.server.address().port;
  }

  send(body) {
    this.socket.write(encodeFrame(JSON.stringify(body)));
  }

  sendRaw(text) {
    this.socket.write(encodeFrame(text));
  }

  async waitFor(predicate) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for websocket message; recent=${JSON.stringify(this.messages.slice(-8))}`);
  }

  async waitForCount(predicate, count) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const matches = this.messages.filter(predicate);
      if (matches.length >= count) return matches;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${count} websocket messages; recent=${JSON.stringify(this.messages.slice(-8))}`);
  }

  close() {
    this.socket?.destroy();
    this.server.close();
  }
}

