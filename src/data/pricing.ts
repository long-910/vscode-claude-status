import type { TokenUsage } from './jsonlReader';

// Token pricing: manual rates (claudeStatus.pricing.*), built-in per-model
// rates, and user overrides (claudeStatus.pricing.modelOverrides).

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

// ---- built-in per-model rates ----------------------------------------------

/** Rates for one model: 5-minute cache write = 1.25x input unless given. */
export function modelRate(input: number, output: number, cacheRead = input * 0.1, cacheCreate = input * 1.25): TokenPricing {
  // Round away float noise from the multipliers (0.1 * 0.1 = 0.010000000000000002)
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return { inputPerMillion: input, outputPerMillion: output, cacheReadPerMillion: r(cacheRead), cacheCreatePerMillion: r(cacheCreate) };
}

type Family = 'fable' | 'opus' | 'sonnet' | 'haiku';

interface ModelRateEntry {
  version: [number, number]   // [major, minor]
  pricing: TokenPricing
  // Rate card for prompts (input + cache tokens) above `threshold` tokens
  longPrompt?: { threshold: number; pricing: TokenPricing }
}

// Anthropic's published first-party rates, USD per 1M tokens, checked against
// https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-31.
// Cache read is 0.1x input unless noted (0.025x Fable / Mythos 5.1, 0.05x
// Opus 5.5 and Sonnet 5.5); 1-hour cache writes are 2x input.
// Every released model has its own row (even when its price equals the row
// before), so it resolves as `builtin`. To support a new model, add a row —
// until then, versions newer than a family's last row are `estimated`.
// Listed releases (2026-10): Fable 5, 5.1; Opus 3, 4, 4.1, 4.5, 4.6, 4.7,
// 4.8, 5, 5.5; Sonnet 3, 3.5, 3.7, 4, 4.5, 4.6, 5, 5.5; Haiku 3, 3.5, 4.5, 5.5.
const MODEL_RATES: Readonly<Record<Family, ReadonlyArray<ModelRateEntry>>> = {
  fable: [  // Mythos shares Fable's rates
    { version: [5, 0], pricing: modelRate(10.00, 50.00) },
    { version: [5, 1], pricing: modelRate(10.00, 50.00, 0.25) },
  ],
  opus: [
    { version: [3, 0], pricing: modelRate(15.00, 75.00) },
    { version: [4, 0], pricing: modelRate(15.00, 75.00) },
    { version: [4, 1], pricing: modelRate(15.00, 75.00) },
    { version: [4, 5], pricing: modelRate(5.00, 25.00) },   // 4.5 – 4.8
    { version: [5, 0], pricing: modelRate(5.00, 25.00) },
    { version: [5, 5], pricing: modelRate(4.00, 20.00, 0.20) },
  ],
  sonnet: [
    { version: [3, 0], pricing: modelRate(3.00, 15.00) },   // 3.x – 4.x
    { version: [5, 0], pricing: modelRate(2.00, 10.00) },
    { version: [5, 5], pricing: modelRate(2.00, 10.00, 0.10) },
  ],
  haiku: [
    { version: [3, 0], pricing: modelRate(0.25, 1.25, 0.03, 0.30) },
    { version: [3, 5], pricing: modelRate(0.80, 4.00) },
    { version: [4, 5], pricing: modelRate(1.00, 5.00) },
    {
      version: [5, 5],
      pricing: modelRate(0.10, 0.50),
      longPrompt: { threshold: 100_000, pricing: modelRate(0.50, 2.50) },
    },
  ],
};

export interface ParsedModel {
  id: string                      // normalized id, e.g. "claude-opus-4-5"
  family: Family | null
  version: [number, number] | null
}

/**
 * Normalize a model id from any provider to Anthropic's first-party form:
 * "us.anthropic.claude-sonnet-4-5-20250929-v1:0" / "claude-opus-4-5@20251101"
 * → "claude-sonnet-4-5" / "claude-opus-4-5".
 */
export function normalizeModelId(model: string): string {
  let id = model.trim().toLowerCase();
  const at = id.indexOf('claude-');
  if (at > 0) { id = id.slice(at); }                 // Bedrock / Vertex prefixes
  id = id.replace(/\[[^\]]*\]$/, '');                // "[1m]" context suffix
  id = id.replace(/@.*$/, '');                       // Vertex "@20251101"
  id = id.replace(/-v\d+(?::\d+)?$/, '');            // Bedrock "-v1:0"
  id = id.replace(/-\d{8}$/, '');                    // snapshot date
  return id;
}

export function parseModelId(model: string): ParsedModel {
  const id = normalizeModelId(model);
  const toFamily = (f: string): Family => (f === 'mythos' ? 'fable' : f as Family);
  // Current scheme: claude-<family>-<major>[-<minor>]
  let m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(id);
  if (m) { return { id, family: toFamily(m[1]), version: [Number(m[2]), Number(m[3] ?? 0)] }; }
  // Claude 3.x scheme: claude-<major>[-<minor>]-<family>
  m = /^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)(?:-|$)/.exec(id);
  if (m) { return { id, family: toFamily(m[3]), version: [Number(m[1]), Number(m[2] ?? 0)] }; }
  // Family without a version (e.g. an alias)
  m = /(opus|sonnet|haiku|fable|mythos)/.exec(id);
  return { id, family: m ? toFamily(m[1]) : null, version: null };
}

/** Per-model rate overrides from claudeStatus.pricing.modelOverrides. */
export type ModelPricingOverrides = Record<string, Partial<TokenPricing>>;

/**
 * - `override`  — matched a claudeStatus.pricing.modelOverrides key
 * - `builtin`   — a model version listed in the built-in table
 * - `estimated` — a family we know, but a version newer than the table (or
 *                 none): priced at the family's latest known rate
 * - `manual`    — unknown model, or model pricing disabled: claudeStatus.pricing.*
 */
export type PricingSource = 'override' | 'builtin' | 'estimated' | 'manual';

export interface ResolvedPricing {
  pricing: TokenPricing
  source: PricingSource
}

function versionKey(v: [number, number]): number {
  return v[0] * 1000 + v[1];
}

function findOverride(id: string, overrides: ModelPricingOverrides | undefined): TokenPricing | null {
  if (!overrides) { return null; }
  // Longest matching key wins, so "claude-opus-6-1" beats "claude-opus-6"
  let best: { key: string; rate: Partial<TokenPricing> } | null = null;
  for (const [key, rate] of Object.entries(overrides)) {
    const k = normalizeModelId(key);
    if (!k || !id.includes(k)) { continue; }
    if (!best || k.length > best.key.length) { best = { key: k, rate }; }
  }
  if (!best) { return null; }
  const { inputPerMillion: input, outputPerMillion: output } = best.rate;
  if (!isRate(input) || !isRate(output)) { return null; }  // invalid entry — ignore
  return modelRate(
    input,
    output,
    isRate(best.rate.cacheReadPerMillion) ? best.rate.cacheReadPerMillion : undefined,
    isRate(best.rate.cacheCreatePerMillion) ? best.rate.cacheCreatePerMillion : undefined,
  );
}

function isRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function promptTokens(usage: TokenUsage): number {
  return (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
}

/**
 * Rate for `model`: a user override, else the built-in rate of the newest
 * table row whose version is <= the model's (so an unreleased "opus-6" uses
 * the latest Opus rate), else `fallback` — the claudeStatus.pricing.* rates.
 * Pass `usage` to select a long-prompt rate card where the model has one.
 */
export function resolveModelPricing(
  model: string | undefined,
  fallback: TokenPricing,
  usage?: TokenUsage,
  overrides?: ModelPricingOverrides,
): ResolvedPricing {
  if (!model) { return { pricing: fallback, source: 'manual' }; }
  const parsed = parseModelId(model);

  const override = findOverride(parsed.id, overrides);
  if (override) { return { pricing: override, source: 'override' }; }
  if (!parsed.family) { return { pricing: fallback, source: 'manual' }; }

  const table = MODEL_RATES[parsed.family];
  const latest = table[table.length - 1];
  let entry = latest;
  let source: PricingSource = 'estimated';
  if (parsed.version) {
    const want = versionKey(parsed.version);
    if (want <= versionKey(latest.version)) {
      // Newest row at or below the requested version (oldest row if below all)
      entry = [...table].reverse().find(e => versionKey(e.version) <= want) ?? table[0];
      source = 'builtin';
    }
  }

  const pricing = entry.longPrompt && usage && promptTokens(usage) > entry.longPrompt.threshold
    ? entry.longPrompt.pricing
    : entry.pricing;
  return { pricing, source };
}

export interface CostOptions {
  pricing: TokenPricing      // manual rates; also the fallback for unknown models
  useModelPricing: boolean   // when true, models are priced by resolveModelPricing()
  modelOverrides?: ModelPricingOverrides
}

export const DEFAULT_COST_OPTIONS: CostOptions = {
  pricing: DEFAULT_PRICING,
  useModelPricing: true,
};

/** How an entry of `model` is priced under `options` (cost-free; for display). */
export function pricingSource(model: string | undefined, options: CostOptions = DEFAULT_COST_OPTIONS): PricingSource {
  if (!options.useModelPricing) { return 'manual'; }
  return resolveModelPricing(model, options.pricing, undefined, options.modelOverrides).source;
}

// Fast mode (Opus 5.5 / 5 / 4.8) is billed at 2x every token category
const FAST_MODE_MULTIPLIER = 2;
// US-only inference (inference_geo: "us") is billed at 1.1x on Claude 4.6+
const US_INFERENCE_MULTIPLIER = 1.1;

/**
 * Multiplier for pricing modifiers recorded on the usage object. Applies only
 * with model pricing, and never on top of a user override (overrides are
 * taken as the exact rate the user pays).
 */
export function pricingMultiplier(usage: TokenUsage, model: string | undefined, source: PricingSource): number {
  if (source !== 'builtin' && source !== 'estimated') { return 1; }
  let m = 1;
  if (usage.speed === 'fast') { m *= FAST_MODE_MULTIPLIER; }
  if (usage.inference_geo === 'us' && model) {
    const { version, family } = parseModelId(model);
    // Fable / Mythos are all 5.x; a missing version means a current alias
    if (family === 'fable' || !version || versionKey(version) >= versionKey([4, 6])) {
      m *= US_INFERENCE_MULTIPLIER;
    }
  }
  return m;
}

/** Cost of one usage entry, priced by its model when model pricing is enabled. */
export function usageCost(
  usage: TokenUsage,
  model: string | undefined,
  options: CostOptions = DEFAULT_COST_OPTIONS,
): number {
  if (!options.useModelPricing) { return calculateCost(usage, options.pricing); }
  const { pricing, source } = resolveModelPricing(model, options.pricing, usage, options.modelOverrides);
  return calculateCost(usage, pricing) * pricingMultiplier(usage, model, source);
}
