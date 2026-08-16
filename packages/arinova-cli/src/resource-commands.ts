import type { Command } from "commander";
import { encodePathSegment, resolveClient, type ApiClient } from "./client.js";
import { printResult } from "./output.js";
import {
  addPaginationOptions,
  paginationValues,
  type PaginationOptionConfig,
} from "./pagination.js";

type Options = Record<string, any>;

export type ResourceIdentifier =
  | { kind: "argument"; syntax?: string }
  | { kind: "option"; flags: string; key: string; description?: string };

interface CommandSpec {
  description?: string;
  configure?(command: Command): void;
}

interface ListSpec extends CommandSpec {
  pagination?: false | PaginationOptionConfig;
  query?(options: Options): Record<string, unknown>;
}

interface CreateSpec extends CommandSpec {
  body(options: Options): unknown;
}

interface IdentifiedSpec extends CommandSpec {
  name?: string;
  identifier?: ResourceIdentifier;
  path?(id: string, options: Options): string;
}

interface UpdateSpec extends IdentifiedSpec {
  body(options: Options): unknown;
  method?: "patch" | "put";
  validate?(options: Options): void;
}

interface DeleteSpec extends IdentifiedSpec {
  query?(options: Options): Record<string, unknown>;
}

export interface ResourceActionSpec extends IdentifiedSpec {
  name: string;
  body?(options: Options): unknown;
  method?: "post" | "patch";
}

export interface ResourceCommandOptions {
  name: string;
  description: string;
  basePath: string;
  identifier?: ResourceIdentifier;
  list?: ListSpec;
  create?: CreateSpec;
  show?: IdentifiedSpec;
  update?: UpdateSpec;
  delete?: DeleteSpec;
  actions?: ResourceActionSpec[];
}

function queryString(values: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
}

function configureIdentifier(
  command: Command,
  identifier: ResourceIdentifier,
): void {
  if (identifier.kind === "argument") {
    command.argument(identifier.syntax ?? "<id>");
  } else {
    command.requiredOption(
      identifier.flags,
      identifier.description ?? "Resource ID",
    );
  }
}

function identifiedAction(
  command: Command,
  identifier: ResourceIdentifier,
  action: (id: string, options: Options) => Promise<void>,
): void {
  configureIdentifier(command, identifier);
  if (identifier.kind === "argument") {
    command.action(async (id: string, options: Options) => action(id, options));
  } else {
    command.action(async (options: Options) => action(options[identifier.key], options));
  }
}

async function mutate(
  client: ApiClient,
  method: "post" | "patch" | "put",
  path: string,
  body?: unknown,
): Promise<unknown> {
  return body === undefined
    ? client[method](path)
    : client[method](path, body);
}

export function registerResourceCommands(
  parent: Command,
  options: ResourceCommandOptions,
): Command {
  const resource = parent.command(options.name).description(options.description);
  const defaultIdentifier = options.identifier ?? { kind: "argument", syntax: "<id>" };

  if (options.list) {
    const command = resource.command("list");
    if (options.list.description) command.description(options.list.description);
    options.list.configure?.(command);
    if (options.list.pagination !== false) {
      addPaginationOptions(command, {
        mode: "offset",
        ...options.list.pagination,
      });
    }
    command.action(async (commandOptions: Options) => {
      const pagination = options.list?.pagination === false
        ? {}
        : paginationValues(commandOptions);
      const query = { ...options.list?.query?.(commandOptions), ...pagination };
      printResult(await resolveClient(resource).get(
        `${options.basePath}${queryString(query)}`,
      ));
    });
  }

  if (options.create) {
    const command = resource.command("create");
    if (options.create.description) command.description(options.create.description);
    options.create.configure?.(command);
    command.action(async (commandOptions: Options) => {
      printResult(await resolveClient(resource).post(
        options.basePath,
        options.create?.body(commandOptions),
      ));
    });
  }

  if (options.show) {
    const spec = options.show;
    const command = resource.command(spec.name ?? "show");
    if (spec.description) command.description(spec.description);
    spec.configure?.(command);
    const identifier = spec.identifier ?? defaultIdentifier;
    identifiedAction(command, identifier, async (id, commandOptions) => {
      const path = spec.path?.(id, commandOptions)
        ?? `${options.basePath}/${encodePathSegment(id)}`;
      printResult(await resolveClient(resource).get(path));
    });
  }

  if (options.update) {
    const spec = options.update;
    const command = resource.command(spec.name ?? "update");
    if (spec.description) command.description(spec.description);
    spec.configure?.(command);
    const identifier = spec.identifier ?? defaultIdentifier;
    identifiedAction(command, identifier, async (id, commandOptions) => {
      spec.validate?.(commandOptions);
      const path = spec.path?.(id, commandOptions)
        ?? `${options.basePath}/${encodePathSegment(id)}`;
      printResult(await mutate(
        resolveClient(resource),
        spec.method ?? "patch",
        path,
        spec.body(commandOptions),
      ));
    });
  }

  if (options.delete) {
    const spec = options.delete;
    const command = resource.command(spec.name ?? "delete");
    if (spec.description) command.description(spec.description);
    spec.configure?.(command);
    const identifier = spec.identifier ?? defaultIdentifier;
    identifiedAction(command, identifier, async (id, commandOptions) => {
      const path = spec.path?.(id, commandOptions)
        ?? `${options.basePath}/${encodePathSegment(id)}`;
      const query = queryString(spec.query?.(commandOptions) ?? {});
      printResult(await resolveClient(resource).delete(`${path}${query}`));
    });
  }

  for (const spec of options.actions ?? []) {
    const command = resource.command(spec.name);
    if (spec.description) command.description(spec.description);
    spec.configure?.(command);
    const identifier = spec.identifier ?? defaultIdentifier;
    identifiedAction(command, identifier, async (id, commandOptions) => {
      const path = spec.path?.(id, commandOptions)
        ?? `${options.basePath}/${encodePathSegment(id)}/${spec.name}`;
      printResult(await mutate(
        resolveClient(resource),
        spec.method ?? "post",
        path,
        spec.body?.(commandOptions),
      ));
    });
  }

  return resource;
}
