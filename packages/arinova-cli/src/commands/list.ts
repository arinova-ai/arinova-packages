import { Command } from "commander";
import { get, UnsupportedCommandError } from "../client.js";
import { printResult, printError, table } from "../output.js";

const VALID_TYPES = ["theme", "expert", "sticker", "lounge", "community", "space"] as const;
type ListType = (typeof VALID_TYPES)[number];

interface TypeConfig {
  endpoint?: string;
  unsupported?: string;
  extractKey: string;
  columns: { key: string; label: string }[];
}

const TYPE_MAP: Record<ListType, TypeConfig> = {
  expert: {
    unsupported: "Expert listing has no current public v1 contract.",
    extractKey: "listings",
    columns: [
      { key: "id", label: "ID" },
      { key: "agent_name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "category", label: "Category" },
    ],
  },
  theme: {
    endpoint: "/api/v1/creator/themes",
    extractKey: "themes",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "price", label: "Price" },
      { key: "status", label: "Status" },
    ],
  },
  sticker: {
    endpoint: "/api/v1/creator/stickers",
    extractKey: "packs",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "sticker_count", label: "Stickers" },
    ],
  },
  space: {
    endpoint: "/api/v1/creator/spaces",
    extractKey: "spaces",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ],
  },
  community: {
    endpoint: "/api/v1/communities",
    extractKey: "communities",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "member_count", label: "Members" },
    ],
  },
  lounge: {
    unsupported: "Lounge listing has no current public v1 contract.",
    extractKey: "communities",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "member_count", label: "Members" },
    ],
  },
};

export function registerList(program: Command): void {
  program
    .command("list")
    .description("List your creations by type")
    .requiredOption("--type <type>", `Type: ${VALID_TYPES.join(", ")}`)
    .action(async (opts: { type: string }) => {
      const t = opts.type.toLowerCase() as ListType;
      if (!VALID_TYPES.includes(t)) {
        printError(new Error(`Invalid type "${opts.type}". Must be one of: ${VALID_TYPES.join(", ")}`));
        return;
      }

      const config = TYPE_MAP[t];
      try {
        if (config.unsupported) {
          throw new UnsupportedCommandError(config.unsupported);
        }
        if (!config.endpoint) {
          throw new UnsupportedCommandError(`No endpoint configured for ${t}.`);
        }
        const data = await get(config.endpoint);
        const items =
          (data as Record<string, unknown>)[config.extractKey] ??
          (data as Record<string, unknown>).agents ??
          data;
        if (Array.isArray(items)) {
          table(items as Record<string, unknown>[], config.columns);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });
}
