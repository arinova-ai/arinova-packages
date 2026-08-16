const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TRUSTED_ARINOVA_API_HOSTNAMES = new Set([
  "api.chat.arinova.ai",
  "api.chat-staging.arinova.ai",
]);

/** Validate and normalize an API base URL before any credentials are attached. */
export function normalizeApiEndpoint(value: string, label = "Endpoint"): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }

  if (url.username || url.password) {
    throw new TypeError(`${label} must not contain credentials`);
  }
  if (url.search || url.hash) {
    throw new TypeError(`${label} must not contain a query string or fragment`);
  }

  const isHttps = url.protocol === "https:";
  const isLoopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  if (!isHttps && !isLoopbackHttp) {
    throw new TypeError(
      `${label} must use HTTPS (HTTP is allowed only for localhost, 127.0.0.1, or ::1)`,
    );
  }

  return url.toString().replace(/\/+$/, "");
}

/** Stricter policy for flows that create or exchange long-lived bot credentials. */
export function normalizeTrustedArinovaApiEndpoint(
  value: string,
  label = "Arinova API endpoint",
): string {
  const normalized = normalizeApiEndpoint(value, label);
  const url = new URL(normalized);
  if (
    url.protocol !== "https:"
    || !TRUSTED_ARINOVA_API_HOSTNAMES.has(url.hostname)
    || url.port
    || url.pathname !== "/"
  ) {
    throw new TypeError(`${label} must use an official HTTPS Arinova API host`);
  }
  return url.origin;
}
