import type { Command } from "commander";
import {
  buildQuery,
  encodePathSegment,
  resolveClient,
} from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { registerAgentPermissions } from "../resource-extras.js";
import { addPaginationOptions, paginationValues, paginationQuery } from "../pagination.js";

const e = encodePathSegment;

async function fileForm(filePath: string): Promise<FormData> {
  const form = new FormData();
  await appendFileToForm(form, "file", filePath);
  return form;
}

export function registerImageCommands(program: Command): void {
  const image = program.command("image").description("Managed image commands");
  const api = () => resolveClient(image);
  const project = image.command("project");
  addPaginationOptions(project.command("list").option("--include-archived"), {
    mode: "offset",
  }).action(async (opts) => {
    printResult(await api().get(`/api/v1/image-projects${buildQuery({
      includeArchived: opts.includeArchived,
      ...paginationValues(opts),
    })}`));
  });
  project.command("create")
    .requiredOption("--title <title>")
    .option("--root-file-key <key>")
    .option("--root-image-asset-id <id>")
    .action(async (opts) => printResult(await api().post("/api/v1/image-projects", {
      title: opts.title,
      rootFileKey: opts.rootFileKey,
      rootImageAssetId: opts.rootImageAssetId,
    })));
  project.command("show").argument("<id>").action(async (id: string) => {
    printResult(await api().get(`/api/v1/image-projects/${e(id)}`));
  });
  project.command("update").argument("<id>")
    .option("--title <title>")
    .option("--current-file-key <key>")
    .option("--current-image-asset-id <id>")
    .action(async (id: string, opts) => printResult(await api().patch(
      `/api/v1/image-projects/${e(id)}`, {
        title: opts.title,
        currentFileKey: opts.currentFileKey,
        currentImageAssetId: opts.currentImageAssetId,
      },
    )));
  project.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await api().delete(`/api/v1/image-projects/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    project.command(name).argument("<id>").action(async (id: string) => {
      printResult(await api().post(`/api/v1/image-projects/${e(id)}/${name}`));
    });
  }
  project.command("document").argument("<id>").option("--version-id <id>")
    .action(async (id: string, opts) => printResult(await api().get(
      `/api/v1/image-projects/${e(id)}/document${buildQuery({
        versionId: opts.versionId,
      })}`,
    )));
  addPaginationOptions(project.command("versions").argument("<id>"), {
    mode: "cursor",
  }).action(async (id: string, options) => {
    printResult(await api().get(
      `/api/v1/image-projects/${e(id)}/versions${paginationQuery(options)}`,
    ));
  });
  project.command("upload-asset").argument("<id>")
    .requiredOption("--role <role>", "layer or preview")
    .requiredOption("--file <path>")
    .requiredOption("--idempotency-key <key>")
    .action(async (id: string, opts) => {
      printResult(await api().request({
        method: "POST",
        path: `/api/v1/image-projects/${e(id)}/assets${buildQuery({ role: opts.role })}`,
        form: await fileForm(opts.file),
        headers: { "Idempotency-Key": opts.idempotencyKey },
      }));
    });
  project.command("asset").argument("<id>")
    .option("--file-id <id>", "Historical asset file ID")
    .option("--editor")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, opts) => {
      const path = opts.fileId
        ? `/api/v1/image-projects/${e(id)}/assets/${e(opts.fileId)}`
        : `/api/v1/image-projects/${e(id)}/asset`;
      await api().download(
        `${path}${buildQuery({ editor: opts.editor })}`, opts.output, opts.force,
      );
    });
  project.command("commit-revision").argument("<id>")
    .requiredOption("--source-version-id <id>")
    .requiredOption("--preview-image-asset-id <id>")
    .requiredOption("--document <json>")
    .requiredOption("--idempotency-key <key>")
    .requiredOption("--expected-revision <n>")
    .action(async (id: string, opts) => {
      printResult(await api().post(
        `/api/v1/image-projects/${e(id)}/revisions`,
        {
          sourceVersionId: opts.sourceVersionId,
          previewImageAssetId: opts.previewImageAssetId,
          document: parseJsonOption(opts.document, "--document"),
          idempotencyKey: opts.idempotencyKey,
        },
        { "If-Match": `"${Number(opts.expectedRevision)}"` },
      ));
    });

  const member = project.command("member");
  addPaginationOptions(member.command("list").argument("<id>"), {
    mode: "offset",
  }).action(async (id: string, options) => {
    printResult(await api().get(
      `/api/v1/image-projects/${e(id)}/members${paginationQuery(options)}`,
    ));
  });
  member.command("add").argument("<id>")
    .option("--user-id <id>").option("--username <name>").option("--permission <permission>", "view, edit, or admin", "view")
    .action(async (id: string, opts) => printResult(await api().post(
      `/api/v1/image-projects/${e(id)}/members`, {
        userId: opts.userId,
        username: opts.username,
        permission: opts.permission,
      },
    )));
  member.command("update").argument("<id>").argument("<user-id>")
    .requiredOption("--permission <permission>")
    .action(async (id: string, userId: string, opts) => printResult(await api().patch(
      `/api/v1/image-projects/${e(id)}/members/${e(userId)}`, { permission: opts.permission },
    )));
  member.command("remove").argument("<id>").argument("<user-id>")
    .action(async (id: string, userId: string) => printResult(await api().delete(
      `/api/v1/image-projects/${e(id)}/members/${e(userId)}`,
    )));

  registerAgentPermissions(project, {
    basePath: (id) => `/api/v1/image-projects/${e(id)}`,
  });
  const share = project.command("public-share");
  share.command("create").argument("<id>").action(async (id: string) => {
    printResult(await api().post(`/api/v1/image-projects/${e(id)}/public-share`));
  });
  share.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await api().delete(`/api/v1/image-projects/${e(id)}/public-share`));
  });

  const asset = image.command("asset");
  asset.command("create")
    .requiredOption("--file <path>")
    .requiredOption("--role <role>", "edit_source, edit_mask, project_source, or embedded")
    .requiredOption("--idempotency-key <key>")
    .option("--conversation-id <id>")
    .option("--document-type <type>")
    .option("--document-id <id>")
    .action(async (opts) => {
      const form = await fileForm(opts.file);
      form.append("role", opts.role);
      if (opts.conversationId) form.append("conversationId", opts.conversationId);
      if (opts.documentType) form.append("documentType", opts.documentType);
      if (opts.documentId) form.append("documentId", opts.documentId);
      printResult(await api().request({
        method: "POST",
        path: "/api/v1/image-assets",
        form,
        headers: { "Idempotency-Key": opts.idempotencyKey },
      }));
    });
  asset.command("download").argument("<id>")
    .option("--variant <variant>", "original, preview, thumbnail, or display", "original")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, opts) => api().download(
      `/api/v1/image-assets/${e(id)}/content${buildQuery({ variant: opts.variant })}`,
      opts.output, opts.force,
    ));

  program.command("external-image")
    .description("Fetch an external image through the server SSRF-safe proxy")
    .command("fetch")
    .requiredOption("--url <url>")
    .requiredOption("--output <path>")
    .option("--force")
    .action(async (opts) => api().download(
      `/api/v1/external-images/content${buildQuery({ url: opts.url })}`,
      opts.output, opts.force,
    ));
}
