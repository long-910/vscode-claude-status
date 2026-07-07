import * as fs from 'fs/promises';
import * as path from 'path';
import { usageCost, forEachJsonlLine, TokenUsage, getClaudeProjectsDir, CostOptions, DEFAULT_COST_OPTIONS } from '../data/jsonlReader';
import { usageDedupeKey } from '../data/usageIndex';

export interface DailyUsage {
  date: string        // "YYYY-MM-DD" local time
  cost: number        // USD
  sessionCount: number
  tokensTotal: number
}

export interface HourlyUsage {
  hour: number        // 0–23 (local time)
  avgCost: number     // USD average per entry
  count: number       // total entries at this hour
}

export interface HeatmapData {
  daily: DailyUsage[]
  hourly: HourlyUsage[]
  dowHour: number[][]  // 7 rows (0=Sun … 6=Sat) × 24 cols, total USD (local time)
  generatedAt: Date
}

export interface EntryForHeatmap {
  timestamp: number   // ms
  cost: number        // USD
  tokens: number      // input + output tokens
  hour: number        // 0–23 local
}

// ---- helpers ----------------------------------------------------------------

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function readJsonlForHeatmap(
  filePath: string,
  cutoff: number,
  options: CostOptions,
): Promise<EntryForHeatmap[]> {
  const result: EntryForHeatmap[] = [];
  // Streaming responses repeat the same usage on every content-block line —
  // count each API call once, like the other readers
  const seenKeys = new Set<string>();
  try {
    await forEachJsonlLine(filePath, trimmed => {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (obj.type !== 'assistant' || typeof obj.timestamp !== 'string') { return; }
        const ts = new Date(obj.timestamp).getTime();
        if (isNaN(ts) || ts < cutoff) { return; }
        const msg = obj.message as { model?: unknown; usage?: Partial<TokenUsage> } | undefined;
        if (!msg?.usage) { return; }
        const dedupeKey = usageDedupeKey(obj);
        if (dedupeKey) {
          if (seenKeys.has(dedupeKey)) { return; }
          seenKeys.add(dedupeKey);
        }
        const u = msg.usage;
        const cost = usageCost({
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
          cache_creation: u.cache_creation,
        }, typeof msg.model === 'string' ? msg.model : undefined, options);
        result.push({
          timestamp: ts,
          cost,
          tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
          hour: new Date(ts).getHours(),
        });
      } catch { /* skip malformed lines */ }
    });
  } catch { /* skip unreadable files */ }
  return result;
}

// Max JSONL files read at once — reading every qualifying file in parallel
// spiked extension-host memory on large histories (#47, #48)
const READ_CONCURRENCY = 4;

// ---- aggregation (exported for tests) --------------------------------------

export function aggregateByDay(entries: EntryForHeatmap[], days: number): DailyUsage[] {
  const byDate = new Map<string, DailyUsage>();
  for (const e of entries) {
    const key = toLocalDateKey(e.timestamp);
    const d = byDate.get(key) ?? { date: key, cost: 0, sessionCount: 0, tokensTotal: 0 };
    d.cost += e.cost;
    d.tokensTotal += e.tokens;
    d.sessionCount++;
    byDate.set(key, d);
  }

  // Fill every day in the window, including zero-activity days
  const result: DailyUsage[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const key = toLocalDateKey(now - i * 24 * 3600 * 1000);
    result.push(byDate.get(key) ?? { date: key, cost: 0, sessionCount: 0, tokensTotal: 0 });
  }
  return result;
}

export function aggregateByHour(entries: EntryForHeatmap[], days: number): HourlyUsage[] {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, totalCost: 0, count: 0 }));

  for (const e of entries) {
    if (e.timestamp < cutoff) { continue; }
    byHour[e.hour].totalCost += e.cost;
    byHour[e.hour].count++;
  }

  return byHour.map(h => ({
    hour: h.hour,
    avgCost: h.count > 0 ? h.totalCost / h.count : 0,
    count: h.count,
  }));
}

export function aggregateByDowHour(entries: EntryForHeatmap[], days: number): number[][] {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of entries) {
    if (e.timestamp < cutoff) { continue; }
    grid[new Date(e.timestamp).getDay()][e.hour] += e.cost;
  }
  return grid;
}

// ---- main entry point -------------------------------------------------------

export async function getHeatmapData(days = 90, options: CostOptions = DEFAULT_COST_OPTIONS): Promise<HeatmapData> {
  const claudeProjectsDir = getClaudeProjectsDir();
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const allEntries: EntryForHeatmap[] = [];

  try {
    const projectDirs = await fs.readdir(claudeProjectsDir);

    // Collect qualifying JSONL files (mtime filter for performance)
    const filePaths: string[] = [];
    for (const dir of projectDirs) {
      const dirPath = path.join(claudeProjectsDir, dir);
      try {
        const dstat = await fs.stat(dirPath);
        if (!dstat.isDirectory() || dstat.mtimeMs < cutoff) { continue; }
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (!file.endsWith('.jsonl')) { continue; }
          const fp = path.join(dirPath, file);
          try {
            const fstat = await fs.stat(fp);
            if (fstat.mtimeMs >= cutoff) { filePaths.push(fp); }
          } catch { /* skip */ }
        }
      } catch { /* skip unreadable project dirs */ }
    }

    // Read qualifying files with bounded concurrency
    let next = 0;
    const workers = Array.from({ length: Math.min(READ_CONCURRENCY, filePaths.length) }, async () => {
      while (next < filePaths.length) {
        const chunk = await readJsonlForHeatmap(filePaths[next++], cutoff, options);
        for (const entry of chunk) { allEntries.push(entry); }
      }
    });
    await Promise.all(workers);

  } catch { /* ~/.claude/projects doesn't exist — return empty data */ }

  return {
    daily: aggregateByDay(allEntries, days),
    hourly: aggregateByHour(allEntries, 30),   // always use last 30 days for hourly
    dowHour: aggregateByDowHour(allEntries, 30),
    generatedAt: new Date(),
  };
}
