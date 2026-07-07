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
  requestId?: string
  message?: {
    id?: string
    model?: string
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
  costByModel5h: Record<string, number>  // model id → cost in the 5h window
}

export interface TokenPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  cacheCreatePerMillion: number
}

export const DEFAULT_PRICING: TokenPricing = {
  inputPerMillion: 3.00,
  outputPerMillion: 15.00,
  cacheReadPerMillion: 0.30,
  cacheCreatePerMillion: 3.75,
};

// Built-in per-model rates (USD per 1M tokens), matched against the JSONL
// entry's message.model. Anthropic's published pricing: cache read = 0.1x
// input, 5-minute cache write = 1.25x input. Order matters — first match wins,
// so legacy patterns must precede their generic family pattern.
const MODEL_PRICING_RULES: ReadonlyArray<{ pattern: RegExp; pricing: TokenPricing }> = [
  // Fable 5 / Mythos 5: $10 / $50
  { pattern: /fable|mythos/i, pricing: { inputPerMillion: 10.00, outputPerMillion: 50.00, cacheReadPerMillion: 1.00, cacheCreatePerMillion: 12.50 } },
  // Legacy Opus (3.x, 4.0, 4.1): $15 / $75
  { pattern: /claude-3-opus|opus-4-0|opus-4-1|opus-4-2025/i, pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, cacheReadPerMillion: 1.50, cacheCreatePerMillion: 18.75 } },
  // Opus 4.5 and later: $5 / $25
  { pattern: /opus/i, pricing: { inputPerMillion: 5.00, outputPerMillion: 25.00, cacheReadPerMillion: 0.50, cacheCreatePerMillion: 6.25 } },
  // Haiku (4.5): $1 / $5
  { pattern: /haiku/i, pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00, cacheReadPerMillion: 0.10, cacheCreatePerMillion: 1.25 } },
  // Sonnet (3.x–5): $3 / $15
  { pattern: /sonnet/i, pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheReadPerMillion: 0.30, cacheCreatePerMillion: 3.75 } },
];

// Returns the built-in rate for a recognized model, or the fallback (the
// user-configured claudeStatus.pricing.* rates) when the model is unknown
export function resolveModelPricing(model: string | undefined, fallback: TokenPricing): TokenPricing {
  if (model) {
    for (const rule of MODEL_PRICING_RULES) {
      if (rule.pattern.test(model)) { return rule.pricing; }
    }
  }
  return fallback;
}

export interface CostOptions {
  pricing: TokenPricing      // manual rates; also the fallback for unknown models
  useModelPricing: boolean   // when true, recognized models use built-in rates
}

export const DEFAULT_COST_OPTIONS: CostOptions = {
  pricing: DEFAULT_PRICING,
  useModelPricing: true,
};

export function entryCost(entry: UsageEntry, options: CostOptions = DEFAULT_COST_OPTIONS): number {
  const pricing = options.useModelPricing
    ? resolveModelPricing(entry.model, options.pricing)
    : options.pricing;
  return calculateCost(entry.usage, pricing);
}

export function calculateCost(usage: TokenUsage, pricing: TokenPricing = DEFAULT_PRICING): number {
  return (
    ((usage.input_tokens || 0) / 1_000_000) * pricing.inputPerMillion +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.outputPerMillion +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheReadPerMillion +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheCreatePerMillion
  );
}

export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

// `newerThanMs` skips files whose mtime is older than the given epoch ms.
// Safe for time-windowed aggregation: JSONL files are append-only, so a file
// not modified since T cannot contain entries with timestamps after T.
export async function findAllJsonlFiles(newerThanMs?: number): Promise<string[]> {
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
          if (!entry.endsWith('.jsonl')) { continue; }
          const filePath = path.join(dirPath, entry);
          if (newerThanMs !== undefined) {
            try {
              const fstat = await fs.stat(filePath);
              if (fstat.mtimeMs < newerThanMs) { continue; }
            } catch {
              continue; // unreadable file — reading it would fail anyway
            }
          }
          files.push(filePath);
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

export async function readJsonlFile(filePath: string): Promise<JsonlEntry[]> {
  const entries: JsonlEntry[] = [];
  // Claude Code writes one JSONL entry per content block in a streaming response,
  // all sharing the same requestId and usage counts. Deduplicate to count each
  // API call exactly once.
  const seenRequestIds = new Set<string>();
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
          const dedupeKey =
            (typeof obj.requestId === 'string' && obj.requestId) ||
            (typeof (obj.message as Record<string, unknown>)?.id === 'string' &&
              (obj.message as Record<string, unknown>).id as string) ||
            null;
          if (dedupeKey) {
            if (seenRequestIds.has(dedupeKey)) { continue; }
            seenRequestIds.add(dedupeKey);
          }
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

// A single deduplicated usage record, shared by every feature that reads JSONL
// (global cost, project cost, prediction, heatmap). Guarantees each API call is
// counted exactly once regardless of streaming duplication.
export interface UsageEntry {
  timestamp: number  // ms since epoch, guaranteed valid
  usage: TokenUsage  // all four fields normalized to numbers
  cwd?: string
  model?: string     // e.g. "claude-sonnet-4-5-20250929"
}

export async function readUsageEntries(filePath: string): Promise<UsageEntry[]> {
  const entries = await readJsonlFile(filePath);
  const result: UsageEntry[] = [];
  for (const entry of entries) {
    const rawUsage = entry.message?.usage;
    if (!rawUsage) { continue; }
    const ts = new Date(entry.timestamp).getTime();
    if (isNaN(ts)) { continue; }
    result.push({
      timestamp: ts,
      usage: {
        input_tokens: rawUsage.input_tokens || 0,
        output_tokens: rawUsage.output_tokens || 0,
        cache_read_input_tokens: rawUsage.cache_read_input_tokens || 0,
        cache_creation_input_tokens: rawUsage.cache_creation_input_tokens || 0,
      },
      cwd: typeof entry.cwd === 'string' ? entry.cwd : undefined,
      model: typeof entry.message?.model === 'string' ? entry.message.model : undefined,
    });
  }
  return result;
}

export async function readAllUsage(options: CostOptions = DEFAULT_COST_OPTIONS): Promise<AggregatedUsage> {
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
    costByModel5h: {},
  };

  // Skip files untouched for over 7 days (+1h margin) — they cannot contain
  // entries inside any aggregation window. Keeps the 60s poll cheap on
  // installations with months of session history.
  const files = await findAllJsonlFiles(now - window7d - 3600_000);
  for (const file of files) {
    const entries = await readUsageEntries(file);
    for (const entry of entries) {
      const { timestamp: ts, usage } = entry;
      const cost = entryCost(entry, options);

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
        if (entry.model) {
          result.costByModel5h[entry.model] = (result.costByModel5h[entry.model] || 0) + cost;
        }
      }
    }
  }

  return result;
}

export async function wasJsonlUpdatedRecently(seconds: number): Promise<boolean> {
  const files = await findAllJsonlFiles(Date.now() - seconds * 1000);
  return files.length > 0;
}
