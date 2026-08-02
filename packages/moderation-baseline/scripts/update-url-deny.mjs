#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import {
  ALLOWLIST_FLOOR,
  ENTRIES_PER_SOURCE,
  SOURCES,
  atomicWrite,
  download,
  entriesEqual,
  parseAllowlist,
  render,
  selectEntries,
} from "./url-deny-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "dict", "url_deny.toml");
const ALLOW = join(ROOT, "dict", "url_allow.toml");
const PACKAGE_JSON = join(ROOT, "package.json");

export async function main() {
  const [allowBody, packageBody] = await Promise.all([
    readFile(ALLOW, "utf8"),
    readFile(PACKAGE_JSON, "utf8"),
  ]);
  const allowlisted = parseAllowlist(allowBody, ALLOWLIST_FLOOR);
  const packageVersion = JSON.parse(packageBody).version;
  // A missing or unparseable snapshot must not block the updater — it just
  // means there is nothing to preserve and nothing to no-op compare against,
  // so regenerate from scratch.
  let existing;
  try {
    existing = parseToml(await readFile(OUTPUT, "utf8"));
  } catch (error) {
    console.warn(`existing ${OUTPUT} is missing or unparseable (${error.message}); regenerating from scratch`);
    existing = undefined;
  }
  const existingEntries = Array.isArray(existing?.entries) ? existing.entries : [];
  const existingDomains = existingEntries
    .map((entry) => (typeof entry?.domain === "string" ? entry.domain.toLowerCase() : ""))
    .filter(Boolean);
  const feeds = await Promise.all(SOURCES.map(async (source) => ({ ...source, body: await download(source.url) })));
  const selected = selectEntries(feeds, allowlisted, ENTRIES_PER_SOURCE, existingDomains);
  const entriesChanged = existing === undefined || !entriesEqual(existingEntries, selected);
  const versionChanged = existing?.meta?.version !== packageVersion;
  if (!entriesChanged && !versionChanged) {
    console.log(`unchanged ${OUTPUT} (${selected.length} deny entries)`);
    return false;
  }
  const date = entriesChanged ? undefined : existing?.meta?.last_updated;
  await atomicWrite(OUTPUT, render(selected, { version: packageVersion, date }));
  console.log(`updated ${OUTPUT} with ${selected.length} deny entries`);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
