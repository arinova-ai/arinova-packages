const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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
