export interface Source {
  category: string;
  url: string;
}

export interface Feed extends Source {
  body: string;
}

export interface DenyEntry {
  domain: string;
  category: string;
  sourceRef?: number;
  source_ref?: number;
}

export interface DownloadOptions {
  allowHttpLocalhost?: boolean;
  attempts?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export const MAX_RESPONSE_BYTES: number;
export const ENTRIES_PER_SOURCE: number;
export const ALLOWLIST_FLOOR: number;
export const SOURCES: Source[];

export function codepointCompare(left: string, right: string): number;
export function validDomain(value: unknown): boolean;
export function domainsFromFeed(body: string): string[];
export function parseAllowlist(body: string, floor?: number): string[];
export function isAllowlisted(domain: string, allowlisted: string[]): boolean;
export function stableSample(domains: string[], count: number): string[];
export function selectEntries(
  feeds: Feed[],
  allowlisted: string[],
  perSource?: number,
  existingDomains?: Iterable<string>,
): DenyEntry[];
export function entriesEqual(left: DenyEntry[], right: DenyEntry[]): boolean;
export function render(entries: DenyEntry[], options: { version: string; date?: string; sources?: Array<{ url: string }> }): string;
export function download(url: string, options?: DownloadOptions): Promise<string>;
export function atomicWrite(path: string, contents: string): Promise<void>;
