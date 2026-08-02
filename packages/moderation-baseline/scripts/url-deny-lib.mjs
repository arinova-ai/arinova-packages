import { createHash } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { parse as parseToml } from "smol-toml";

export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
export const ENTRIES_PER_SOURCE = 512;
export const ALLOWLIST_FLOOR = 6;
export const SOURCES = [
  {
    category: "ransomware-host",
    url: "https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/ransomware-nl.txt",
  },
  {
    category: "scam-host",
    url: "https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/scam-nl.txt",
  },
];

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "ac.uk", "co.jp", "co.kr", "co.nz", "co.uk", "com.au", "com.br", "com.cn", "com.hk", "com.sg", "gov.uk", "net.au", "org.uk",
]);

export function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validDomain(value) {
  if (typeof value !== "string" || value.length > 253 || !value.includes(".") || value.includes("..")) return false;
  if (isIP(value)) return false;
  const labels = value.split(".");
  if (labels.every((label) => /^\d+$/.test(label))) return false;
  if (!labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return false;
  }
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) return labels.length >= 3;
  return labels.length >= 2;
}

export function domainsFromFeed(body) {
  return [...new Set(body
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#") && validDomain(line)))];
}

export function parseAllowlist(body, floor = ALLOWLIST_FLOOR) {
  const parsed = parseToml(body);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const domains = entries.map((entry, index) => {
    const domain = typeof entry?.domain === "string" ? entry.domain.toLowerCase() : "";
    if (!validDomain(domain)) {
      // A typo'd protected domain must fail loudly — silently dropping it
      // would strip its allowlist protection without anyone noticing.
      throw new Error(
        `allowlist entry #${index} has invalid domain ${JSON.stringify(entry?.domain ?? null)}`,
      );
    }
    return domain;
  });
  if (domains.length < floor) throw new Error(`allowlist yielded ${domains.length} valid domains; expected at least ${floor}`);
  return [...new Set(domains)].sort(codepointCompare);
}

export function isAllowlisted(domain, allowlisted) {
  return allowlisted.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export function stableSample(domains, count) {
  return [...domains]
    .map((domain) => ({ domain, hash: createHash("sha256").update(domain).digest("hex") }))
    .sort((left, right) => codepointCompare(left.hash, right.hash) || codepointCompare(left.domain, right.domain))
    .map(({ domain }) => domain)
    .slice(0, count);
}

export function selectEntries(feeds, allowlisted, perSource = ENTRIES_PER_SOURCE, existingDomains = []) {
  const selected = [];
  const seen = new Set();
  const preserve = new Set(existingDomains);
  for (const [sourceRef, source] of feeds.entries()) {
    const candidates = domainsFromFeed(source.body)
      .filter((domain) => !seen.has(domain) && !isAllowlisted(domain, allowlisted));
    // Preservation-first: domains already shipped in the current dict that
    // are still present in this feed keep their slot; only the remaining
    // budget is filled via hash sampling. Without this, a change to the
    // sampling scheme silently rotates out most of the shipped coverage.
    const preserved = candidates.filter((domain) => preserve.has(domain));
    const kept = preserved.length > perSource ? stableSample(preserved, perSource) : preserved;
    const keptSet = new Set(kept);
    const sample = stableSample(
      candidates.filter((domain) => !keptSet.has(domain)),
      perSource - kept.length,
    );
    const chosen = [...kept, ...sample];
    if (chosen.length !== perSource) {
      throw new Error(`${source.url} yielded ${chosen.length} safe domains; expected ${perSource}`);
    }
    for (const domain of chosen) {
      selected.push({ domain, category: source.category, sourceRef });
      seen.add(domain);
    }
  }
  return selected.sort((left, right) => codepointCompare(left.domain, right.domain));
}

export function entriesEqual(left, right) {
  if (left.length !== right.length) return false;
  const normalize = (entry) => `${entry.domain}\0${entry.category}\0${entry.sourceRef ?? entry.source_ref}`;
  const normalizedLeft = left.map(normalize).sort(codepointCompare);
  const normalizedRight = right.map(normalize).sort(codepointCompare);
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function render(entries, { version, date = new Date().toISOString().slice(0, 10), sources = SOURCES } = {}) {
  if (!version) throw new Error("package version is required");
  const lines = [
    "[meta]",
    'list_name      = "url_deny"',
    `version        = ${JSON.stringify(version)}`,
    `last_updated   = ${JSON.stringify(date)}`,
    'maintained_by  = "Ripple Company / generated by scripts/update-url-deny.mjs"',
    'review_cadence = "daily"',
    "source_refs    = [",
    ...sources.map(({ url }) => `  ${JSON.stringify(url)},`),
    "]",
    "",
    "# Generated deterministically from the source feeds above.",
    "# Do not hand-edit entries; update the source configuration and rerun the updater.",
  ];
  for (const entry of entries) {
    const sourceRef = entry.sourceRef ?? entry.source_ref;
    const source = sources[sourceRef];
    if (!source?.url) {
      throw new Error(`entry ${entry.domain} has source_ref ${sourceRef} with no matching source URL`);
    }
    lines.push(
      "",
      "[[entries]]",
      `domain     = ${JSON.stringify(entry.domain)}`,
      `category   = ${JSON.stringify(entry.category)}`,
      'severity   = "block"',
      'applies    = ["web_search.output"]',
      // Rust consumer contract (dict.rs maps `audit` -> audit_note and
      // asserts the "source=https://..." prefix); source_ref is kept as
      // the machine-readable index into meta.source_refs.
      `audit      = ${JSON.stringify(`source=${source.url}`)}`,
      `source_ref = ${sourceRef}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

class DownloadError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

function validateDownloadUrl(value, allowHttpLocalhost) {
  const parsed = new URL(value);
  const localHttp = allowHttpLocalhost && parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) throw new DownloadError(`refusing non-HTTPS URL ${value}`, false);
  return parsed;
}

function downloadOnce(url, options, redirects = 0, deadlineAt = Date.now() + options.timeoutMs) {
  if (redirects > options.maxRedirects) return Promise.reject(new DownloadError(`too many redirects while fetching ${url}`, false));
  const parsed = validateDownloadUrl(url, options.allowHttpLocalhost);
  const requestImpl = parsed.protocol === "https:" ? options.httpsRequest : options.httpRequest;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const done = finish(resolve);
    const fail = finish(reject);
    const signal = AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
    const req = requestImpl(parsed, {
      headers: { "user-agent": "arinova-moderation-baseline-updater/1.0" },
      signal,
    });
    req.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        let redirect;
        try {
          redirect = new URL(response.headers.location, parsed).href;
          validateDownloadUrl(redirect, options.allowHttpLocalhost);
        } catch (error) {
          fail(error);
          return;
        }
        downloadOnce(redirect, options, redirects + 1, deadlineAt).then(done, fail);
        return;
      }
      if (status !== 200) {
        response.resume();
        fail(new DownloadError(`fetch ${url} returned HTTP ${status}`, status >= 500 || status === 429));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > options.maxResponseBytes) {
          response.destroy();
          fail(new DownloadError(`fetch ${url} exceeded ${options.maxResponseBytes} bytes`, false));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
      response.on("error", fail);
    });
    req.on("error", (error) => fail(new DownloadError(error.message, true)));
    req.end();
  });
}

export async function download(url, options = {}) {
  const resolved = {
    allowHttpLocalhost: false,
    attempts: 3,
    httpRequest,
    httpsRequest,
    maxRedirects: 3,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    retryDelayMs: 100,
    timeoutMs: 30_000,
    ...options,
  };
  let lastError;
  for (let attempt = 0; attempt < resolved.attempts; attempt += 1) {
    try {
      return await downloadOnce(url, resolved);
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt === resolved.attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, resolved.retryDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function atomicWrite(path, contents) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o644);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
