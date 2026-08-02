const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function stripArinovaChatTargetPrefix(raw: string): string {
  return raw.trim().replace(/^(?:openclaw-arinova-ai|arinova):/i, "").trim();
}

export function normalizeArinovaChatMessagingTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const normalized = stripArinovaChatTargetPrefix(trimmed);

  if (!normalized) return undefined;

  return `openclaw-arinova-ai:${normalized}`.toLowerCase();
}

export function looksLikeArinovaChatTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (/^(openclaw-arinova-ai|arinova):/i.test(trimmed)) {
    return true;
  }

  return UUID_RE.test(trimmed);
}
