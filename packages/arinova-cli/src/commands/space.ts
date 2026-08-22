import type { Command } from "commander";
import {
  buildQuery,
  encodePathSegment,
  resolveClient,
  UnsupportedCommandError,
} from "../client.js";
import { appendFileToForm, createFileBlob } from "../file-upload.js";
import { getEndpoint } from "../config.js";
import { printNote, printResult, printSuccess, table } from "../output.js";
import { parseJsonOption } from "../json-options.js";
import { addPaginationOptions, paginationQuery, paginationValues, parseCount } from "../pagination.js";
import { buildSpaceProject } from "./space-build.js";
import { scaffoldSpaceProject } from "./space-scaffold.js";

const e = encodePathSegment;

function parseTags(value?: string): string[] | undefined {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean);
}

const FRIENDLY_SPACE_ERRORS: Record<string, string> = {
  INVALID_SPACE_BUNDLE: "The ZIP is not a valid managed Space bundle. Run `arinova space build` locally and fix the reported bundle rule before uploading again.",
  SPACE_OAUTH_APP_REQUIRED: "This Space has no matching OAuth app. Create one with `arinova app create`, then set space.json 'id' to its Client ID.",
  SPACE_OAUTH_APP_MISMATCH: "space.json 'id' must exactly match the OAuth Client ID bound to this Space.",
  SPACE_VERSION_EXISTS: "That version already exists. Bump `version` in space.json, rebuild, and upload the new ZIP.",
  SPACE_VERSION_NOT_PUBLISHABLE: "This version cannot be published in its current state. Inspect `space version scan`, request `space version rescan`, or upload a fixed version.",
  SPACE_ACTIVE_VERSION_DELETE_DENIED: "The active version cannot be deleted. Publish or roll back to another version first.",
  SPACE_PUBLISH_REQUIRES_VERSION: "Publish a managed bundle with `arinova space version publish <space-id> <version-id>`.",
};

class FriendlySpaceError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(error: unknown, message: string, code?: string) {
    super(message);
    this.name = "FriendlySpaceError";
    this.code = code;
    if (error && typeof error === "object") {
      const apiError = error as { status?: number; details?: unknown };
      this.status = apiError.status;
      this.details = apiError.details;
    }
    this.cause = error;
  }
}

export function friendlySpaceError(error: unknown): Error {
  const value = error && typeof error === "object"
    ? error as { code?: unknown; details?: unknown }
    : undefined;
  const code = typeof value?.code === "string" ? value.code : undefined;
  const friendly = code ? FRIENDLY_SPACE_ERRORS[code] : undefined;
  if (!friendly) return error instanceof Error ? error : new Error(String(error));
  const reason = code === "INVALID_SPACE_BUNDLE" && value?.details && typeof value.details === "object"
    ? (value.details as { reason?: unknown }).reason
    : undefined;
  const suffix = typeof reason === "string" ? ` Server reason: ${reason}.` : "";
  return new FriendlySpaceError(error, `${friendly}${suffix}`, code);
}

async function withFriendlySpaceErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw friendlySpaceError(error);
  }
}

function numberOption(value: unknown, option: string): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${option} must be an integer`);
  return parsed;
}

function booleanOption(value: unknown, option: string): boolean | undefined {
  if (value == null) return undefined;
  if (value !== "true" && value !== "false") {
    throw new Error(`${option} must be true or false`);
  }
  return value === "true";
}

function printSpaces(data: unknown): void {
  const record = data as Record<string, unknown> | null;
  const spaces = record?.spaces ?? record?.items ?? data;
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

  space.command("init")
    .description("Scaffold a managed Space bundle project")
    .argument("<name>", "Project directory and display name")
    .option("--api-origin <origin>", "API origin to allow in the generated CSP manifest")
    .action((name: string, opts: { apiOrigin?: string }) => {
      const endpoint = opts.apiOrigin ?? getEndpoint();
      const directory = scaffoldSpaceProject(name, endpoint);
      printSuccess(`Space scaffolded in ${directory}`);
      printNote("Replace space.json 'id' with the Client ID returned by `arinova app create`.");
      printNote("Then run `arinova space build` inside the project directory.");
    });

  space.command("build")
    .description("Validate and package the current managed Space project")
    .option("--output <zip>", "Output ZIP path (default: dist/<id>-<version>.zip)")
    .action((opts: { output?: string }) => {
      const result = buildSpaceProject(process.cwd(), opts.output);
      printSuccess(`Built ${result.outputPath} (${(result.archiveBytes / 1024).toFixed(1)} KiB, ${result.fileCount} files)`);
      if (result.skipped.length > 0) {
        printNote(`Skipped development-only paths: ${result.skipped.join(", ")}`);
      }
      printNote(`Upload with: arinova space version create <space-id> --bundle ${result.outputPath}`);
    });

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
    .option("--price-points <n>")
    .option("--show-creator-profile")
    .action(async (opts) => {
      printResult(await api().post("/api/v1/spaces", {
        name: opts.name,
        description: opts.description ?? "",
        category: opts.category,
        tags: parseTags(opts.tags),
        pricePoints: numberOption(opts.pricePoints, "--price-points"),
        showCreatorProfile: opts.showCreatorProfile,
      }));
    });

  space.command("update").argument("<id>", "Space ID")
    .option("--name <name>")
    .option("--description <desc>")
    .option("--category <category>")
    .option("--tags <tags>")
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
        externalCoverImageUrl: opts.externalCoverImageUrl,
        pricePoints: numberOption(opts.pricePoints, "--price-points"),
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
    throw new UnsupportedCommandError(
      `Direct Space publishing is not supported. Use \`arinova space version publish ${id} <version-id>\`.`,
    );
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
  version.command("list").argument("<space-id>").action(async (spaceId: string) => {
    printResult(await api().get(`/api/v1/spaces/${e(spaceId)}/versions`));
  });
  version.command("create")
    .argument("<space-id>")
    .option("--bundle <bundle.zip>", "Managed Space ZIP created by `space build`")
    .option("--file <bundle.zip>", "Deprecated alias for --bundle")
    .action(async (spaceId: string, opts: { bundle?: string; file?: string }) => {
      const bundlePath = opts.bundle ?? opts.file;
      if (!bundlePath) throw new Error("Pass the bundle ZIP with --bundle <bundle.zip>.");
      const form = new FormData();
      form.append("bundle", await createFileBlob(bundlePath, { type: "application/zip" }));
      printResult(await withFriendlySpaceErrors(() =>
        api().upload(`/api/v1/spaces/${e(spaceId)}/versions`, form)
      ));
    });
  version.command("delete")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await withFriendlySpaceErrors(() =>
        api().delete(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}`)
      ));
    });
  version.command("preview")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await withFriendlySpaceErrors(() =>
        api().post(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/preview`)
      ));
    });
  version.command("scan")
    .description("Show safety scan status and findings")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await withFriendlySpaceErrors(() =>
        api().get(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/scan`)
      ));
    });
  version.command("rescan")
    .description("Run safety scanning again; passing rejected versions return to draft")
    .argument("<space-id>")
    .argument("<version-id>")
    .action(async (spaceId: string, versionId: string) => {
      printResult(await withFriendlySpaceErrors(() =>
        api().post(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/scan`)
      ));
    });
  for (const name of ["publish", "rollback"] as const) {
    version.command(name)
      .argument("<space-id>")
      .argument("<version-id>")
      .action(async (spaceId: string, versionId: string) => {
        printResult(await withFriendlySpaceErrors(() =>
          api().post(`/api/v1/spaces/${e(spaceId)}/versions/${e(versionId)}/${name}`)
        ));
      });
  }

  const products = space.command("products")
    .alias("product")
    .description("Manage Space commerce products (maximum 100 per Space)");
  products.command("list").argument("<space-id>").action(async (spaceId: string) => {
    printResult(await api().get(`/api/v1/creator/spaces/${e(spaceId)}/products`));
  });
  products.command("create")
    .argument("<space-id>")
    .requiredOption("--key <product-key>")
    .requiredOption("--name <name>")
    .requiredOption("--price-points <points>")
    .requiredOption("--kind <kind>", "consumable, durable, or subscription")
    .option("--description <description>")
    .option("--inactive", "Create the product inactive")
    .action(async (spaceId: string, opts) => {
      printResult(await api().post(`/api/v1/creator/spaces/${e(spaceId)}/products`, {
        productKey: opts.key,
        name: opts.name,
        description: opts.description ?? "",
        pricePoints: numberOption(opts.pricePoints, "--price-points"),
        kind: opts.kind,
        active: !opts.inactive,
      }));
    });
  products.command("update")
    .argument("<space-id>")
    .argument("<product-key>")
    .option("--name <name>")
    .option("--description <description>")
    .option("--price-points <points>")
    .option("--active <boolean>")
    .action(async (spaceId: string, productKey: string, opts) => {
      printResult(await api().put(`/api/v1/creator/spaces/${e(spaceId)}/products/${e(productKey)}`, {
        name: opts.name,
        description: opts.description,
        pricePoints: numberOption(opts.pricePoints, "--price-points"),
        active: booleanOption(opts.active, "--active"),
      }));
    });
  products.command("deactivate")
    .alias("delete")
    .description("Stop new purchases; existing subscriptions continue renewing")
    .argument("<space-id>")
    .argument("<product-key>")
    .action(async (spaceId: string, productKey: string) => {
      await api().delete(`/api/v1/creator/spaces/${e(spaceId)}/products/${e(productKey)}`);
      printSuccess(`Product ${productKey} deactivated. Existing subscriptions continue renewing.`);
    });
  products.command("wind-down")
    .description("Deactivate a subscription product and cancel renewals at period end")
    .argument("<space-id>")
    .argument("<product-key>")
    .action(async (spaceId: string, productKey: string) => {
      printResult(await api().post(
        `/api/v1/creator/spaces/${e(spaceId)}/products/${e(productKey)}/wind-down`,
      ));
    });
}
