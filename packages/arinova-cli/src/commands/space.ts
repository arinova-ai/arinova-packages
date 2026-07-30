import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  buildQuery,
  del,
  encodePathSegment,
  get,
  post,
  put,
  upload,
  uploadMultipart,
} from "../client.js";
import { printResult, printSuccess, table } from "../output.js";

const e = encodePathSegment;

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

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

  space.command("list")
    .description("List discoverable spaces")
    .option("--search <query>")
    .option("--category <category>")
    .option("--page <n>")
    .option("--limit <n>")
    .action(async (opts) => {
      printSpaces(await get(`/api/v1/spaces${buildQuery(opts)}`));
    });
  space.command("owned").description("List spaces you own").action(async () => {
    printSpaces(await get("/api/v1/spaces/owned"));
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
      printResult(await post("/api/v1/spaces", {
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
      printResult(await put(`/api/v1/spaces/${e(id)}`, {
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
    printResult(await get(`/api/v1/spaces/${e(id)}`));
  });
  space.command("delete").argument("<id>", "Space ID").action(async (id: string) => {
    await del(`/api/v1/spaces/${e(id)}`);
    printSuccess(`Space ${id} deleted.`);
  });
  space.command("publish").argument("<id>", "Space ID").action(async (id: string) => {
    printResult(await put(`/api/v1/spaces/${e(id)}`, { isPublic: true }));
  });
  space.command("unpublish").argument("<id>", "Space ID").action(async (id: string) => {
    printResult(await put(`/api/v1/spaces/${e(id)}`, { isPublic: false }));
  });
  space.command("cover").argument("<id>", "Space ID")
    .requiredOption("--file <path>")
    .action(async (id: string, opts: { file: string }) => {
      printResult(await upload(`/api/v1/spaces/${e(id)}/cover`, opts.file));
    });
  space.command("report").argument("<id>", "Space ID")
    .requiredOption("--reason <reason>")
    .option("--detail <detail>")
    .action(async (id: string, opts: { reason: string; detail?: string }) => {
      printResult(await post(`/api/v1/spaces/${e(id)}/reports`, opts));
    });

  const storage = space.command("storage")
    .description("Per-user Space runtime storage (requires a Space OAuth token)");
  storage.command("list").argument("<space-id>").action(async (spaceId: string) => {
    printResult(await get(`/api/v1/spaces/${e(spaceId)}/storage`));
  });
  storage.command("get")
    .argument("<space-id>")
    .argument("<key>")
    .action(async (spaceId: string, key: string) => {
      printResult(await get(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`));
    });
  storage.command("set")
    .argument("<space-id>")
    .argument("<key>")
    .requiredOption("--value <json>", "JSON value")
    .action(async (spaceId: string, key: string, opts: { value: string }) => {
      printResult(await put(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`, {
        value: parseJson(opts.value, "--value"),
      }));
    });
  storage.command("delete")
    .argument("<space-id>")
    .argument("<key>")
    .action(async (spaceId: string, key: string) => {
      printResult(await del(`/api/v1/spaces/${e(spaceId)}/storage/${e(key)}`));
    });

  const version = space.command("version").description("Managed Space bundle versions");
  version.command("list").argument("<space-id>").action(async (spaceId: string) => {
    printResult(await get(`/api/v1/spaces/${e(spaceId)}/versions`));
  });
  version.command("create")
    .argument("<space-id>")
    .requiredOption("--file <bundle.zip>")
    .action(async (spaceId: string, opts: { file: string }) => {
      const data = readFileSync(opts.file);
      printResult(await uploadMultipart(
        `/api/v1/spaces/${e(spaceId)}/versions`,
        { bundle: new Blob([data]) },
      ));
    });
  version.command("delete")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await del(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}`));
    });
  for (const name of ["publish", "rollback"] as const) {
    version.command(name)
      .argument("<space-id>")
      .argument("<version-id>")
      .action(async (spaceId: string, versionId: string) => {
        printResult(await post(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/${name}`));
      });
  }
}
