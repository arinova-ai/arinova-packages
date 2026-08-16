import type { Command } from "commander";
import {
  buildQuery,
  del,
  encodePathSegment,
  get,
  patch,
  post,
  put,
  resolveClient,
} from "../client.js";
import { appendFileToForm } from "../file-upload.js";
import { printResult } from "../output.js";
import { parseJsonArray, parseJsonOption } from "../json-options.js";

const e = encodePathSegment;

const apiClient = resolveClient;

async function fileForm(filePath: string): Promise<FormData> {
  const form = new FormData();
  await appendFileToForm(form, "file", filePath);
  return form;
}

export function registerImageCommands(program: Command): void {
  const image = program.command("image").description("Managed image commands");
  const project = image.command("project");
  project.command("list").option("--include-archived").action(async (opts) => {
    printResult(await get(`/api/v1/image-projects${buildQuery({
      includeArchived: opts.includeArchived,
    })}`));
  });
  project.command("create")
    .requiredOption("--title <title>")
    .option("--root-file-key <key>")
    .option("--root-image-asset-id <id>")
    .action(async (opts) => printResult(await post("/api/v1/image-projects", {
      title: opts.title,
      rootFileKey: opts.rootFileKey,
      rootImageAssetId: opts.rootImageAssetId,
    })));
  project.command("show").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/image-projects/${e(id)}`));
  });
  project.command("update").argument("<id>")
    .option("--title <title>")
    .option("--current-file-key <key>")
    .option("--current-image-asset-id <id>")
    .action(async (id: string, opts) => printResult(await patch(
      `/api/v1/image-projects/${e(id)}`, {
        title: opts.title,
        currentFileKey: opts.currentFileKey,
        currentImageAssetId: opts.currentImageAssetId,
      },
    )));
  project.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/image-projects/${e(id)}`));
  });
  for (const name of ["archive", "unarchive"] as const) {
    project.command(name).argument("<id>").action(async (id: string) => {
      printResult(await post(`/api/v1/image-projects/${e(id)}/${name}`));
    });
  }
  project.command("document").argument("<id>").option("--version-id <id>")
    .action(async (id: string, opts) => printResult(await get(
      `/api/v1/image-projects/${e(id)}/document${buildQuery({
        versionId: opts.versionId,
      })}`,
    )));
  project.command("versions").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/image-projects/${e(id)}/versions`));
  });
  project.command("upload-asset").argument("<id>")
    .requiredOption("--role <role>", "layer or preview")
    .requiredOption("--file <path>")
    .requiredOption("--idempotency-key <key>")
    .action(async (id: string, opts) => {
      printResult(await apiClient(image).request({
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
      await apiClient(image).download(
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
      printResult(await apiClient(image).post(
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
  member.command("list").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/image-projects/${e(id)}/members`));
  });
  member.command("add").argument("<id>")
    .option("--user-id <id>").option("--username <name>").option("--permission <permission>", "view, edit, or admin", "view")
    .action(async (id: string, opts) => printResult(await post(
      `/api/v1/image-projects/${e(id)}/members`, {
        userId: opts.userId,
        username: opts.username,
        permission: opts.permission,
      },
    )));
  member.command("update").argument("<id>").argument("<user-id>")
    .requiredOption("--permission <permission>")
    .action(async (id: string, userId: string, opts) => printResult(await patch(
      `/api/v1/image-projects/${e(id)}/members/${e(userId)}`, { permission: opts.permission },
    )));
  member.command("remove").argument("<id>").argument("<user-id>")
    .action(async (id: string, userId: string) => printResult(await del(
      `/api/v1/image-projects/${e(id)}/members/${e(userId)}`,
    )));

  const permissions = project.command("agent-permissions");
  permissions.command("get").argument("<id>").action(async (id: string) => {
    printResult(await get(`/api/v1/image-projects/${e(id)}/agent-permissions`));
  });
  permissions.command("set").argument("<id>").requiredOption("--agents <json>")
    .action(async (id: string, opts) => {
      const agents = parseJsonArray(opts.agents, "--agents");
      printResult(await put(`/api/v1/image-projects/${e(id)}/agent-permissions`, { agents }));
    });
  const share = project.command("public-share");
  share.command("create").argument("<id>").action(async (id: string) => {
    printResult(await post(`/api/v1/image-projects/${e(id)}/public-share`));
  });
  share.command("delete").argument("<id>").action(async (id: string) => {
    printResult(await del(`/api/v1/image-projects/${e(id)}/public-share`));
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
      printResult(await apiClient(image).request({
        method: "POST",
        path: "/api/v1/image-assets",
        form,
        headers: { "Idempotency-Key": opts.idempotencyKey },
      }));
    });
  asset.command("download").argument("<id>")
    .option("--variant <variant>", "original, preview, thumbnail, or display", "original")
    .requiredOption("--output <path>").option("--force")
    .action(async (id: string, opts) => apiClient(image).download(
      `/api/v1/image-assets/${e(id)}/content${buildQuery({ variant: opts.variant })}`,
      opts.output, opts.force,
    ));

  program.command("external-image")
    .description("Fetch an external image through the server SSRF-safe proxy")
    .command("fetch")
    .requiredOption("--url <url>")
    .requiredOption("--output <path>")
    .option("--force")
    .action(async (opts) => apiClient(image).download(
      `/api/v1/external-images/content${buildQuery({ url: opts.url })}`,
      opts.output, opts.force,
    ));
}
