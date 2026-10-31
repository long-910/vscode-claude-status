import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { getClaudeHome } from './claudeHome';
import { readUsageRecords, usageDedupeKey } from './usageIndex';

export interface CacheCreationBreakdown {
  ephemeral_5m_input_tokens?: number
  ephemeral_1h_input_tokens?: number
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  cache_creation?: CacheCreationBreakdown
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

const ONE_HOUR_CACHE_WRITE_MULTIPLIER = 2;

const rate = (input: number, output: number, cacheRead: number): TokenPricing => ({
  inputPerMillion: input,
  outputPerMillion: output,
  cacheReadPerMillion: cacheRead,
  cacheCreatePerMillion: input * 1.25,  // 5-minute cache write
});

interface ModelPricingRule {
  pattern: RegExp
  pricing: TokenPricing
  // Rate card for prompts (input + cache tokens) above `threshold` tokens
  longPrompt?: { threshold: number; pricing: TokenPricing }
}

// Built-in per-model rates (USD per 1M tokens), matched against the JSONL
// entry's message.model. Anthropic's published pricing: 5-minute cache write
// = 1.25x input, 1-hour cache write = 2x input, cache read = 0.1x input unless
// noted. First match wins, so specific patterns precede their family pattern.
const MODEL_PRICING_RULES: ReadonlyArray<ModelPricingRule> = [
  // Fable 5.1 / Mythos 5.1 — cache read 0.025x
  { pattern: /(fable|mythos)-5-1/i, pricing: rate(10.00, 50.00, 0.25) },
  { pattern: /fable|mythos/i, pricing: rate(10.00, 50.00, 1.00) },
  // Opus 5.5 — cache read 0.05x
  { pattern: /opus-5-5/i, pricing: rate(4.00, 20.00, 0.20) },
  // Legacy Opus (3, 4.0, 4.1)
  { pattern: /claude-3-opus|opus-4-1(?!\d)|opus-4-20\d{6}/i, pricing: rate(15.00, 75.00, 1.50) },
  // Opus 4.5 – 4.8, Opus 5
  { pattern: /opus/i, pricing: rate(5.00, 25.00, 0.50) },
  // Sonnet 5 / 5.5
  { pattern: /sonnet-5/i, pricing: rate(2.00, 10.00, 0.20) },
  // Sonnet 3.x – 4.x
  { pattern: /sonnet/i, pricing: rate(3.00, 15.00, 0.30) },
  // Haiku 5.x — two rate cards chosen by prompt length
  {
    pattern: /haiku-5/i,
    pricing: rate(0.10, 0.50, 0.01),
    longPrompt: { threshold: 100_000, pricing: rate(0.50, 2.50, 0.05) },
  },
  { pattern: /claude-3-5-haiku/i, pricing: rate(0.80, 4.00, 0.08) },
  { pattern: /claude-3-haiku/i, pricing: rate(0.25, 1.25, 0.03) },
  // Haiku 4.5
  { pattern: /haiku/i, pricing: rate(1.00, 5.00, 0.10) },
];

function promptTokens(usage: TokenUsage): number {
  return (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
}

/**
 * Built-in rate for a recognized model, or `fallback` (the user-configured
 * claudeStatus.pricing.* rates) when the model is unknown, e.g. `<synthetic>`.
 * Pass `usage` to select a long-prompt rate card where the model has one.
 */
export function resolveModelPricing(
  model: string | undefined,
  fallback: TokenPricing,
  usage?: TokenUsage,
): TokenPricing {
  if (!model) { return fallback; }
  const rule = MODEL_PRICING_RULES.find(r => r.pattern.test(model));
  if (!rule) { return fallback; }
  if (rule.longPrompt && usage && promptTokens(usage) > rule.longPrompt.threshold) {
    return rule.longPrompt.pricing;
  }
  return rule.pricing;
}

export interface CostOptions {
  pricing: TokenPricing      // manual rates; also the fallback for unknown models
  useModelPricing: boolean   // when true, recognized models use built-in rates
}

export const DEFAULT_COST_OPTIONS: CostOptions = {
  pricing: DEFAULT_PRICING,
  useModelPricing: true,
};

/** Cost of one usage entry, priced by its model when model pricing is enabled. */
export function usageCost(
  usage: TokenUsage,
  model: string | undefined,
  options: CostOptions = DEFAULT_COST_OPTIONS,
): number {
  const pricing = options.useModelPricing
    ? resolveModelPricing(model, options.pricing, usage)
    : options.pricing;
  return calculateCost(usage, pricing);
}

export function calculateCost(usage: TokenUsage, pricing: TokenPricing = DEFAULT_PRICING): number {
  const cacheCreateTotal = usage.cache_creation_input_tokens || 0;
  const cacheCreate1h = Math.min(
    Math.max(usage.cache_creation?.ephemeral_1h_input_tokens || 0, 0),
    cacheCreateTotal
  );
  const cacheCreate5m = cacheCreateTotal - cacheCreate1h;

  return (
    ((usage.input_tokens || 0) / 1_000_000) * pricing.inputPerMillion +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.outputPerMillion +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheReadPerMillion +
    (cacheCreate5m / 1_000_000) * pricing.cacheCreatePerMillion +
    (cacheCreate1h / 1_000_000) * pricing.inputPerMillion * ONE_HOUR_CACHE_WRITE_MULTIPLIER
  );
}

export function getClaudeProjectsDir(): string {
  return path.join(getClaudeHome(), 'projects');
}

/**
 * Stream a JSONL file and call `onLine` for each non-empty, trimmed line.
 * Peak memory is one line rather than the whole file, which matters because
 * a single Claude Code transcript can grow to ~100 MB (#48).
 * Return `false` from `onLine` to stop reading early.
 * Rejects if the file cannot be opened.
 */
export async function forEachJsonlLine(
  filePath: string,
  onLine: (line: string) => boolean | void,
): Promise<void> {
  const handle = await fs.open(filePath, 'r');
  const stream = handle.createReadStream({ encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      if (onLine(trimmed) === false) { break; }
    }
  } finally {
    rl.close();
    stream.destroy();
    await handle.close().catch(() => {});
  }
}

/**
 * List every `~/.claude/projects/<project>/<session>.jsonl` file.
 * When `modifiedSinceMs` is given, files whose mtime is older are skipped:
 * Claude Code only appends to a transcript, so a file's mtime is >= the
 * timestamp of every entry inside it.
 */
export async function findAllJsonlFiles(modifiedSinceMs?: number): Promise<string[]> {
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
          if (modifiedSinceMs !== undefined) {
            try {
              const fstat = await fs.stat(filePath);
              if (fstat.mtimeMs < modifiedSinceMs) { continue; }
            } catch {
              continue;
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
    await forEachJsonlLine(filePath, trimmed => {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        // Only 'assistant' entries have usage data in message.usage
        if (
          obj.type === 'assistant' &&
          typeof obj.timestamp === 'string' &&
          obj.message !== undefined
        ) {
          const dedupeKey = usageDedupeKey(obj);
          if (dedupeKey) {
            if (seenRequestIds.has(dedupeKey)) { return; }
            seenRequestIds.add(dedupeKey);
          }
          // Keep only the fields callers use — message content can be large
          const message = obj.message as JsonlEntry['message'];
          entries.push({
            type: obj.type,
            timestamp: obj.timestamp,
            requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
            message: { id: message?.id, model: message?.model, usage: message?.usage },
          });
        }
      } catch {
        // skip malformed lines
      }
    });
  } catch {
    // skip unreadable files
  }
  return entries;
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

  // Files untouched for 7 days cannot contain entries inside any window below
  const files = await findAllJsonlFiles(now - window7d);
  const records = await readUsageRecords(files, now - window7d);
  for (const { timestamp: ts, usage, model } of records) {
    const cost = usageCost(usage, model, options);

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
      if (model) {
        result.costByModel5h[model] = (result.costByModel5h[model] || 0) + cost;
      }
    }
  }

  return result;
}

export async function wasJsonlUpdatedRecently(seconds: number): Promise<boolean> {
  const files = await findAllJsonlFiles(Date.now() - seconds * 1000);
  return files.length > 0;
}
