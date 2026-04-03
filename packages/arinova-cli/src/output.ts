let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function printResult(data: unknown): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    prettyPrint(data);
  }
}

export function printError(err: unknown): void {
  if (jsonMode) {
    const obj =
      err instanceof Error
        ? { error: err.message }
        : { error: String(err) };
    console.error(JSON.stringify(obj, null, 2));
  } else {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(`Error: ${String(err)}`);
    }
  }
  process.exit(1);
}

export function printSuccess(msg: string): void {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, message: msg }));
  } else {
    console.log(msg);
  }
}

function prettyPrint(data: unknown, indent = 0): void {
  const pad = "  ".repeat(indent);
  if (data === null || data === undefined) {
    console.log(`${pad}(none)`);
    return;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log(`${pad}(empty list)`);
      return;
    }
    for (const item of data) {
      prettyPrint(item, indent);
      if (indent === 0) console.log("---");
    }
    return;
  }
  if (typeof data === "object") {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "object" && !Array.isArray(value)) {
        console.log(`${pad}${key}:`);
        prettyPrint(value, indent + 1);
      } else if (Array.isArray(value)) {
        console.log(`${pad}${key}: ${value.join(", ")}`);
      } else {
        console.log(`${pad}${key}: ${String(value)}`);
      }
    }
    return;
  }
  console.log(`${pad}${String(data)}`);
}

export function table(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
): void {
  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }

  const widths = columns.map((c) =>
    Math.max(
      c.label.length,
      ...rows.map((r) => String(r[c.key] ?? "").length),
    ),
  );

  const header = columns.map((c, i) => c.label.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    const line = columns
      .map((c, i) => String(row[c.key] ?? "").padEnd(widths[i]))
      .join("  ");
    console.log(line);
  }
}
