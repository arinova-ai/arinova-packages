let jsonMode = false;

const ANSI_SEQUENCE =
  // CSI, OSC (BEL or ST terminated), and two-byte escape sequences.
  /\u001B(?:\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[@-_])/g;
const UNSAFE_TERMINAL_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitizeTerminalText(value: string): string {
  return value.replace(ANSI_SEQUENCE, "").replace(UNSAFE_TERMINAL_CONTROL, "");
}

function terminalText(value: unknown): string {
  return sanitizeTerminalText(String(value));
}

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export class ReportedCliError extends Error {
  readonly reported = true;

  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error));
    this.name = "ReportedCliError";
    this.cause = error;
  }
}

export function printResult(data: unknown): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((item) => item && typeof item === "object" && !Array.isArray(item))
  ) {
    const keys = [...new Set(data.flatMap((item) =>
      Object.entries(item as Record<string, unknown>)
        .filter(([, value]) =>
          value == null || ["string", "number", "boolean"].includes(typeof value)
        )
        .map(([key]) => key)
    ))].slice(0, 8);
    if (keys.length > 0) {
      table(
        data as Record<string, unknown>[],
        keys.map((key) => ({ key, label: key })),
      );
    } else {
      prettyPrint(data);
    }
  } else {
    prettyPrint(data);
  }
}

export function printError(err: unknown): void {
  if (jsonMode) {
    const value = err as {
      status?: number;
      code?: string;
      message?: string;
      details?: unknown;
    };
    const obj = {
      error: {
        status: value?.status,
        code: value?.code,
        message: value?.message ?? String(err),
        details: value?.details,
      },
    };
    console.error(JSON.stringify(obj, null, 2));
  } else {
    if (err instanceof Error) {
      console.error(`Error: ${terminalText(err.message)}`);
    } else {
      console.error(`Error: ${terminalText(err)}`);
    }
  }
  throw new ReportedCliError(err);
}

export function printWarning(message: string): void {
  console.error(`Warning: ${terminalText(message)}`);
}

export function printSuccess(msg: string): void {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, message: msg }));
  } else {
    console.log(terminalText(msg));
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
        console.log(`${pad}${terminalText(key)}:`);
        prettyPrint(value, indent + 1);
      } else if (Array.isArray(value)) {
        console.log(`${pad}${terminalText(key)}: ${terminalText(value.join(", "))}`);
      } else {
        console.log(`${pad}${terminalText(key)}: ${terminalText(value)}`);
      }
    }
    return;
  }
  console.log(`${pad}${terminalText(data)}`);
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
      terminalText(c.label).length,
      ...rows.map((r) => terminalText(r[c.key] ?? "").length),
    ),
  );

  const header = columns.map((c, i) => terminalText(c.label).padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    const line = columns
      .map((c, i) => terminalText(row[c.key] ?? "").padEnd(widths[i]))
      .join("  ");
    console.log(line);
  }
}
