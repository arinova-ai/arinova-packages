import type { Command } from "commander";
import {
  buildQuery,
  encodePathSegment,
  resolveClient,
} from "../client.js";
import { appendFileToForm, createFileBlob } from "../file-upload.js";
import { printResult, printSuccess, table } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { addPaginationOptions, paginationQuery, paginationValues, parseCount } from "../pagination.js";

const e = encodePathSegment;

function parseTags(value?: string): string[] | undefined {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function printSpaces(data: unknown): void {
  const spaces = (data as Record<string, unknown>)?.spaces ?? data;
  if (Array.isArray(spaces)) {
    table(spaces as Record<string, unknown>[], [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ]);
  } else {
    printResult(data);
  }
}

export function registerSpace(program: Command): void {
  const space = program.command("space").description("Space management");
  const api = () => resolveClient(space);

  addPaginationOptions(space.command("list")
    .description("List discoverable spaces")
    .option("--search <query>")
    .option("--category <category>")
    .option("--page <n>", "Page number", parseCount), { mode: "offset" })
    .action(async (opts) => {
      printSpaces(await api().get(`/api/v1/spaces${buildQuery({
        search: opts.search,
        category: opts.category,
        page: opts.page,
        ...paginationValues(opts),
      })}`));
    });
  space.command("owned").description("List spaces you own").action(async () => {
    printSpaces(await api().get("/api/v1/spaces/owned"));
  });

  space.command("create")
    .requiredOption("--name <name>", "Space name")
    .option("--description <desc>")
    .option("--category <category>")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--url <iframe-url>", "Iframe URL")
    .option("--public")
    .option("--price-points <n>")
    .option("--show-creator-profile")
    .action(async (opts) => {
      printResult(await api().post("/api/v1/spaces", {
        name: opts.name,
        description: opts.description ?? "",
        category: opts.category,
        tags: parseTags(opts.tags),
        definition: opts.url ? { iframeUrl: opts.url } : undefined,
        isPublic: opts.public,
        pricePoints: opts.pricePoints == null ? undefined : Number(opts.pricePoints),
        showCreatorProfile: opts.showCreatorProfile,
      }));
    });

  space.command("update").argument("<id>", "Space ID")
    .option("--name <name>")
    .option("--description <desc>")
    .option("--category <category>")
    .option("--tags <tags>")
    .option("--url <iframe-url>")
    .option("--external-cover-image-url <url>")
    .option("--price-points <n>")
    .option("--show-creator-profile <boolean>")
    .action(async (id: string, opts) => {
      if (opts.showCreatorProfile && !["true", "false"].includes(opts.showCreatorProfile)) {
        throw new Error("--show-creator-profile must be true or false");
      }
      printResult(await api().put(`/api/v1/spaces/${e(id)}`, {
        name: opts.name,
        description: opts.description,
        category: opts.category,
        tags: parseTags(opts.tags),
        definition: opts.url ? { iframeUrl: opts.url } : undefined,
        externalCoverImageUrl: opts.externalCoverImageUrl,
        pricePoints: opts.pricePoints == null ? undefined : Number(opts.pricePoints),
        showCreatorProfile: opts.showCreatorProfile == null
          ? undefined
          : opts.showCreatorProfile === "true",
      }));
    });
  space.command("show").argument("<id>", "Space ID").action(async (id: string) => {
    printResult(await api().get(`/api/v1/spaces/${e(id)}`));
  });
  space.command("delete").argument("<id>", "Space ID").action(async (id: string) => {
    await api().delete(`/api/v1/spaces/${e(id)}`);
    printSuccess(`Space ${id} deleted.`);
  });
  space.command("publish").argument("<id>", "Space ID").action(async (id: string) => {
    printResult(await api().put(`/api/v1/spaces/${e(id)}`, { isPublic: true }));
  });
  space.command("unpublish").argument("<id>", "Space ID").action(async (id: string) => {
    printResult(await api().put(`/api/v1/spaces/${e(id)}`, { isPublic: false }));
  });
  space.command("cover").argument("<id>", "Space ID")
    .requiredOption("--file <path>")
    .action(async (id: string, opts: { file: string }) => {
      const form = new FormData();
      await appendFileToForm(form, "file", opts.file);
      printResult(await api().upload(`/api/v1/spaces/${e(id)}/cover`, form));
    });
  space.command("report").argument("<id>", "Space ID")
    .requiredOption("--reason <reason>")
    .option("--detail <detail>")
    .action(async (id: string, opts: { reason: string; detail?: string }) => {
      printResult(await api().post(`/api/v1/spaces/${e(id)}/reports`, {
        reason: opts.reason, detail: opts.detail,
      }));
    });

  const storage = space.command("storage")
    .description("Per-user Space runtime storage (requires a Space OAuth token)");
  addPaginationOptions(storage.command("list").argument("<space-id>"), {
    mode: "offset",
  }).action(async (spaceId: string, options) => {
    printResult(await api().get(
      `/api/v1/spaces/${e(spaceId)}/storage${paginationQuery(options)}`,
    ));
  });
  storage.command("get")
    .argument("<space-id>")
    .argument("<key>")
    .action(async (spaceId: string, key: string) => {
      printResult(await api().get(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`));
    });
  storage.command("set")
    .argument("<space-id>")
    .argument("<key>")
    .requiredOption("--value <json>", "JSON value")
    .action(async (spaceId: string, key: string, opts: { value: string }) => {
      printResult(await api().put(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`, {
        value: parseJsonOption(opts.value, "--value"),
      }));
    });
  storage.command("delete")
    .argument("<space-id>")
    .argument("<key>")
    .action(async (spaceId: string, key: string) => {
      printResult(await api().delete(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`));
    });

  const version = space.command("version").description("Managed Space bundle versions");
  addPaginationOptions(version.command("list").argument("<space-id>"), {
    mode: "cursor",
  }).action(async (spaceId: string, options) => {
    printResult(await api().get(
      `/api/v1/spaces/${e(spaceId)}/versions${paginationQuery(options)}`,
    ));
  });
  version.command("create")
    .argument("<space-id>")
    .requiredOption("--file <bundle.zip>")
    .action(async (spaceId: string, opts: { file: string }) => {
      const form = new FormData();
      form.append("bundle", await createFileBlob(opts.file, { type: "application/zip" }));
      printResult(await api().upload(`/api/v1/spaces/${e(spaceId)}/versions`, form));
    });
  version.command("delete")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await api().delete(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}`));
    });
  for (const name of ["publish", "rollback"] as const) {
    version.command(name)
      .argument("<space-id>")
      .argument("<version-id>")
      .action(async (spaceId: string, versionId: string) => {
        printResult(await api().post(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/${name}`));
      });
  }
}
