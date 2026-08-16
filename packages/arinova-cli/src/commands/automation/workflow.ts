import type { Command } from "commander";
import { buildQuery, encodePathSegment, resolveClient } from "../../client.js";
import { parseJsonObject, parseJsonOption } from "../../json-options.js";
import { printResult } from "../../output.js";
import { addPaginationOptions, paginationValues } from "../../pagination.js";

const e = encodePathSegment;

export function registerWorkflowCommands(program: Command): void {
  const workflow = program.command("workflow").description("Workflow commands");
  addPaginationOptions(workflow.command("list").option("--status <status>"), {
    mode: "offset",
  }).action(async (options) => printResult(await resolveClient(workflow).get(
    `/api/v1/workflows${buildQuery({
      status: options.status,
      ...paginationValues(options),
    })}`,
  )));
  workflow.command("create")
    .requiredOption("--name <name>").requiredOption("--graph <json>")
    .option("--description <text>").option("--variables <json>")
    .option("--max-concurrent-runs <n>").option("--max-duration-seconds <n>")
    .action(async (options) => printResult(await resolveClient(workflow).post(
      "/api/v1/workflows",
      {
        name: options.name,
        description: options.description,
        graph: parseJsonOption(options.graph, "--graph"),
        variables: parseJsonOption(options.variables, "--variables"),
        maxConcurrentRuns: options.maxConcurrentRuns == null
          ? undefined
          : Number(options.maxConcurrentRuns),
        maxDurationSeconds: options.maxDurationSeconds == null
          ? undefined
          : Number(options.maxDurationSeconds),
      },
    )));
  workflow.command("show").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(workflow).get(`/api/v1/workflows/${e(id)}`));
  });
  workflow.command("update").argument("<id>").requiredOption("--body <json>")
    .action(async (id: string, options) => printResult(await resolveClient(workflow).patch(
      `/api/v1/workflows/${e(id)}`,
      parseJsonObject(options.body, "--body"),
    )));
  workflow.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await resolveClient(workflow).delete(`/api/v1/workflows/${e(id)}`));
  });
  for (const name of ["activate", "pause"] as const) {
    workflow.command(name).argument("<id>").action(async (id: string) => {
      printResult(await resolveClient(workflow).post(`/api/v1/workflows/${e(id)}/${name}`));
    });
  }
  workflow.command("run").argument("<id>").option("--payload <json>")
    .action(async (id: string, options) => printResult(await resolveClient(workflow).post(
      `/api/v1/workflows/${e(id)}/run`,
      { payload: parseJsonOption(options.payload, "--payload") },
    )));
  addPaginationOptions(
    workflow.command("runs").argument("<id>").option("--status <status>"),
    { mode: "offset" },
  ).action(async (id: string, options) => printResult(await resolveClient(workflow).get(
    `/api/v1/workflows/${e(id)}/runs${buildQuery({
      status: options.status,
      ...paginationValues(options),
    })}`,
  )));

  const workflowRun = workflow.command("run-record");
  workflowRun.command("show").argument("<workflow-id>").argument("<run-id>")
    .action(async (id: string, runId: string) => printResult(await resolveClient(workflow).get(
      `/api/v1/workflows/${e(id)}/runs/${e(runId)}`,
    )));
  workflowRun.command("cancel").argument("<workflow-id>").argument("<run-id>")
    .action(async (id: string, runId: string) => printResult(await resolveClient(workflow).post(
      `/api/v1/workflows/${e(id)}/runs/${e(runId)}/cancel`,
    )));
}
