const TRUSTED_API_HOSTS = new Set([
  "api.chat.arinova.ai",
  "api.chat-staging.arinova.ai",
]);

export function normalizeTrustedApiUrl(value: string, label = "Arinova API URL"): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:") {
    throw new TypeError(`${label} must use HTTPS`);
  }
  if (!TRUSTED_API_HOSTS.has(url.hostname) || url.port) {
    throw new TypeError(`${label} must use an official Arinova API host`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(`${label} must not contain credentials, a query, or a fragment`);
  }
  if (url.pathname !== "/") {
    throw new TypeError(`${label} must not contain a path`);
  }
  return url.origin;
}

export function assertTrustedApiRequestUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Arinova request URL must be absolute");
  }
  normalizeTrustedApiUrl(url.origin);
  if (url.username || url.password || url.hash) {
    throw new TypeError("Arinova request URL must not contain credentials or a fragment");
  }
  return url;
}
