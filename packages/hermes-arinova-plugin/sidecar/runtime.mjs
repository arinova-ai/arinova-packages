import http from "node:http";
import { once } from "node:events";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const sdkContract = JSON.parse(readFileSync(new URL("../sdk-contract.json", import.meta.url), "utf8"));
const runtimeContract = JSON.parse(readFileSync(new URL("../runtime-contract.json", import.meta.url), "utf8"));

export const runtimeDefaults = Object.freeze({ ...runtimeContract.defaults });
const CONCURRENCY_MODES = new Set(runtimeContract.concurrencyModes);
const CONTROL_ENDPOINTS = new Set([
  "/healthz",
  "/agent-sdk",
  "/task-sdk",
  "/chunk",
  "/complete",
  "/error",
  "/shutdown"
]);
const DEFAULT_CONTROL_MAX_BODY_BYTES = runtimeDefaults.controlMaxBodyBytes;
const DEFAULT_ADAPTER_POST_TIMEOUT_MS = runtimeDefaults.adapterPostTimeoutMs;
const MAX_PENDING_TASK_OUTPUTS = runtimeDefaults.maxPendingTaskOutputs;
export function intEnv(env, name) {
  const raw = env[name];
  const normalized = typeof raw === "string" ? raw.trim() : raw;
  if (normalized == null || normalized === "") return undefined;
  if (typeof normalized !== "number" && !/^\d+$/.test(String(normalized))) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const value = Number(normalized);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

export function positiveIntEnv(env, name) {
  const value = intEnv(env, name);
  if (value === 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

// For settings where 0 has a defined meaning (e.g. maxQueuedTasks: 0 means
// "never queue" in the SDK).
export function nonNegativeIntEnv(env, name) {
  return intEnv(env, name);
}

export function requiredEnv(env, name) {
  const value = typeof env[name] === "string" ? env[name].trim() : "";
  return value || "";
}

function parseSkills(env) {
  const sourceName = env.ARINOVA_AGENT_SKILLS_JSON ? "ARINOVA_AGENT_SKILLS_JSON" : "ARINOVA_AGENT_SKILLS";
  const raw = env.ARINOVA_AGENT_SKILLS_JSON || env.ARINOVA_AGENT_SKILLS;
  if (!raw) return undefined;
  assertNoDuplicateJsonKeys(raw);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${sourceName} must be a JSON array`);
  }
  const skillIds = new Set();
  return parsed.map((skill, index) => {
    if (!skill || typeof skill !== "object") {
      throw new Error(`${sourceName}[${index}] must be an object`);
    }
    if (
      typeof skill.id !== "string" ||
      typeof skill.name !== "string" ||
      typeof skill.description !== "string"
    ) {
      throw new Error(`${sourceName}[${index}] requires string id, name and description`);
    }
    const unknown = Object.keys(skill).filter((key) => !["id", "name", "description"].includes(key)).sort();
    if (unknown.length > 0) {
      throw new Error(`${sourceName}[${index}] has unsupported field(s): ${unknown.join(", ")}`);
    }
    const skillId = skill.id.trim();
    if (!skillId) {
      throw new Error(`${sourceName}[${index}] requires a non-empty id`);
    }
    if (!skill.name.trim()) {
      throw new Error(`${sourceName}[${index}] requires a non-empty name`);
    }
    if (skillIds.has(skillId)) {
      throw new Error(`${sourceName}[${index}] has duplicate id: ${skillId}`);
    }
    skillIds.add(skillId);
    return { id: skill.id, name: skill.name, description: skill.description };
  });
}

export function buildAgentOptions({ serverUrl, botToken, env = process.env }) {
  const options = { serverUrl, botToken };
  const skills = parseSkills(env);
  if (skills) options.skills = skills;

  const reconnectInterval = positiveIntEnv(env, "ARINOVA_RECONNECT_INTERVAL_MS");
  if (reconnectInterval !== undefined) options.reconnectInterval = reconnectInterval;
  const pingInterval = positiveIntEnv(env, "ARINOVA_PING_INTERVAL_MS");
  if (pingInterval !== undefined) options.pingInterval = pingInterval;
  const pingTimeout = positiveIntEnv(env, "ARINOVA_PING_TIMEOUT_MS");
  if (pingTimeout !== undefined) options.pingTimeout = pingTimeout;
  const maxConsecutive = positiveIntEnv(env, "ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION");
  if (maxConsecutive !== undefined) options.maxConsecutivePerConversation = maxConsecutive;
  const maxQueuedTasks = nonNegativeIntEnv(env, "ARINOVA_MAX_QUEUED_TASKS");
  if (maxQueuedTasks !== undefined) options.maxQueuedTasks = maxQueuedTasks;

  const concurrencyMode = env.ARINOVA_CONCURRENCY_MODE || env.ARINOVA_AGENT_CONCURRENCY_MODE || "per-conversation";
  if (!CONCURRENCY_MODES.has(concurrencyMode)) {
    throw new Error(`ARINOVA_CONCURRENCY_MODE must be one of: ${Array.from(CONCURRENCY_MODES).join(", ")}`);
  }
  options.concurrencyMode = concurrencyMode;
  return options;
}

export function buildControlServerOptions({ env = process.env } = {}) {
  const options = {};
  const adapterPostTimeoutMs = positiveIntEnv(env, "ARINOVA_ADAPTER_POST_TIMEOUT_MS");
  if (adapterPostTimeoutMs !== undefined) {
    options.adapterPostTimeoutMs = adapterPostTimeoutMs;
  }
  const maxBodyBytes = positiveIntEnv(env, "ARINOVA_CONTROL_MAX_BODY_BYTES");
  if (maxBodyBytes !== undefined) {
    options.maxBodyBytes = maxBodyBytes;
  }
  return options;
}

function fallbackAvailableSkills(agentSkills) {
  if (!Array.isArray(agentSkills) || agentSkills.length === 0) return undefined;
  return agentSkills.map((skill) => ({
    slug: skill.id,
    name: skill.name,
    slashCommand: skill.id ? `/${skill.id}` : null,
    description: skill.description
  }));
}

function isOnboardingSeed(seed) {
  return Boolean(
    seed &&
    typeof seed === "object" &&
    seed.kind === "first_touch_opening" &&
    typeof seed.seedId === "string" &&
    typeof seed.agentId === "string" &&
    typeof seed.action === "string" &&
    typeof seed.prompt === "string"
  );
}

function isTokenClaimedData(data) {
  return Boolean(
    data &&
    typeof data === "object" &&
    (typeof data.agentId === "string" || data.agentId === null) &&
    typeof data.permanentToken === "string" &&
    data.permanentToken.trim() !== ""
  );
}

export function serializeTask(task, agentSkills = undefined) {
  return {
    taskId: task.taskId,
    taskKind: task.taskKind,
    userMessageId: task.userMessageId,
    conversationId: task.conversationId,
    ...(hasOwn(task, "conversationName") ? { conversationName: task.conversationName } : {}),
    conversationType: task.conversationType,
    ...(task.content !== undefined ? { content: task.content } : {}),
    senderUserId: task.senderUserId,
    senderUsername: task.senderUsername,
    senderAgentId: task.senderAgentId,
    senderAgentName: task.senderAgentName,
    members: task.members,
    replyTo: task.replyTo,
    history: task.history,
    attachments: task.attachments,
    availableSkills: task.availableSkills || fallbackAvailableSkills(agentSkills)
  };
}

export const agentMethods = new Set([
  "getAgentId",
  "getOnboardingSeed",
  "sendMessage",
  "sendTelemetry",
  "sendHud",
  "sendTaskUpdate",
  "reportToolCall",
  "callAction",
  "uploadFile",
  "fetchHistory",
  "listNotes",
  "createNote",
  "updateNote",
  "deleteNote",
  "listBoards",
  "createCard",
  "updateCard",
  "createBoard",
  "updateBoard",
  "archiveBoard",
  "listColumns",
  "createColumn",
  "updateColumn",
  "deleteColumn",
  "reorderColumns",
  "listCards",
  "completeCard",
  "listArchivedCards",
  "addCardCommit",
  "listCardCommits",
  "linkCardNote",
  "unlinkCardNote",
  "listCardNotes",
  "listLabels",
  "createLabel",
  "updateLabel",
  "deleteLabel",
  "addCardLabel",
  "removeCardLabel",
  "queryMemory",
  "fetchSkillPrompt"
]);

export const taskMethods = new Set(["uploadFile", "fetchHistory", "callAction"]);

const agentRequiredArgCounts = new Map([
  ["sendMessage", 2],
  ["sendTelemetry", 2],
  ["sendHud", 1],
  ["sendTaskUpdate", 2],
  ["reportToolCall", 1],
  ["callAction", 2],
  ["uploadFile", 3],
  ["fetchHistory", 1],
  ["listNotes", 0],
  ["createNote", 1],
  ["updateNote", 2],
  ["deleteNote", 1],
  ["createCard", 1],
  ["updateCard", 2],
  ["createBoard", 1],
  ["updateBoard", 2],
  ["archiveBoard", 1],
  ["listColumns", 1],
  ["createColumn", 2],
  ["updateColumn", 2],
  ["deleteColumn", 1],
  ["reorderColumns", 2],
  ["completeCard", 1],
  ["listArchivedCards", 1],
  ["addCardCommit", 2],
  ["listCardCommits", 1],
  ["linkCardNote", 2],
  ["unlinkCardNote", 2],
  ["listCardNotes", 1],
  ["listLabels", 1],
  ["createLabel", 2],
  ["updateLabel", 2],
  ["deleteLabel", 1],
  ["addCardLabel", 2],
  ["removeCardLabel", 2],
  ["queryMemory", 1],
  ["fetchSkillPrompt", 1]
]);

const agentMaxArgCounts = new Map([
  ...Array.from(agentRequiredArgCounts.entries()),
  ["getAgentId", 0],
  ["getOnboardingSeed", 0],
  ["listBoards", 0],
  ["sendHud", 2],
  ["fetchHistory", 2],
  ["listNotes", 1],
  ["uploadFile", 4],
  ["callAction", 3],
  ["listCards", 1],
  ["listArchivedCards", 2]
]);

const taskRequiredArgCounts = new Map([
  ["uploadFile", 2],
  ["callAction", 2]
]);

const taskMaxArgCounts = new Map([
  ["uploadFile", 3],
  ["fetchHistory", 1],
  ["callAction", 3]
]);

const agentArgTypes = new Map([
  ["sendMessage", ["string", "string"]],
  ["sendTelemetry", ["string", "object"]],
  ["sendHud", ["object", "string"]],
  ["sendTaskUpdate", ["string", "object"]],
  ["reportToolCall", ["object"]],
  ["callAction", ["string", "object", "object"]],
  ["uploadFile", ["string", "object", "string", "string"]],
  ["fetchHistory", ["string", "object"]],
  ["listNotes", ["object"]],
  ["createNote", ["object"]],
  ["updateNote", ["string", "object"]],
  ["deleteNote", ["string"]],
  ["createCard", ["object"]],
  ["updateCard", ["string", "object"]],
  ["createBoard", ["object"]],
  ["updateBoard", ["string", "object"]],
  ["archiveBoard", ["string"]],
  ["listColumns", ["string"]],
  ["createColumn", ["string", "object"]],
  ["updateColumn", ["string", "object"]],
  ["deleteColumn", ["string"]],
  ["reorderColumns", ["string", "array"]],
  ["listCards", ["object"]],
  ["completeCard", ["string"]],
  ["listArchivedCards", ["string", "object"]],
  ["addCardCommit", ["string", "object"]],
  ["listCardCommits", ["string"]],
  ["linkCardNote", ["string", "string"]],
  ["unlinkCardNote", ["string", "string"]],
  ["listCardNotes", ["string"]],
  ["listLabels", ["string"]],
  ["createLabel", ["string", "object"]],
  ["updateLabel", ["string", "object"]],
  ["deleteLabel", ["string"]],
  ["addCardLabel", ["string", "string"]],
  ["removeCardLabel", ["string", "string"]],
  ["queryMemory", ["object"]],
  ["fetchSkillPrompt", ["string"]]
]);

const taskArgTypes = new Map([
  ["uploadFile", ["object", "string", "string"]],
  ["fetchHistory", ["object"]],
  ["callAction", ["string", "object", "object"]]
]);

const agentArgNames = new Map([
  ["sendMessage", ["conversation_id", "content"]],
  ["sendTelemetry", ["event", "data"]],
  ["sendHud", ["data", "conversation_id"]],
  ["sendTaskUpdate", ["agent_name", "data"]],
  ["reportToolCall", ["report"]],
  ["callAction", ["action", "action_args", "options"]],
  ["uploadFile", ["conversation_id", "file", "file_name", "file_type"]],
  ["fetchHistory", ["conversation_id", "options"]],
  ["listNotes", ["options"]],
  ["createNote", ["body"]],
  ["updateNote", ["note_id", "body"]],
  ["deleteNote", ["note_id"]],
  ["createCard", ["body"]],
  ["updateCard", ["card_id", "body"]],
  ["createBoard", ["body"]],
  ["updateBoard", ["board_id", "body"]],
  ["archiveBoard", ["board_id"]],
  ["listColumns", ["board_id"]],
  ["createColumn", ["board_id", "body"]],
  ["updateColumn", ["column_id", "body"]],
  ["deleteColumn", ["column_id"]],
  ["reorderColumns", ["board_id", "column_ids"]],
  ["listCards", ["options"]],
  ["completeCard", ["card_id"]],
  ["listArchivedCards", ["board_id", "options"]],
  ["addCardCommit", ["card_id", "body"]],
  ["listCardCommits", ["card_id"]],
  ["linkCardNote", ["card_id", "note_id"]],
  ["unlinkCardNote", ["card_id", "note_id"]],
  ["listCardNotes", ["card_id"]],
  ["listLabels", ["board_id"]],
  ["createLabel", ["board_id", "body"]],
  ["updateLabel", ["label_id", "body"]],
  ["deleteLabel", ["label_id"]],
  ["addCardLabel", ["card_id", "label_id"]],
  ["removeCardLabel", ["card_id", "label_id"]],
  ["queryMemory", ["options"]],
  ["fetchSkillPrompt", ["skill_slug"]]
]);

const taskArgNames = new Map([
  ["uploadFile", ["file", "file_name", "file_type"]],
  ["fetchHistory", ["options"]],
  ["callAction", ["action", "action_args", "options"]]
]);

const trimmedStringArguments = new Set([
  "action",
  "board_id",
  "card_id",
  "column_id",
  "conversation_id",
  "label_id",
  "note_id",
  "skill_slug"
]);

const trimmedStringFields = new Set([
  "callId",
  "conversationId",
  "messageId",
  "parentCallId",
  "taskId"
]);

const trimmedStringFieldsByArgument = new Map([
  ["body", new Set([
    "boardId",
    "columnId",
    "notebookId"
  ])],
  ["options", new Set([
    ...trimmedStringFields,
    "after",
    "around",
    "before"
  ])],
  ["report", new Set([
    "sessionId",
    "turnId",
    "messageId"
  ])]
]);

const trimmedStringArrayArguments = new Set([
  "column_ids"
]);

const stringArraySchema = {
  type: "array",
  items: { type: "string" }
};

const fetchHistoryOptionsSchema = {
  type: "object",
  properties: {
    before: { type: "string" },
    after: { type: "string" },
    around: { type: "string" },
    limit: { type: "number" }
  },
  additionalProperties: false
};

const listNotesOptionsSchema = {
  type: "object",
  properties: {
    before: { type: "string" },
    limit: { type: "number" },
    offset: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    archived: { type: "boolean" }
  },
  additionalProperties: false
};

const createNoteBodySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    notebookId: { type: "string" }
  },
  required: ["title"],
  additionalProperties: false
};

const updateNoteBodySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    tags: { type: "array", items: { type: "string" } }
  },
  additionalProperties: false
};

const createCardBodySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string" },
    columnName: { type: "string" },
    columnId: { type: "string" },
    boardId: { type: "string" }
  },
  required: ["title"],
  additionalProperties: false
};

const updateCardBodySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string" },
    columnId: { type: "string" },
    sortOrder: { type: "number" }
  },
  additionalProperties: false
};

const createBoardBodySchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false
      }
    }
  },
  required: ["name"],
  additionalProperties: false
};

const updateBoardBodySchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false
};

const columnBodySchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    sortOrder: { type: "number" }
  },
  additionalProperties: false
};

const createColumnBodySchema = {
  ...columnBodySchema,
  required: ["name"]
};

const addCommitBodySchema = {
  type: "object",
  properties: {
    commitHash: { type: "string" },
    message: { type: "string" }
  },
  required: ["commitHash"],
  additionalProperties: false
};

const labelBodySchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    color: { type: "string" }
  },
  additionalProperties: false
};

const createLabelBodySchema = {
  ...labelBodySchema,
  required: ["name"]
};

const listCardsOptionsSchema = {
  type: "object",
  properties: {
    search: { type: "string" },
    limit: { type: "number" },
    offset: { type: "number" }
  },
  additionalProperties: false
};

const listArchivedCardsOptionsSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" }
  },
  additionalProperties: false
};

const queryMemoryOptionsSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    limit: { type: "number" }
  },
  required: ["query"],
  additionalProperties: false
};

const taskUpdateDataSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        status: { type: "string", enum: ["started"] },
        task: { type: "string" }
      },
      required: ["status", "task"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        status: { type: "string", enum: ["completed"] },
        durationMs: { type: "number" },
        costUsd: { type: "number" },
        numTurns: { type: "number" }
      },
      required: ["status"],
      additionalProperties: false
    }
  ]
};

const actionOptionsSchema = {
  type: "object",
  properties: {
    callId: { type: "string" },
    taskId: { type: "string" },
    conversationId: { type: "string" },
    messageId: { type: "string" },
    parentCallId: { type: "string" },
    reason: { type: "string" },
    metadata: { type: "object" },
    dryRun: { type: "boolean" },
    timeoutMs: { type: "number" }
  },
  additionalProperties: false
};

const taskActionOptionsSchema = {
  type: "object",
  properties: {
    callId: { type: "string" },
    parentCallId: { type: "string" },
    reason: { type: "string" },
    metadata: { type: "object" },
    dryRun: { type: "boolean" },
    timeoutMs: { type: "number" }
  },
  additionalProperties: false
};

const toolCallReportSchema = {
  type: "object",
  properties: {
    sessionId: { type: "string" },
    turnId: { type: "string" },
    seqOrder: { type: "number" },
    toolName: { type: "string" },
    input: { type: "object" },
    output: {},
    durationMs: { type: "number" },
    success: { type: "boolean" },
    error: { type: "string" },
    messageId: { type: "string" }
  },
  required: ["sessionId", "turnId", "seqOrder", "toolName", "input", "success"],
  additionalProperties: false
};

const uploadFileSchema = {
  type: "object",
  properties: {
    base64: { type: "string" }
  },
  required: ["base64"],
  additionalProperties: false
};

const agentArgSchemas = new Map([
  ["uploadFile", [null, uploadFileSchema, null, null]],
  ["sendTaskUpdate", [null, taskUpdateDataSchema]],
  ["reportToolCall", [toolCallReportSchema]],
  ["callAction", [null, null, actionOptionsSchema]],
  ["fetchHistory", [null, fetchHistoryOptionsSchema]],
  ["listNotes", [listNotesOptionsSchema]],
  ["createNote", [createNoteBodySchema]],
  ["updateNote", [null, updateNoteBodySchema]],
  ["createCard", [createCardBodySchema]],
  ["updateCard", [null, updateCardBodySchema]],
  ["createBoard", [createBoardBodySchema]],
  ["updateBoard", [null, updateBoardBodySchema]],
  ["createColumn", [null, createColumnBodySchema]],
  ["updateColumn", [null, columnBodySchema]],
  ["reorderColumns", [null, stringArraySchema]],
  ["listCards", [listCardsOptionsSchema]],
  ["listArchivedCards", [null, listArchivedCardsOptionsSchema]],
  ["addCardCommit", [null, addCommitBodySchema]],
  ["createLabel", [null, createLabelBodySchema]],
  ["updateLabel", [null, labelBodySchema]],
  ["queryMemory", [queryMemoryOptionsSchema]]
]);

const taskArgSchemas = new Map([
  ["uploadFile", [uploadFileSchema, null, null]],
  ["fetchHistory", [fetchHistoryOptionsSchema]],
  ["callAction", [null, null, taskActionOptionsSchema]]
]);

function applySdkContract(scope, methods, requiredCounts, maxCounts, argTypes, argNames, argSchemas) {
  const entries = Object.entries(sdkContract[scope]);
  methods.clear();
  requiredCounts.clear();
  maxCounts.clear();
  argTypes.clear();
  argNames.clear();
  argSchemas.clear();
  for (const [method, definition] of entries) {
    const schemas = definition.args.map((argument) =>
      argument.schema["x-arinova-file"] ? uploadFileSchema : argument.schema
    );
    methods.add(method);
    requiredCounts.set(method, definition.required);
    maxCounts.set(method, definition.args.length);
    argNames.set(method, definition.args.map((argument) => argument.name));
    argTypes.set(method, schemas.map((schema) => schema.type || "object"));
    argSchemas.set(method, schemas);
  }
}

applySdkContract(
  "agent",
  agentMethods,
  agentRequiredArgCounts,
  agentMaxArgCounts,
  agentArgTypes,
  agentArgNames,
  agentArgSchemas
);
applySdkContract(
  "task",
  taskMethods,
  taskRequiredArgCounts,
  taskMaxArgCounts,
  taskArgTypes,
  taskArgNames,
  taskArgSchemas
);

function assertJsonCompliant(value, path = "response", seen = new Set()) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} contains a non-finite number`);
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompliant(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertJsonCompliant(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function jsonResponse(res, status, body) {
  assertJsonCompliant(body);
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length)
  });
  res.end(payload);
}

function controlPath(req) {
  return new URL(req.url || "/", "http://127.0.0.1").pathname;
}

function tokensEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function readJson(req, maxBodyBytes = DEFAULT_CONTROL_MAX_BODY_BYTES) {
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new UnsupportedMediaTypeError("control request body must use application/json");
  }
  const contentLength = controlContentLength(req.headers["content-length"]);
  if (contentLength > maxBodyBytes) {
    throw new PayloadTooLargeError(`control request body exceeds ${maxBodyBytes} bytes`);
  }
  let body = "";
  req.setEncoding("utf8");
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk, "utf8");
    if (bytes > maxBodyBytes) {
      throw new PayloadTooLargeError(`control request body exceeds ${maxBodyBytes} bytes`);
    }
    body += chunk;
  }
  if (!body) return {};
  assertNoDuplicateJsonKeys(body);
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ControlRequestError("control request body must be a JSON object");
  }
  try {
    assertJsonCompliant(parsed, "control request body");
  } catch (error) {
    throw new ControlRequestError(error instanceof Error ? error.message : String(error));
  }
  return parsed;
}

function assertNoDuplicateJsonKeys(raw) {
  let index = 0;

  function skipWhitespace() {
    while (/\s/.test(raw[index] || "")) index += 1;
  }

  function parseString() {
    index += 1;
    let value = "";
    while (index < raw.length) {
      const char = raw[index];
      if (char === '"') {
        index += 1;
        return value;
      }
      if (char === "\\") {
        const escaped = raw[index + 1];
        if (escaped === "u") {
          const hex = raw.slice(index + 2, index + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            value += String.fromCharCode(Number.parseInt(hex, 16));
            index += 6;
            continue;
          }
        }
        const escapes = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        value += Object.prototype.hasOwnProperty.call(escapes, escaped) ? escapes[escaped] : "";
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }
    return value;
  }

  function skipLiteral() {
    while (index < raw.length && !/[\s,\]}]/.test(raw[index])) index += 1;
  }

  function parseArray() {
    index += 1;
    skipWhitespace();
    if (raw[index] === "]") {
      index += 1;
      return;
    }
    while (index < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[index] === ",") {
        index += 1;
        continue;
      }
      if (raw[index] === "]") {
        index += 1;
      }
      return;
    }
  }

  function parseObject() {
    const keys = new Set();
    index += 1;
    skipWhitespace();
    if (raw[index] === "}") {
      index += 1;
      return;
    }
    while (index < raw.length) {
      skipWhitespace();
      if (raw[index] !== '"') return;
      const key = parseString();
      if (keys.has(key)) {
        throw new ControlRequestError(`JSON object contains duplicate key: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      if (raw[index] !== ":") return;
      index += 1;
      parseValue();
      skipWhitespace();
      if (raw[index] === ",") {
        index += 1;
        continue;
      }
      if (raw[index] === "}") {
        index += 1;
      }
      return;
    }
  }

  function parseValue() {
    skipWhitespace();
    if (raw[index] === "{") {
      parseObject();
      return;
    }
    if (raw[index] === "[") {
      parseArray();
      return;
    }
    if (raw[index] === '"') {
      parseString();
      return;
    }
    skipLiteral();
  }

  parseValue();
}

function controlContentLength(value) {
  if (value == null) {
    throw new ControlRequestError("control request Content-Length is required");
  }
  const raw = String(value).trim();
  if (!raw) {
    throw new ControlRequestError("control request Content-Length is required");
  }
  if (!/^\d+$/.test(raw)) {
    throw new ControlRequestError("control request Content-Length must be a non-negative integer");
  }
  return Number(raw);
}

class ControlRequestError extends Error {}
class UnsupportedMediaTypeError extends Error {}
class PayloadTooLargeError extends Error {}

function normalizeCallArgs(body) {
  if (!hasOwn(body, "args")) return [];
  if (!Array.isArray(body.args)) {
    throw new ControlRequestError("args must be an array when provided");
  }
  return body.args;
}

function validateCallArgs(method, args, requiredArgCounts, maxArgCounts) {
  const requiredCount = requiredArgCounts.get(method) ?? 0;
  const maxCount = maxArgCounts.get(method);
  if (args.length < requiredCount) {
    throw new ControlRequestError(`args for ${method} requires at least ${requiredCount} item(s)`);
  }
  if (typeof maxCount === "number" && args.length > maxCount) {
    throw new ControlRequestError(`args for ${method} accepts at most ${maxCount} item(s)`);
  }
}

function argTypePhrase(type) {
  return type === "array" || type === "object" ? `an ${type}` : `a ${type}`;
}

function matchesArgType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  return true;
}

function validateCallArgTypes(method, args, argTypes) {
  const expectedTypes = argTypes.get(method);
  if (!expectedTypes) return;
  for (let index = 0; index < args.length; index += 1) {
    const expectedType = expectedTypes[index];
    if (expectedType && !matchesArgType(args[index], expectedType)) {
      throw new ControlRequestError(`args[${index}] must be ${argTypePhrase(expectedType)}`);
    }
  }
}

function validateSchemaValue(name, schema, value) {
  if (!schema) return;
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    if (value && typeof value === "object" && !Array.isArray(value) && hasOwn(value, "status")) {
      const allowedStatuses = [];
      for (const branch of schema.oneOf) {
        const enumValues = branch?.properties?.status?.enum;
        if (!Array.isArray(enumValues)) continue;
        allowedStatuses.push(...enumValues.map(String));
        if (enumValues.includes(value.status)) {
          validateSchemaValue(name, branch, value);
          return;
        }
      }
      if (allowedStatuses.length > 0) {
        throw new ControlRequestError(`${name}.status must be one of: ${allowedStatuses.join(", ")}`);
      }
    }
    let firstError = null;
    for (const branch of schema.oneOf) {
      try {
        validateSchemaValue(name, branch, value);
        return;
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    throw firstError || new ControlRequestError(`${name} did not match any allowed schema`);
  }

  if (schema.type && !matchesArgType(value, schema.type)) {
    throw new ControlRequestError(`${name} must be ${argTypePhrase(schema.type)}`);
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).filter((key) => !hasOwn(properties, key)).sort();
      if (unknown.length > 0) {
        throw new ControlRequestError(`${name} has unsupported field(s): ${unknown.join(", ")}`);
      }
    }
    for (const required of schema.required || []) {
      if (!hasOwn(value, required)) {
        throw new ControlRequestError(`${name}.${required} is required`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (hasOwn(properties, key)) {
        validateSchemaValue(`${name}.${key}`, properties[key], item);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(value)) {
    const itemSchema = schema.items && typeof schema.items === "object" ? schema.items : {};
    if (itemSchema.type === "string" && value.some((item) => typeof item !== "string")) {
      throw new ControlRequestError(`${name} items must be strings`);
    }
    if (itemSchema.type === "object") {
      value.forEach((item, index) => validateSchemaValue(`${name}[${index}]`, itemSchema, item));
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new ControlRequestError(`${name} must be one of: ${schema.enum.map(String).join(", ")}`);
  }
}

function validateCallArgSchemas(method, args, argSchemas) {
  const expectedSchemas = argSchemas.get(method);
  if (!expectedSchemas) return;
  for (let index = 0; index < args.length; index += 1) {
    const schema = expectedSchemas[index];
    if (schema) {
      validateSchemaValue(`args[${index}]`, schema, args[index]);
    }
  }
}

function normalizeSdkArgs(method, args, argNames) {
  const names = argNames.get(method);
  if (!names) return args;
  return args.map((value, index) => normalizeSdkValue(names[index], value));
}

function normalizeSdkValue(name, value) {
  if (typeof value === "string" && trimmedStringArguments.has(name)) {
    return value.trim();
  }
  if (Array.isArray(value) && trimmedStringArrayArguments.has(name)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : item));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const trimmedFields = trimmedStringFieldsByArgument.get(name) ?? new Set();
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" && trimmedFields.has(key) ? item.trim() : item
    ])
  );
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function rejectUnknownFields(body, allowedFields) {
  const unknown = Object.keys(body).filter((key) => !allowedFields.has(key)).sort();
  if (unknown.length > 0) {
    throw new ControlRequestError(`control request body has unsupported field(s): ${unknown.join(", ")}`);
  }
}

function requiredStringField(body, key) {
  if (typeof body[key] !== "string") {
    throw new ControlRequestError(`${key} must be a non-empty string`);
  }
  const value = body[key].trim();
  if (value === "") {
    throw new ControlRequestError(`${key} must be a non-empty string`);
  }
  return value;
}

function requiredTextField(body, key) {
  if (typeof body[key] !== "string") {
    throw new ControlRequestError(`${key} must be a string`);
  }
  return body[key];
}

function decodeUploadArgs(args, fileArgIndex = 1) {
  const next = [...args];
  const file = next[fileArgIndex];
  if (!file || typeof file !== "object" || Array.isArray(file) || typeof file.base64 !== "string") {
    throw new ControlRequestError(`uploadFile argument ${fileArgIndex} must be an object with a base64 string`);
  }
  const extra = Object.keys(file).filter((key) => key !== "base64").sort();
  if (extra.length > 0) {
    throw new ControlRequestError(`uploadFile argument ${fileArgIndex} has unsupported field(s): ${extra.join(", ")}`);
  }
  const raw = file.base64;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
    throw new ControlRequestError(`uploadFile argument ${fileArgIndex} has invalid base64 data`);
  }
  next[fileArgIndex] = Uint8Array.from(Buffer.from(raw, "base64"));
  return next;
}

async function callAllowed(target, allowedMethods, method, args) {
  if (!allowedMethods.has(method)) {
    throw new ControlRequestError(`unsupported SDK method: ${method}`);
  }
  const fn = target[method];
  if (typeof fn !== "function") {
    throw new Error(`SDK method is not callable: ${method}`);
  }
  return await fn.apply(target, args);
}

async function callAgentSdk(agent, body) {
  rejectUnknownFields(body, new Set(["method", "args"]));
  const method = requiredStringField(body, "method");
  if (!agentMethods.has(method)) {
    throw new ControlRequestError(`unsupported SDK method: ${method}`);
  }
  let args = normalizeCallArgs(body);
  validateCallArgs(method, args, agentRequiredArgCounts, agentMaxArgCounts);
  validateCallArgTypes(method, args, agentArgTypes);
  validateCallArgSchemas(method, args, agentArgSchemas);
  args = normalizeSdkArgs(method, args, agentArgNames);
  if (method === "uploadFile") {
    args = decodeUploadArgs(args, 1);
  }
  return await callAllowed(agent, agentMethods, method, args);
}

async function callTaskSdk(agent, tasks, body) {
  rejectUnknownFields(body, new Set(["taskId", "method", "args"]));
  const taskId = requiredStringField(body, "taskId");
  const method = requiredStringField(body, "method");
  if (!taskMethods.has(method)) {
    throw new ControlRequestError(`unsupported SDK method: ${method}`);
  }
  let args = normalizeCallArgs(body);
  validateCallArgs(method, args, taskRequiredArgCounts, taskMaxArgCounts);
  validateCallArgTypes(method, args, taskArgTypes);
  validateCallArgSchemas(method, args, taskArgSchemas);
  args = normalizeSdkArgs(method, args, taskArgNames);
  const task = tasks.get(taskId);
  if (!task) {
    throw new Error(`no active task: ${taskId}`);
  }
  if (method === "uploadFile") {
    args = decodeUploadArgs(args, 0);
  }
  return await callAllowed(task, taskMethods, method, args);
}

export async function postAdapter(adapterUrl, sharedToken, path, body, timeoutMs = DEFAULT_ADAPTER_POST_TIMEOUT_MS) {
  assertJsonCompliant(body, "adapter callback");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${adapterUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arinova-Bridge-Token": sharedToken
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`adapter ${path} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`adapter ${path} failed (${res.status}): ${await res.text()}`);
  }
  const contentType = String(res.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new Error(`adapter ${path} returned non-JSON response content type: ${contentType || "<missing>"}`);
  }
  const raw = await res.text();
  try {
    assertNoDuplicateJsonKeys(raw);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`adapter ${path} returned malformed acknowledgement: ${raw || "<empty>"}`);
    }
    assertJsonCompliant(parsed, "adapter acknowledgement");
    if (parsed.ok !== true) {
      throw new Error(`adapter ${path} returned unsuccessful acknowledgement: ${raw || "<empty>"}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`adapter ${path} returned `)) {
      throw error;
    }
    throw new Error(`adapter ${path} returned malformed JSON acknowledgement: ${raw || "<empty>"}`);
  }
}

export function createControlServer({
  agent,
  agentSkills = [],
  adapterUrl,
  sharedToken,
  onShutdown = () => process.exit(0),
  maxBodyBytes = DEFAULT_CONTROL_MAX_BODY_BYTES,
  adapterPostTimeoutMs = DEFAULT_ADAPTER_POST_TIMEOUT_MS
}) {
  const tasks = new Map();
  const abortCleanups = new Map();
  const pendingTaskOutputs = [];
  const pendingOnboardingSeeds = new Set();
  const forwardedOnboardingSeeds = new Set();
  let connected = false;
  let lastAuthError = "";

  function forgetTask(taskId, { dropPending = false } = {}) {
    const cleanup = abortCleanups.get(taskId);
    if (cleanup) {
      cleanup();
      abortCleanups.delete(taskId);
    }
    tasks.delete(taskId);
    if (dropPending) {
      for (let index = pendingTaskOutputs.length - 1; index >= 0; index -= 1) {
        if (pendingTaskOutputs[index]?.taskId === taskId) {
          pendingTaskOutputs.splice(index, 1);
        }
      }
    }
  }

  function clearActiveTasks() {
    for (const cleanup of abortCleanups.values()) cleanup();
    abortCleanups.clear();
    tasks.clear();
    pendingTaskOutputs.splice(0);
  }

  function clearControlState() {
    clearActiveTasks();
  }

  function queueOrSendTaskOutput(taskId, sendOutput, terminal = false) {
    if (!connected) {
      if (terminal) {
        sendOutput();
        return;
      }
      while (pendingTaskOutputs.length >= MAX_PENDING_TASK_OUTPUTS) pendingTaskOutputs.shift();
      pendingTaskOutputs.push({ taskId, sendOutput });
      return;
    }
    sendOutput();
  }

  function flushPendingTaskOutputs() {
    if (!connected) return;
    const outputs = pendingTaskOutputs.splice(0);
    for (const { taskId, sendOutput } of outputs) {
      if (!tasks.has(taskId)) continue;
      try {
        sendOutput();
      } catch (error) {
        console.error(error?.stack || String(error));
      }
    }
  }

  function markDisconnected() {
    connected = false;
    postAdapter(adapterUrl, sharedToken, "/connection-status", { connected: false }, adapterPostTimeoutMs).catch(() => {});
  }

  function forwardAuthFailed(error, retryable) {
    clearActiveTasks();
    markDisconnected();
    postAdapter(adapterUrl, sharedToken, "/auth-failed", {
      error,
      retryable
    }, adapterPostTimeoutMs).catch((postError) => {
      console.error(postError?.stack || String(postError));
    });
  }

  agent.on("token_claimed", (data) => {
    if (!isTokenClaimedData(data)) {
      console.warn("Arinova sidecar: ignored malformed token_claimed payload");
      return;
    }
    postAdapter(adapterUrl, sharedToken, "/token-claimed", data, adapterPostTimeoutMs).catch((error) => {
      console.error(error?.stack || String(error));
    });
  });

  agent.on("connected", () => {
    const wasConnected = connected;
    connected = true;
    lastAuthError = "";
    flushPendingTaskOutputs();
    const agentId = typeof agent.getAgentId === "function" ? agent.getAgentId() : null;
    if (!wasConnected) {
      postAdapter(adapterUrl, sharedToken, "/connection-status", {
        connected: true,
        ...(typeof agentId === "string" && agentId ? { agentId } : {})
      }, adapterPostTimeoutMs).catch((error) => {
        console.error(error?.stack || String(error));
      });
    }
    const seed = typeof agent.getOnboardingSeed === "function" ? agent.getOnboardingSeed() : null;
    if (!isOnboardingSeed(seed)) {
      return;
    }
    if (forwardedOnboardingSeeds.has(seed.seedId) || pendingOnboardingSeeds.has(seed.seedId)) {
      return;
    }
    pendingOnboardingSeeds.add(seed.seedId);
    postAdapter(adapterUrl, sharedToken, "/onboarding-seed", seed, adapterPostTimeoutMs)
      .then(() => {
        forwardedOnboardingSeeds.add(seed.seedId);
      })
      .catch((error) => {
        console.error(error?.stack || String(error));
      })
      .finally(() => {
        pendingOnboardingSeeds.delete(seed.seedId);
      });
  });

  agent.on("disconnected", () => {
    markDisconnected();
  });

  agent.on("auth_failed", () => {
    if (!lastAuthError) forwardAuthFailed("Arinova SDK authentication failed", false);
  });

  agent.on("error", (error) => {
    const message = error?.message || String(error);
    if (!message.includes("Agent auth failed") && !message.includes("Agent auth retryable server error")) {
      postAdapter(adapterUrl, sharedToken, "/sdk-error", { error: message }, adapterPostTimeoutMs).catch((postError) => {
        console.error(postError?.stack || String(postError));
      });
      return;
    }
    lastAuthError = message;
    forwardAuthFailed(message, message.includes("retryable server error"));
  });

  agent.onTask(async (task) => {
    const taskId = typeof task.taskId === "string" ? task.taskId : "";
    if (!taskId) {
      task.sendError("Arinova task is missing taskId");
      return;
    }
    tasks.set(taskId, task);
    if (task.signal && typeof task.signal.addEventListener === "function") {
      const handleAbort = () => {
        abortCleanups.delete(taskId);
        tasks.delete(taskId);
        forgetTask(taskId, { dropPending: true });
        postAdapter(adapterUrl, sharedToken, "/cancel", { taskId }, adapterPostTimeoutMs).catch((error) => {
          console.error(error?.stack || String(error));
        });
      };
      if (task.signal.aborted) {
        handleAbort();
        return;
      }
      task.signal.addEventListener("abort", handleAbort, { once: true });
      if (typeof task.signal.removeEventListener === "function") {
        abortCleanups.set(taskId, () => task.signal.removeEventListener("abort", handleAbort));
      }
    }
    try {
      await postAdapter(adapterUrl, sharedToken, "/task", serializeTask(task, agentSkills), adapterPostTimeoutMs);
    } catch (error) {
      forgetTask(taskId);
      task.sendError(error instanceof Error ? error.message : String(error));
    }
  });

  const controlServer = http.createServer(async (req, res) => {
    const path = controlPath(req);
    if (!tokensEqual(req.headers["x-arinova-bridge-token"], sharedToken)) {
      jsonResponse(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    if (CONTROL_ENDPOINTS.has(path) && req.method !== "POST") {
      const payload = Buffer.from(JSON.stringify({ ok: false, error: "method not allowed" }));
      res.writeHead(405, {
        "Allow": "POST",
        "Content-Type": "application/json",
        "Content-Length": String(payload.length)
      });
      res.end(payload);
      return;
    }

    try {
      if (req.method === "POST" && path === "/healthz") {
        const body = await readJson(req, maxBodyBytes);
        rejectUnknownFields(body, new Set());
        const agentId = connected && typeof agent.getAgentId === "function" ? agent.getAgentId() : null;
        jsonResponse(res, 200, {
          ok: true,
          connected,
          ...(typeof agentId === "string" && agentId ? { agentId } : {}),
          tasks: tasks.size
        });
        return;
      }

      if (req.method === "POST" && path === "/agent-sdk") {
        const result = await callAgentSdk(agent, await readJson(req, maxBodyBytes));
        jsonResponse(res, 200, { ok: true, result: result ?? null });
        return;
      }

      if (req.method === "POST" && path === "/task-sdk") {
        const result = await callTaskSdk(agent, tasks, await readJson(req, maxBodyBytes));
        jsonResponse(res, 200, { ok: true, result: result ?? null });
        return;
      }

      if (req.method === "POST" && path === "/chunk") {
        const body = await readJson(req, maxBodyBytes);
        rejectUnknownFields(body, new Set(["taskId", "content"]));
        const taskId = requiredStringField(body, "taskId");
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`no active task: ${taskId}`);
        }
        const content = requiredTextField(body, "content");
        queueOrSendTaskOutput(taskId, () => task.sendChunk(content));
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && path === "/complete") {
        const body = await readJson(req, maxBodyBytes);
        rejectUnknownFields(body, new Set(["taskId", "content", "mentions"]));
        const taskId = requiredStringField(body, "taskId");
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`no active task: ${taskId}`);
        }
        if (hasOwn(body, "mentions") && !Array.isArray(body.mentions)) {
          throw new ControlRequestError("mentions must be an array when provided");
        }
        if (Array.isArray(body.mentions) && body.mentions.some((mention) => typeof mention !== "string")) {
          throw new ControlRequestError("mentions items must be strings");
        }
        const mentions = Array.isArray(body.mentions)
          ? body.mentions.filter((mention) => mention.trim() !== "")
          : [];
        const options = mentions.length ? { mentions } : undefined;
        const content = requiredTextField(body, "content");
        try {
          queueOrSendTaskOutput(taskId, () => task.sendComplete(content, options), true);
        } finally {
          forgetTask(taskId);
        }
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && path === "/error") {
        const body = await readJson(req, maxBodyBytes);
        rejectUnknownFields(body, new Set(["taskId", "error"]));
        const taskId = requiredStringField(body, "taskId");
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`no active task: ${taskId}`);
        }
        const error = requiredTextField(body, "error");
        try {
          queueOrSendTaskOutput(taskId, () => task.sendError(error), true);
        } finally {
          forgetTask(taskId);
        }
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && path === "/shutdown") {
        const body = await readJson(req, maxBodyBytes);
        rejectUnknownFields(body, new Set());
        jsonResponse(res, 200, { ok: true });
        setTimeout(onShutdown, 25);
        return;
      }

      jsonResponse(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      const status = error instanceof PayloadTooLargeError
        ? 413
        : error instanceof UnsupportedMediaTypeError
        ? 415
        : error instanceof SyntaxError || error instanceof ControlRequestError
          ? 400
          : 500;
      jsonResponse(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { controlServer, tasks, clearControlState };
}

export async function listen(server, port, bind) {
  server.listen(port, bind);
  await once(server, "listening");
}
