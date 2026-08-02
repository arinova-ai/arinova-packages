import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import {
  buildAgentOptions,
  buildControlServerOptions,
  createControlServer,
  intEnv,
  listen,
  nonNegativeIntEnv,
  positiveIntEnv,
  postAdapter,
  readJson,
  requiredEnv
} from "./runtime.mjs";
import { FakeAgent, FakeTask } from "./check-runtime-fixtures.mjs";

const token = "test-token";
const adapterEvents = [];

assert.equal(intEnv({ ARINOVA_SIDECAR_PORT: "8793" }, "ARINOVA_SIDECAR_PORT"), 8793);
assert.equal(intEnv({ ARINOVA_SIDECAR_PORT: "   " }, "ARINOVA_SIDECAR_PORT"), undefined);
assert.equal(requiredEnv({ ARINOVA_SERVER_URL: "  wss://example.test/  " }, "ARINOVA_SERVER_URL"), "wss://example.test/");
assert.equal(requiredEnv({ ARINOVA_SERVER_URL: "   " }, "ARINOVA_SERVER_URL"), "");
assert.equal(requiredEnv({}, "ARINOVA_SERVER_URL"), "");
assert.throws(
  () => intEnv({ ARINOVA_SIDECAR_PORT: "+8793" }, "ARINOVA_SIDECAR_PORT"),
  /must be a non-negative integer/
);
assert.throws(
  () => intEnv({ ARINOVA_SIDECAR_PORT: "1e3" }, "ARINOVA_SIDECAR_PORT"),
  /must be a non-negative integer/
);
assert.throws(
  () => intEnv({ ARINOVA_SIDECAR_PORT: "0x2259" }, "ARINOVA_SIDECAR_PORT"),
  /must be a non-negative integer/
);
assert.equal(nonNegativeIntEnv({ ARINOVA_MAX_QUEUED_TASKS: "0" }, "ARINOVA_MAX_QUEUED_TASKS"), 0);
assert.equal(nonNegativeIntEnv({ ARINOVA_MAX_QUEUED_TASKS: "7" }, "ARINOVA_MAX_QUEUED_TASKS"), 7);
assert.equal(nonNegativeIntEnv({}, "ARINOVA_MAX_QUEUED_TASKS"), undefined);
assert.throws(
  () => nonNegativeIntEnv({ ARINOVA_MAX_QUEUED_TASKS: "-1" }, "ARINOVA_MAX_QUEUED_TASKS"),
  /must be a non-negative integer/
);
assert.equal(positiveIntEnv({ ARINOVA_PING_INTERVAL_MS: "250" }, "ARINOVA_PING_INTERVAL_MS"), 250);
assert.throws(
  () => positiveIntEnv({ ARINOVA_PING_INTERVAL_MS: "0" }, "ARINOVA_PING_INTERVAL_MS"),
  /must be a positive integer/
);

assert.deepEqual(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: {
      ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([
        { id: "memo", name: "Memo", description: "Use memos" },
        { id: "chat", name: "Chat", description: "" }
      ]),
      ARINOVA_CONCURRENCY_MODE: "per-conversation",
      ARINOVA_RECONNECT_INTERVAL_MS: "1000",
      ARINOVA_PING_INTERVAL_MS: "2000",
      ARINOVA_PING_TIMEOUT_MS: "3000",
      ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION: "4"
    }
  }),
  {
    serverUrl: "ws://example",
    botToken: "token",
    skills: [
      { id: "memo", name: "Memo", description: "Use memos" },
      { id: "chat", name: "Chat", description: "" }
    ],
    concurrencyMode: "per-conversation",
    reconnectInterval: 1000,
    pingInterval: 2000,
    pingTimeout: 3000,
    maxConsecutivePerConversation: 4
  }
);

assert.deepEqual(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: {
      ARINOVA_AGENT_SKILLS: JSON.stringify([
        { id: "legacy", name: "Legacy", description: "Legacy skill env" }
      ])
    }
  }),
  {
    serverUrl: "ws://example",
    botToken: "token",
    skills: [{ id: "legacy", name: "Legacy", description: "Legacy skill env" }],
    concurrencyMode: "per-conversation"
  }
);

assert.deepEqual(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: {
      ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([
        { id: "primary", name: "Primary", description: "Primary skill env" }
      ]),
      ARINOVA_AGENT_SKILLS: JSON.stringify([
        { id: "legacy", name: "Legacy", description: "Legacy skill env" }
      ])
    }
  }).skills,
  [{ id: "primary", name: "Primary", description: "Primary skill env" }]
);

assert.equal(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_CONCURRENCY_MODE: "unbounded" }
  }).concurrencyMode,
  "unbounded"
);
assert.equal(
  Object.hasOwn(
    buildAgentOptions({
      serverUrl: "ws://example",
      botToken: "token",
      env: { ARINOVA_RECONNECT_INTERVAL_MS: "   " }
    }),
    "reconnectInterval"
  ),
  false
);
assert.equal(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_RECONNECT_INTERVAL_MS: " 250 " }
  }).reconnectInterval,
  250
);
assert.equal(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: {
      ARINOVA_CONCURRENCY_MODE: "agent-wide",
      ARINOVA_AGENT_CONCURRENCY_MODE: "unbounded"
    }
  }).concurrencyMode,
  "agent-wide"
);

assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: "{}" }
  }),
  /ARINOVA_AGENT_SKILLS_JSON must be a JSON array/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS: "{}" }
  }),
  /ARINOVA_AGENT_SKILLS must be a JSON array/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: '[{"id":"memo","id":"chat","name":"Chat","description":"Duplicate field"}]' }
  }),
  /JSON object contains duplicate key: id/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS: '[{"id":"memo","name":"Memo","description":"One","description":"Two"}]' }
  }),
  /JSON object contains duplicate key: description/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([{ id: "bad", name: "Bad" }]) }
  }),
  /ARINOVA_AGENT_SKILLS_JSON\[0\] requires string id, name and description/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS: JSON.stringify([{ id: "bad", name: "Bad" }]) }
  }),
  /ARINOVA_AGENT_SKILLS\[0\] requires string id, name and description/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([{ id: "memo", name: "Memo", description: "Use memos", icon: "book" }]) }
  }),
  /ARINOVA_AGENT_SKILLS_JSON\[0\] has unsupported field\(s\): icon/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([{ id: 123, name: "Bad", description: "Bad" }]) }
  }),
  /ARINOVA_AGENT_SKILLS_JSON\[0\] requires string id, name and description/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([{ id: "", name: "Blank", description: "Blank" }]) }
  }),
  /ARINOVA_AGENT_SKILLS_JSON\[0\] requires a non-empty id/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_AGENT_SKILLS: JSON.stringify([{ id: "blank", name: "  ", description: "Blank" }]) }
  }),
  /ARINOVA_AGENT_SKILLS\[0\] requires a non-empty name/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: {
      ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([
        { id: "memo", name: "Memo", description: "Use memos" },
        { id: "memo", name: "Memo Copy", description: "Duplicate id" }
      ])
    }
  }),
  /ARINOVA_AGENT_SKILLS_JSON\[1\] has duplicate id: memo/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_RECONNECT_INTERVAL_MS: "-1" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_PING_INTERVAL_MS: "1.5" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_PING_TIMEOUT_MS: "true" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION: "two" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_RECONNECT_INTERVAL_MS: "1e3" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_CONCURRENCY_MODE: "serial" }
  }),
  /must be one of/
);
assert.equal(
  buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_MAX_QUEUED_TASKS: "0" }
  }).maxQueuedTasks,
  0
);
assert.throws(
  () => buildAgentOptions({
    serverUrl: "ws://example",
    botToken: "token",
    env: { ARINOVA_PING_INTERVAL_MS: "0" }
  }),
  /ARINOVA_PING_INTERVAL_MS must be a positive integer/
);
assert.throws(
  () => buildControlServerOptions({
    env: { ARINOVA_CONTROL_MAX_BODY_BYTES: "0" }
  }),
  /ARINOVA_CONTROL_MAX_BODY_BYTES must be a positive integer/
);

assert.deepEqual(
  buildControlServerOptions({
    env: { ARINOVA_ADAPTER_POST_TIMEOUT_MS: "1234", ARINOVA_CONTROL_MAX_BODY_BYTES: "4096" }
  }),
  { adapterPostTimeoutMs: 1234, maxBodyBytes: 4096 }
);
assert.deepEqual(buildControlServerOptions({ env: {} }), {});
assert.deepEqual(buildControlServerOptions({ env: { ARINOVA_CONTROL_MAX_BODY_BYTES: "   " } }), {});
assert.deepEqual(buildControlServerOptions({ env: { ARINOVA_CONTROL_MAX_BODY_BYTES: " 512 " } }), { maxBodyBytes: 512 });
assert.throws(
  () => buildControlServerOptions({
    env: { ARINOVA_ADAPTER_POST_TIMEOUT_MS: "-1" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildControlServerOptions({
    env: { ARINOVA_CONTROL_MAX_BODY_BYTES: "huge" }
  }),
  /must be a non-negative integer/
);
assert.throws(
  () => buildControlServerOptions({
    env: { ARINOVA_CONTROL_MAX_BODY_BYTES: "0x10" }
  }),
  /must be a non-negative integer/
);

const adapterServer = createServer(async (req, res) => {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) body += chunk;
  const parsedBody = body ? JSON.parse(body) : {};
  adapterEvents.push({
    path: req.url,
    token: req.headers["x-arinova-bridge-token"],
    body: parsedBody
  });
  if (req.url === "/task" && parsedBody.taskId === "task-forward-fail") {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("task bridge unavailable");
    return;
  }
  if (
    req.url === "/onboarding-seed" &&
    parsedBody.seedId === "seed-retry" &&
    adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length === 1
  ) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("seed bridge unavailable");
    return;
  }
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

adapterServer.listen(0, "127.0.0.1");
await once(adapterServer, "listening");
const adapterPort = adapterServer.address().port;

const hangingAdapter = createServer((_req, _res) => {});
hangingAdapter.listen(0, "127.0.0.1");
await once(hangingAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${hangingAdapter.address().port}`, token, "/task", {}, 25),
  /timed out after 25ms/
);
hangingAdapter.close();

const failingAdapter = createServer((_req, res) => {
  res.writeHead(503, { "Content-Type": "text/plain" });
  res.end("adapter unavailable");
});
failingAdapter.listen(0, "127.0.0.1");
await once(failingAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${failingAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task failed \(503\): adapter unavailable/
);
failingAdapter.close();

const nonJsonAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "text/plain" });
  res.end("ok");
});
nonJsonAckAdapter.listen(0, "127.0.0.1");
await once(nonJsonAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${nonJsonAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned non-JSON response content type: text\/plain/
);
nonJsonAckAdapter.close();

const malformedAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end("{not-json");
});
malformedAckAdapter.listen(0, "127.0.0.1");
await once(malformedAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${malformedAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned malformed JSON acknowledgement/
);
malformedAckAdapter.close();

const emptyAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end("");
});
emptyAckAdapter.listen(0, "127.0.0.1");
await once(emptyAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${emptyAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned malformed JSON acknowledgement/
);
emptyAckAdapter.close();

const duplicateKeyAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end('{"ok":true,"ok":false}');
});
duplicateKeyAckAdapter.listen(0, "127.0.0.1");
await once(duplicateKeyAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${duplicateKeyAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned malformed JSON acknowledgement/
);
duplicateKeyAckAdapter.close();

const nonfiniteAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end('{"ok":true,"score":NaN}');
});
nonfiniteAckAdapter.listen(0, "127.0.0.1");
await once(nonfiniteAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${nonfiniteAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned malformed JSON acknowledgement/
);
nonfiniteAckAdapter.close();

const nonObjectAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end("[]");
});
nonObjectAckAdapter.listen(0, "127.0.0.1");
await once(nonObjectAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${nonObjectAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned malformed acknowledgement/
);
nonObjectAckAdapter.close();

const unsuccessfulAckAdapter = createServer((_req, res) => {
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "adapter rejected callback" }));
});
unsuccessfulAckAdapter.listen(0, "127.0.0.1");
await once(unsuccessfulAckAdapter, "listening");
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${unsuccessfulAckAdapter.address().port}`, token, "/task", {}, 1000),
  /adapter \/task returned unsuccessful acknowledgement/
);
unsuccessfulAckAdapter.close();

const adapterEventsBeforeNonfiniteCallback = adapterEvents.length;
await assert.rejects(
  () => postAdapter(`http://127.0.0.1:${adapterPort}`, token, "/task", { taskId: "bad-callback", score: Number.NaN }, 1000),
  /adapter callback\.score contains a non-finite number/
);
assert.equal(adapterEvents.length, adapterEventsBeforeNonfiniteCallback);

const agent = new FakeAgent();
let shutdownCalls = 0;
let controlClosedByShutdown = false;
let shutdownClear = () => {};
const { controlServer, tasks, clearControlState } = createControlServer({
  agent,
  agentSkills: [
    { id: "memo", name: "Memo", description: "Use memos" },
    { id: "", name: "  ", description: "" }
  ],
  adapterUrl: `http://127.0.0.1:${adapterPort}`,
  sharedToken: token,
  onShutdown: () => {
    shutdownCalls += 1;
    agent.disconnect();
    shutdownClear();
  },
  maxBodyBytes: 512
});
shutdownClear = clearControlState;
await listen(controlServer, 0, "127.0.0.1");
const controlPort = controlServer.address().port;

async function post(path, body = {}, requestToken = token) {
  const res = await fetch(`http://127.0.0.1:${controlPort}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arinova-Bridge-Token": requestToken
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function postRaw(path, body, requestToken = token) {
  const res = await fetch(`http://127.0.0.1:${controlPort}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arinova-Bridge-Token": requestToken
    },
    body
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function postWithContentType(path, body, contentType, requestToken = token) {
  const res = await fetch(`http://127.0.0.1:${controlPort}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Arinova-Bridge-Token": requestToken
    },
    body
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function postWithoutContentLength(path, body, requestToken = token) {
  return await new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: controlPort,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Arinova-Bridge-Token": requestToken
        }
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function rawJsonRequest(body, headers = {}) {
  return {
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...headers
    },
    setEncoding() {},
    async *[Symbol.asyncIterator]() {
      if (body) yield body;
    }
  };
}

function rawJsonRequestWithoutLength(body) {
  return {
    headers: {
      "content-type": "application/json"
    },
    setEncoding() {},
    async *[Symbol.asyncIterator]() {
      if (body) yield body;
    }
  };
}

async function getControl(path, requestToken = token) {
  const res = await fetch(`http://127.0.0.1:${controlPort}${path}`, {
    method: "GET",
    headers: {
      "X-Arinova-Bridge-Token": requestToken
    }
  });
  const text = await res.text();
  return {
    status: res.status,
    allow: res.headers.get("allow"),
    body: text ? JSON.parse(text) : null
  };
}

function healthBody(connected, tasks) {
  return {
    ok: true,
    connected,
    ...(connected ? { agentId: "agent-1" } : {}),
    tasks
  };
}

try {
  assert.equal((await post("/healthz", {}, "wrong")).status, 401);
  assert.deepEqual((await post("/healthz?probe=1")).body, healthBody(false, 0));
  const wrongMethod = await getControl("/agent-sdk");
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.allow, "POST");
  assert.equal(wrongMethod.body.ok, false);
  assert.match(wrongMethod.body.error, /method not allowed/);
  const wrongMethodWithQuery = await getControl("/agent-sdk?probe=1");
  assert.equal(wrongMethodWithQuery.status, 405);
  assert.equal(wrongMethodWithQuery.allow, "POST");
  const missingEndpoint = await getControl("/missing");
  assert.equal(missingEndpoint.status, 404);
  assert.equal(missingEndpoint.allow, null);
  assert.equal(missingEndpoint.body.ok, false);
  const missingEndpointWithQuery = await getControl("/missing?probe=1");
  assert.equal(missingEndpointWithQuery.status, 404);
  const textPlainJson = await postWithContentType("/agent-sdk", '{"method":"getAgentId","args":[]}', "text/plain");
  assert.equal(textPlainJson.status, 415);
  assert.equal(textPlainJson.body.ok, false);
  assert.match(textPlainJson.body.error, /application\/json/);
  const oversizedJson = await postRaw("/agent-sdk", JSON.stringify({ method: "getAgentId", padding: "x".repeat(600) }));
  assert.equal(oversizedJson.status, 413);
  assert.equal(oversizedJson.body.ok, false);
  assert.match(oversizedJson.body.error, /exceeds 512 bytes/);
  await assert.rejects(
    () => readJson(rawJsonRequest('{"method":"getAgentId"}', { "content-length": "not-a-number" }), 512),
    /control request Content-Length must be a non-negative integer/
  );
  await assert.rejects(
    () => readJson(rawJsonRequest('{"method":"getAgentId"}', { "content-length": "-1" }), 512),
    /control request Content-Length must be a non-negative integer/
  );
  await assert.rejects(
    () => readJson(rawJsonRequestWithoutLength('{"method":"getAgentId"}'), 512),
    /control request Content-Length is required/,
    "control request without Content-Length must be rejected before reading body"
  );
  const callsBeforeMissingLength = agent.calls.length;
  const missingLengthControl = await postWithoutContentLength(
    "/agent-sdk",
    JSON.stringify({ method: "sendTelemetry", args: ["missing.length", {}] })
  );
  assert.equal(missingLengthControl.status, 400);
  assert.equal(missingLengthControl.body.ok, false);
  assert.match(missingLengthControl.body.error, /control request Content-Length is required/);
  assert.equal(
    agent.calls.length,
    callsBeforeMissingLength,
    "control request without Content-Length dispatched to the SDK"
  );
  const malformedJson = await postRaw("/agent-sdk", "{bad-json");
  assert.equal(malformedJson.status, 400);
  assert.equal(malformedJson.body.ok, false);
  assert.match(malformedJson.body.error, /JSON|Unexpected|position/);
  const duplicateKeyJson = await postRaw("/agent-sdk", '{"method":"getAgentId","method":"sendTelemetry","args":[]}');
  assert.equal(duplicateKeyJson.status, 400);
  assert.equal(duplicateKeyJson.body.ok, false);
  assert.match(duplicateKeyJson.body.error, /duplicate key: method/);
  const nestedDuplicateKeyJson = await postRaw(
    "/agent-sdk",
    '{"method":"reportToolCall","args":[{"sessionId":"s","turnId":"t","seqOrder":1,"toolName":"terminal","input":{},"success":true,"output":{"value":1,"value":2}}]}'
  );
  assert.equal(nestedDuplicateKeyJson.status, 400);
  assert.equal(nestedDuplicateKeyJson.body.ok, false);
  assert.match(nestedDuplicateKeyJson.body.error, /duplicate key: value/);
  const arrayJson = await postRaw("/agent-sdk", "[]");
  assert.equal(arrayJson.status, 400);
  assert.equal(arrayJson.body.ok, false);
  assert.match(arrayJson.body.error, /JSON object/);
  const nullJson = await postRaw("/task-sdk", "null");
  assert.equal(nullJson.status, 400);
  assert.equal(nullJson.body.ok, false);
  assert.match(nullJson.body.error, /JSON object/);
  const missingAgentMethod = await post("/agent-sdk", { args: [] });
  assert.equal(missingAgentMethod.status, 400);
  assert.match(missingAgentMethod.body.error, /method must be a non-empty string/);
  const numericAgentMethod = await post("/agent-sdk", { method: 0, args: [] });
  assert.equal(numericAgentMethod.status, 400);
  assert.match(numericAgentMethod.body.error, /method must be a non-empty string/);
  const objectAgentArgs = await post("/agent-sdk", { method: "getAgentId", args: {} });
  assert.equal(objectAgentArgs.status, 400);
  assert.match(objectAgentArgs.body.error, /args must be an array/);
  const badAgentMethod = await post("/agent-sdk", { method: "notAllowed", args: [] });
  assert.equal(badAgentMethod.status, 400);
  assert.match(badAgentMethod.body.error, /unsupported SDK method/);
  const trimmedAgentMethod = await post("/agent-sdk", { method: "  sendTelemetry  ", args: ["trimmed.method", { ok: true }] });
  assert.equal(trimmedAgentMethod.status, 200);
  assert.deepEqual(agent.calls.at(-1), ["sendTelemetry", "trimmed.method", { ok: true }]);
  const trimmedAgentMessageArgs = await post("/agent-sdk", {
    method: "sendMessage",
    args: ["  conv-sidecar-trim  ", " hello sidecar trim "]
  });
  assert.equal(trimmedAgentMessageArgs.status, 200);
  assert.deepEqual(agent.calls.at(-1), ["sendMessage", "conv-sidecar-trim", " hello sidecar trim "]);
  const trimmedAgentShareNoteArgs = await post("/agent-sdk", {
    method: "shareNote",
    args: ["  conv-share-sidecar-trim  ", "  note-share-sidecar-trim  "]
  });
  assert.equal(trimmedAgentShareNoteArgs.status, 200);
  assert.deepEqual(trimmedAgentShareNoteArgs.body.result, {
    conversationId: "conv-share-sidecar-trim",
    noteId: "note-share-sidecar-trim"
  });
  const badAgentMethodObjectArgs = await post("/agent-sdk", { method: "notAllowed", args: {} });
  assert.equal(badAgentMethodObjectArgs.status, 400);
  assert.match(badAgentMethodObjectArgs.body.error, /unsupported SDK method/);
  const badAgentMethodExtraArgs = await post("/agent-sdk", { method: "notAllowed", args: ["extra"] });
  assert.equal(badAgentMethodExtraArgs.status, 400);
  assert.match(badAgentMethodExtraArgs.body.error, /unsupported SDK method/);
  const unknownAgentField = await post("/agent-sdk", { method: "getAgentId", args: [], typo: true });
  assert.equal(unknownAgentField.status, 400);
  assert.match(unknownAgentField.body.error, /control request body has unsupported field\(s\): typo/);
  const missingTaskIdCall = await post("/task-sdk", { method: "fetchHistory", args: [] });
  assert.equal(missingTaskIdCall.status, 400);
  assert.match(missingTaskIdCall.body.error, /taskId must be a non-empty string/);
  const unknownTaskField = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [], typo: true });
  assert.equal(unknownTaskField.status, 400);
  assert.match(unknownTaskField.body.error, /control request body has unsupported field\(s\): typo/);
  const numericTaskIdChunk = await post("/chunk", { taskId: 0, content: "late" });
  assert.equal(numericTaskIdChunk.status, 400);
  assert.match(numericTaskIdChunk.body.error, /taskId must be a non-empty string/);
  const unknownChunkField = await post("/chunk", { taskId: "task-1", content: "late", typo: true });
  assert.equal(unknownChunkField.status, 400);
  assert.match(unknownChunkField.body.error, /control request body has unsupported field\(s\): typo/);
  const emptyTaskIdComplete = await post("/complete", { taskId: "", content: "late" });
  assert.equal(emptyTaskIdComplete.status, 400);
  assert.match(emptyTaskIdComplete.body.error, /taskId must be a non-empty string/);
  const unknownCompleteField = await post("/complete", { taskId: "task-1", content: "late", typo: true });
  assert.equal(unknownCompleteField.status, 400);
  assert.match(unknownCompleteField.body.error, /control request body has unsupported field\(s\): typo/);
  const emptyTaskIdError = await post("/error", { taskId: "   ", error: "late" });
  assert.equal(emptyTaskIdError.status, 400);
  assert.match(emptyTaskIdError.body.error, /taskId must be a non-empty string/);
  const unknownErrorField = await post("/error", { taskId: "task-1", error: "late", typo: true });
  assert.equal(unknownErrorField.status, 400);
  assert.match(unknownErrorField.body.error, /control request body has unsupported field\(s\): typo/);
  const unknownHealthzField = await post("/healthz", { typo: true });
  assert.equal(unknownHealthzField.status, 400);
  assert.match(unknownHealthzField.body.error, /control request body has unsupported field\(s\): typo/);
  const unknownShutdownField = await post("/shutdown", { typo: true });
  assert.equal(unknownShutdownField.status, 400);
  assert.match(unknownShutdownField.body.error, /control request body has unsupported field\(s\): typo/);
  assert.equal(shutdownCalls, 0);
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));

  agent.onboardingSeed = { kind: "first_touch_opening", seedId: "bad-seed" };
  agent.emit("connected");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(adapterEvents.some((event) => event.path === "/onboarding-seed"), false);
  agent.agentId = { id: "agent-bad" };
  agent.emit("connected");
  const malformedAgentDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected && !("agentId" in event.body)) && Date.now() < malformedAgentDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(
    adapterEvents.some((event) => event.path === "/connection-status" && event.body.agentId && typeof event.body.agentId !== "string"),
    false,
    "malformed getAgentId should not be forwarded to Hermes connection status"
  );
  assert.deepEqual((await post("/healthz")).body, { ok: true, connected: true, tasks: 0 });
  agent.agentId = "agent-1";

  agent.onboardingSeed = { kind: "first_touch_opening", seedId: "seed-1", agentId: "agent-1", action: "open", prompt: "hello" };
  agent.emit("connected");
  const connectedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/connection-status" && event.body.agentId === "agent-1") && Date.now() < connectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const connectedEvent = adapterEvents.find((event) => event.path === "/connection-status" && event.body.agentId === "agent-1");
  assert.equal(connectedEvent.body.agentId, "agent-1");
  const seedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/onboarding-seed") && Date.now() < seedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const seedEvent = adapterEvents.find((event) => event.path === "/onboarding-seed");
  assert.equal(seedEvent.body.seedId, "seed-1");
  const connectedEventsBeforeDuplicateConnected = adapterEvents.filter(
    (event) => event.path === "/connection-status" && event.body.connected === true
  ).length;
  agent.emit("connected");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(adapterEvents.filter((event) => event.path === "/onboarding-seed").length, 1);
  assert.equal(
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length,
    connectedEventsBeforeDuplicateConnected,
    "duplicate connected event should not forward duplicate Hermes connection-status"
  );
  agent.onboardingSeed = { kind: "first_touch_opening", seedId: "", agentId: "", action: "", prompt: "" };
  agent.emit("connected");
  const emptySeedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/onboarding-seed" && event.body.seedId === "") && Date.now() < emptySeedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const emptySeedEvent = adapterEvents.find((event) => event.path === "/onboarding-seed" && event.body.seedId === "");
  assert.deepEqual(emptySeedEvent.body, { kind: "first_touch_opening", seedId: "", agentId: "", action: "", prompt: "" });
  agent.onboardingSeed = { kind: "first_touch_opening", seedId: "seed-retry", agentId: "agent-1", action: "open", prompt: "retry" };
  agent.emit("connected");
  const failedSeedDeadline = Date.now() + 1000;
  while (adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length < 1 && Date.now() < failedSeedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length, 1);
  agent.emit("connected");
  const retriedSeedDeadline = Date.now() + 1000;
  while (adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length < 2 && Date.now() < retriedSeedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length, 2);
  agent.emit("connected");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-retry").length,
    2,
    "successful onboarding seed retry should be marked forwarded"
  );
  agent.onboardingSeed = { kind: "first_touch_opening", seedId: "seed-1", agentId: "agent-1", action: "open", prompt: "hello" };

  agent.emit("error", new Error("background parser failed"));
  const sdkErrorDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/sdk-error") && Date.now() < sdkErrorDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const sdkErrorEvent = adapterEvents.find((event) => event.path === "/sdk-error");
  assert.equal(sdkErrorEvent.body.error, "background parser failed");
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const malformedTokenEventsBefore = adapterEvents.filter((event) => event.path === "/token-claimed").length;
  agent.emit("token_claimed", { agentId: "agent-bad", permanentToken: { token: "ari_bad" } });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/token-claimed").length,
    malformedTokenEventsBefore,
    "malformed token_claimed should not be forwarded to Hermes"
  );
  agent.emit("token_claimed", { agentId: "agent-empty", permanentToken: "   " });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/token-claimed").length,
    malformedTokenEventsBefore,
    "blank token_claimed token should not be forwarded to Hermes"
  );
  agent.emit("token_claimed", { agentId: "agent-1", permanentToken: "ari_perm" });
  const tokenDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/token-claimed") && Date.now() < tokenDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const tokenEvent = adapterEvents.find((event) => event.path === "/token-claimed");
  assert.equal(tokenEvent.body.agentId, "agent-1");
  assert.equal(tokenEvent.body.permanentToken, "ari_perm");
  agent.emit("token_claimed", { agentId: null, permanentToken: "ari_null_agent_perm" });
  const nullAgentTokenDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_null_agent_perm") && Date.now() < nullAgentTokenDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const nullAgentTokenEvent = adapterEvents.find((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_null_agent_perm");
  assert.deepEqual(nullAgentTokenEvent.body, { agentId: null, permanentToken: "ari_null_agent_perm" });

  agent.emit("auth_failed");
  const nativeAuthDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/auth-failed") && Date.now() < nativeAuthDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const nativeAuthEvent = adapterEvents.find((event) => event.path === "/auth-failed");
  assert.match(nativeAuthEvent.body.error, /authentication failed/);
  assert.equal(nativeAuthEvent.body.retryable, false);
  const nativeAuthDisconnectedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === false) && Date.now() < nativeAuthDisconnectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));

  agent.emit("error", new Error("Agent auth failed (attempt 1/5, retry 1): invalid token"));
  const authDeadline = Date.now() + 1000;
  while (adapterEvents.filter((event) => event.path === "/auth-failed").length < 2 && Date.now() < authDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const authEvent = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
  assert.match(authEvent.body.error, /invalid token/);
  assert.equal(authEvent.body.retryable, false);

  agent.emit("error", new Error("Agent auth retryable server error (retry 2, auth failures 1/5): gateway timeout"));
  const retryableAuthDeadline = Date.now() + 1000;
  while (adapterEvents.filter((event) => event.path === "/auth-failed").length < 3 && Date.now() < retryableAuthDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const retryableAuthEvent = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
  assert.match(retryableAuthEvent.body.error, /gateway timeout/);
  assert.equal(retryableAuthEvent.body.retryable, true);
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));

  agent.emit("connected");
  const reconnectedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === true) && Date.now() < reconnectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const malformedTask = new FakeTask();
  malformedTask.taskId = undefined;
  await agent.handler(malformedTask);
  assert.deepEqual(malformedTask.errors, ["Arinova task is missing taskId"]);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  assert.equal(adapterEvents.some((event) => event.path === "/task" && !Object.hasOwn(event.body, "taskId")), false);

  const task = new FakeTask();
  await agent.handler(task);
  const taskEvent = adapterEvents.find((event) => event.path === "/task");
  assert.equal(taskEvent.token, token);
  assert.deepEqual(taskEvent.body, {
    taskId: "task-1",
    taskKind: "trigger",
    userMessageId: "msg-1",
    conversationId: "conv-1",
    conversationName: "Project Memo",
    conversationType: "direct",
    content: "hello",
    senderUserId: "user-1",
    senderUsername: "User",
    senderAgentId: "agent-2",
    senderAgentName: "Helper",
    members: [{ agentId: "agent-3", agentName: "Researcher" }],
    replyTo: { role: "assistant", content: "previous", senderAgentName: "Helper" },
    history: [{ role: "user", content: "earlier", senderAgentName: "Helper", senderUsername: "User", createdAt: "now" }],
    attachments: [{ id: "file-1", fileName: "a.txt", fileType: "text/plain", fileSize: 2, url: "https://x" }],
    availableSkills: [{ slug: "memo", name: "Memo", slashCommand: "/memo", description: "Use memos" }]
  });
  const fallbackSkillTask = new FakeTask();
  fallbackSkillTask.taskId = "task-fallback-skills";
  fallbackSkillTask.availableSkills = undefined;
  await agent.handler(fallbackSkillTask);
  const fallbackSkillEvent = adapterEvents.find((event) => event.path === "/task" && event.body.taskId === "task-fallback-skills");
  assert.deepEqual(fallbackSkillEvent.body.availableSkills, [
    { slug: "memo", name: "Memo", slashCommand: "/memo", description: "Use memos" },
    { slug: "", name: "  ", slashCommand: null, description: "" }
  ]);
  assert.equal((await post("/error", { taskId: "task-fallback-skills", error: "fallback checked" })).status, 200);

  const explicitEmptySkillTask = new FakeTask();
  explicitEmptySkillTask.taskId = "task-explicit-empty-skills";
  explicitEmptySkillTask.availableSkills = [];
  await agent.handler(explicitEmptySkillTask);
  const explicitEmptySkillEvent = adapterEvents.find((event) => event.path === "/task" && event.body.taskId === "task-explicit-empty-skills");
  assert.deepEqual(explicitEmptySkillEvent.body.availableSkills, []);
  assert.equal((await post("/error", { taskId: "task-explicit-empty-skills", error: "explicit empty skills checked" })).status, 200);

  const emptyConversationNameTask = new FakeTask();
  emptyConversationNameTask.taskId = "task-empty-conversation-name";
  emptyConversationNameTask.conversationName = "";
  await agent.handler(emptyConversationNameTask);
  const emptyConversationNameEvent = adapterEvents.find((event) => event.path === "/task" && event.body.taskId === "task-empty-conversation-name");
  assert.equal(emptyConversationNameEvent.body.conversationName, "");
  assert.equal((await post("/error", { taskId: "task-empty-conversation-name", error: "empty conversation name checked" })).status, 200);

  const forwardFailureTask = new FakeTask();
  forwardFailureTask.taskId = "task-forward-fail";
  await agent.handler(forwardFailureTask);
  const forwardFailureDeadline = Date.now() + 1000;
  while (forwardFailureTask.errors.length === 0 && Date.now() < forwardFailureDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.match(forwardFailureTask.errors[0], /task bridge unavailable/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  const forwardFailureCancelCount = adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-forward-fail").length;
  forwardFailureTask.abortController.abort();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-forward-fail").length,
    forwardFailureCancelCount
  );

  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  assert.deepEqual(
    (await post("/agent-sdk", { method: "queryMemory", args: [{ query: "hello" }] })).body.result,
    [{ content: "memory", category: "test", score: 1 }]
  );
  const nonfiniteAgentResult = await post("/agent-sdk", { method: "queryMemory", args: [{ query: "nonfinite" }] });
  assert.equal(nonfiniteAgentResult.status, 500);
  assert.match(nonfiniteAgentResult.body.error, /response\.result\[0\]\.score contains a non-finite number/);
  const nonfiniteControlRequest = await postRaw(
    "/agent-sdk",
    '{"method":"reportToolCall","args":[{"sessionId":"session-1","turnId":"turn-1","seqOrder":0,"toolName":"arinova_sdk_call","input":{},"output":{"value":1e999},"success":true}]}'
  );
  assert.equal(nonfiniteControlRequest.status, 400);
  assert.match(nonfiniteControlRequest.body.error, /control request body\.args\[0\]\.output\.value contains a non-finite number/);
  assert.equal((await post("/agent-sdk", { method: "getAgentId", args: [] })).body.result, "agent-1");
  assert.deepEqual(
    (await post("/agent-sdk", { method: "getOnboardingSeed", args: [] })).body.result,
    { kind: "first_touch_opening", seedId: "seed-1", agentId: "agent-1", action: "open", prompt: "hello" }
  );
  assert.deepEqual(
    (await post("/agent-sdk", { method: "sendTelemetry", args: ["runtime.undefined", { ok: true }] })).body,
    { ok: true, result: null }
  );
  assert.deepEqual(agent.calls.at(-1), ["sendTelemetry", "runtime.undefined", { ok: true }]);
  const shortAgentArgs = await post("/agent-sdk", { method: "sendTelemetry", args: ["smoke"] });
  assert.equal(shortAgentArgs.status, 400);
  assert.match(shortAgentArgs.body.error, /args for sendTelemetry requires at least 2 item/);
  const extraAgentArgs = await post("/agent-sdk", { method: "getAgentId", args: ["unexpected"] });
  assert.equal(extraAgentArgs.status, 400);
  assert.match(extraAgentArgs.body.error, /args for getAgentId accepts at most 0 item/);
  const badAgentStringArg = await post("/agent-sdk", { method: "sendMessage", args: [123, "hello"] });
  assert.equal(badAgentStringArg.status, 400);
  assert.match(badAgentStringArg.body.error, /args\[0\] must be a string/);
  const badFetchSkillPromptArg = await post("/agent-sdk", { method: "fetchSkillPrompt", args: [123] });
  assert.equal(badFetchSkillPromptArg.status, 400);
  assert.match(badFetchSkillPromptArg.body.error, /args\[0\] must be a string/);
  const badShareNoteConversationArg = await post("/agent-sdk", { method: "shareNote", args: [123, "note-1"] });
  assert.equal(badShareNoteConversationArg.status, 400);
  assert.match(badShareNoteConversationArg.body.error, /args\[0\] must be a string/);
  const badShareNoteNoteArg = await post("/agent-sdk", { method: "shareNote", args: ["conv-1", 123] });
  assert.equal(badShareNoteNoteArg.status, 400);
  assert.match(badShareNoteNoteArg.body.error, /args\[1\] must be a string/);
  const badScalarAgentStringCases = [
    ["sendHud", [{}, 123], 1],
    ["deleteNote", [123], 0],
    ["archiveBoard", [123], 0],
    ["listColumns", [123], 0],
    ["deleteColumn", [123], 0],
    ["completeCard", [123], 0],
    ["listCardCommits", [123], 0],
    ["linkCardNote", [123, "note-1"], 0],
    ["linkCardNote", ["card-1", 123], 1],
    ["unlinkCardNote", [123, "note-1"], 0],
    ["unlinkCardNote", ["card-1", 123], 1],
    ["listCardNotes", [123], 0],
    ["listLabels", [123], 0],
    ["deleteLabel", [123], 0],
    ["addCardLabel", [123, "label-1"], 0],
    ["addCardLabel", ["card-1", 123], 1],
    ["removeCardLabel", [123, "label-1"], 0],
    ["removeCardLabel", ["card-1", 123], 1]
  ];
  for (const [method, args, index] of badScalarAgentStringCases) {
    const rejected = await post("/agent-sdk", { method, args });
    assert.equal(rejected.status, 400, `${method} should reject non-string args[${index}]`);
    assert.match(rejected.body.error, new RegExp(`args\\[${index}\\] must be a string`));
  }
  const badAgentObjectArg = await post("/agent-sdk", { method: "createCard", args: ["not-an-object"] });
  assert.equal(badAgentObjectArg.status, 400);
  assert.match(badAgentObjectArg.body.error, /args\[0\] must be an object/);
  const badAgentArrayArg = await post("/agent-sdk", { method: "reorderColumns", args: ["board-1", "col-1,col-2"] });
  assert.equal(badAgentArrayArg.status, 400);
  assert.match(badAgentArrayArg.body.error, /args\[1\] must be an array/);
  const badReorderColumnIdsItem = await post("/agent-sdk", { method: "reorderColumns", args: ["board-1", ["col-1", 42]] });
  assert.equal(badReorderColumnIdsItem.status, 400);
  assert.match(badReorderColumnIdsItem.body.error, /args\[1\] items must be strings/);
  const trimmedReorderColumnIds = await post("/agent-sdk", {
    method: "reorderColumns",
    args: ["  board-sidecar-columns  ", ["  col-sidecar-a  ", " col-sidecar-b "]]
  });
  assert.equal(trimmedReorderColumnIds.status, 200);
  assert.deepEqual(agent.calls.at(-1), [
    "reorderColumns",
    "board-sidecar-columns",
    ["col-sidecar-a", "col-sidecar-b"]
  ]);
  const badCreateCardMissingTitle = await post("/agent-sdk", { method: "createCard", args: [{ description: "missing title" }] });
  assert.equal(badCreateCardMissingTitle.status, 400);
  assert.match(badCreateCardMissingTitle.body.error, /args\[0\]\.title is required/);
  const badCreateCardUnknownField = await post("/agent-sdk", { method: "createCard", args: [{ title: "Card", typo: true }] });
  assert.equal(badCreateCardUnknownField.status, 400);
  assert.match(badCreateCardUnknownField.body.error, /args\[0\] has unsupported field\(s\): typo/);
  const badCreateBoardColumnMissingName = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: "Board", columns: [{}] }]
  });
  assert.equal(badCreateBoardColumnMissingName.status, 400);
  assert.match(badCreateBoardColumnMissingName.body.error, /args\[0\]\.columns\[0\]\.name is required/);
  const badCreateBoardColumnsType = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: "Board", columns: { name: "Todo" } }]
  });
  assert.equal(badCreateBoardColumnsType.status, 400);
  assert.match(badCreateBoardColumnsType.body.error, /args\[0\]\.columns must be an array/);
  const badCreateBoardColumnItemType = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: "Board", columns: [123] }]
  });
  assert.equal(badCreateBoardColumnItemType.status, 400);
  assert.match(badCreateBoardColumnItemType.body.error, /args\[0\]\.columns\[0\] must be an object/);
  const badCreateBoardColumnNameType = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: "Board", columns: [{ name: 123 }] }]
  });
  assert.equal(badCreateBoardColumnNameType.status, 400);
  assert.match(badCreateBoardColumnNameType.body.error, /args\[0\]\.columns\[0\]\.name must be a string/);
  const badCreateBoardColumnUnknownField = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: "Board", columns: [{ name: "Todo", title: "Bad" }] }]
  });
  assert.equal(badCreateBoardColumnUnknownField.status, 400);
  assert.match(badCreateBoardColumnUnknownField.body.error, /args\[0\]\.columns\[0\] has unsupported field\(s\): title/);
  const badCreateBoardNameType = await post("/agent-sdk", {
    method: "createBoard",
    args: [{ name: 123 }]
  });
  assert.equal(badCreateBoardNameType.status, 400);
  assert.match(badCreateBoardNameType.body.error, /args\[0\]\.name must be a string/);
  const badUpdateBoardNameType = await post("/agent-sdk", {
    method: "updateBoard",
    args: ["board-1", { name: 123 }]
  });
  assert.equal(badUpdateBoardNameType.status, 400);
  assert.match(badUpdateBoardNameType.body.error, /args\[1\]\.name must be a string/);
  const badCreateColumnMissingName = await post("/agent-sdk", {
    method: "createColumn",
    args: ["board-1", { sortOrder: 1 }]
  });
  assert.equal(badCreateColumnMissingName.status, 400);
  assert.match(badCreateColumnMissingName.body.error, /args\[1\]\.name is required/);
  const badCreateColumnNameType = await post("/agent-sdk", {
    method: "createColumn",
    args: ["board-1", { name: 123 }]
  });
  assert.equal(badCreateColumnNameType.status, 400);
  assert.match(badCreateColumnNameType.body.error, /args\[1\]\.name must be a string/);
  const badUpdateColumnNameType = await post("/agent-sdk", {
    method: "updateColumn",
    args: ["col-1", { name: 123 }]
  });
  assert.equal(badUpdateColumnNameType.status, 400);
  assert.match(badUpdateColumnNameType.body.error, /args\[1\]\.name must be a string/);
  const badHistoryLimitType = await post("/agent-sdk", { method: "fetchHistory", args: ["conv-1", { limit: "10" }] });
  assert.equal(badHistoryLimitType.status, 400);
  assert.match(badHistoryLimitType.body.error, /args\[1\]\.limit must be a number/);
  const badHistoryBeforeType = await post("/agent-sdk", { method: "fetchHistory", args: ["conv-1", { before: 10 }] });
  assert.equal(badHistoryBeforeType.status, 400);
  assert.match(badHistoryBeforeType.body.error, /args\[1\]\.before must be a string/);
  const badHistoryAfterType = await post("/agent-sdk", { method: "fetchHistory", args: ["conv-1", { after: 10 }] });
  assert.equal(badHistoryAfterType.status, 400);
  assert.match(badHistoryAfterType.body.error, /args\[1\]\.after must be a string/);
  const badHistoryAroundType = await post("/agent-sdk", { method: "fetchHistory", args: ["conv-1", { around: 10 }] });
  assert.equal(badHistoryAroundType.status, 400);
  assert.match(badHistoryAroundType.body.error, /args\[1\]\.around must be a string/);
  const badListCardsLimitType = await post("/agent-sdk", { method: "listCards", args: [{ limit: "10" }] });
  assert.equal(badListCardsLimitType.status, 400);
  assert.match(badListCardsLimitType.body.error, /args\[0\]\.limit must be a number/);
  const badListCardsSearchType = await post("/agent-sdk", { method: "listCards", args: [{ search: 10 }] });
  assert.equal(badListCardsSearchType.status, 400);
  assert.match(badListCardsSearchType.body.error, /args\[0\]\.search must be a string/);
  const badListCardsOffsetType = await post("/agent-sdk", { method: "listCards", args: [{ offset: "20" }] });
  assert.equal(badListCardsOffsetType.status, 400);
  assert.match(badListCardsOffsetType.body.error, /args\[0\]\.offset must be a number/);
  const badArchivedCardsPageType = await post("/agent-sdk", { method: "listArchivedCards", args: ["board-1", { page: "1" }] });
  assert.equal(badArchivedCardsPageType.status, 400);
  assert.match(badArchivedCardsPageType.body.error, /args\[1\]\.page must be a number/);
  const badArchivedCardsLimitType = await post("/agent-sdk", { method: "listArchivedCards", args: ["board-1", { limit: "20" }] });
  assert.equal(badArchivedCardsLimitType.status, 400);
  assert.match(badArchivedCardsLimitType.body.error, /args\[1\]\.limit must be a number/);
  const badQueryMemoryMissingQuery = await post("/agent-sdk", { method: "queryMemory", args: [{ limit: 3 }] });
  assert.equal(badQueryMemoryMissingQuery.status, 400);
  assert.match(badQueryMemoryMissingQuery.body.error, /args\[0\]\.query is required/);
  const badQueryMemoryQueryType = await post("/agent-sdk", { method: "queryMemory", args: [{ query: 123 }] });
  assert.equal(badQueryMemoryQueryType.status, 400);
  assert.match(badQueryMemoryQueryType.body.error, /args\[0\]\.query must be a string/);
  const badQueryMemoryLimitType = await post("/agent-sdk", { method: "queryMemory", args: [{ query: "q", limit: "10" }] });
  assert.equal(badQueryMemoryLimitType.status, 400);
  assert.match(badQueryMemoryLimitType.body.error, /args\[0\]\.limit must be a number/);
  const badCreateColumnSortOrderType = await post("/agent-sdk", {
    method: "createColumn",
    args: ["board-1", { name: "Todo", sortOrder: "first" }]
  });
  assert.equal(badCreateColumnSortOrderType.status, 400);
  assert.match(badCreateColumnSortOrderType.body.error, /args\[1\]\.sortOrder must be a number/);
  const badUpdateColumnSortOrderType = await post("/agent-sdk", {
    method: "updateColumn",
    args: ["col-1", { sortOrder: "last" }]
  });
  assert.equal(badUpdateColumnSortOrderType.status, 400);
  assert.match(badUpdateColumnSortOrderType.body.error, /args\[1\]\.sortOrder must be a number/);
  const badCreateLabelNameType = await post("/agent-sdk", {
    method: "createLabel",
    args: ["board-1", { name: 123 }]
  });
  assert.equal(badCreateLabelNameType.status, 400);
  assert.match(badCreateLabelNameType.body.error, /args\[1\]\.name must be a string/);
  const badCreateLabelColorType = await post("/agent-sdk", {
    method: "createLabel",
    args: ["board-1", { name: "Bug", color: 123 }]
  });
  assert.equal(badCreateLabelColorType.status, 400);
  assert.match(badCreateLabelColorType.body.error, /args\[1\]\.color must be a string/);
  const badUpdateLabelNameType = await post("/agent-sdk", {
    method: "updateLabel",
    args: ["label-1", { name: 123 }]
  });
  assert.equal(badUpdateLabelNameType.status, 400);
  assert.match(badUpdateLabelNameType.body.error, /args\[1\]\.name must be a string/);
  const badUpdateLabelColorType = await post("/agent-sdk", {
    method: "updateLabel",
    args: ["label-1", { color: 123 }]
  });
  assert.equal(badUpdateLabelColorType.status, 400);
  assert.match(badUpdateLabelColorType.body.error, /args\[1\]\.color must be a string/);
  const badCommitHashType = await post("/agent-sdk", {
    method: "addCardCommit",
    args: ["card-1", { commitHash: 123 }]
  });
  assert.equal(badCommitHashType.status, 400);
  assert.match(badCommitHashType.body.error, /args\[1\]\.commitHash must be a string/);
  const badCommitMessageType = await post("/agent-sdk", {
    method: "addCardCommit",
    args: ["card-1", { commitHash: "abc", message: 123 }]
  });
  assert.equal(badCommitMessageType.status, 400);
  assert.match(badCommitMessageType.body.error, /args\[1\]\.message must be a string/);
  const badCreateCardColumnIdType = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: "Card", columnId: 123 }]
  });
  assert.equal(badCreateCardColumnIdType.status, 400);
  assert.match(badCreateCardColumnIdType.body.error, /args\[0\]\.columnId must be a string/);
  const badCreateCardColumnNameType = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: "Card", columnName: 123 }]
  });
  assert.equal(badCreateCardColumnNameType.status, 400);
  assert.match(badCreateCardColumnNameType.body.error, /args\[0\]\.columnName must be a string/);
  const badCreateCardBoardIdType = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: "Card", boardId: 123 }]
  });
  assert.equal(badCreateCardBoardIdType.status, 400);
  assert.match(badCreateCardBoardIdType.body.error, /args\[0\]\.boardId must be a string/);
  const badCreateCardPriorityType = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: "Card", priority: 123 }]
  });
  assert.equal(badCreateCardPriorityType.status, 400);
  assert.match(badCreateCardPriorityType.body.error, /args\[0\]\.priority must be a string/);
  const badCreateCardDescriptionType = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: "Card", description: 123 }]
  });
  assert.equal(badCreateCardDescriptionType.status, 400);
  assert.match(badCreateCardDescriptionType.body.error, /args\[0\]\.description must be a string/);
  const badUpdateCardTitleType = await post("/agent-sdk", {
    method: "updateCard",
    args: ["card-1", { title: 123 }]
  });
  assert.equal(badUpdateCardTitleType.status, 400);
  assert.match(badUpdateCardTitleType.body.error, /args\[1\]\.title must be a string/);
  const badUpdateCardColumnIdType = await post("/agent-sdk", {
    method: "updateCard",
    args: ["card-1", { columnId: 123 }]
  });
  assert.equal(badUpdateCardColumnIdType.status, 400);
  assert.match(badUpdateCardColumnIdType.body.error, /args\[1\]\.columnId must be a string/);
  const badUpdateCardDescriptionType = await post("/agent-sdk", {
    method: "updateCard",
    args: ["card-1", { description: 123 }]
  });
  assert.equal(badUpdateCardDescriptionType.status, 400);
  assert.match(badUpdateCardDescriptionType.body.error, /args\[1\]\.description must be a string/);
  const badUpdateCardPriorityType = await post("/agent-sdk", {
    method: "updateCard",
    args: ["card-1", { priority: 123 }]
  });
  assert.equal(badUpdateCardPriorityType.status, 400);
  assert.match(badUpdateCardPriorityType.body.error, /args\[1\]\.priority must be a string/);
  const badUpdateCardSortOrderType = await post("/agent-sdk", {
    method: "updateCard",
    args: ["card-1", { sortOrder: "last" }]
  });
  assert.equal(badUpdateCardSortOrderType.status, 400);
  assert.match(badUpdateCardSortOrderType.body.error, /args\[1\]\.sortOrder must be a number/);
  const badCreateNoteTitleType = await post("/agent-sdk", {
    method: "createNote",
    args: [{ title: 123 }]
  });
  assert.equal(badCreateNoteTitleType.status, 400);
  assert.match(badCreateNoteTitleType.body.error, /args\[0\]\.title must be a string/);
  const badCreateNoteContentType = await post("/agent-sdk", {
    method: "createNote",
    args: [{ title: "Note", content: 123 }]
  });
  assert.equal(badCreateNoteContentType.status, 400);
  assert.match(badCreateNoteContentType.body.error, /args\[0\]\.content must be a string/);
  const badCreateNoteNotebookIdType = await post("/agent-sdk", {
    method: "createNote",
    args: [{ title: "Note", notebookId: 123 }]
  });
  assert.equal(badCreateNoteNotebookIdType.status, 400);
  assert.match(badCreateNoteNotebookIdType.body.error, /args\[0\]\.notebookId must be a string/);
  const badUpdateNoteContentType = await post("/agent-sdk", {
    method: "updateNote",
    args: ["note-1", { content: 123 }]
  });
  assert.equal(badUpdateNoteContentType.status, 400);
  assert.match(badUpdateNoteContentType.body.error, /args\[1\]\.content must be a string/);
  const badListNotesTagsType = await post("/agent-sdk", { method: "listNotes", args: [{ tags: "work" }] });
  assert.equal(badListNotesTagsType.status, 400);
  assert.match(badListNotesTagsType.body.error, /args\[0\]\.tags must be an array/);
  const badListNotesBeforeType = await post("/agent-sdk", { method: "listNotes", args: [{ before: 10 }] });
  assert.equal(badListNotesBeforeType.status, 400);
  assert.match(badListNotesBeforeType.body.error, /args\[0\]\.before must be a string/);
  const badListNotesLimitType = await post("/agent-sdk", { method: "listNotes", args: [{ limit: "10" }] });
  assert.equal(badListNotesLimitType.status, 400);
  assert.match(badListNotesLimitType.body.error, /args\[0\]\.limit must be a number/);
  const badListNotesOffsetType = await post("/agent-sdk", { method: "listNotes", args: [{ offset: "20" }] });
  assert.equal(badListNotesOffsetType.status, 400);
  assert.match(badListNotesOffsetType.body.error, /args\[0\]\.offset must be a number/);
  const badListNotesArchivedType = await post("/agent-sdk", { method: "listNotes", args: [{ archived: "true" }] });
  assert.equal(badListNotesArchivedType.status, 400);
  assert.match(badListNotesArchivedType.body.error, /args\[0\]\.archived must be a boolean/);
  const badListNotesTagsItemType = await post("/agent-sdk", { method: "listNotes", args: [{ tags: ["work", 3] }] });
  assert.equal(badListNotesTagsItemType.status, 400);
  assert.match(badListNotesTagsItemType.body.error, /args\[0\]\.tags items must be strings/);
  const badCreateNoteTagsType = await post("/agent-sdk", {
    method: "createNote",
    args: [{ title: "Note", tags: "work" }]
  });
  assert.equal(badCreateNoteTagsType.status, 400);
  assert.match(badCreateNoteTagsType.body.error, /args\[0\]\.tags must be an array/);
  const badCreateNoteTagsItemType = await post("/agent-sdk", {
    method: "createNote",
    args: [{ title: "Note", tags: ["work", 3] }]
  });
  assert.equal(badCreateNoteTagsItemType.status, 400);
  assert.match(badCreateNoteTagsItemType.body.error, /args\[0\]\.tags items must be strings/);
  const trimmedStructuredHistoryCursors = await post("/agent-sdk", {
    method: "fetchHistory",
    args: ["  conv-sidecar-history  ", { before: "  msg-before  ", after: " msg-after ", around: " msg-around ", limit: 3 }]
  });
  assert.equal(trimmedStructuredHistoryCursors.status, 200);
  assert.deepEqual(agent.calls.at(-1), [
    "fetchHistory",
    "conv-sidecar-history",
    { before: "msg-before", after: "msg-after", around: "msg-around", limit: 3 }
  ]);
  const trimmedStructuredCardIds = await post("/agent-sdk", {
    method: "createCard",
    args: [{ title: " keep sidecar title padding ", boardId: "  board-body  ", columnId: " col-body " }]
  });
  assert.equal(trimmedStructuredCardIds.status, 200);
  assert.deepEqual(agent.calls.at(-1), [
    "createCard",
    { title: " keep sidecar title padding ", boardId: "board-body", columnId: "col-body" }
  ]);
  const badUpdateNoteTagsType = await post("/agent-sdk", {
    method: "updateNote",
    args: ["note-1", { tags: "work" }]
  });
  assert.equal(badUpdateNoteTagsType.status, 400);
  assert.match(badUpdateNoteTagsType.body.error, /args\[1\]\.tags must be an array/);
  const badUpdateNoteTagsItemType = await post("/agent-sdk", {
    method: "updateNote",
    args: ["note-1", { tags: ["work", 3] }]
  });
  assert.equal(badUpdateNoteTagsItemType.status, 400);
  assert.match(badUpdateNoteTagsItemType.body.error, /args\[1\]\.tags items must be strings/);
  const badAgentActionNameType = await post("/agent-sdk", {
    method: "callAction",
    args: [123, {}]
  });
  assert.equal(badAgentActionNameType.status, 400);
  assert.match(badAgentActionNameType.body.error, /args\[0\] must be a string/);
  const badAgentActionCallIdType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { callId: 123 }]
  });
  assert.equal(badAgentActionCallIdType.status, 400);
  assert.match(badAgentActionCallIdType.body.error, /args\[2\]\.callId must be a string/);
  const badAgentActionMetadataType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { metadata: "not-an-object" }]
  });
  assert.equal(badAgentActionMetadataType.status, 400);
  assert.match(badAgentActionMetadataType.body.error, /args\[2\]\.metadata must be an object/);
  const badAgentActionTaskIdType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { taskId: 123 }]
  });
  assert.equal(badAgentActionTaskIdType.status, 400);
  assert.match(badAgentActionTaskIdType.body.error, /args\[2\]\.taskId must be a string/);
  const badAgentActionConversationIdType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { conversationId: 123 }]
  });
  assert.equal(badAgentActionConversationIdType.status, 400);
  assert.match(badAgentActionConversationIdType.body.error, /args\[2\]\.conversationId must be a string/);
  const badAgentActionMessageIdType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { messageId: 123 }]
  });
  assert.equal(badAgentActionMessageIdType.status, 400);
  assert.match(badAgentActionMessageIdType.body.error, /args\[2\]\.messageId must be a string/);
  const badAgentActionParentCallIdType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { parentCallId: 123 }]
  });
  assert.equal(badAgentActionParentCallIdType.status, 400);
  assert.match(badAgentActionParentCallIdType.body.error, /args\[2\]\.parentCallId must be a string/);
  const badAgentActionReasonType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { reason: 123 }]
  });
  assert.equal(badAgentActionReasonType.status, 400);
  assert.match(badAgentActionReasonType.body.error, /args\[2\]\.reason must be a string/);
  const badAgentActionDryRunType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { dryRun: "true" }]
  });
  assert.equal(badAgentActionDryRunType.status, 400);
  assert.match(badAgentActionDryRunType.body.error, /args\[2\]\.dryRun must be a boolean/);
  const badAgentActionTimeoutType = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, { timeoutMs: Number.NaN }]
  });
  assert.equal(badAgentActionTimeoutType.status, 400);
  assert.match(badAgentActionTimeoutType.body.error, /args\[2\]\.timeoutMs must be a number/);
  const trimmedAgentActionOptionIds = await post("/agent-sdk", {
    method: "callAction",
    args: ["agent.action", {}, {
      callId: "  sidecar-global-call  ",
      taskId: "  sidecar-task  ",
      conversationId: "  sidecar-conv  ",
      messageId: "  sidecar-msg  ",
      parentCallId: "  sidecar-parent  ",
      reason: " keep sidecar reason padding "
    }]
  });
  assert.equal(trimmedAgentActionOptionIds.status, 200);
  assert.deepEqual(trimmedAgentActionOptionIds.body.result.options, {
    callId: "sidecar-global-call",
    taskId: "sidecar-task",
    conversationId: "sidecar-conv",
    messageId: "sidecar-msg",
    parentCallId: "sidecar-parent",
    reason: " keep sidecar reason padding "
  });
  const badTaskUpdateStatus = await post("/agent-sdk", { method: "sendTaskUpdate", args: ["Hermes", { status: "queued" }] });
  assert.equal(badTaskUpdateStatus.status, 400);
  assert.match(badTaskUpdateStatus.body.error, /args\[1\]\.status must be one of: started, completed/);
  const badTaskUpdateTaskType = await post("/agent-sdk", { method: "sendTaskUpdate", args: ["Hermes", { status: "started", task: 123 }] });
  assert.equal(badTaskUpdateTaskType.status, 400);
  assert.match(badTaskUpdateTaskType.body.error, /args\[1\]\.task must be a string/);
  const badTaskUpdateDurationType = await post("/agent-sdk", { method: "sendTaskUpdate", args: ["Hermes", { status: "completed", durationMs: "slow" }] });
  assert.equal(badTaskUpdateDurationType.status, 400);
  assert.match(badTaskUpdateDurationType.body.error, /args\[1\]\.durationMs must be a number/);
  const badTaskUpdateCostType = await post("/agent-sdk", { method: "sendTaskUpdate", args: ["Hermes", { status: "completed", costUsd: "free" }] });
  assert.equal(badTaskUpdateCostType.status, 400);
  assert.match(badTaskUpdateCostType.body.error, /args\[1\]\.costUsd must be a number/);
  const badTaskUpdateTurnsType = await post("/agent-sdk", { method: "sendTaskUpdate", args: ["Hermes", { status: "completed", numTurns: "two" }] });
  assert.equal(badTaskUpdateTurnsType.status, 400);
  assert.match(badTaskUpdateTurnsType.body.error, /args\[1\]\.numTurns must be a number/);
  const badReportRequiredField = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, input: {}, success: true }]
  });
  assert.equal(badReportRequiredField.status, 400);
  assert.match(badReportRequiredField.body.error, /args\[0\]\.toolName is required/);
  const badReportSessionIdType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: 123, turnId: "turn-1", seqOrder: 0, toolName: "bash", input: {}, success: true }]
  });
  assert.equal(badReportSessionIdType.status, 400);
  assert.match(badReportSessionIdType.body.error, /args\[0\]\.sessionId must be a string/);
  const badReportTurnIdType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: 123, seqOrder: 0, toolName: "bash", input: {}, success: true }]
  });
  assert.equal(badReportTurnIdType.status, 400);
  assert.match(badReportTurnIdType.body.error, /args\[0\]\.turnId must be a string/);
  const badReportSeqOrderType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: "first", toolName: "bash", input: {}, success: true }]
  });
  assert.equal(badReportSeqOrderType.status, 400);
  assert.match(badReportSeqOrderType.body.error, /args\[0\]\.seqOrder must be a number/);
  const badReportToolNameType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: 123, input: {}, success: true }]
  });
  assert.equal(badReportToolNameType.status, 400);
  assert.match(badReportToolNameType.body.error, /args\[0\]\.toolName must be a string/);
  const badReportInputType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: "bash", input: "bad", success: true }]
  });
  assert.equal(badReportInputType.status, 400);
  assert.match(badReportInputType.body.error, /args\[0\]\.input must be an object/);
  const badReportSuccessType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: "bash", input: {}, success: "yes" }]
  });
  assert.equal(badReportSuccessType.status, 400);
  assert.match(badReportSuccessType.body.error, /args\[0\]\.success must be a boolean/);
  const badReportDurationType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: "bash", input: {}, success: true, durationMs: "slow" }]
  });
  assert.equal(badReportDurationType.status, 400);
  assert.match(badReportDurationType.body.error, /args\[0\]\.durationMs must be a number/);
  const badReportErrorType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: "bash", input: {}, success: false, error: 123 }]
  });
  assert.equal(badReportErrorType.status, 400);
  assert.match(badReportErrorType.body.error, /args\[0\]\.error must be a string/);
  const badReportMessageIdType = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{ sessionId: "session-1", turnId: "turn-1", seqOrder: 0, toolName: "bash", input: {}, success: true, messageId: 123 }]
  });
  assert.equal(badReportMessageIdType.status, 400);
  assert.match(badReportMessageIdType.body.error, /args\[0\]\.messageId must be a string/);
  const trimmedReportIdentityFields = await post("/agent-sdk", {
    method: "reportToolCall",
    args: [{
      sessionId: "  sidecar-session  ",
      turnId: " sidecar-turn ",
      seqOrder: 0,
      toolName: " keep tool padding ",
      input: {},
      success: true,
      messageId: " sidecar-message "
    }]
  });
  assert.equal(trimmedReportIdentityFields.status, 200);
  assert.deepEqual(agent.calls.at(-1), [
    "reportToolCall",
    {
      sessionId: "sidecar-session",
      turnId: "sidecar-turn",
      seqOrder: 0,
      toolName: " keep tool padding ",
      input: {},
      success: true,
      messageId: "sidecar-message"
    }
  ]);
  const structuredAgentUnknownFieldCases = [
    ["sendTaskUpdate", ["Hermes", { status: "started", task: "smoke", unknown: true }], "args[1]"],
    ["reportToolCall", [{
      sessionId: "session-1",
      turnId: "turn-1",
      seqOrder: 0,
      toolName: "bash",
      input: {},
      success: true,
      unknown: true
    }], "args[0]"],
    ["callAction", ["agent.action", {}, { unknown: true }], "args[2]"],
    ["fetchHistory", ["conv-1", { unknown: true }], "args[1]"],
    ["listNotes", [{ unknown: true }], "args[0]"],
    ["createNote", [{ title: "Note", unknown: true }], "args[0]"],
    ["updateNote", ["note-1", { unknown: true }], "args[1]"],
    ["createCard", [{ title: "Card", unknown: true }], "args[0]"],
    ["updateCard", ["card-1", { unknown: true }], "args[1]"],
    ["createBoard", [{ name: "Board", unknown: true }], "args[0]"],
    ["updateBoard", ["board-1", { name: "Board", unknown: true }], "args[1]"],
    ["createColumn", ["board-1", { name: "Todo", unknown: true }], "args[1]"],
    ["updateColumn", ["column-1", { unknown: true }], "args[1]"],
    ["listCards", [{ unknown: true }], "args[0]"],
    ["listArchivedCards", ["board-1", { unknown: true }], "args[1]"],
    ["addCardCommit", ["card-1", { commitHash: "abc", unknown: true }], "args[1]"],
    ["createLabel", ["board-1", { name: "Bug", unknown: true }], "args[1]"],
    ["updateLabel", ["label-1", { unknown: true }], "args[1]"],
    ["queryMemory", [{ query: "memory", unknown: true }], "args[0]"]
  ];
  for (const [method, args, argLabel] of structuredAgentUnknownFieldCases) {
    const rejected = await post("/agent-sdk", { method, args });
    assert.equal(rejected.status, 400, `${method} should reject unknown structured fields`);
    assert.match(rejected.body.error, new RegExp(`${argLabel.replace("[", "\\[").replace("]", "\\]")} has unsupported field\\(s\\): unknown`));
  }
  assert.deepEqual(
    (await post("/agent-sdk", {
      method: "uploadFile",
      args: ["conv-1", { base64: "SGk=" }, "hi.txt", "text/plain"]
    })).body.result,
    { url: "https://file", fileName: "hi.txt", fileType: "text/plain", fileSize: 2 }
  );
  assert.deepEqual(agent.calls.at(-1), ["uploadFile", "conv-1", [72, 105], "hi.txt", "text/plain"]);
  const badAgentUpload = await post("/agent-sdk", {
    method: "uploadFile",
    args: ["conv-1", { base64: "!!!!" }, "bad.txt", "text/plain"]
  });
  assert.equal(badAgentUpload.status, 400);
  assert.equal(badAgentUpload.body.ok, false);
  assert.match(badAgentUpload.body.error, /invalid base64/);
  const missingAgentUploadBase64 = await post("/agent-sdk", {
    method: "uploadFile",
    args: ["conv-1", {}, "bad.txt", "text/plain"]
  });
  assert.equal(missingAgentUploadBase64.status, 400);
  assert.equal(missingAgentUploadBase64.body.ok, false);
  assert.match(missingAgentUploadBase64.body.error, /args\[1\]\.base64 is required/);
  const badAgentUploadBase64Type = await post("/agent-sdk", {
    method: "uploadFile",
    args: ["conv-1", { base64: 123 }, "bad.txt", "text/plain"]
  });
  assert.equal(badAgentUploadBase64Type.status, 400);
  assert.equal(badAgentUploadBase64Type.body.ok, false);
  assert.match(badAgentUploadBase64Type.body.error, /args\[1\]\.base64 must be a string/);
  const missingAgentUploadData = await post("/agent-sdk", {
    method: "uploadFile",
    args: ["conv-1", { path: "/tmp/not-readable-from-sidecar" }, "bad.txt", "text/plain"]
  });
  assert.equal(missingAgentUploadData.status, 400);
  assert.equal(missingAgentUploadData.body.ok, false);
  assert.match(missingAgentUploadData.body.error, /args\[1\] has unsupported field\(s\): path/);
  const ambiguousAgentUploadData = await post("/agent-sdk", {
    method: "uploadFile",
    args: ["conv-1", { base64: "SGk=", path: "/tmp/ignored" }, "bad.txt", "text/plain"]
  });
  assert.equal(ambiguousAgentUploadData.status, 400);
  assert.equal(ambiguousAgentUploadData.body.ok, false);
  assert.match(ambiguousAgentUploadData.body.error, /args\[1\] has unsupported field\(s\): path/);

  assert.deepEqual(
    (await post("/task-sdk", {
      taskId: "task-1",
      method: "uploadFile",
      args: [{ base64: "IQ==" }, "bang.txt", "text/plain"]
    })).body.result,
    { bytes: [33], fileName: "bang.txt", fileType: "text/plain" }
  );
  const shortTaskUploadArgs = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{ base64: "IQ==" }]
  });
  assert.equal(shortTaskUploadArgs.status, 400);
  assert.match(shortTaskUploadArgs.body.error, /args for uploadFile requires at least 2 item/);
  const extraTaskUploadArgs = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{ base64: "IQ==" }, "bang.txt", "text/plain", "extra"]
  });
  assert.equal(extraTaskUploadArgs.status, 400);
  assert.match(extraTaskUploadArgs.body.error, /args for uploadFile accepts at most 3 item/);
  const badTaskUpload = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{ base64: "!!!!" }, "bad-task.txt", "text/plain"]
  });
  assert.equal(badTaskUpload.status, 400);
  assert.equal(badTaskUpload.body.ok, false);
  assert.match(badTaskUpload.body.error, /invalid base64/);
  const missingTaskUploadBase64 = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{}, "bad-task.txt", "text/plain"]
  });
  assert.equal(missingTaskUploadBase64.status, 400);
  assert.equal(missingTaskUploadBase64.body.ok, false);
  assert.match(missingTaskUploadBase64.body.error, /args\[0\]\.base64 is required/);
  const badTaskUploadBase64Type = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{ base64: 123 }, "bad-task.txt", "text/plain"]
  });
  assert.equal(badTaskUploadBase64Type.status, 400);
  assert.equal(badTaskUploadBase64Type.body.ok, false);
  assert.match(badTaskUploadBase64Type.body.error, /args\[0\]\.base64 must be a string/);
  const missingTaskUploadData = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: ["not-base64", "bad-task.txt", "text/plain"]
  });
  assert.equal(missingTaskUploadData.status, 400);
  assert.equal(missingTaskUploadData.body.ok, false);
  assert.match(missingTaskUploadData.body.error, /args\[0\] must be an object/);
  const ambiguousTaskUploadData = await post("/task-sdk", {
    taskId: "task-1",
    method: "uploadFile",
    args: [{ base64: "IQ==", path: "/tmp/ignored" }, "bad-task.txt", "text/plain"]
  });
  assert.equal(ambiguousTaskUploadData.status, 400);
  assert.equal(ambiguousTaskUploadData.body.ok, false);
  assert.match(ambiguousTaskUploadData.body.error, /args\[0\] has unsupported field\(s\): path/);
  const missingTaskMethod = await post("/task-sdk", { taskId: "task-1", args: [] });
  assert.equal(missingTaskMethod.status, 400);
  assert.match(missingTaskMethod.body.error, /method must be a non-empty string/);
  const objectTaskArgs = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: {} });
  assert.equal(objectTaskArgs.status, 400);
  assert.match(objectTaskArgs.body.error, /args must be an array/);
  const shortTaskArgs = await post("/task-sdk", { taskId: "task-1", method: "callAction", args: ["task.action"] });
  assert.equal(shortTaskArgs.status, 400);
  assert.match(shortTaskArgs.body.error, /args for callAction requires at least 2 item/);
  const extraTaskArgs = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ limit: 1 }, "extra"] });
  assert.equal(extraTaskArgs.status, 400);
  assert.match(extraTaskArgs.body.error, /args for fetchHistory accepts at most 1 item/);
  const badTaskStringArg = await post("/task-sdk", { taskId: "task-1", method: "callAction", args: [123, {}] });
  assert.equal(badTaskStringArg.status, 400);
  assert.match(badTaskStringArg.body.error, /args\[0\] must be a string/);
  const badTaskObjectArg = await post("/task-sdk", { taskId: "task-1", method: "callAction", args: ["task.action", "not-an-object"] });
  assert.equal(badTaskObjectArg.status, 400);
  assert.match(badTaskObjectArg.body.error, /args\[1\] must be an object/);
  const badTaskActionOption = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { unknown: true }]
  });
  assert.equal(badTaskActionOption.status, 400);
  assert.match(badTaskActionOption.body.error, /args\[2\] has unsupported field\(s\): unknown/);
  const badTaskActionParentCallIdType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { parentCallId: 123 }]
  });
  assert.equal(badTaskActionParentCallIdType.status, 400);
  assert.match(badTaskActionParentCallIdType.body.error, /args\[2\]\.parentCallId must be a string/);
  const badTaskActionReasonType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { reason: 123 }]
  });
  assert.equal(badTaskActionReasonType.status, 400);
  assert.match(badTaskActionReasonType.body.error, /args\[2\]\.reason must be a string/);
  const badTaskActionCallIdType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { callId: 123 }]
  });
  assert.equal(badTaskActionCallIdType.status, 400);
  assert.match(badTaskActionCallIdType.body.error, /args\[2\]\.callId must be a string/);
  const badTaskActionMetadataType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { metadata: "not-an-object" }]
  });
  assert.equal(badTaskActionMetadataType.status, 400);
  assert.match(badTaskActionMetadataType.body.error, /args\[2\]\.metadata must be an object/);
  const taskScopedActionIdOverride = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { taskId: "wrong-task", conversationId: "wrong-conv", messageId: "wrong-message" }]
  });
  assert.equal(taskScopedActionIdOverride.status, 400);
  assert.match(taskScopedActionIdOverride.body.error, /args\[2\] has unsupported field\(s\): conversationId, messageId, taskId/);
  const badTaskActionDryRunType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { dryRun: "true" }]
  });
  assert.equal(badTaskActionDryRunType.status, 400);
  assert.match(badTaskActionDryRunType.body.error, /args\[2\]\.dryRun must be a boolean/);
  const badTaskActionTimeoutType = await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.action", {}, { timeoutMs: Number.NaN }]
  });
  assert.equal(badTaskActionTimeoutType.status, 400);
  assert.match(badTaskActionTimeoutType.body.error, /args\[2\]\.timeoutMs must be a number/);
  const badTaskHistoryCursor = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ before: 123 }] });
  assert.equal(badTaskHistoryCursor.status, 400);
  assert.match(badTaskHistoryCursor.body.error, /args\[0\]\.before must be a string/);
  const badTaskHistoryAfter = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ after: 123 }] });
  assert.equal(badTaskHistoryAfter.status, 400);
  assert.match(badTaskHistoryAfter.body.error, /args\[0\]\.after must be a string/);
  const badTaskHistoryAround = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ around: 123 }] });
  assert.equal(badTaskHistoryAround.status, 400);
  assert.match(badTaskHistoryAround.body.error, /args\[0\]\.around must be a string/);
  const badTaskHistoryLimit = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ limit: "10" }] });
  assert.equal(badTaskHistoryLimit.status, 400);
  assert.match(badTaskHistoryLimit.body.error, /args\[0\]\.limit must be a number/);
  const nonfiniteTaskResult = await post("/task-sdk", { taskId: "task-1", method: "fetchHistory", args: [{ limit: 99 }] });
  assert.equal(nonfiniteTaskResult.status, 500);
  assert.match(nonfiniteTaskResult.body.error, /response\.result\.messages\[0\]\.score contains a non-finite number/);
  const structuredTaskUnknownFieldCases = [
    ["fetchHistory", [{ unknown: true }], "args[0]"],
    ["callAction", ["task.action", {}, { unknown: true }], "args[2]"]
  ];
  for (const [method, args, argLabel] of structuredTaskUnknownFieldCases) {
    const rejected = await post("/task-sdk", { taskId: "task-1", method, args });
    assert.equal(rejected.status, 400, `task ${method} should reject unknown structured fields`);
    assert.match(rejected.body.error, new RegExp(`${argLabel.replace("[", "\\[").replace("]", "\\]")} has unsupported field\\(s\\): unknown`));
  }
  const badTaskMethod = await post("/task-sdk", { taskId: "task-1", method: "notAllowed", args: [] });
  assert.equal(badTaskMethod.status, 400);
  assert.match(badTaskMethod.body.error, /unsupported SDK method/);
  const badMissingTaskMethod = await post("/task-sdk", { taskId: "task-missing-method", method: "notAllowed", args: [] });
  assert.equal(badMissingTaskMethod.status, 400);
  assert.match(badMissingTaskMethod.body.error, /unsupported SDK method/);
  const missingTaskObjectArgs = await post("/task-sdk", { taskId: "task-missing-object-args", method: "fetchHistory", args: {} });
  assert.equal(missingTaskObjectArgs.status, 400);
  assert.match(missingTaskObjectArgs.body.error, /args must be an array/);
  const missingTaskShortActionArgs = await post("/task-sdk", { taskId: "task-missing-short-action", method: "callAction", args: ["action.only"] });
  assert.equal(missingTaskShortActionArgs.status, 400);
  assert.match(missingTaskShortActionArgs.body.error, /args for callAction requires at least 2 item/);
  const missingTaskBadActionArgs = await post("/task-sdk", { taskId: "task-missing-bad-action", method: "callAction", args: [123, {}] });
  assert.equal(missingTaskBadActionArgs.status, 400);
  assert.match(missingTaskBadActionArgs.body.error, /args\[0\] must be a string/);
  const missingTaskBadActionOptions = await post("/task-sdk", {
    taskId: "task-missing-bad-options",
    method: "callAction",
    args: ["action.ok", {}, { conversationId: "conv-1" }]
  });
  assert.equal(missingTaskBadActionOptions.status, 400);
  assert.match(missingTaskBadActionOptions.body.error, /args\[2\] has unsupported field\(s\): conversationId/);

  const badChunkContent = await post("/chunk", { taskId: "task-1", content: { text: "delta" } });
  assert.equal(badChunkContent.status, 400);
  assert.match(badChunkContent.body.error, /content must be a string/);
  assert.deepEqual(task.chunks, []);
  const missingChunkContent = await post("/chunk", { taskId: "task-1" });
  assert.equal(missingChunkContent.status, 400);
  assert.match(missingChunkContent.body.error, /content must be a string/);
  const numericChunkContent = await post("/chunk", { taskId: "task-1", content: 0 });
  assert.equal(numericChunkContent.status, 400);
  assert.match(numericChunkContent.body.error, /content must be a string/);
  assert.deepEqual(task.chunks, []);
  assert.deepEqual((await post("/task-sdk", { taskId: "  task-1  ", method: "  fetchHistory  ", args: [] })).body, {
    ok: true,
    result: { messages: [], hasMore: false }
  });
  assert.deepEqual((await post("/task-sdk", { taskId: "task-1", method: "callAction", args: ["  task.sidecar.trim  ", {}] })).body, {
    ok: true,
    result: { action: "task.sidecar.trim", args: {}, status: "success" }
  });
  assert.deepEqual((await post("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: ["task.sidecar.options", {}, {
      callId: "  sidecar-task-call  ",
      parentCallId: "  sidecar-task-parent  ",
      reason: " keep task sidecar reason padding "
    }]
  })).body, {
    ok: true,
    result: {
      action: "task.sidecar.options",
      args: {},
      options: {
        callId: "sidecar-task-call",
        parentCallId: "sidecar-task-parent",
        reason: " keep task sidecar reason padding "
      },
      status: "success"
    }
  });
  assert.deepEqual((await post("/chunk", { taskId: "task-1", content: "delta" })).body, { ok: true });
  assert.deepEqual(task.chunks, ["delta"]);
  assert.deepEqual((await post("/chunk", { taskId: "  task-1  ", content: "trimmed delta" })).body, { ok: true });
  assert.deepEqual(task.chunks, ["delta", "trimmed delta"]);

  const badCompleteContent = await post("/complete", { taskId: "task-1", content: { text: "done" } });
  assert.equal(badCompleteContent.status, 400);
  assert.match(badCompleteContent.body.error, /content must be a string/);
  const booleanCompleteContent = await post("/complete", { taskId: "task-1", content: false });
  assert.equal(booleanCompleteContent.status, 400);
  assert.match(booleanCompleteContent.body.error, /content must be a string/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  const badCompleteMentions = await post("/complete", { taskId: "task-1", content: "done", mentions: "user-1" });
  assert.equal(badCompleteMentions.status, 400);
  assert.match(badCompleteMentions.body.error, /mentions must be an array when provided/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  const badCompleteMentionItems = await post("/complete", { taskId: "task-1", content: "done", mentions: ["user-1", 42] });
  assert.equal(badCompleteMentionItems.status, 400);
  assert.match(badCompleteMentionItems.body.error, /mentions items must be strings/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  assert.deepEqual(
    (await post("/complete", { taskId: "  task-1  ", content: "done", mentions: ["user-1", "", "agent-1"] })).body,
    { ok: true }
  );
  assert.equal(task.completed, "done");
  assert.deepEqual(task.completeOptions, { mentions: ["user-1", "agent-1"] });
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  const completedCancelCount = adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-1").length;
  task.abortController.abort();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-1").length,
    completedCancelCount
  );
  const missingComplete = await post("/complete", { taskId: "task-1", content: "late done" });
  assert.equal(missingComplete.status, 500);
  assert.match(missingComplete.body.error, /no active task/);

  const completeFailureTask = new FakeTask();
  completeFailureTask.taskId = "task-complete-failure";
  completeFailureTask.throwComplete = true;
  await agent.handler(completeFailureTask);
  const failedComplete = await post("/complete", { taskId: "task-complete-failure", content: "retryable done" });
  assert.equal(failedComplete.status, 500);
  assert.match(failedComplete.body.error, /complete delivery failed/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  completeFailureTask.throwComplete = false;
  assert.equal((await post("/complete", { taskId: "task-complete-failure", content: "retryable done" })).status, 500);
  assert.equal(completeFailureTask.completed, null);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const errorTask = new FakeTask();
  errorTask.taskId = "task-error";
  await agent.handler(errorTask);
  const badErrorContent = await post("/error", { taskId: "task-error", error: { message: "cancelled" } });
  assert.equal(badErrorContent.status, 400);
  assert.match(badErrorContent.body.error, /error must be a string/);
  const numericErrorContent = await post("/error", { taskId: "task-error", error: 0 });
  assert.equal(numericErrorContent.status, 400);
  assert.match(numericErrorContent.body.error, /error must be a string/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  await post("/error", { taskId: "  task-error  ", error: "cancelled" });
  assert.deepEqual(errorTask.errors, ["cancelled"]);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  const erroredCancelCount = adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-error").length;
  errorTask.abortController.abort();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/cancel" && event.body.taskId === "task-error").length,
    erroredCancelCount
  );
  const missingError = await post("/error", { taskId: "task-error", error: "late cancelled" });
  assert.equal(missingError.status, 500);
  assert.match(missingError.body.error, /no active task/);

  const errorFailureTask = new FakeTask();
  errorFailureTask.taskId = "task-error-failure";
  errorFailureTask.throwError = true;
  await agent.handler(errorFailureTask);
  const failedError = await post("/error", { taskId: "task-error-failure", error: "retryable error" });
  assert.equal(failedError.status, 500);
  assert.match(failedError.body.error, /error delivery failed/);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  errorFailureTask.throwError = false;
  assert.equal((await post("/error", { taskId: "task-error-failure", error: "retryable error" })).status, 500);
  assert.deepEqual(errorFailureTask.errors, []);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const falsyTask = new FakeTask();
  falsyTask.taskId = "task-falsy";
  await agent.handler(falsyTask);
  await post("/chunk", { taskId: "task-falsy", content: "" });
  assert.deepEqual(falsyTask.chunks, [""]);
  await post("/complete", { taskId: "task-falsy", content: "" });
  assert.equal(falsyTask.completed, "");

  const falsyErrorTask = new FakeTask();
  falsyErrorTask.taskId = "task-falsy-error";
  await agent.handler(falsyErrorTask);
  await post("/error", { taskId: "task-falsy-error", error: "" });
  assert.deepEqual(falsyErrorTask.errors, [""]);

  const authLostTask = new FakeTask();
  authLostTask.taskId = "task-auth-lost";
  await agent.handler(authLostTask);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  agent.emit("error", new Error("Agent auth failed (attempt 2/5, retry 3): expired token"));
  const activeAuthDeadline = Date.now() + 1000;
  while (adapterEvents.filter((event) => event.path === "/auth-failed").length < 4 && Date.now() < activeAuthDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));
  const authLostTaskCall = await post("/task-sdk", { taskId: "task-auth-lost", method: "fetchHistory", args: [] });
  assert.equal(authLostTaskCall.status, 500);
  assert.match(authLostTaskCall.body.error, /no active task/);

  agent.emit("connected");
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const transientDisconnectTask = new FakeTask();
  transientDisconnectTask.taskId = "task-transient-disconnect";
  await agent.handler(transientDisconnectTask);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));

  const disconnectedEventsBefore = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length;
  agent.emit("disconnected");
  const disconnectedDeadline = Date.now() + 1000;
  while (
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length <= disconnectedEventsBefore
    && Date.now() < disconnectedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length > disconnectedEventsBefore
  );
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 1));
  assert.equal((await post("/chunk", { taskId: "task-transient-disconnect", content: "held during reconnect" })).status, 200);
  assert.deepEqual(transientDisconnectTask.chunks, []);
  agent.emit("connected");
  const transientReconnectDeadline = Date.now() + 1000;
  while (
    !adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === true)
    && Date.now() < transientReconnectDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  assert.deepEqual(transientDisconnectTask.chunks, ["held during reconnect"]);
  assert.equal((await post("/complete", { taskId: "task-transient-disconnect", content: "done after reconnect" })).status, 200);
  assert.equal(transientDisconnectTask.completed, "done after reconnect");
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const completeWhileDisconnectedTask = new FakeTask();
  completeWhileDisconnectedTask.taskId = "task-complete-while-disconnected";
  await agent.handler(completeWhileDisconnectedTask);
  agent.emit("disconnected");
  const completeDisconnectedDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== false
    && Date.now() < completeDisconnectedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 1));
  assert.equal(
    (await post("/complete", {
      taskId: "task-complete-while-disconnected",
      content: "queued complete",
      mentions: ["user-offline", ""]
    })).status,
    200
  );
  assert.equal(completeWhileDisconnectedTask.completed, "queued complete");
  assert.deepEqual(completeWhileDisconnectedTask.completeOptions, { mentions: ["user-offline"] });
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));
  agent.emit("connected");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(completeWhileDisconnectedTask.completed, "queued complete");
  assert.deepEqual(completeWhileDisconnectedTask.completeOptions, { mentions: ["user-offline"] });
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const failingCompleteWhileDisconnectedTask = new FakeTask();
  failingCompleteWhileDisconnectedTask.taskId = "task-failing-complete-while-disconnected";
  failingCompleteWhileDisconnectedTask.throwComplete = true;
  await agent.handler(failingCompleteWhileDisconnectedTask);
  agent.emit("disconnected");
  const failingCompleteDisconnectedDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== false
    && Date.now() < failingCompleteDisconnectedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal((await post("/complete", { taskId: "task-failing-complete-while-disconnected", content: "queued failing complete" })).status, 500);
  agent.emit("connected");
  const failingCompleteReconnectDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== true
    && Date.now() < failingCompleteReconnectDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const errorWhileDisconnectedTask = new FakeTask();
  errorWhileDisconnectedTask.taskId = "task-error-while-disconnected";
  await agent.handler(errorWhileDisconnectedTask);
  agent.emit("disconnected");
  const errorDisconnectedDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== false
    && Date.now() < errorDisconnectedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 1));
  assert.equal((await post("/error", { taskId: "task-error-while-disconnected", error: "queued error" })).status, 200);
  assert.deepEqual(errorWhileDisconnectedTask.errors, ["queued error"]);
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));
  agent.emit("connected");
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(errorWhileDisconnectedTask.errors, ["queued error"]);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const failingErrorWhileDisconnectedTask = new FakeTask();
  failingErrorWhileDisconnectedTask.taskId = "task-failing-error-while-disconnected";
  failingErrorWhileDisconnectedTask.throwError = true;
  await agent.handler(failingErrorWhileDisconnectedTask);
  agent.emit("disconnected");
  const failingErrorDisconnectedDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== false
    && Date.now() < failingErrorDisconnectedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal((await post("/error", { taskId: "task-failing-error-while-disconnected", error: "queued failing error" })).status, 500);
  agent.emit("connected");
  const failingErrorReconnectDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== true
    && Date.now() < failingErrorReconnectDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const abortedWhileDisconnectedTask = new FakeTask();
  abortedWhileDisconnectedTask.taskId = "task-abort-while-disconnected";
  await agent.handler(abortedWhileDisconnectedTask);
  agent.emit("disconnected");
  const disconnectedAbortDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== false
    && Date.now() < disconnectedAbortDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 1));
  assert.equal((await post("/chunk", { taskId: "task-abort-while-disconnected", content: "stale chunk" })).status, 200);
  assert.deepEqual(abortedWhileDisconnectedTask.chunks, []);
  abortedWhileDisconnectedTask.abortController.abort();
  const disconnectedCancelDeadline = Date.now() + 1000;
  while (
    !adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-abort-while-disconnected")
    && Date.now() < disconnectedCancelDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-abort-while-disconnected"));
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 0));
  agent.emit("connected");
  const abortedReconnectDeadline = Date.now() + 1000;
  while (
    (await post("/healthz")).body.connected !== true
    && Date.now() < abortedReconnectDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  assert.deepEqual(abortedWhileDisconnectedTask.chunks, []);

  const cancelledTask = new FakeTask();
  cancelledTask.taskId = "task-2";
  await agent.handler(cancelledTask);
  cancelledTask.abortController.abort();
  const cancelDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-2") && Date.now() < cancelDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-2"));
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));
  const cancelledTaskCall = await post("/task-sdk", { taskId: "task-2", method: "fetchHistory", args: [] });
  assert.equal(cancelledTaskCall.status, 500);
  assert.match(cancelledTaskCall.body.error, /no active task/);
  const cancelledChunk = await post("/chunk", { taskId: "task-2", content: "late" });
  assert.equal(cancelledChunk.status, 500);
  assert.match(cancelledChunk.body.error, /no active task/);
  const cancelledComplete = await post("/complete", { taskId: "task-2", content: "late done" });
  assert.equal(cancelledComplete.status, 500);
  assert.match(cancelledComplete.body.error, /no active task/);
  const cancelledError = await post("/error", { taskId: "task-2", error: "late cancelled" });
  assert.equal(cancelledError.status, 500);
  assert.match(cancelledError.body.error, /no active task/);

  const preAbortedTask = new FakeTask();
  preAbortedTask.taskId = "task-pre-aborted";
  preAbortedTask.abortController.abort();
  await agent.handler(preAbortedTask);
  const preAbortedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-pre-aborted") && Date.now() < preAbortedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-pre-aborted"));
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-pre-aborted"), false);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const bad = await post("/agent-sdk", { method: "notAllowed", args: [] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /unsupported SDK method/);

  const signalCleanupTask = new FakeTask();
  signalCleanupTask.taskId = "task-signal-cleanup-runtime-active";
  await agent.handler(signalCleanupTask);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  agent.emit("disconnected");
  const signalCleanupDisconnectedDeadline = Date.now() + 1000;
  while ((await post("/healthz")).body.connected !== false && Date.now() < signalCleanupDisconnectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal((await post("/chunk", { taskId: "task-signal-cleanup-runtime-active", content: "drop on signal cleanup" })).status, 200);
  assert.deepEqual(signalCleanupTask.chunks, []);
  assert.equal(tasks.size, 1);
  clearControlState();
  clearControlState();
  assert.equal(tasks.size, 0);
  agent.emit("connected");
  const signalCleanupReconnectDeadline = Date.now() + 1000;
  while ((await post("/healthz")).body.connected !== true && Date.now() < signalCleanupReconnectDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual(signalCleanupTask.chunks, []);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 0));

  const shutdownTask = new FakeTask();
  shutdownTask.taskId = "task-shutdown-runtime-active";
  await agent.handler(shutdownTask);
  assert.deepEqual((await post("/healthz")).body, healthBody(true, 1));
  agent.emit("disconnected");
  const shutdownDisconnectedDeadline = Date.now() + 1000;
  while ((await post("/healthz")).body.connected !== false && Date.now() < shutdownDisconnectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual((await post("/healthz")).body, healthBody(false, 1));
  assert.equal((await post("/chunk", { taskId: "task-shutdown-runtime-active", content: "drop on shutdown" })).status, 200);
  assert.deepEqual(shutdownTask.chunks, []);
  assert.equal(tasks.size, 1);
  assert.equal(typeof clearControlState, "function");

  assert.deepEqual((await post("/shutdown")).body, { ok: true });
  const shutdownDeadline = Date.now() + 1000;
  while (shutdownCalls === 0 && Date.now() < shutdownDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(shutdownCalls, 1);
  assert.equal(agent.disconnected, true);
  assert.equal(tasks.size, 0);
  assert.deepEqual(shutdownTask.chunks, []);

  console.log("sidecar runtime OK");
} finally {
  if (!controlClosedByShutdown) {
    controlServer.close();
  }
  adapterServer.close();
}
