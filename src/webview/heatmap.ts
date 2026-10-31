import { usageCost, forEachJsonlLine, findAllJsonlFiles, CostOptions, DEFAULT_COST_OPTIONS } from '../data/jsonlReader';
import { firstSeen, parseUsageLine } from '../data/usageIndex';
import { localDateKey } from '../data/localTime';

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


async function readJsonlForHeatmap(
  filePath: string,
  cutoff: number,
  options: CostOptions,
): Promise<EntryForHeatmap[]> {
  const result: EntryForHeatmap[] = [];
  // Same parsing and streaming dedupe as the usage index
  const seenKeys = new Set<string>();
  try {
    await forEachJsonlLine(filePath, line => {
      const parsed = parseUsageLine(line);
      if (!parsed || !firstSeen(seenKeys, parsed.dedupeKey) || !parsed.record) { return; }
      const { timestamp, usage, model } = parsed.record;
      if (timestamp < cutoff) { return; }
      result.push({
        timestamp,
        cost: usageCost(usage, model, options),
        tokens: usage.input_tokens + usage.output_tokens,
        hour: new Date(timestamp).getHours(),
      });
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
    const key = localDateKey(e.timestamp);
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
    const key = localDateKey(now - i * 24 * 3600 * 1000);
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
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const allEntries: EntryForHeatmap[] = [];

  // Same discovery as the other readers: per-file mtime filter (a directory's
  // own mtime is not used — appending to an old transcript doesn't change it).
  // Returns [] when ~/.claude/projects doesn't exist.
  const filePaths = await findAllJsonlFiles(cutoff);

  // Read qualifying files with bounded concurrency
  let next = 0;
  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, filePaths.length) }, async () => {
    while (next < filePaths.length) {
      const chunk = await readJsonlForHeatmap(filePaths[next++], cutoff, options);
      for (const entry of chunk) { allEntries.push(entry); }
    }
  });
  await Promise.all(workers);

  return {
    daily: aggregateByDay(allEntries, days),
    hourly: aggregateByHour(allEntries, 30),   // always use last 30 days for hourly
    dowHour: aggregateByDowHour(allEntries, 30),
    generatedAt: new Date(),
  };
}
