import type { Command } from "commander";
import { getOpts } from "../api.js";
import {
  buildQuery,
  del,
  encodePathSegment,
  get,
  patch,
  post,
  resolveClient,
} from "../client.js";
import { printResult, printWarning } from "../output.js";
import { parseJsonObject, parseJsonOption } from "../json-options.js";
import { parseCount } from "../pagination.js";

const e = encodePathSegment;

const client = resolveClient;

export function registerAutomationCommands(program: Command): void {
  const action = program.command("action").description("Action calls and confirmations");
  action.command("manifest").action(async () => printResult(await get("/api/v1/actions/manifest")));
  action.command("agent-manifest").action(async () => {
    printResult(await get("/api/v1/actions/agent-manifest"));
  });
  action.command("call").requiredOption("--body <json>", "Inbound action call")
    .action(async (opts) => printResult(await post(
      "/api/v1/actions/call", parseJsonObject(opts.body, "--body"),
    )));
  action.command("pending")
    .requiredOption("--since <datetime>")
    .option("--limit <n>", "Maximum results", parseCount).option("--cursor <cursor>")
    .action(async (opts) => printResult(await get(
      `/api/v1/actions/pending${buildQuery(opts)}`,
    )));
  action.command("history").requiredOption("--conversation-id <id>")
    .action(async (opts) => printResult(await get(
      `/api/v1/actions/history/${e(opts.conversationId)}`,
    )));
  const confirmation = action.command("confirmation");
  confirmation.command("approve").argument("<id>").action(async (id: string) => {
    printResult(await post(`/api/v1/actions/confirm/${e(id)}`));
  });
  confirmation.command("reject").argument("<id>").action(async (id: string) => {
    printResult(await post(`/api/v1/actions/confirm/${e(id)}/reject`));
  });
  action.command("cancel")
    .option("--call-id <id>", "Public call ID")
    .option("--row-id <id>", "Action audit row ID")
    .action(async (opts) => {
      if ((opts.callId ? 1 : 0) + (opts.rowId ? 1 : 0) !== 1) {
        throw new Error("Specify exactly one of --call-id or --row-id");
      }
      printResult(await post(opts.callId
        ? `/api/v1/actions/${e(opts.callId)}/cancel`
        : `/api/v1/actions/by-id/${e(opts.rowId)}/cancel`));
    });

  const workflow = program.command("workflow").description("Workflow commands");
  workflow.command("list").option("--status <status>").option("--limit <n>", "Maximum results", parseCount).option("--offset <n>", "Results to skip", parseCount)
    .action(async (opts) => printResult(await get(`/api/v1/workflows${buildQuery(opts)}`)));
  workflow.command("create")
    .requiredOption("--name <name>").requiredOption("--graph <json>")
    .option("--description <text>").option("--variables <json>")
    .option("--max-concurrent-runs <n>").option("--max-duration-seconds <n>")
    .action(async (opts) => printResult(await post("/api/v1/workflows", {
      name: opts.name,
      description: opts.description,
      graph: parseJsonOption(opts.graph, "--graph"),
      variables: parseJsonOption(opts.variables, "--variables"),
      maxConcurrentRuns: opts.maxConcurrentRuns == null ? undefined : Number(opts.maxConcurrentRuns),
      maxDurationSeconds: opts.maxDurationSeconds == null ? undefined : Number(opts.maxDurationSeconds),
    })));
  workflow.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/workflows/${e(id)}`));
  });
  workflow.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, opts) => printResult(await patch(
      `/api/v1/workflows/${e(id)}`, parseJsonObject(opts.body, "--body"),
    )));
  workflow.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/workflows/${e(id)}`));
  });
  for (const name of ["activate", "pause"] as const) {
    workflow.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/workflows/${e(id)}/${name}`));
    });
  }
  workflow.command("run").argument("<id>").option("--payload <json>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/workflows/${e(id)}/run`,
      { payload: parseJsonOption(opts.payload, "--payload") },
    )));
  workflow.command("runs").argument("<id>")
    .option("--status <status>").option("--limit <n>", "Maximum results", parseCount).option("--offset <n>", "Results to skip", parseCount)
    .action(async (id: string, opts) => printResult(await get(
      `/api/v1/workflows/${e(id)}/runs${buildQuery(opts)}`,
    )));
  const workflowRun = workflow.command("run-record");
  workflowRun.command("show").argument("<workflow-id>").argument("<run-id>")
    .action(async (id: string, runId: string) => printResult(await get(
      `/api/v1/workflows/${e(id)}/runs/${e(runId)}`,
    )));
  workflowRun.command("cancel").argument("<workflow-id>").argument("<run-id>")
    .action(async (id: string, runId: string) => printResult(await post(
      `/api/v1/workflows/${e(id)}/runs/${e(runId)}/cancel`,
    )));

  const cron = program.command("cron").description("Platform cron");
  const job = cron.command("job");
  job.command("list")
    .option("--status <status>").option("--enabled <boolean>")
    .option("--conversation-id <id>").option("--agent-id <id>")
    .option("--created-by-agent-id <id>").option("--schedule-kind <kind>")
    .option("--target-type <type>")
    .action(async (opts) => printResult(await get(
      `/api/v1/platform-cron/jobs${buildQuery(opts)}`,
    )));
  job.command("create").requiredOption("--body <json>").option("--dry-run")
    .action(async (opts) => printResult(await post(
      `/api/v1/platform-cron/jobs${buildQuery({ dryRun: opts.dryRun })}`,
      parseJsonObject(opts.body, "--body"),
    )));
  job.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/platform-cron/jobs/${e(id)}`));
  });
  job.command("update").argument("<id>").requiredOption("--body <json>").option("--dry-run")
    .action(async (id: string, opts) => printResult(await patch(
      `/api/v1/platform-cron/jobs/${e(id)}${buildQuery({ dryRun: opts.dryRun })}`,
      parseJsonObject(opts.body, "--body"),
    )));
  job.command("cancel").argument("<id>").option("--reason <reason>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/platform-cron/jobs/${e(id)}/cancel`, { reason: opts.reason },
    )));
  for (const [name, enabled] of [["enable", true], ["disable", false]] as const) {
    job.command(name).argument("<id>").action(async (id: string) => printResult(await patch(
      `/api/v1/platform-cron/jobs/${e(id)}/enabled`, { enabled },
    )));
  }
  const cronConfirmation = cron.command("confirmation");
  for (const name of ["approve", "reject"] as const) {
    cronConfirmation.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/platform-cron/confirmations/${e(id)}/${name}`));
    });
  }

  const trigger = program.command("trigger").description("Platform triggers");
  trigger.command("list").action(async () => {
    printResult(await get("/api/v1/platform-triggers/triggers"));
  });
  trigger.command("create").requiredOption("--body <json>").action(async (opts) => {
    printResult(await post(
      "/api/v1/platform-triggers/triggers", parseJsonObject(opts.body, "--body"),
    ));
  });
  trigger.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/platform-triggers/triggers/${e(id)}`));
  });
  trigger.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, opts) => printResult(await patch(
      `/api/v1/platform-triggers/triggers/${e(id)}`, parseJsonObject(opts.body, "--body"),
    )));
  trigger.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/platform-triggers/triggers/${e(id)}`));
  });
  for (const [name, enabled] of [["enable", true], ["disable", false]] as const) {
    trigger.command(name).argument("<id>").action(async (id: string) => printResult(await patch(
      `/api/v1/platform-triggers/triggers/${e(id)}/enabled`, { enabled },
    )));
  }
  trigger.command("test").argument("<id>").option("--body <json>", "Test event", "{}")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/platform-triggers/triggers/${e(id)}/test`, parseJsonObject(opts.body, "--body"),
    )));
  trigger.command("cancel").argument("<id>").option("--reason <reason>")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/platform-triggers/triggers/${e(id)}/cancel`, { reason: opts.reason },
    )));
  trigger.command("fire-events").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/platform-triggers/triggers/${e(id)}/fire-events`));
  });
  trigger.command("merged-dispatch").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/platform-triggers/merged-dispatches/${e(id)}`));
  });

  const webhook = program.command("webhook").description("Webhook management");
  webhook.command("list").option("--status <status>").option("--limit <n>", "Maximum results", parseCount).option("--offset <n>", "Results to skip", parseCount)
    .action(async (opts) => printResult(await get(`/api/v1/webhooks${buildQuery(opts)}`)));
  webhook.command("create").requiredOption("--body <json>").action(async (opts) => {
    if (process.stderr.isTTY) printWarning("Webhook secret is shown only in this response; store it securely.");
    printResult(await post("/api/v1/webhooks", parseJsonObject(opts.body, "--body")));
  });
  webhook.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/webhooks/${e(id)}`));
  });
  webhook.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, opts) => printResult(await patch(
      `/api/v1/webhooks/${e(id)}`, parseJsonObject(opts.body, "--body"),
    )));
  webhook.command("cancel").argument("<id>").action(async (id: string) => {
    printResult(await post(`/api/v1/webhooks/${e(id)}/cancel`));
  });
  webhook.command("rotate-secret").argument("<id>").action(async (id: string) => {
    if (process.stderr.isTTY) printWarning("New webhook secret is shown only in this response; store it securely.");
    printResult(await post(`/api/v1/webhooks/${e(id)}/rotate-secret`));
  });
  webhook.command("fire-events").argument("<id>").option("--limit <n>", "Maximum results", parseCount).option("--offset <n>", "Results to skip", parseCount)
    .action(async (id: string, opts) => printResult(await get(
      `/api/v1/webhooks/${e(id)}/fire-events${buildQuery(opts)}`,
    )));
  const fireEvent = webhook.command("fire-event");
  fireEvent.command("show").argument("<webhook-id>").argument("<event-id>")
    .action(async (id: string, eventId: string) => printResult(await get(
      `/api/v1/webhooks/${e(id)}/fire-events/${e(eventId)}`,
    )));
  fireEvent.command("payload").argument("<webhook-id>").argument("<event-id>")
    .action(async (id: string, eventId: string) => printResult(await get(
      `/api/v1/webhooks/${e(id)}/fire-events/${e(eventId)}/payload`,
    )));
  webhook.command("function-executions").argument("<id>")
    .action(async (id: string) => printResult(await get(
      `/api/v1/webhooks/${e(id)}/function-executions`,
    )));

  const delivery = program.command("delivery").description("Pull deliveries");
  delivery.command("list")
    .option("--endpoint-id <id>").option("--status <status>")
    .option("--cursor <cursor>").option("--limit <n>", "Maximum results", parseCount)
    .action(async (opts) => printResult(await get(`/api/v1/deliveries${buildQuery(opts)}`)));
  delivery.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/deliveries/${e(id)}`));
  });
  delivery.command("ack").argument("<id>").requiredOption("--idempotency-key <key>")
    .action(async (id: string, opts) => printResult(await client(delivery).post(
      `/api/v1/deliveries/${e(id)}/ack`, undefined,
      { "Idempotency-Key": opts.idempotencyKey },
    )));

  const autopilot = program.command("autopilot").description("Autopilot controls");
  const settings = autopilot.command("settings");
  settings.command("get").requiredOption("--agent-id <id>").option("--conversation-id <id>")
    .action(async (opts) => printResult(await get(
      `/api/v1/autopilot/settings${buildQuery(opts)}`,
    )));
  settings.command("update").requiredOption("--body <json>").action(async (opts) => {
    printResult(await patch("/api/v1/autopilot/settings", parseJsonObject(opts.body, "--body")));
  });
  autopilot.command("evaluate")
    .requiredOption("--agent-id <id>").requiredOption("--conversation-id <id>")
    .option("--dry-run")
    .action(async (opts) => printResult(await post("/api/v1/autopilot/evaluate", {
      agentId: opts.agentId,
      conversationId: opts.conversationId,
      dryRun: opts.dryRun,
    })));
  autopilot.command("runs").option("--agent-id <id>").option("--conversation-id <id>")
    .action(async (opts) => printResult(await get(`/api/v1/autopilot/runs${buildQuery(opts)}`)));
  autopilot.command("credit").option("--agent-id <id>").option("--conversation-id <id>")
    .action(async (opts) => printResult(await get(`/api/v1/autopilot/credit${buildQuery(opts)}`)));
}
