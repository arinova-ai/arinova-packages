export function parseJsonOption(value: string | undefined, label = "JSON option"): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

export function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = parseJsonOption(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function parseJsonArray(value: string, label: string): unknown[] {
  const parsed = parseJsonOption(value, label);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed;
}
