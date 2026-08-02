export function encodePathSegment(value: string, label: string): string {
  if (!value || value === "." || value === "..") {
    throw new TypeError(`${label} must be a non-empty URL path segment`);
  }
  return encodeURIComponent(value).replace(/\./g, "%2E");
}
