import * as fs from 'fs/promises';
import type { TokenUsage } from './jsonlReader';

// Incremental, in-memory index of usage entries from Claude Code transcripts.
//
// Transcripts are append-only, so each file is read once from the start and
// afterwards only from the byte offset where the previous read stopped. Usage
// aggregation, project cost and prediction all share this index, so a refresh
// reads only the bytes appended since the last refresh (#48).

export interface UsageRecord {
  timestamp: number  // ms
  usage: TokenUsage
  model?: string     // e.g. "claude-sonnet-5-5"; used for model-aware pricing
}

/**
 * Oldest entry kept in memory — the widest window any caller aggregates: the
 * calendar month (up to 31 days, plus a day of margin for DST / clock skew).
 */
export const INDEX_RETENTION_MS = 32 * 24 * 3600 * 1000;

const CHUNK_SIZE = 1024 * 1024;
const NEWLINE = 0x0a;

interface FileState {
  ino: number
  mtimeMs: number
  offset: number                // bytes consumed so far (always at a line boundary)
  records: UsageRecord[]
  seenKeys: Set<string>         // requestId / message.id dedupe keys seen in this file
}

/**
 * Claude Code writes one JSONL entry per content block of a streaming
 * response, all sharing the same requestId and usage. Every reader dedupes on
 * this key so each API call is counted once. Returns null when absent.
 */
export function usageDedupeKey(obj: Record<string, unknown>): string | null {
  if (typeof obj.requestId === 'string' && obj.requestId) { return obj.requestId; }
  const id = (obj.message as Record<string, unknown> | undefined)?.id;
  return typeof id === 'string' && id ? id : null;
}

const files = new Map<string, FileState>();
const syncing = new Map<string, Promise<void>>();

function newState(ino: number, mtimeMs: number): FileState {
  return { ino, mtimeMs, offset: 0, records: [], seenKeys: new Set() };
}

export interface ParsedUsageLine {
  dedupeKey: string | null
  record: UsageRecord | null   // null: no usage or an invalid timestamp
}

/**
 * Parse one transcript line. The single place that decides which lines carry
 * usage and how usage is normalized — shared by the index and the heatmap.
 * Returns null for anything that is not an assistant message (or not JSON).
 * Callers dedupe on `dedupeKey` before looking at `record`: Claude Code writes
 * one entry per content block of a streaming response, all sharing the same
 * requestId and usage, so each API call is counted once.
 */
export function parseUsageLine(line: string): ParsedUsageLine | null {
  const trimmed = line.trim();
  if (!trimmed) { return null; }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null; // skip malformed lines
  }
  if (obj.type !== 'assistant' || typeof obj.timestamp !== 'string') { return null; }
  const message = obj.message as { model?: unknown; usage?: Partial<TokenUsage> } | undefined;
  if (!message) { return null; }

  const dedupeKey = usageDedupeKey(obj);
  const u = message.usage;
  const timestamp = new Date(obj.timestamp).getTime();
  if (!u || isNaN(timestamp)) { return { dedupeKey, record: null }; }

  return {
    dedupeKey,
    record: {
      timestamp,
      usage: {
        input_tokens: u.input_tokens || 0,
        output_tokens: u.output_tokens || 0,
        cache_read_input_tokens: u.cache_read_input_tokens || 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
        cache_creation: u.cache_creation
          ? { ephemeral_1h_input_tokens: u.cache_creation.ephemeral_1h_input_tokens }
          : undefined,
        // Pricing modifiers; kept only when set so records stay slim
        ...(typeof u.speed === 'string' ? { speed: u.speed } : {}),
        ...(typeof u.inference_geo === 'string' ? { inference_geo: u.inference_geo } : {}),
      },
      model: typeof message.model === 'string' ? message.model : undefined,
    },
  };
}

/**
 * Per-reader dedupe: true the first time a key is seen (and for lines with no
 * key, which cannot be deduplicated).
 */
export function firstSeen(seen: Set<string>, key: string | null): boolean {
  if (!key) { return true; }
  if (seen.has(key)) { return false; }
  seen.add(key);
  return true;
}

function ingestLine(state: FileState, line: string, retainSince: number): void {
  const parsed = parseUsageLine(line);
  if (!parsed || !firstSeen(state.seenKeys, parsed.dedupeKey)) { return; }
  if (parsed.record && parsed.record.timestamp >= retainSince) {
    state.records.push(parsed.record);
  }
}

function isCompleteJson(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

async function syncFile(filePath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    files.delete(filePath);
    return;
  }

  let state = files.get(filePath);
  // A new inode or a shrunk file means the transcript was replaced — start over
  if (!state || state.ino !== stat.ino || stat.size < state.offset) {
    state = newState(stat.ino, stat.mtimeMs);
    files.set(filePath, state);
  }
  state.mtimeMs = stat.mtimeMs;

  const retainSince = Date.now() - INDEX_RETENTION_MS;
  if (state.records.length > 0 && state.records[0].timestamp < retainSince) {
    state.records = state.records.filter(r => r.timestamp >= retainSince);
  }
  if (stat.size === state.offset) { return; }

  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(CHUNK_SIZE);
    let carry: Buffer = Buffer.alloc(0);
    let pos = state.offset;
    // Read only up to the size seen above; anything appended meanwhile is picked up next sync
    while (pos < stat.size) {
      const { bytesRead } = await handle.read(buf, 0, Math.min(CHUNK_SIZE, stat.size - pos), pos);
      if (bytesRead === 0) { break; }
      pos += bytesRead;

      const data = carry.length > 0 ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      let start = 0;
      let nl: number;
      while ((nl = data.indexOf(NEWLINE, start)) !== -1) {
        ingestLine(state, data.toString('utf-8', start, nl), retainSince);
        start = nl + 1;
      }
      state.offset += start;
      // Copy: `buf` is reused for the next chunk
      carry = Buffer.from(data.subarray(start));
    }

    // A trailing line without '\n' is usually still being written — leave it for
    // the next sync, unless it already parses as a complete entry
    if (carry.length > 0) {
      const tail = carry.toString('utf-8');
      if (isCompleteJson(tail.trim())) {
        ingestLine(state, tail, retainSince);
        state.offset += carry.length;
      }
    }
  } finally {
    await handle.close().catch(() => {});
  }
}

// Serialise syncs per file so concurrent callers never read the same bytes twice
function syncFileOnce(filePath: string): Promise<void> {
  const prev = syncing.get(filePath) ?? Promise.resolve();
  const next = prev.then(() => syncFile(filePath)).catch(() => { files.delete(filePath); });
  syncing.set(filePath, next);
  next.finally(() => {
    if (syncing.get(filePath) === next) { syncing.delete(filePath); }
  }).catch(() => {});
  return next;
}

/**
 * Bring the given transcripts up to date and return their usage records with
 * `timestamp >= sinceMs`. `sinceMs` must not be older than INDEX_RETENTION_MS.
 */
export async function readUsageRecords(filePaths: string[], sinceMs: number): Promise<UsageRecord[]> {
  // Forget files that aged out of every window
  const evictBefore = Date.now() - INDEX_RETENTION_MS;
  for (const [fp, state] of files) {
    if (state.mtimeMs < evictBefore) { files.delete(fp); }
  }

  // Sequential on purpose: bounds memory and I/O to one file at a time
  for (const fp of filePaths) {
    await syncFileOnce(fp);
  }

  const result: UsageRecord[] = [];
  for (const fp of filePaths) {
    const state = files.get(fp);
    if (!state) { continue; }
    for (const r of state.records) {
      if (r.timestamp >= sinceMs) { result.push(r); }
    }
  }
  return result;
}

/** Number of transcripts currently held in the index (tests). */
export function indexedFileCount(): number {
  return files.size;
}

/** Drop all cached state (tests). */
export function clearUsageIndex(): void {
  files.clear();
  syncing.clear();
}
