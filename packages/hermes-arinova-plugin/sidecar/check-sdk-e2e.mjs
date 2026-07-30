import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import { buildAgentOptions, createControlServer, listen } from "./runtime.mjs";
import { FakeArinovaServer } from "./check-sdk-e2e-fixtures.mjs";

const sdkPackage = JSON.parse(
  readFileSync(new URL("./node_modules/@arinova-ai/agent-sdk/package.json", import.meta.url), "utf8")
);
const EXPECTED_TASK_SDK_METHODS = [
  "uploadFile",
  "fetchHistory",
  "callAction"
];
const EXPECTED_RETRYABLE_AUTH_ERROR_MARKERS = [
  "timeout",
  "timed out",
  "not ready",
  "unavailable",
  "temporarily",
  "connection",
  "network",
  "econnrefused",
  "gateway",
  "502",
  "503",
  "504"
];
const calledTaskMethods = new Set();

function assertAuthEnvelope(auth, botToken, label = "agent_auth") {
  assert.equal(auth.type, "agent_auth", `${label} frame type`);
  assert.equal(auth.botToken, botToken, `${label} bot token`);
  assert.deepEqual(auth.runtime, {
    name: "arinova-agent-sdk",
    version: sdkPackage.version,
    language: "typescript",
    platform: "node"
  }, `${label} runtime metadata`);
  assert.deepEqual(auth.capabilities, {
    actionCall: {
      supported: true,
      protocolVersion: "2026-05-05",
      canEmitFrames: true,
      supportsActionResultContinuation: true,
      supportsGetSchema: true,
      schemaCache: false
    }
  }, `${label} action_call capabilities`);
}

const arinova = new FakeArinovaServer();
const arinovaPort = await arinova.listen();

const adapterEvents = [];
const adapterServer = createServer(async (req, res) => {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) body += chunk;
  adapterEvents.push({
    path: req.url,
    token: req.headers["x-arinova-bridge-token"],
    body: body ? JSON.parse(body) : {}
  });
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});
adapterServer.listen(0, "127.0.0.1");
await once(adapterServer, "listening");

const sharedToken = "bridge-token";
function speedSdkHeartbeats() {
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (callback, delay, ...args) => {
    return originalSetInterval(callback, delay === 60_000 ? 100 : delay, ...args);
  };
  return () => {
    globalThis.setInterval = originalSetInterval;
  };
}
function speedSdkDefaultPings() {
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (callback, delay, ...args) => {
    return originalSetInterval(callback, delay === 30_000 ? 50 : delay, ...args);
  };
  return () => {
    globalThis.setInterval = originalSetInterval;
  };
}
const observedSdkAuthRetryDelays = [];
function speedSdkAuthRetries() {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (typeof delay === "number" && delay >= 5_000) {
      observedSdkAuthRetryDelays.push(delay);
    }
    return originalSetTimeout(callback, typeof delay === "number" && delay >= 5_000 ? 50 : delay, ...args);
  };
  return () => {
    globalThis.setTimeout = originalSetTimeout;
  };
}
function speedSdkActionTimeouts() {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    return originalSetTimeout(callback, delay === 60_000 ? 50 : delay, ...args);
  };
  return () => {
    globalThis.setTimeout = originalSetTimeout;
  };
}
function speedSdkDefaultReconnects() {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => {
    return originalSetTimeout(callback, delay === 5_000 ? 50 : delay, ...args);
  };
  return () => {
    globalThis.setTimeout = originalSetTimeout;
  };
}
const restoreCommandIntervals = speedSdkHeartbeats();
const agentOptions = buildAgentOptions({
  serverUrl: `ws://127.0.0.1:${arinovaPort}`,
  botToken: "ari_test",
  env: {
    ARINOVA_AGENT_SKILLS_JSON: JSON.stringify([
      { id: "memo", name: "Memo", description: "Read and write memos" },
      { id: "chat", name: "Chat", description: "" }
    ]),
    ARINOVA_RECONNECT_INTERVAL_MS: "250",
    ARINOVA_CONCURRENCY_MODE: "agent-wide",
    ARINOVA_PING_INTERVAL_MS: "100",
    ARINOVA_PING_TIMEOUT_MS: "250"
  }
});
const agent = new ArinovaAgent(agentOptions);
const { controlServer } = createControlServer({
  agent,
  agentSkills: agentOptions.skills,
  adapterUrl: `http://127.0.0.1:${adapterServer.address().port}`,
  sharedToken,
  onShutdown: () => {}
});
await listen(controlServer, 0, "127.0.0.1");
const controlPort = controlServer.address().port;

async function postControl(path, body) {
  const res = await fetch(`http://127.0.0.1:${controlPort}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arinova-Bridge-Token": sharedToken
    },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

async function callAgentSdk(method, args = []) {
  const response = await postControl("/agent-sdk", { method, args });
  assert.equal(response.status, 200, `${method}: ${JSON.stringify(response.body)}`);
  return response.body.result;
}

async function callTaskSdk(taskId, method, args = []) {
  const response = await postControl("/task-sdk", { taskId, method, args });
  assert.equal(response.status, 200, `${method}: ${JSON.stringify(response.body)}`);
  if (EXPECTED_TASK_SDK_METHODS.includes(method)) calledTaskMethods.add(method);
  return response.body.result;
}

async function taskSdkError(taskId, method, args = []) {
  const response = await postControl("/task-sdk", { taskId, method, args });
  assert.equal(response.status, 500, `${method}: ${JSON.stringify(response.body)}`);
  assert.equal(response.body.ok, false);
  return String(response.body.error);
}

async function waitForAdapterTask(taskId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const event = adapterEvents.find((candidate) => candidate.path === "/task" && candidate.body.taskId === taskId);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for adapter task ${taskId}`);
}

try {
  const connected = agent.connect();
  const auth = await arinova.waitFor((message) => message.type === "agent_auth");
  assertAuthEnvelope(auth, "ari_test", "initial agent_auth");
  assert.deepEqual(auth.skills, [
    { id: "memo", name: "Memo", description: "Read and write memos" },
    { id: "chat", name: "Chat", description: "" }
  ]);
  arinova.send({
    type: "auth_ok",
    agentId: "agent-1",
    permanentToken: "ari_perm",
    onboardingSeed: {
      kind: "first_touch_opening",
      seedId: "seed-1",
      agentId: "agent-1",
      action: "open",
      prompt: "Say hello"
    }
  });
  await connected;
  assert.equal(agent.getAgentId(), "agent-1");
  assert.equal(agent.getOnboardingSeed().prompt, "Say hello");
  assert.deepEqual(await arinova.waitFor((message) => message.type === "register_commands"), {
    type: "register_commands",
    agentId: "agent-1",
    commands: [
      { name: "memo", description: "Read and write memos" },
      { name: "chat", description: "" }
    ]
  });
  try {
    const commandHeartbeat = await arinova.waitFor((message) => message.type === "heartbeat_commands");
    assert.deepEqual(commandHeartbeat, {
      type: "heartbeat_commands",
      agentId: "agent-1"
    });
  } finally {
    restoreCommandIntervals();
  }
  const connectedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected) && Date.now() < connectedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const connectedEvent = adapterEvents.find((event) => event.path === "/connection-status" && event.body.connected);
  assert.equal(connectedEvent.body.agentId, "agent-1");
  const seedDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/onboarding-seed") && Date.now() < seedDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const seedEvent = adapterEvents.find((event) => event.path === "/onboarding-seed");
  assert.equal(seedEvent.body.seedId, "seed-1");
  assert.equal(seedEvent.body.prompt, "Say hello");
  const onboardingSeedCountBeforeMalformedAuth = adapterEvents.filter((event) => event.path === "/onboarding-seed").length;
  const connectionStatusCountBeforeDuplicateAuth = adapterEvents.filter(
    (event) => event.path === "/connection-status" && event.body.connected === true
  ).length;
  arinova.send({
    type: "auth_ok",
    agentId: "agent-1",
    onboardingSeed: {
      kind: "something_else",
      seedId: "malformed-seed",
      agentId: "agent-1",
      action: "open",
      prompt: "should not be forwarded"
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    adapterEvents.filter((event) => event.path === "/onboarding-seed").length,
    onboardingSeedCountBeforeMalformedAuth,
    "malformed auth_ok onboardingSeed should not be forwarded"
  );
  assert.equal(
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length,
    connectionStatusCountBeforeDuplicateAuth,
    "duplicate auth_ok should not forward duplicate Hermes connection-status"
  );
  const tokenDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/token-claimed") && Date.now() < tokenDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const tokenClaimed = adapterEvents.find((event) => event.path === "/token-claimed");
  assert.equal(tokenClaimed.body.agentId, "agent-1");
  assert.equal(tokenClaimed.body.permanentToken, "ari_perm");
  arinova.send({
    type: "claim_ok",
    agentId: "agent-1",
    permanentToken: "ari_claim_perm"
  });
  const claimDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_claim_perm") && Date.now() < claimDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const claimToken = adapterEvents.find((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_claim_perm");
  assert.equal(claimToken.body.agentId, "agent-1");
  const onboardingSeedCountBeforeClaimOk = adapterEvents.filter((event) => event.path === "/onboarding-seed").length;
  assert.equal(
    await callAgentSdk("getOnboardingSeed"),
    null,
    "claim_ok should leave SDK onboarding seed null until permanent-token auth_ok"
  );
  assert.equal(
    adapterEvents.filter((event) => event.path === "/onboarding-seed").length,
    onboardingSeedCountBeforeClaimOk,
    "claim_ok should not forward an onboarding seed to Hermes"
  );
  arinova.send({
    type: "claim_ok",
    permanentToken: "ari_claim_no_agent_perm"
  });
  const claimWithoutAgentDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_claim_no_agent_perm") && Date.now() < claimWithoutAgentDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const claimWithoutAgentToken = adapterEvents.find((event) => event.path === "/token-claimed" && event.body.permanentToken === "ari_claim_no_agent_perm");
  assert.equal(claimWithoutAgentToken.body.agentId, "agent-1");
  const authCountBeforeClaimReconnect = arinova.messages.filter((message) => message.type === "agent_auth").length;
  arinova.socket.destroy();
  const claimReconnectAuths = await arinova.waitForCount(
    (message) => message.type === "agent_auth",
    authCountBeforeClaimReconnect + 1
  );
  assertAuthEnvelope(claimReconnectAuths.at(-1), "ari_claim_no_agent_perm", "claim-token reconnect agent_auth");
  arinova.send({
    type: "auth_ok",
    agentId: "agent-1",
    onboardingSeed: {
      kind: "first_touch_opening",
      seedId: "seed-claim",
      agentId: "agent-1",
      action: "open",
      prompt: "Claimed token hello"
    }
  });
  const claimSeedDeadline = Date.now() + 1000;
  while (
    !adapterEvents.some((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-claim")
    && Date.now() < claimSeedDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const claimSeedEvent = adapterEvents.find((event) => event.path === "/onboarding-seed" && event.body.seedId === "seed-claim");
  assert.equal(claimSeedEvent.body.prompt, "Claimed token hello");

  assert.equal(await callAgentSdk("getAgentId"), "agent-1");
  assert.equal((await callAgentSdk("getOnboardingSeed")).prompt, "Claimed token hello");

  const httpSendRequestsBeforeWsSendMessage = arinova.httpRequests.filter((request) => request.path === "/api/v1/messages/send").length;
  assert.equal(await callAgentSdk("sendMessage", ["conv-1", "proactive hello"]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "agent_send"), {
    type: "agent_send",
    conversationId: "conv-1",
    content: "proactive hello"
  });
  assert.equal(
    arinova.httpRequests.filter((request) => request.path === "/api/v1/messages/send").length,
    httpSendRequestsBeforeWsSendMessage,
    "sendMessage should use agent_send websocket frame while connected"
  );

  assert.equal(await callAgentSdk("sendTelemetry", ["smoke", { ok: true }]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "agent_telemetry"), {
    type: "agent_telemetry",
    event: "smoke",
    data: { ok: true }
  });

  assert.equal(await callAgentSdk("sendHud", [{ status: "green" }, "conv-1"]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "hud_update"), {
    type: "hud_update",
    data: { status: "green" },
    conversationId: "conv-1"
  });

  assert.equal(await callAgentSdk("sendHud", [{ status: "global" }]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "hud_update" && message.data?.status === "global"), {
    type: "hud_update",
    data: { status: "global" }
  });

  assert.equal(await callAgentSdk("sendTaskUpdate", ["Hermes", { status: "started", task: "smoke" }]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "task_update"), {
    type: "task_update",
    agentName: "Hermes",
    data: { status: "started", task: "smoke" }
  });

  assert.equal(
    await callAgentSdk("sendTaskUpdate", ["Hermes", { status: "completed", durationMs: 12, costUsd: 0.02, numTurns: 3 }]),
    null
  );
  assert.deepEqual(await arinova.waitFor((message) => message.type === "task_update" && message.data?.status === "completed"), {
    type: "task_update",
    agentName: "Hermes",
    data: { status: "completed", durationMs: 12, costUsd: 0.02, numTurns: 3 }
  });

  assert.equal(await callAgentSdk("reportToolCall", [{
    sessionId: "session-1",
    turnId: "turn-1",
    seqOrder: 0,
    toolName: "arinova_query_memory",
    input: { query: "hello" },
    output: [{ content: "memory" }],
    durationMs: 42,
    success: true,
    messageId: "msg-1"
  }]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "tool_call_report"), {
    type: "tool_call_report",
    report: {
      sessionId: "session-1",
      turnId: "turn-1",
      seqOrder: 0,
      toolName: "arinova_query_memory",
      input: { query: "hello" },
      output: [{ content: "memory" }],
      durationMs: 42,
      success: true,
      messageId: "msg-1"
    }
  });

  assert.equal(await callAgentSdk("reportToolCall", [{
    sessionId: "session-1",
    turnId: "turn-1",
    seqOrder: 1,
    toolName: "arinova_sdk_call",
    input: { method: "queryMemory" },
    durationMs: 7,
    success: false,
    error: "tool failed",
    messageId: "msg-2"
  }]), null);
  assert.deepEqual(await arinova.waitFor((message) => message.type === "tool_call_report" && message.report?.success === false), {
    type: "tool_call_report",
    report: {
      sessionId: "session-1",
      turnId: "turn-1",
      seqOrder: 1,
      toolName: "arinova_sdk_call",
      input: { method: "queryMemory" },
      durationMs: 7,
      success: false,
      error: "tool failed",
      messageId: "msg-2"
    }
  });

  const globalActionResultPromise = callAgentSdk("callAction", [
    "global.action",
    { value: 1 },
    {
      callId: "global-call",
      timeoutMs: 1000,
      taskId: "global-task",
      conversationId: "conv-global",
      messageId: "msg-global",
      parentCallId: "parent-call",
      reason: "smoke",
      metadata: { source: "sidecar-smoke" },
      dryRun: true
    }
  ]);
  const globalAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.action");
  assert.deepEqual(globalAction, {
    type: "action_call",
    id: "global-call",
    action: "global.action",
    arguments: { value: 1 },
    taskId: "global-task",
    conversationId: "conv-global",
    messageId: "msg-global",
    parentCallId: "parent-call",
    reason: "smoke",
    metadata: { source: "sidecar-smoke" },
    dryRun: true
  });
  arinova.send({
    type: "action_result",
    id: "global-call",
    action: "global.action",
    status: "requires_confirmation",
    confirmation: {
      confirmationId: "confirm-1",
      title: "Confirm action",
      summary: "Review before running",
      expiresAt: "2026-06-29T00:00:00.000Z"
    },
    traceId: "trace-1",
    actionVersion: "v1",
    dryRun: true
  });
  assert.deepEqual(await globalActionResultPromise, {
    callId: "global-call",
    action: "global.action",
    status: "requires_confirmation",
    result: null,
    error: null,
    confirmation: {
      confirmationId: "confirm-1",
      title: "Confirm action",
      summary: "Review before running",
      expiresAt: "2026-06-29T00:00:00.000Z"
    },
    traceId: "trace-1",
    actionVersion: "v1",
    dryRun: true
  });

  const generatedCallIdResultPromise = callAgentSdk("callAction", [
    "global.generated-call-id",
    { value: 2 },
    { timeoutMs: 1000 }
  ]);
  const generatedCallIdAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.generated-call-id");
  assert.match(generatedCallIdAction.id, /^call_/);
  assert.deepEqual(generatedCallIdAction, {
    type: "action_call",
    id: generatedCallIdAction.id,
    action: "global.generated-call-id",
    arguments: { value: 2 }
  });
  arinova.send({
    type: "action_result",
    id: generatedCallIdAction.id,
    action: "global.generated-call-id",
    status: "success",
    result: { generated: true }
  });
  assert.deepEqual(await generatedCallIdResultPromise, {
    callId: generatedCallIdAction.id,
    action: "global.generated-call-id",
    status: "success",
    result: { generated: true },
    error: null,
    confirmation: null
  });

  const transientActionResultPromise = callAgentSdk("callAction", [
    "global.transient",
    { value: 5 },
    { callId: "global-transient-call", timeoutMs: 1000 }
  ]);
  const transientAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.transient");
  assert.deepEqual(transientAction, {
    type: "action_call",
    id: "global-transient-call",
    action: "global.transient",
    arguments: { value: 5 }
  });
  let transientResolved = false;
  transientActionResultPromise.then(() => {
    transientResolved = true;
  });
  for (const status of ["received", "validating", "processing"]) {
    arinova.send({
      type: "action_result",
      id: "global-transient-call",
      action: "global.transient",
      status
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(transientResolved, false, `${status} resolved a pending action_call`);
  }
  arinova.send({
    type: "action_result",
    id: "global-transient-call",
    action: "global.transient",
    status: "success",
    result: { ok: true }
  });
  assert.deepEqual(await transientActionResultPromise, {
    callId: "global-transient-call",
    action: "global.transient",
    status: "success",
    result: { ok: true },
    error: null,
    confirmation: null
  });

  const globalActionErrorPromise = callAgentSdk("callAction", [
    "global.error",
    { value: 3 },
    { callId: "global-error-call", timeoutMs: 1000 }
  ]);
  const globalErrorAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.error");
  assert.deepEqual(globalErrorAction, {
    type: "action_call",
    id: "global-error-call",
    action: "global.error",
    arguments: { value: 3 }
  });
  arinova.send({
    type: "action_result",
    id: "global-error-call",
    action: "global.error",
    status: "error",
    error: {
      code: "VALIDATION_FAILED",
      message: "Value was rejected",
      details: { field: "value", reason: "too-small" }
    },
    traceId: "trace-error"
  });
  assert.deepEqual(await globalActionErrorPromise, {
    callId: "global-error-call",
    action: "global.error",
    status: "error",
    result: null,
    error: {
      code: "VALIDATION_FAILED",
      message: "Value was rejected",
      details: { field: "value", reason: "too-small" }
    },
    confirmation: null,
    traceId: "trace-error"
  });

  const globalActionCancelledPromise = callAgentSdk("callAction", [
    "global.cancelled",
    { value: 4 },
    { callId: "global-cancelled-call", timeoutMs: 1000 }
  ]);
  const globalCancelledAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.cancelled");
  assert.deepEqual(globalCancelledAction, {
    type: "action_call",
    id: "global-cancelled-call",
    action: "global.cancelled",
    arguments: { value: 4 }
  });
  arinova.send({
    type: "action_result",
    id: "global-cancelled-call",
    action: "global.cancelled",
    status: "cancelled",
    result: { reason: "user_cancelled" },
    traceId: "trace-cancelled"
  });
  assert.deepEqual(await globalActionCancelledPromise, {
    callId: "global-cancelled-call",
    action: "global.cancelled",
    status: "cancelled",
    result: { reason: "user_cancelled" },
    error: null,
    confirmation: null,
    traceId: "trace-cancelled"
  });

  const globalActionTimeoutPromise = postControl("/agent-sdk", {
    method: "callAction",
    args: [
      "global.timeout",
      { value: 9 },
      { callId: "global-timeout-call", timeoutMs: 50 }
    ]
  });
  const globalTimeoutAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.timeout");
  assert.deepEqual(globalTimeoutAction, {
    type: "action_call",
    id: "global-timeout-call",
    action: "global.timeout",
    arguments: { value: 9 }
  });
  const globalActionTimeout = await globalActionTimeoutPromise;
  assert.equal(globalActionTimeout.status, 500);
  assert.match(globalActionTimeout.body.error, /action_call global\.timeout \(global-timeout-call\) timed out/);
  arinova.send({
    type: "action_result",
    id: "global-timeout-call",
    action: "global.timeout",
    status: "success",
    result: { tooLate: true }
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    arinova.messages.filter((message) => message.type === "action_call" && message.id === "global-timeout-call").length,
    1,
    "late action_result after timeout should not reopen or duplicate action_call state"
  );

  const restoreActionTimeouts = speedSdkActionTimeouts();
  try {
    const globalDefaultTimeoutPromise = postControl("/agent-sdk", {
      method: "callAction",
      args: [
        "global.default-timeout",
        { value: 10 },
        { callId: "global-default-timeout-call" }
      ]
    });
    const globalDefaultTimeoutAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.default-timeout");
    assert.deepEqual(globalDefaultTimeoutAction, {
      type: "action_call",
      id: "global-default-timeout-call",
      action: "global.default-timeout",
      arguments: { value: 10 }
    });
    const globalDefaultTimeout = await globalDefaultTimeoutPromise;
    assert.equal(globalDefaultTimeout.status, 500);
    assert.match(globalDefaultTimeout.body.error, /action_call global\.default-timeout \(global-default-timeout-call\) timed out/);
  } finally {
    restoreActionTimeouts();
  }

  arinova.sendRaw("{bad-json");
  const malformedWsDeadline = Date.now() + 1000;
  while (!adapterEvents.some((event) => event.path === "/sdk-error" && /JSON|Unexpected|position/.test(event.body.error)) && Date.now() < malformedWsDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const malformedWsError = adapterEvents.find((event) => event.path === "/sdk-error" && /JSON|Unexpected|position/.test(event.body.error));
  assert.ok(malformedWsError, "malformed websocket JSON did not surface through /sdk-error");
  assert.equal(await callAgentSdk("getAgentId"), "agent-1");

  arinova.send({
    type: "task",
    taskId: "task-1",
    userMessageId: "msg-1",
    conversationId: "conv-1",
    conversationType: "direct",
    content: "hello Hermes",
    senderUserId: "user-1",
    senderUsername: "User",
    senderAgentId: "agent-helper",
    senderAgentName: "Helper",
    members: [{ agentId: "agent-researcher", agentName: "Researcher" }],
    replyTo: { role: "assistant", content: "previous answer", senderAgentName: "Helper" },
    history: [{ role: "user", content: "earlier question", senderAgentName: "Helper", senderUsername: "User", createdAt: "2026-06-29T00:59:00.000Z" }],
    attachments: [{ id: "att-1", fileName: "a.txt", fileType: "text/plain", fileSize: 1, url: "https://x" }],
    availableSkills: [{
      slug: "memo", name: "Memo", slashCommand: "/memo", description: "Read and write memos" },
      { slug: "", name: "  ", slashCommand: null, description: "" }
    ]
  });

  const deadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const taskEvent = adapterEvents.find((event) => event.path === "/task");
  assert.equal(taskEvent.token, sharedToken);
  assert.equal(taskEvent.body.taskId, "task-1");
  assert.equal(taskEvent.body.userMessageId, "msg-1");
  assert.equal(taskEvent.body.conversationId, "conv-1");
  assert.equal(taskEvent.body.conversationType, "direct");
  assert.equal(taskEvent.body.senderUserId, "user-1");
  assert.equal(taskEvent.body.senderUsername, "User");
  assert.equal(taskEvent.body.senderAgentId, "agent-helper");
  assert.equal(taskEvent.body.senderAgentName, "Helper");
  assert.deepEqual(taskEvent.body.members, [{ agentId: "agent-researcher", agentName: "Researcher" }]);
  assert.deepEqual(taskEvent.body.replyTo, { role: "assistant", content: "previous answer", senderAgentName: "Helper" });
  assert.deepEqual(taskEvent.body.history, [{ role: "user", content: "earlier question", senderAgentName: "Helper", senderUsername: "User", createdAt: "2026-06-29T00:59:00.000Z" }]);
  assert.deepEqual(taskEvent.body.attachments[0], {
    id: "att-1",
    fileName: "a.txt",
    fileType: "text/plain",
    fileSize: 1,
    url: "https://x"
  });
  assert.deepEqual(taskEvent.body.availableSkills, [
    { slug: "memo", name: "Memo", slashCommand: "/memo", description: "Read and write memos" },
    { slug: "chat", name: "Chat", slashCommand: "/chat", description: "" }
  ]);
  assert.equal(taskEvent.body.content, "hello Hermes");

  arinova.send({
    type: "task",
    taskId: "task-queued",
    userMessageId: "msg-queued",
    conversationId: "conv-queued",
    conversationType: "direct",
    content: "queued while task-1 is active"
  });
  const queued = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-queued");
  assert.deepEqual(queued, {
    type: "task_queued",
    taskId: "task-queued",
    conversationId: "conv-queued",
    queuePosition: 0,
    globalQueueSize: 1
  });
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-queued"), false);

  const history = await callTaskSdk("task-1", "fetchHistory", [{ limit: 1 }]);
  assert.deepEqual(history, {
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
  assert.equal(arinova.httpRequests.at(-1).path, "/api/v1/messages/conv-1");
  assert.equal(arinova.httpRequests.at(-1).search, "?limit=1");

  const defaultHistory = await callTaskSdk("task-1", "fetchHistory");
  assert.deepEqual(defaultHistory, { messages: [], hasMore: false });
  assert.equal(arinova.httpRequests.at(-1).path, "/api/v1/messages/conv-1");
  assert.equal(arinova.httpRequests.at(-1).search, "");

  const upload = await callTaskSdk("task-1", "uploadFile", [{ base64: "SGk=" }, "task.txt", "text/plain"]);
  assert.deepEqual(upload, {
    url: "https://file/task.txt",
    fileName: "task.txt",
    fileType: "text/plain",
    fileSize: 2
  });
  assert.equal(arinova.httpRequests.at(-1).path, "/api/v1/files/upload");

  assert.match(
    await taskSdkError("task-1", "fetchHistory", [{ before: "duplicate-json" }]),
    /fetchHistory returned malformed JSON: JSON object contains duplicate key: messages/
  );
  assert.match(
    await taskSdkError("task-1", "uploadFile", [{ base64: "SGk=" }, "duplicate-json.bin", "application/octet-stream"]),
    /uploadFile returned malformed JSON: JSON object contains duplicate key: url/
  );

  const taskActionIdOverride = await postControl("/task-sdk", {
    taskId: "task-1",
    method: "callAction",
    args: [
      "task.action",
      { value: 2 },
      {
        callId: "task-call-bad",
        taskId: "wrong-task",
        conversationId: "wrong-conv",
        messageId: "wrong-message"
      }
    ]
  });
  assert.equal(taskActionIdOverride.status, 400);
  assert.match(taskActionIdOverride.body.error, /args\[2\] has unsupported field\(s\): conversationId, messageId, taskId/);

  const taskActionResultPromise = callTaskSdk("task-1", "callAction", [
    "task.action",
    { value: 2 },
    {
      callId: "task-call",
      timeoutMs: 1000,
      reason: "task smoke"
    }
  ]);
  const taskAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "task.action");
  assert.deepEqual(taskAction, {
    type: "action_call",
    id: "task-call",
    action: "task.action",
    arguments: { value: 2 },
    taskId: "task-1",
    conversationId: "conv-1",
    messageId: "task-1",
    reason: "task smoke"
  });
  arinova.send({
    type: "action_result",
    id: "task-call",
    action: "task.action",
    status: "success",
    result: { ok: true },
    traceId: "trace-task",
    actionVersion: "task-v1",
    dryRun: false
  });
  assert.deepEqual(await taskActionResultPromise, {
    callId: "task-call",
    action: "task.action",
    status: "success",
    result: { ok: true },
    error: null,
    confirmation: null,
    traceId: "trace-task",
    actionVersion: "task-v1",
    dryRun: false
  });

  const taskActionFullOptionsPromise = callTaskSdk("task-1", "callAction", [
    "task.action.full-options",
    { value: 3 },
    {
      callId: "task-call-full-options",
      parentCallId: "task-parent-call",
      reason: "task full options",
      metadata: { source: "task-sidecar-smoke" },
      dryRun: true,
      timeoutMs: 1000
    }
  ]);
  const taskActionFullOptions = await arinova.waitFor((message) => message.type === "action_call" && message.action === "task.action.full-options");
  assert.deepEqual(taskActionFullOptions, {
    type: "action_call",
    id: "task-call-full-options",
    action: "task.action.full-options",
    arguments: { value: 3 },
    taskId: "task-1",
    conversationId: "conv-1",
    messageId: "task-1",
    parentCallId: "task-parent-call",
    reason: "task full options",
    metadata: { source: "task-sidecar-smoke" },
    dryRun: true
  });
  arinova.send({
    type: "action_result",
    id: "task-call-full-options",
    action: "task.action.full-options",
    status: "success",
    result: { ok: true },
    dryRun: true
  });
  assert.deepEqual(await taskActionFullOptionsPromise, {
    callId: "task-call-full-options",
    action: "task.action.full-options",
    status: "success",
    result: { ok: true },
    error: null,
    confirmation: null,
    dryRun: true
  });

  const missingChunkContent = await postControl("/chunk", { taskId: "task-1" });
  assert.equal(missingChunkContent.status, 400);
  assert.match(missingChunkContent.body.error, /content must be a string/);
  const numericChunkContent = await postControl("/chunk", { taskId: "task-1", content: 0 });
  assert.equal(numericChunkContent.status, 400);
  assert.match(numericChunkContent.body.error, /content must be a string/);
  assert.equal(
    arinova.messages.some((message) => message.type === "agent_chunk" && message.taskId === "task-1"),
    false
  );

  assert.equal((await postControl("/chunk", { taskId: "task-1", content: "delta" })).status, 200);
  const chunk = await arinova.waitFor((message) => message.type === "agent_chunk");
  assert.deepEqual(chunk, { type: "agent_chunk", taskId: "task-1", chunk: "delta" });
  assert.equal((await postControl("/chunk", { taskId: "  task-1  ", content: "trimmed delta" })).status, 200);
  const trimmedChunk = await arinova.waitFor(
    (message) => message.type === "agent_chunk" && message.chunk === "trimmed delta"
  );
  assert.deepEqual(trimmedChunk, { type: "agent_chunk", taskId: "task-1", chunk: "trimmed delta" });

  assert.deepEqual(await callTaskSdk("  task-1  ", "  fetchHistory  "), { messages: [], hasMore: false });

  assert.equal((await postControl("/complete", { taskId: "  task-1  ", content: "done", mentions: ["user-1"] })).status, 200);
  const complete = await arinova.waitFor((message) => message.type === "agent_complete");
  assert.deepEqual(complete, {
    type: "agent_complete",
    taskId: "task-1",
    content: "done",
    mentions: ["user-1"]
  });

  const queuedTaskDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-queued") && Date.now() < queuedTaskDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const queuedTaskEvent = adapterEvents.find((event) => event.path === "/task" && event.body.taskId === "task-queued");
  assert.equal(queuedTaskEvent.body.conversationId, "conv-queued");
  assert.equal(queuedTaskEvent.body.content, "queued while task-1 is active");
  assert.deepEqual(queuedTaskEvent.body.availableSkills, [
    { slug: "memo", name: "Memo", slashCommand: "/memo", description: "Read and write memos" },
    { slug: "chat", name: "Chat", slashCommand: "/chat", description: "" }
  ]);
  assert.equal((await postControl("/error", { taskId: "task-queued", error: "queued e2e done" })).status, 200);
  const queuedError = await arinova.waitFor((message) => message.type === "agent_error" && message.taskId === "task-queued");
  assert.equal(queuedError.error, "queued e2e done");

  arinova.send({
    type: "task",
    taskId: "task-fair-a1",
    userMessageId: "msg-fair-a1",
    conversationId: "conv-fair-A",
    conversationType: "direct",
    content: "fair active A1"
  });
  await waitForAdapterTask("task-fair-a1");
  arinova.send({
    type: "task",
    taskId: "task-fair-a2",
    userMessageId: "msg-fair-a2",
    conversationId: "conv-fair-A",
    conversationType: "direct",
    content: "fair queued A2"
  });
  const fairQueuedA2 = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-fair-a2");
  assert.equal(fairQueuedA2.queuePosition, 0);
  assert.equal(fairQueuedA2.globalQueueSize, 1);
  arinova.send({
    type: "task",
    taskId: "task-fair-b1",
    userMessageId: "msg-fair-b1",
    conversationId: "conv-fair-B",
    conversationType: "direct",
    content: "fair queued B1"
  });
  const fairQueuedB1 = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-fair-b1");
  assert.equal(fairQueuedB1.queuePosition, 0);
  assert.equal(fairQueuedB1.globalQueueSize, 2);
  for (const [suffix, conversationId] of [
    ["a3", "conv-fair-A"],
    ["b2", "conv-fair-B"],
    ["c1", "conv-fair-C"]
  ]) {
    arinova.send({
      type: "task",
      taskId: `task-fair-${suffix}`,
      userMessageId: `msg-fair-${suffix}`,
      conversationId,
      conversationType: "direct",
      content: `fair queued ${suffix.toUpperCase()}`
    });
  }
  const fairQueuedC1 = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-fair-c1");
  assert.equal(fairQueuedC1.queuePosition, 0);
  assert.equal(fairQueuedC1.globalQueueSize, 5);

  const fairRunOrder = ["task-fair-a1"];
  for (const taskId of ["task-fair-a1", "task-fair-a2", "task-fair-b1", "task-fair-b2", "task-fair-a3"]) {
    assert.equal((await postControl("/complete", { taskId, content: `${taskId} done` })).status, 200);
    await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === taskId);
    if (taskId !== "task-fair-a3") {
      const nextTaskId = {
        "task-fair-a1": "task-fair-a2",
        "task-fair-a2": "task-fair-b1",
        "task-fair-b1": "task-fair-b2",
        "task-fair-b2": "task-fair-a3"
      }[taskId];
      await waitForAdapterTask(nextTaskId);
      fairRunOrder.push(nextTaskId);
    }
  }
  await waitForAdapterTask("task-fair-c1");
  fairRunOrder.push("task-fair-c1");
  assert.deepEqual(fairRunOrder, [
    "task-fair-a1",
    "task-fair-a2",
    "task-fair-b1",
    "task-fair-b2",
    "task-fair-a3",
    "task-fair-c1"
  ]);
  assert.equal((await postControl("/complete", { taskId: "task-fair-c1", content: "task-fair-c1 done" })).status, 200);
  await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-fair-c1");

  arinova.send({
    type: "task",
    taskId: "task-cancel-queued-active",
    userMessageId: "msg-cancel-queued-active",
    conversationId: "conv-cancel-queued",
    conversationType: "direct",
    content: "active while queued task is cancelled"
  });
  await waitForAdapterTask("task-cancel-queued-active");
  arinova.send({
    type: "task",
    taskId: "task-cancel-queued-pending",
    userMessageId: "msg-cancel-queued-pending",
    conversationId: "conv-cancel-queued",
    conversationType: "direct",
    content: "queued task to cancel before start"
  });
  const cancelQueuedPending = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-cancel-queued-pending");
  assert.equal(cancelQueuedPending.queuePosition, 0);
  assert.equal(cancelQueuedPending.globalQueueSize, 1);
  arinova.send({ type: "cancel_task", taskId: "task-cancel-queued-pending" });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-cancel-queued-pending"), false);
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-cancel-queued-pending"), false);
  assert.equal((await postControl("/complete", { taskId: "task-cancel-queued-active", content: "cancel queued active done" })).status, 200);
  await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-cancel-queued-active");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-cancel-queued-pending"), false);

  arinova.send({
    type: "task",
    taskId: "task-reconnect-active",
    userMessageId: "msg-reconnect-active",
    conversationId: "conv-reconnect",
    conversationType: "direct",
    content: "active during websocket reconnect"
  });
  await waitForAdapterTask("task-reconnect-active");
  const authCountBeforeActiveReconnect = arinova.messages.filter((message) => message.type === "agent_auth").length;
  const disconnectedCountBeforeActiveDrop = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length;
  arinova.socket.destroy();
  const disconnectedAfterDropDeadline = Date.now() + 3000;
  while (
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length <= disconnectedCountBeforeActiveDrop
    && Date.now() < disconnectedAfterDropDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === false).length > disconnectedCountBeforeActiveDrop,
    "active task socket drop should emit a fresh disconnected status"
  );
  assert.equal((await postControl("/chunk", { taskId: "task-reconnect-active", content: "buffered while offline" })).status, 200);
  assert.equal(
    (await postControl("/complete", {
      taskId: "task-reconnect-active",
      content: "completed while offline",
      mentions: ["user-offline", ""]
    })).status,
    200
  );
  assert.equal(
    arinova.messages.some((message) => message.type === "agent_chunk" && message.taskId === "task-reconnect-active"),
    false,
    "offline chunk should buffer until SDK websocket reconnect auth_ok"
  );
  assert.equal(
    arinova.messages.some((message) => message.type === "agent_complete" && message.taskId === "task-reconnect-active"),
    false,
    "offline terminal event should buffer until SDK websocket reconnect auth_ok"
  );
  const activeReconnectAuths = await arinova.waitForCount(
    (message) => message.type === "agent_auth",
    authCountBeforeActiveReconnect + 1
  );
  assertAuthEnvelope(activeReconnectAuths.at(-1), "ari_claim_no_agent_perm", "active-task reconnect agent_auth");
  const pingCountBeforeActiveAuthOk = arinova.messages.filter((message) => message.type === "ping").length;
  await arinova.waitForCount((message) => message.type === "ping", pingCountBeforeActiveAuthOk + 1);
  const connectedCountBeforeActiveAuthOk = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
  const onboardingSeedCountBeforeSeedlessReconnect = adapterEvents.filter((event) => event.path === "/onboarding-seed").length;
  arinova.send({
    type: "auth_ok",
    agentId: "agent-1"
  });
  const reconnectedAfterDropDeadline = Date.now() + 3000;
  while (
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeActiveAuthOk
    && Date.now() < reconnectedAfterDropDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(
    adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeActiveAuthOk,
    "active task reconnect auth_ok should emit a fresh connected status"
  );
  assert.equal(await callAgentSdk("getOnboardingSeed"), null);
  assert.equal(
    adapterEvents.filter((event) => event.path === "/onboarding-seed").length,
    onboardingSeedCountBeforeSeedlessReconnect,
    "seedless reconnect auth_ok should clear SDK seed without forwarding an onboarding seed"
  );
  const reconnectChunk = await arinova.waitFor((message) => message.type === "agent_chunk" && message.taskId === "task-reconnect-active");
  assert.equal(reconnectChunk.chunk, "buffered while offline");
  const reconnectComplete = await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-reconnect-active");
  assert.equal(reconnectComplete.content, "completed while offline");
  assert.deepEqual(reconnectComplete.mentions, ["user-offline"]);
  assert.ok(
    arinova.messages.findIndex((message) => message === reconnectChunk)
      < arinova.messages.findIndex((message) => message === reconnectComplete),
    "offline chunks should flush before terminal events"
  );
  assert.equal(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-reconnect-active"), false);

  const pingCountBeforeWatchdog = arinova.messages.filter((message) => message.type === "ping").length;
  await arinova.waitForCount((message) => message.type === "ping", pingCountBeforeWatchdog + 1);
  const stableAuthCountBeforeWatchdog = arinova.messages.filter((message) => message.type === "agent_auth").length;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(
    arinova.messages.filter((message) => message.type === "agent_auth").length,
    stableAuthCountBeforeWatchdog,
    "normal ping/pong should not force a reconnect"
  );

  arinova.autoPong = false;
  const authCountBeforePongTimeout = arinova.messages.filter((message) => message.type === "agent_auth").length;
  const pongTimeoutAuths = await arinova.waitForCount(
    (message) => message.type === "agent_auth",
    authCountBeforePongTimeout + 1
  );
  assertAuthEnvelope(pongTimeoutAuths.at(-1), "ari_claim_no_agent_perm", "pong-timeout reconnect agent_auth");
  assert.ok(
    adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === false),
    "pong watchdog reconnect should mark the adapter disconnected"
  );
  arinova.autoPong = true;
  arinova.send({
    type: "auth_ok",
    agentId: "agent-1"
  });
  const watchdogReconnectDeadline = Date.now() + 3000;
  while (
    !adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === true)
    && Date.now() < watchdogReconnectDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(
    adapterEvents.some((event) => event.path === "/connection-status" && event.body.connected === true),
    "pong watchdog reconnect should restore connected status after auth_ok"
  );

  const restoreTaskIntervals = speedSdkHeartbeats();
  try {
    arinova.send({
      type: "task",
      taskId: "task-heartbeat",
      userMessageId: "msg-heartbeat",
      conversationId: "conv-heartbeat",
      conversationType: "direct",
      content: "heartbeat while active"
    });
    const heartbeatTaskDeadline = Date.now() + 3000;
    while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-heartbeat") && Date.now() < heartbeatTaskDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-heartbeat"));
    const heartbeat = await arinova.waitFor((message) => message.type === "agent_heartbeat" && message.taskId === "task-heartbeat");
    assert.equal(heartbeat.taskId, "task-heartbeat");
  } finally {
    restoreTaskIntervals();
  }
  assert.equal((await postControl("/complete", { taskId: "task-heartbeat", content: "heartbeat done" })).status, 200);
  const heartbeatComplete = await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-heartbeat");
  assert.equal(heartbeatComplete.content, "heartbeat done");

  arinova.send({
    type: "task",
    taskId: "task-error-cancelled",
    userMessageId: "msg-error-cancelled",
    conversationId: "conv-1",
    conversationType: "direct",
    content: "cancel through error endpoint"
  });
  const errorCancelDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-error-cancelled") && Date.now() < errorCancelDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-error-cancelled"));
  assert.equal((await postControl("/error", { taskId: "task-error-cancelled", error: "cancelled" })).status, 200);
  const endpointCancelError = await arinova.waitFor((message) => message.type === "agent_error" && message.taskId === "task-error-cancelled");
  assert.deepEqual(endpointCancelError, {
    type: "agent_error",
    taskId: "task-error-cancelled",
    error: "cancelled",
    reason: "cancelled"
  });

  arinova.send({
    type: "task",
    taskId: "task-cron",
    taskKind: "cron_wakeup",
    content: "agent-level wakeup"
  });
  const cronTaskDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-cron") && Date.now() < cronTaskDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const cronTaskEvent = adapterEvents.find((event) => event.path === "/task" && event.body.taskId === "task-cron");
  assert.equal(cronTaskEvent.body.taskKind, "cron_wakeup");
  assert.equal(Object.hasOwn(cronTaskEvent.body, "conversationId"), false);
  assert.equal(cronTaskEvent.body.content, "agent-level wakeup");
  const cronHistory = await postControl("/task-sdk", { taskId: "task-cron", method: "fetchHistory", args: [] });
  assert.equal(cronHistory.status, 500);
  assert.match(cronHistory.body.error, /fetchHistory is unavailable.*cron_wakeup.*not bound to a conversation/);
  const cronUpload = await postControl("/task-sdk", { taskId: "task-cron", method: "uploadFile", args: [{ base64: "SGk=" }, "cron.txt", "text/plain"] });
  assert.equal(cronUpload.status, 500);
  assert.match(cronUpload.body.error, /uploadFile is unavailable.*cron_wakeup.*not bound to a conversation/);
  const cronActionResultPromise = callTaskSdk("task-cron", "callAction", [
    "cron.action",
    { wake: true },
    { callId: "cron-call", timeoutMs: 1000 }
  ]);
  const cronAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "cron.action");
  assert.deepEqual(cronAction, {
    type: "action_call",
    id: "cron-call",
    action: "cron.action",
    arguments: { wake: true },
    taskId: "task-cron",
    messageId: "task-cron"
  });
  arinova.send({
    type: "action_result",
    id: "cron-call",
    action: "cron.action",
    status: "success",
    result: { ok: true }
  });
  assert.deepEqual(await cronActionResultPromise, {
    callId: "cron-call",
    action: "cron.action",
    status: "success",
    result: { ok: true },
    error: null,
    confirmation: null
  });
  assert.equal((await postControl("/complete", { taskId: "task-cron", content: "cron done" })).status, 200);
  const cronComplete = await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-cron");
  assert.equal(cronComplete.content, "cron done");

  arinova.send({
    type: "task",
    taskId: "task-cron-queued-1",
    taskKind: "cron_wakeup",
    content: "first queued cron wakeup"
  });
  await waitForAdapterTask("task-cron-queued-1");
  arinova.send({
    type: "task",
    taskId: "task-cron-queued-2",
    taskKind: "trigger",
    content: "second queued trigger wakeup"
  });
  const cronQueuedSecond = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-cron-queued-2");
  assert.equal(Object.hasOwn(cronQueuedSecond, "conversationId"), false);
  assert.equal(cronQueuedSecond.queuePosition, 0);
  assert.equal(cronQueuedSecond.globalQueueSize, 1);
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-cron-queued-2"), false);
  assert.equal((await postControl("/complete", { taskId: "task-cron-queued-1", content: "first cron queued done" })).status, 200);
  await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-cron-queued-1");
  const cronQueuedSecondEvent = await waitForAdapterTask("task-cron-queued-2");
  assert.equal(cronQueuedSecondEvent.body.taskKind, "trigger");
  assert.equal(cronQueuedSecondEvent.body.content, "second queued trigger wakeup");
  assert.equal(Object.hasOwn(cronQueuedSecondEvent.body, "conversationId"), false);
  assert.equal((await postControl("/complete", { taskId: "task-cron-queued-2", content: "second cron queued done" })).status, 200);
  await arinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-cron-queued-2");

  arinova.send({
    type: "task",
    taskId: "task-2",
    userMessageId: "msg-2",
    conversationId: "conv-1",
    conversationType: "direct",
    content: "cancel me"
  });
  const cancelTaskDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-2") && Date.now() < cancelTaskDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  arinova.send({ type: "cancel_task", taskId: "task-2" });
  const cancelDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-2") && Date.now() < cancelDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-2"));
  const cancelledTaskCall = await postControl("/task-sdk", { taskId: "task-2", method: "fetchHistory", args: [] });
  assert.equal(cancelledTaskCall.status, 500);
  assert.match(cancelledTaskCall.body.error, /no active task/);
  const cancelledChunk = await postControl("/chunk", { taskId: "task-2", content: "late" });
  assert.equal(cancelledChunk.status, 500);
  assert.match(cancelledChunk.body.error, /no active task/);
  const cancelledComplete = await postControl("/complete", { taskId: "task-2", content: "late done" });
  assert.equal(cancelledComplete.status, 500);
  assert.match(cancelledComplete.body.error, /no active task/);
  const cancelledError = await postControl("/error", { taskId: "task-2", error: "late cancelled" });
  assert.equal(cancelledError.status, 500);
  assert.match(cancelledError.body.error, /no active task/);
  const cancelError = await arinova.waitFor((message) => message.type === "agent_error" && message.taskId === "task-2");
  assert.equal(cancelError.reason, "cancelled");

  const restoreAuthRetryTimeouts = speedSdkAuthRetries();
  try {
    arinova.send({
      type: "task",
      taskId: "task-auth-error-active",
      userMessageId: "msg-auth-error-active",
      conversationId: "conv-auth-error",
      conversationType: "direct",
      content: "active task should clear on auth_error"
    });
    await waitForAdapterTask("task-auth-error-active");
    assert.deepEqual((await postControl("/healthz", {})).body, { ok: true, connected: true, agentId: "agent-1", tasks: 1 });

    const authFailedBeforeInvalid = adapterEvents.filter((event) => event.path === "/auth-failed").length;
    const authCountBeforeInvalidRetry = arinova.messages.filter((message) => message.type === "agent_auth").length;
    arinova.send({
      type: "auth_error",
      error: "Invalid bot token"
    });
    const invalidAuthDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/auth-failed").length <= authFailedBeforeInvalid
      && Date.now() < invalidAuthDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const invalidAuthFailed = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
    assert.match(invalidAuthFailed.body.error, /Invalid bot token/);
    assert.equal(invalidAuthFailed.body.retryable, false);
    assert.deepEqual((await postControl("/healthz", {})).body, { ok: true, connected: false, tasks: 0 });
    const authClearedTaskCall = await postControl("/task-sdk", { taskId: "task-auth-error-active", method: "fetchHistory", args: [] });
    assert.equal(authClearedTaskCall.status, 500);
    assert.match(authClearedTaskCall.body.error, /no active task/);
    const invalidRetryAuths = await arinova.waitForCount(
      (message) => message.type === "agent_auth",
      authCountBeforeInvalidRetry + 1
    );
    assertAuthEnvelope(invalidRetryAuths.at(-1), "ari_claim_no_agent_perm", "invalid-auth retry agent_auth");
    const connectedCountBeforeInvalidRecovery = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
    arinova.send({
      type: "auth_ok",
      agentId: "agent-1"
    });
    const invalidRecoveryDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeInvalidRecovery
      && Date.now() < invalidRecoveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeInvalidRecovery,
      "auth_error retry should reconnect after auth_ok"
    );

    const authFailedBeforeRetryable = adapterEvents.filter((event) => event.path === "/auth-failed").length;
    const authCountBeforeRetryableRetry = arinova.messages.filter((message) => message.type === "agent_auth").length;
    arinova.send({
      type: "auth_error",
      error: "Gateway timeout"
    });
    const retryableAuthDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/auth-failed").length <= authFailedBeforeRetryable
      && Date.now() < retryableAuthDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const retryableAuthFailed = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
    assert.match(retryableAuthFailed.body.error, /Gateway timeout/);
    assert.equal(retryableAuthFailed.body.retryable, true);
    assert.deepEqual((await postControl("/healthz", {})).body, { ok: true, connected: false, tasks: 0 });
    const retryableRetryAuths = await arinova.waitForCount(
      (message) => message.type === "agent_auth",
      authCountBeforeRetryableRetry + 1
    );
    assertAuthEnvelope(retryableRetryAuths.at(-1), "ari_claim_no_agent_perm", "retryable-auth retry agent_auth");
    const connectedCountBeforeRetryableRecovery = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
    arinova.send({
      type: "auth_ok",
      agentId: "agent-1"
    });
    const retryableRecoveryDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeRetryableRecovery
      && Date.now() < retryableRecoveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeRetryableRecovery,
      "retryable auth_error should reconnect after auth_ok"
    );

    for (const marker of EXPECTED_RETRYABLE_AUTH_ERROR_MARKERS) {
      const authFailedBeforeMarker = adapterEvents.filter((event) => event.path === "/auth-failed").length;
      const authCountBeforeMarkerRetry = arinova.messages.filter((message) => message.type === "agent_auth").length;
      arinova.send({
        type: "auth_error",
        error: `Retryable auth marker ${marker}`
      });
      const markerAuthDeadline = Date.now() + 3000;
      while (
        adapterEvents.filter((event) => event.path === "/auth-failed").length <= authFailedBeforeMarker
        && Date.now() < markerAuthDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const markerAuthFailed = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
      assert.match(markerAuthFailed.body.error, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(markerAuthFailed.body.retryable, true, `retryable auth marker ${marker}`);
      const markerRetryAuths = await arinova.waitForCount(
        (message) => message.type === "agent_auth",
        authCountBeforeMarkerRetry + 1
      );
      assertAuthEnvelope(markerRetryAuths.at(-1), "ari_claim_no_agent_perm", `retryable marker ${marker} agent_auth`);
      const connectedCountBeforeMarkerRecovery = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
      arinova.send({
        type: "auth_ok",
        agentId: "agent-1"
      });
      const markerRecoveryDeadline = Date.now() + 3000;
      while (
        adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeMarkerRecovery
        && Date.now() < markerRecoveryDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(
        adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeMarkerRecovery,
        `retryable auth marker ${marker} should recover after auth_ok`
      );
    }

    const authCountBeforeTimeoutErrors = arinova.messages.filter((message) => message.type === "agent_auth").length;
    for (let index = 1; index <= 5; index += 1) {
      const authFailedBeforeTimeout = adapterEvents.filter((event) => event.path === "/auth-failed").length;
      const authCountBeforeTimeoutRetry = arinova.messages.filter((message) => message.type === "agent_auth").length;
      arinova.send({
        type: "auth_error",
        error: `Authentication timeout repeated ${index}`
      });
      const timeoutAuthDeadline = Date.now() + 3000;
      while (
        adapterEvents.filter((event) => event.path === "/auth-failed").length <= authFailedBeforeTimeout
        && Date.now() < timeoutAuthDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const timeoutAuthFailed = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
      assert.match(timeoutAuthFailed.body.error, new RegExp(`Authentication timeout repeated ${index}`));
      assert.equal(timeoutAuthFailed.body.retryable, true);
      const timeoutRetryAuths = await arinova.waitForCount(
        (message) => message.type === "agent_auth",
        authCountBeforeTimeoutRetry + 1
      );
      assertAuthEnvelope(timeoutRetryAuths.at(-1), "ari_claim_no_agent_perm", `timeout retry ${index} agent_auth`);
    }
    assert.equal(
      arinova.messages.filter((message) => message.type === "agent_auth").length,
      authCountBeforeTimeoutErrors + 5,
      "repeated auth timeout should keep scheduling retries"
    );
    const connectedCountBeforeTimeoutRecovery = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
    arinova.send({
      type: "auth_ok",
      agentId: "agent-1"
    });
    const timeoutRecoveryDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeTimeoutRecovery
      && Date.now() < timeoutRecoveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeTimeoutRecovery,
      "repeated auth timeout should recover after auth_ok"
    );

    const authCountBeforeRepeatedErrors = arinova.messages.filter((message) => message.type === "agent_auth").length;
    for (let index = 1; index <= 5; index += 1) {
      const authFailedBeforeRepeated = adapterEvents.filter((event) => event.path === "/auth-failed").length;
      const authCountBeforeRepeatedRetry = arinova.messages.filter((message) => message.type === "agent_auth").length;
      arinova.send({
        type: "auth_error",
        error: `Invalid bot token repeated ${index}`
      });
      const repeatedAuthDeadline = Date.now() + 3000;
      while (
        adapterEvents.filter((event) => event.path === "/auth-failed").length <= authFailedBeforeRepeated
        && Date.now() < repeatedAuthDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const repeatedAuthFailed = adapterEvents.filter((event) => event.path === "/auth-failed").at(-1);
      assert.match(repeatedAuthFailed.body.error, new RegExp(`Invalid bot token repeated ${index}`));
      assert.equal(repeatedAuthFailed.body.retryable, false);
      const repeatedRetryAuths = await arinova.waitForCount(
        (message) => message.type === "agent_auth",
        authCountBeforeRepeatedRetry + 1
      );
      assertAuthEnvelope(repeatedRetryAuths.at(-1), "ari_claim_no_agent_perm", `repeated auth_error ${index} agent_auth`);
    }
    assert.equal(
      arinova.messages.filter((message) => message.type === "agent_auth").length,
      authCountBeforeRepeatedErrors + 5,
      "repeated real auth_error should keep scheduling retries"
    );
    assert.ok(
      observedSdkAuthRetryDelays.includes(60_000),
      "auth retry backoff should cap at the SDK AUTH_ERROR_MAX_DELAY"
    );
    const connectedCountBeforeRepeatedRecovery = adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length;
    arinova.send({
      type: "auth_ok",
      agentId: "agent-1"
    });
    const repeatedRecoveryDeadline = Date.now() + 3000;
    while (
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length <= connectedCountBeforeRepeatedRecovery
      && Date.now() < repeatedRecoveryDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      adapterEvents.filter((event) => event.path === "/connection-status" && event.body.connected === true).length > connectedCountBeforeRepeatedRecovery,
      "repeated auth_error should recover after auth_ok"
    );
  } finally {
    restoreAuthRetryTimeouts();
  }

  arinova.send({
    type: "task",
    taskId: "task-overflow-active",
    userMessageId: "msg-overflow-active",
    conversationId: "conv-overflow",
    conversationType: "direct",
    content: "keep overflow queue active"
  });
  const overflowActiveDeadline = Date.now() + 3000;
  while (!adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-overflow-active") && Date.now() < overflowActiveDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-overflow-active"));
  for (let index = 1; index <= 11; index += 1) {
    arinova.send({
      type: "task",
      taskId: `task-overflow-${index}`,
      userMessageId: `msg-overflow-${index}`,
      conversationId: "conv-overflow",
      conversationType: "direct",
      content: `overflow queued ${index}`
    });
  }
  const overflowQueued = await arinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-overflow-11");
  assert.equal(overflowQueued.queuePosition, 9);
  assert.equal(overflowQueued.globalQueueSize, 10);
  const overflowError = await arinova.waitFor((message) => message.type === "agent_error" && message.taskId === "task-overflow-1");
  assert.equal(overflowError.error, "queue_overflow");
  assert.equal(adapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-overflow-1"), false);

  const disconnectActionPromise = postControl("/agent-sdk", {
    method: "callAction",
    args: [
      "global.disconnect",
      { value: 10 },
      { callId: "global-disconnect-call", timeoutMs: 1000 }
    ]
  });
  const disconnectAction = await arinova.waitFor((message) => message.type === "action_call" && message.action === "global.disconnect");
  assert.deepEqual(disconnectAction, {
    type: "action_call",
    id: "global-disconnect-call",
    action: "global.disconnect",
    arguments: { value: 10 }
  });
  agent.disconnect();
  const disconnectActionResult = await disconnectActionPromise;
  assert.equal(disconnectActionResult.status, 500);
  assert.match(disconnectActionResult.body.error, /action_call global-disconnect-call cancelled by disconnect/);
  const disconnectedAction = await postControl("/agent-sdk", {
    method: "callAction",
    args: [
      "global.after-disconnect",
      { value: 11 },
      { callId: "global-after-disconnect-call", timeoutMs: 1000 }
    ]
  });
  assert.equal(disconnectedAction.status, 500);
  assert.match(disconnectedAction.body.error, /action_call requires an active WebSocket connection/);
  const disconnectedFrameCount = arinova.messages.length;
  for (const [method, args] of [
    ["sendTelemetry", ["offline.noop", { ok: true }]],
    ["sendHud", [{ status: "offline" }, "conv-offline"]],
    ["sendTaskUpdate", ["Hermes", { status: "completed" }]],
    ["reportToolCall", [{
      sessionId: "offline-session",
      turnId: "offline-turn",
      seqOrder: 0,
      toolName: "arinova_sdk_call",
      input: {},
      success: true
    }]]
  ]) {
    const disconnectedVoid = await postControl("/agent-sdk", { method, args });
    assert.equal(disconnectedVoid.status, 200, `${method}: ${JSON.stringify(disconnectedVoid.body)}`);
    assert.equal(disconnectedVoid.body.result, null);
  }
  assert.equal(
    arinova.messages.length,
    disconnectedFrameCount,
    "disconnected fire-and-forget SDK methods should no-op without websocket frames"
  );
  const overflowCancelDeadline = Date.now() + 1000;
  while (
    !adapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-overflow-active")
    && Date.now() < overflowCancelDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual([...calledTaskMethods].sort(), EXPECTED_TASK_SDK_METHODS.toSorted());
} finally {
  controlServer.close();
  adapterServer.close();
  arinova.close();
}

async function runPerConversationE2e() {
  const perConversationArinova = new FakeArinovaServer();
  const perConversationPort = await perConversationArinova.listen();
  const perConversationAdapterEvents = [];
  const perConversationAdapterServer = createServer(async (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    for await (const chunk of req) body += chunk;
    perConversationAdapterEvents.push({
      path: req.url,
      token: req.headers["x-arinova-bridge-token"],
      body: body ? JSON.parse(body) : {}
    });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  perConversationAdapterServer.listen(0, "127.0.0.1");
  await once(perConversationAdapterServer, "listening");

  const perConversationOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${perConversationPort}`,
    botToken: "ari_per_conversation",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "250",
      ARINOVA_CONCURRENCY_MODE: "per-conversation",
      ARINOVA_PING_INTERVAL_MS: "60000",
      ARINOVA_PING_TIMEOUT_MS: "120000"
    }
  });
  assert.equal(perConversationOptions.concurrencyMode, "per-conversation");
  const perConversationAgent = new ArinovaAgent(perConversationOptions);
  const { controlServer: perConversationControlServer } = createControlServer({
    agent: perConversationAgent,
    agentSkills: perConversationOptions.skills,
    adapterUrl: `http://127.0.0.1:${perConversationAdapterServer.address().port}`,
    sharedToken,
    onShutdown: () => {}
  });
  await listen(perConversationControlServer, 0, "127.0.0.1");
  const perConversationControlPort = perConversationControlServer.address().port;

  async function postPerConversationControl(path, body) {
    const res = await fetch(`http://127.0.0.1:${perConversationControlPort}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arinova-Bridge-Token": sharedToken
      },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  async function waitForPerConversationAdapterTask(taskId) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const event = perConversationAdapterEvents.find((candidate) => candidate.path === "/task" && candidate.body.taskId === taskId);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for per-conversation adapter task ${taskId}`);
  }

  try {
    const connected = perConversationAgent.connect();
    const auth = await perConversationArinova.waitFor((message) => message.type === "agent_auth");
    assert.equal(auth.botToken, "ari_per_conversation");
    perConversationArinova.send({ type: "auth_ok", agentId: "agent-per-conversation" });
    await connected;

    perConversationArinova.send({
      type: "task",
      taskId: "task-per-conv-a1",
      userMessageId: "msg-per-conv-a1",
      conversationId: "conv-per-a",
      conversationType: "direct",
      content: "first same conversation task"
    });
    await waitForPerConversationAdapterTask("task-per-conv-a1");
    perConversationArinova.send({
      type: "task",
      taskId: "task-per-conv-a2",
      userMessageId: "msg-per-conv-a2",
      conversationId: "conv-per-a",
      conversationType: "direct",
      content: "queued same conversation task"
    });
    const queuedA2 = await perConversationArinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-per-conv-a2");
    assert.equal(queuedA2.conversationId, "conv-per-a");
    assert.equal(queuedA2.queuePosition, 0);
    assert.equal(queuedA2.globalQueueSize, 1);
    assert.equal(
      perConversationAdapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-per-conv-a2"),
      false,
      "per-conversation mode should not start a same-conversation queued task immediately"
    );

    perConversationArinova.send({
      type: "task",
      taskId: "task-per-conv-b1",
      userMessageId: "msg-per-conv-b1",
      conversationId: "conv-per-b",
      conversationType: "direct",
      content: "parallel different conversation task"
    });
    const b1Task = await waitForPerConversationAdapterTask("task-per-conv-b1");
    assert.equal(b1Task.body.conversationId, "conv-per-b");
    assert.equal((await postPerConversationControl("/complete", { taskId: "task-per-conv-b1", content: "b1 done" })).status, 200);
    await perConversationArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-per-conv-b1");

    assert.equal((await postPerConversationControl("/complete", { taskId: "task-per-conv-a1", content: "a1 done" })).status, 200);
    await perConversationArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-per-conv-a1");
    const drainedA2 = await waitForPerConversationAdapterTask("task-per-conv-a2");
    assert.equal(drainedA2.body.content, "queued same conversation task");
    assert.equal((await postPerConversationControl("/complete", { taskId: "task-per-conv-a2", content: "a2 done" })).status, 200);
    await perConversationArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-per-conv-a2");

    perConversationArinova.send({
      type: "task",
      taskId: "task-per-conv-cron",
      taskKind: "cron_wakeup",
      content: "per-conversation cron wakeup"
    });
    const cronTask = await waitForPerConversationAdapterTask("task-per-conv-cron");
    assert.equal(Object.hasOwn(cronTask.body, "conversationId"), false);
    perConversationArinova.send({
      type: "task",
      taskId: "task-per-conv-real-while-cron",
      userMessageId: "msg-per-conv-real-while-cron",
      conversationId: "conv-per-real",
      conversationType: "direct",
      content: "real conversation while cron is active"
    });
    const realWhileCron = await waitForPerConversationAdapterTask("task-per-conv-real-while-cron");
    assert.equal(realWhileCron.body.conversationId, "conv-per-real");
    assert.equal(
      perConversationArinova.messages.some((message) => message.type === "task_queued" && message.taskId === "task-per-conv-real-while-cron"),
      false,
      "per-conversation no-conversation sentinel should not queue a real conversation task"
    );
    assert.equal((await postPerConversationControl("/complete", { taskId: "task-per-conv-real-while-cron", content: "real done" })).status, 200);
    await perConversationArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-per-conv-real-while-cron");
    assert.equal((await postPerConversationControl("/complete", { taskId: "task-per-conv-cron", content: "cron done" })).status, 200);
    await perConversationArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-per-conv-cron");
  } finally {
    perConversationAgent.disconnect();
    perConversationControlServer.close();
    perConversationAdapterServer.close();
    perConversationArinova.close();
  }
}

await runPerConversationE2e();
async function runUnboundedE2e() {
  const unboundedArinova = new FakeArinovaServer();
  const unboundedPort = await unboundedArinova.listen();
  const unboundedAdapterEvents = [];
  const unboundedAdapterServer = createServer(async (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    for await (const chunk of req) body += chunk;
    unboundedAdapterEvents.push({
      path: req.url,
      token: req.headers["x-arinova-bridge-token"],
      body: body ? JSON.parse(body) : {}
    });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  unboundedAdapterServer.listen(0, "127.0.0.1");
  await once(unboundedAdapterServer, "listening");

  const unboundedOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${unboundedPort}`,
    botToken: "ari_unbounded",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "250",
      ARINOVA_AGENT_CONCURRENCY_MODE: "unbounded",
      ARINOVA_PING_INTERVAL_MS: "60000",
      ARINOVA_PING_TIMEOUT_MS: "120000"
    }
  });
  assert.equal(unboundedOptions.concurrencyMode, "unbounded");
  const unboundedAgent = new ArinovaAgent(unboundedOptions);
  const { controlServer: unboundedControlServer } = createControlServer({
    agent: unboundedAgent,
    agentSkills: unboundedOptions.skills,
    adapterUrl: `http://127.0.0.1:${unboundedAdapterServer.address().port}`,
    sharedToken,
    onShutdown: () => {}
  });
  await listen(unboundedControlServer, 0, "127.0.0.1");
  const unboundedControlPort = unboundedControlServer.address().port;

  async function postUnboundedControl(path, body) {
    const res = await fetch(`http://127.0.0.1:${unboundedControlPort}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arinova-Bridge-Token": sharedToken
      },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  async function waitForUnboundedAdapterTask(taskId) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const event = unboundedAdapterEvents.find((candidate) => candidate.path === "/task" && candidate.body.taskId === taskId);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for unbounded adapter task ${taskId}`);
  }

  try {
    const connected = unboundedAgent.connect();
    const auth = await unboundedArinova.waitFor((message) => message.type === "agent_auth");
    assert.equal(auth.botToken, "ari_unbounded");
    unboundedArinova.send({ type: "auth_ok", agentId: "agent-unbounded" });
    await connected;

    unboundedArinova.send({
      type: "task",
      taskId: "task-unbounded-a1",
      userMessageId: "msg-unbounded-a1",
      conversationId: "conv-unbounded",
      conversationType: "direct",
      content: "first unbounded task"
    });
    unboundedArinova.send({
      type: "task",
      taskId: "task-unbounded-a2",
      userMessageId: "msg-unbounded-a2",
      conversationId: "conv-unbounded",
      conversationType: "direct",
      content: "second unbounded task"
    });
    const unboundedA1 = await waitForUnboundedAdapterTask("task-unbounded-a1");
    const unboundedA2 = await waitForUnboundedAdapterTask("task-unbounded-a2");
    assert.equal(unboundedA1.body.conversationId, "conv-unbounded");
    assert.equal(unboundedA2.body.conversationId, "conv-unbounded");
    assert.equal(
      unboundedArinova.messages.some((message) => message.type === "task_queued" && message.taskId === "task-unbounded-a2"),
      false,
      "unbounded mode should not queue a same-conversation second task"
    );
    assert.deepEqual((await postUnboundedControl("/healthz", {})).body, { ok: true, connected: true, agentId: "agent-unbounded", tasks: 2 });
    assert.equal((await postUnboundedControl("/complete", { taskId: "task-unbounded-a1", content: "unbounded a1 done" })).status, 200);
    assert.equal((await postUnboundedControl("/complete", { taskId: "task-unbounded-a2", content: "unbounded a2 done" })).status, 200);
    await unboundedArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-unbounded-a1");
    await unboundedArinova.waitFor((message) => message.type === "agent_complete" && message.taskId === "task-unbounded-a2");
  } finally {
    unboundedAgent.disconnect();
    unboundedControlServer.close();
    unboundedAdapterServer.close();
    unboundedArinova.close();
  }
}

await runUnboundedE2e();
async function runInitialPongGraceE2e() {
  const graceArinova = new FakeArinovaServer();
  graceArinova.autoPong = false;
  const gracePort = await graceArinova.listen();
  const graceOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${gracePort}`,
    botToken: "ari_pong_grace",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "50",
      ARINOVA_PING_INTERVAL_MS: "100",
      ARINOVA_PING_TIMEOUT_MS: "250"
    }
  });
  const graceAgent = new ArinovaAgent(graceOptions);
  try {
    graceAgent.connect();
    const auth = await graceArinova.waitFor((message) => message.type === "agent_auth");
    assertAuthEnvelope(auth, "ari_pong_grace", "initial pong grace agent_auth");
    const authCountBeforeGrace = graceArinova.messages.filter((message) => message.type === "agent_auth").length;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(
      graceArinova.messages.filter((message) => message.type === "agent_auth").length,
      authCountBeforeGrace,
      "initial missing pong should not reconnect before the onopen grace timeout"
    );
    const graceReconnectAuths = await graceArinova.waitForCount(
      (message) => message.type === "agent_auth",
      authCountBeforeGrace + 1
    );
    assertAuthEnvelope(graceReconnectAuths.at(-1), "ari_pong_grace", "initial pong grace reconnect agent_auth");
  } finally {
    graceAgent.disconnect();
    graceArinova.close();
  }
}

await runInitialPongGraceE2e();
async function runDefaultReconnectIntervalE2e() {
  const reconnectArinova = new FakeArinovaServer();
  const reconnectPort = await reconnectArinova.listen();
  const reconnectOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${reconnectPort}`,
    botToken: "ari_default_reconnect",
    env: {
      ARINOVA_PING_INTERVAL_MS: "100",
      ARINOVA_PING_TIMEOUT_MS: "250"
    }
  });
  const reconnectAgent = new ArinovaAgent(reconnectOptions);
  const restoreDefaultReconnects = speedSdkDefaultReconnects();
  try {
    reconnectAgent.connect();
    const auth = await reconnectArinova.waitFor((message) => message.type === "agent_auth");
    assertAuthEnvelope(auth, "ari_default_reconnect", "default reconnect initial agent_auth");
    const authCountBeforeDefaultReconnect = reconnectArinova.messages.filter((message) => message.type === "agent_auth").length;
    reconnectArinova.socket.destroy();
    const defaultReconnectAuths = await reconnectArinova.waitForCount(
      (message) => message.type === "agent_auth",
      authCountBeforeDefaultReconnect + 1
    );
    assertAuthEnvelope(defaultReconnectAuths.at(-1), "ari_default_reconnect", "default reconnect agent_auth");
  } finally {
    restoreDefaultReconnects();
    reconnectAgent.disconnect();
    reconnectArinova.close();
  }
}

await runDefaultReconnectIntervalE2e();
async function runDefaultPingIntervalE2e() {
  const pingArinova = new FakeArinovaServer();
  const pingPort = await pingArinova.listen();
  const pingOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${pingPort}`,
    botToken: "ari_default_ping",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "50"
    }
  });
  const pingAgent = new ArinovaAgent(pingOptions);
  const restoreDefaultPings = speedSdkDefaultPings();
  try {
    const connected = pingAgent.connect();
    const auth = await pingArinova.waitFor((message) => message.type === "agent_auth");
    assertAuthEnvelope(auth, "ari_default_ping", "default ping initial agent_auth");
    pingArinova.send({ type: "auth_ok", agentId: "agent-default-ping" });
    await connected;
    await pingArinova.waitFor((message) => message.type === "ping");
  } finally {
    restoreDefaultPings();
    pingAgent.disconnect();
    pingArinova.close();
  }
}

await runDefaultPingIntervalE2e();
async function runDefaultPingTimeoutE2e() {
  const timeoutArinova = new FakeArinovaServer();
  timeoutArinova.autoPong = false;
  const timeoutPort = await timeoutArinova.listen();
  const timeoutOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${timeoutPort}`,
    botToken: "ari_default_ping_timeout",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "50",
      ARINOVA_PING_INTERVAL_MS: "100"
    }
  });
  const timeoutAgent = new ArinovaAgent(timeoutOptions);
  try {
    timeoutAgent.connect();
    const auth = await timeoutArinova.waitFor((message) => message.type === "agent_auth");
    assertAuthEnvelope(auth, "ari_default_ping_timeout", "default ping timeout initial agent_auth");
    const authCountBeforeDefaultPingTimeout = timeoutArinova.messages.filter((message) => message.type === "agent_auth").length;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(
      timeoutArinova.messages.filter((message) => message.type === "agent_auth").length,
      authCountBeforeDefaultPingTimeout,
      "default ping timeout should keep the initial socket alive for twice the ping interval"
    );
    const defaultPingTimeoutAuths = await timeoutArinova.waitForCount(
      (message) => message.type === "agent_auth",
      authCountBeforeDefaultPingTimeout + 1
    );
    assertAuthEnvelope(
      defaultPingTimeoutAuths.at(-1),
      "ari_default_ping_timeout",
      "default ping timeout reconnect agent_auth"
    );
  } finally {
    timeoutAgent.disconnect();
    timeoutArinova.close();
  }
}

await runDefaultPingTimeoutE2e();
async function runShutdownCleanupE2e() {
  const shutdownArinova = new FakeArinovaServer();
  const shutdownPort = await shutdownArinova.listen();
  const shutdownAdapterEvents = [];
  const shutdownAdapterServer = createServer(async (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    for await (const chunk of req) body += chunk;
    shutdownAdapterEvents.push({
      path: req.url,
      token: req.headers["x-arinova-bridge-token"],
      body: body ? JSON.parse(body) : {}
    });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  shutdownAdapterServer.listen(0, "127.0.0.1");
  await once(shutdownAdapterServer, "listening");

  const shutdownOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${shutdownPort}`,
    botToken: "ari_shutdown",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "250",
      ARINOVA_CONCURRENCY_MODE: "agent-wide",
      ARINOVA_PING_INTERVAL_MS: "60000",
      ARINOVA_PING_TIMEOUT_MS: "120000"
    }
  });
  const shutdownAgent = new ArinovaAgent(shutdownOptions);
  let shutdownCalls = 0;
  const { controlServer: shutdownControlServer } = createControlServer({
    agent: shutdownAgent,
    agentSkills: shutdownOptions.skills,
    adapterUrl: `http://127.0.0.1:${shutdownAdapterServer.address().port}`,
    sharedToken,
    onShutdown: () => {
      shutdownCalls += 1;
    }
  });
  await listen(shutdownControlServer, 0, "127.0.0.1");
  const shutdownControlPort = shutdownControlServer.address().port;

  async function postShutdownControl(path, body) {
    const res = await fetch(`http://127.0.0.1:${shutdownControlPort}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arinova-Bridge-Token": sharedToken
      },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  async function waitForShutdownAdapterTask(taskId) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const event = shutdownAdapterEvents.find((candidate) => candidate.path === "/task" && candidate.body.taskId === taskId);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for shutdown adapter task ${taskId}`);
  }

  try {
    const connected = shutdownAgent.connect();
    const auth = await shutdownArinova.waitFor((message) => message.type === "agent_auth");
    assert.equal(auth.botToken, "ari_shutdown");
    shutdownArinova.send({ type: "auth_ok", agentId: "agent-shutdown" });
    await connected;

    shutdownArinova.send({
      type: "task",
      taskId: "task-shutdown-active",
      userMessageId: "msg-shutdown-active",
      conversationId: "conv-shutdown",
      conversationType: "direct",
      content: "active when shutdown starts"
    });
    await waitForShutdownAdapterTask("task-shutdown-active");
    shutdownArinova.send({
      type: "task",
      taskId: "task-shutdown-queued",
      userMessageId: "msg-shutdown-queued",
      conversationId: "conv-shutdown",
      conversationType: "direct",
      content: "queued when shutdown starts"
    });
    const queued = await shutdownArinova.waitFor((message) => message.type === "task_queued" && message.taskId === "task-shutdown-queued");
    assert.equal(queued.globalQueueSize, 1);

    const pendingActionPromise = postShutdownControl("/agent-sdk", {
      method: "callAction",
      args: [
        "global.shutdown-pending",
        { value: 1 },
        { callId: "global-shutdown-pending-call", timeoutMs: 1000 }
      ]
    });
    await shutdownArinova.waitFor((message) => message.type === "action_call" && message.id === "global-shutdown-pending-call");
    assert.deepEqual((await postShutdownControl("/shutdown", {})).body, { ok: true });
    const pendingActionResult = await pendingActionPromise;
    assert.equal(pendingActionResult.status, 500);
    assert.match(pendingActionResult.body.error, /action_call global-shutdown-pending-call cancelled by disconnect/);

    const shutdownDeadline = Date.now() + 3000;
    while (shutdownCalls === 0 && Date.now() < shutdownDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(shutdownCalls, 1);
    const activeCancelDeadline = Date.now() + 3000;
    while (
      !shutdownAdapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-shutdown-active")
      && Date.now() < activeCancelDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      shutdownAdapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-shutdown-active"),
      "shutdown should cancel the active task"
    );
    assert.equal(
      shutdownAdapterEvents.some((event) => event.path === "/task" && event.body.taskId === "task-shutdown-queued"),
      false,
      "shutdown should not start queued tasks"
    );
    assert.equal(
      shutdownAdapterEvents.some((event) => event.path === "/cancel" && event.body.taskId === "task-shutdown-queued"),
      false,
      "shutdown should remove queued tasks without adapter cancel"
    );
  } finally {
    shutdownControlServer.close();
    shutdownAdapterServer.close();
    shutdownArinova.close();
  }
}

await runShutdownCleanupE2e();
async function runMalformedOnboardingSeedE2e() {
  const malformedSeedArinova = new FakeArinovaServer();
  const malformedSeedPort = await malformedSeedArinova.listen();
  const malformedSeedAdapterEvents = [];
  const malformedSeedAdapterServer = createServer(async (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    for await (const chunk of req) body += chunk;
    malformedSeedAdapterEvents.push({
      path: req.url,
      token: req.headers["x-arinova-bridge-token"],
      body: body ? JSON.parse(body) : {}
    });
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  malformedSeedAdapterServer.listen(0, "127.0.0.1");
  await once(malformedSeedAdapterServer, "listening");

  const malformedSeedOptions = buildAgentOptions({
    serverUrl: `ws://127.0.0.1:${malformedSeedPort}`,
    botToken: "ari_malformed_seed",
    env: {
      ARINOVA_RECONNECT_INTERVAL_MS: "250",
      ARINOVA_PING_INTERVAL_MS: "60000",
      ARINOVA_PING_TIMEOUT_MS: "120000"
    }
  });
  const malformedSeedAgent = new ArinovaAgent(malformedSeedOptions);
  const { controlServer: malformedSeedControlServer } = createControlServer({
    agent: malformedSeedAgent,
    agentSkills: malformedSeedOptions.skills,
    adapterUrl: `http://127.0.0.1:${malformedSeedAdapterServer.address().port}`,
    sharedToken,
    onShutdown: () => {}
  });
  await listen(malformedSeedControlServer, 0, "127.0.0.1");
  const malformedSeedControlPort = malformedSeedControlServer.address().port;

  async function postMalformedSeedControl(path, body) {
    const res = await fetch(`http://127.0.0.1:${malformedSeedControlPort}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arinova-Bridge-Token": sharedToken
      },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  try {
    const connected = malformedSeedAgent.connect();
    const auth = await malformedSeedArinova.waitFor((message) => message.type === "agent_auth");
    assert.equal(auth.botToken, "ari_malformed_seed");
    malformedSeedArinova.send({
      type: "auth_ok",
      agentId: "agent-malformed-seed",
      onboardingSeed: {
        kind: "something_else",
        seedId: "bad-kind",
        agentId: "agent-malformed-seed",
        action: "open",
        prompt: "should be dropped"
      }
    });
    await connected;
    assert.equal((await postMalformedSeedControl("/agent-sdk", { method: "getOnboardingSeed", args: [] })).body.result, null);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      malformedSeedAdapterEvents.some((event) => event.path === "/onboarding-seed"),
      false,
      "malformed onboarding seed should not be forwarded to Hermes"
    );

    const missingPromptSeedCount = malformedSeedAdapterEvents.filter((event) => event.path === "/onboarding-seed").length;
    malformedSeedArinova.send({
      type: "auth_ok",
      agentId: "agent-malformed-seed",
      onboardingSeed: {
        kind: "first_touch_opening",
        seedId: "missing-prompt",
        agentId: "agent-malformed-seed",
        action: "open"
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await postMalformedSeedControl("/agent-sdk", { method: "getOnboardingSeed", args: [] })).body.result, null);
    assert.equal(
      malformedSeedAdapterEvents.filter((event) => event.path === "/onboarding-seed").length,
      missingPromptSeedCount,
      "onboarding seed missing prompt should not be forwarded to Hermes"
    );

    const stringSeedCount = malformedSeedAdapterEvents.filter((event) => event.path === "/onboarding-seed").length;
    malformedSeedArinova.send({
      type: "auth_ok",
      agentId: "agent-malformed-seed",
      onboardingSeed: "nope"
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await postMalformedSeedControl("/agent-sdk", { method: "getOnboardingSeed", args: [] })).body.result, null);
    assert.equal(
      malformedSeedAdapterEvents.filter((event) => event.path === "/onboarding-seed").length,
      stringSeedCount,
      "string onboarding seed should not be forwarded to Hermes"
    );
  } finally {
    malformedSeedAgent.disconnect();
    malformedSeedControlServer.close();
    malformedSeedAdapterServer.close();
    malformedSeedArinova.close();
  }
}

await runMalformedOnboardingSeedE2e();
console.log("sidecar sdk e2e OK");
