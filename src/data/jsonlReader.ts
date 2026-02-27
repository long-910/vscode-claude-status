import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// Actual Claude Code JSONL structure (verified against real data):
// - type: 'assistant' entries contain usage data
// - usage is at entry.message.usage (NOT entry.usage)
// - costUSD field does not exist; always calculate from tokens
// - cwd is at the top level of every entry
interface JsonlEntry {
  type: string
  timestamp: string
  cwd?: string
  message?: {
    usage?: TokenUsage
  }
}

export interface AggregatedUsage {
  cost5h: number
  costDay: number
  cost7d: number
  tokensIn5h: number
  tokensOut5h: number
  tokensCacheRead5h: number
  tokensCacheCreate5h: number
}

export function calculateCost(usage: TokenUsage): number {
  return (
    ((usage.input_tokens || 0) / 1_000_000) * 3.00 +
    ((usage.output_tokens || 0) / 1_000_000) * 15.00 +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * 0.30 +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * 3.75
  );
}

export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export async function findAllJsonlFiles(): Promise<string[]> {
  const projectsDir = getClaudeProjectsDir();
  const files: string[] = [];

  try {
    const projectDirs = await fs.readdir(projectsDir);
    for (const dir of projectDirs) {
      const dirPath = path.join(projectsDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) { continue; }
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
          if (entry.endsWith('.jsonl')) {
            files.push(path.join(dirPath, entry));
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // ~/.claude/projects doesn't exist — graceful degradation
  }

  return files;
}

async function readJsonlFile(filePath: string): Promise<JsonlEntry[]> {
  const entries: JsonlEntry[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        // Only 'assistant' entries have usage data in message.usage
        if (
          obj.type === 'assistant' &&
          typeof obj.timestamp === 'string' &&
          obj.message !== undefined
        ) {
          entries.push(obj as unknown as JsonlEntry);
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip unreadable files
  }
  return entries;
}

export async function readAllUsage(): Promise<AggregatedUsage> {
  const now = Date.now();
  const window5h = 5 * 3600 * 1000;
  const window7d = 7 * 24 * 3600 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const result: AggregatedUsage = {
    cost5h: 0,
    costDay: 0,
    cost7d: 0,
    tokensIn5h: 0,
    tokensOut5h: 0,
    tokensCacheRead5h: 0,
    tokensCacheCreate5h: 0,
  };

  const files = await findAllJsonlFiles();
  for (const file of files) {
    const entries = await readJsonlFile(file);
    for (const entry of entries) {
      const ts = new Date(entry.timestamp).getTime();
      if (isNaN(ts)) { continue; }

      const usage = entry.message?.usage;
      if (!usage) { continue; }
      const cost = calculateCost(usage);

      const age = now - ts;
      if (age <= window7d) {
        result.cost7d += cost;
      }
      if (ts >= startOfToday.getTime()) {
        result.costDay += cost;
      }
      if (age <= window5h) {
        result.cost5h += cost;
        result.tokensIn5h += usage.input_tokens || 0;
        result.tokensOut5h += usage.output_tokens || 0;
        result.tokensCacheRead5h += usage.cache_read_input_tokens || 0;
        result.tokensCacheCreate5h += usage.cache_creation_input_tokens || 0;
      }
    }
  }

  return result;
}

export async function wasJsonlUpdatedRecently(seconds: number): Promise<boolean> {
  const files = await findAllJsonlFiles();
  const threshold = Date.now() - seconds * 1000;
  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs >= threshold) { return true; }
    } catch {
      // skip
    }
  }
  return false;
}
