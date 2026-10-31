import * as assert from 'assert';
import {
  calculateCost, normalizeModelId, parseModelId, pricingMultiplier, pricingSource, resolveModelPricing, usageCost,
  DEFAULT_PRICING, CostOptions,
} from '../../data/pricing';
import type { TokenUsage } from '../../data/jsonlReader';

const tokens = (fields: Partial<TokenUsage>): TokenUsage => ({
  input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...fields,
});
const rates = (model: string) => {
  const { pricing: p } = resolveModelPricing(model, DEFAULT_PRICING);
  return [p.inputPerMillion, p.outputPerMillion, p.cacheReadPerMillion];
};
const MANUAL = { inputPerMillion: 7, outputPerMillion: 8, cacheReadPerMillion: 0.7, cacheCreatePerMillion: 8.75 };

suite('Pricing', () => {
  suite('normalizeModelId', () => {
    test('strips provider prefixes, snapshot dates and version suffixes', () => {
      assert.strictEqual(normalizeModelId('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
      assert.strictEqual(normalizeModelId('us.anthropic.claude-sonnet-4-5-20250929-v1:0'), 'claude-sonnet-4-5');
      assert.strictEqual(normalizeModelId('anthropic.claude-opus-5-5'), 'claude-opus-5-5');
      assert.strictEqual(normalizeModelId('claude-opus-4-5@20251101'), 'claude-opus-4-5');
      assert.strictEqual(normalizeModelId('Claude-Opus-5-5[1m]'), 'claude-opus-5-5');
    });
  });

  suite('parseModelId', () => {
    test('current scheme: claude-<family>-<major>[-<minor>]', () => {
      assert.deepStrictEqual(parseModelId('claude-opus-5-5').version, [5, 5]);
      assert.deepStrictEqual(parseModelId('claude-sonnet-5').version, [5, 0]);
      assert.deepStrictEqual(parseModelId('claude-opus-4-20250514').version, [4, 0]);
      assert.deepStrictEqual(parseModelId('claude-opus-4-1-20250805').version, [4, 1]);
      assert.strictEqual(parseModelId('claude-mythos-5-1').family, 'fable');
    });

    test('Claude 3 scheme: claude-<major>[-<minor>]-<family>', () => {
      assert.deepStrictEqual(parseModelId('claude-3-5-sonnet-20241022'), { id: 'claude-3-5-sonnet', family: 'sonnet', version: [3, 5] });
      assert.deepStrictEqual(parseModelId('claude-3-opus-20240229').version, [3, 0]);
    });

    test('unknown models have no family', () => {
      assert.strictEqual(parseModelId('<synthetic>').family, null);
    });
  });

  suite('resolveModelPricing — built-in table', () => {
    test('current models (input / output / cache read)', () => {
      assert.deepStrictEqual(rates('claude-fable-5-1'), [10, 50, 0.25]);
      assert.deepStrictEqual(rates('claude-mythos-5-1'), [10, 50, 0.25]);
      assert.deepStrictEqual(rates('claude-opus-5-5'), [4, 20, 0.20]);
      assert.deepStrictEqual(rates('claude-sonnet-5-5'), [2, 10, 0.10]);   // 0.05x cache read
      assert.deepStrictEqual(rates('claude-haiku-5-5'), [0.10, 0.50, 0.01]);
    });

    test('previous models', () => {
      assert.deepStrictEqual(rates('claude-fable-5'), [10, 50, 1]);
      assert.deepStrictEqual(rates('claude-opus-5'), [5, 25, 0.5]);
      assert.deepStrictEqual(rates('claude-opus-4-8'), [5, 25, 0.5]);
      assert.deepStrictEqual(rates('claude-opus-4-5-20251101'), [5, 25, 0.5]);
      assert.deepStrictEqual(rates('claude-sonnet-5'), [2, 10, 0.2]);
      assert.deepStrictEqual(rates('claude-sonnet-4-6'), [3, 15, 0.3]);
      assert.deepStrictEqual(rates('claude-sonnet-4-5-20250929'), [3, 15, 0.3]);
      assert.deepStrictEqual(rates('claude-haiku-4-5-20251001'), [1, 5, 0.1]);
    });

    test('legacy models', () => {
      assert.deepStrictEqual(rates('claude-opus-4-1-20250805'), [15, 75, 1.5]);
      assert.deepStrictEqual(rates('claude-opus-4-20250514'), [15, 75, 1.5]);
      assert.deepStrictEqual(rates('claude-3-opus-20240229'), [15, 75, 1.5]);
      assert.deepStrictEqual(rates('claude-3-7-sonnet-20250219'), [3, 15, 0.3]);
      assert.deepStrictEqual(rates('claude-3-5-haiku-20241022'), [0.8, 4, 0.08]);
      assert.deepStrictEqual(rates('claude-3-haiku-20240307'), [0.25, 1.25, 0.03]);
    });

    test('Bedrock / Vertex ids price like first-party ids', () => {
      assert.deepStrictEqual(rates('us.anthropic.claude-opus-5-5'), rates('claude-opus-5-5'));
      assert.deepStrictEqual(rates('claude-sonnet-4-5@20250929'), rates('claude-sonnet-4-5'));
    });

    test('regression: every released model resolves as builtin, not estimated', () => {
      const released = [
        'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5', 'claude-mythos-5-1',
        'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
        'claude-opus-4-5-20251101', 'claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-3-opus-20240229',
        'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022',
        'claude-haiku-5-5', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307',
      ];
      for (const model of released) {
        assert.strictEqual(resolveModelPricing(model, MANUAL).source, 'builtin', model);
      }
    });

    test('Haiku 5.5 uses the long-prompt rate card above 100K prompt tokens', () => {
      const short = resolveModelPricing('claude-haiku-5-5', DEFAULT_PRICING, tokens({ input_tokens: 50_000, cache_read_input_tokens: 50_000 }));
      const long = resolveModelPricing('claude-haiku-5-5', DEFAULT_PRICING, tokens({ input_tokens: 1_000, cache_read_input_tokens: 100_000 }));
      assert.strictEqual(short.pricing.inputPerMillion, 0.10);
      assert.deepStrictEqual([long.pricing.inputPerMillion, long.pricing.outputPerMillion], [0.50, 2.50]);
    });
  });

  suite('resolveModelPricing — models newer than the table', () => {
    test('a newer version uses the family\'s latest known rate and is marked estimated', () => {
      for (const model of ['claude-opus-6', 'claude-opus-5-7', 'claude-sonnet-6-1-20270101', 'claude-fable-6']) {
        const family = parseModelId(model).family as string;
        const latest = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', fable: 'claude-fable-5-1' }[family] as string;
        const r = resolveModelPricing(model, MANUAL);
        assert.strictEqual(r.source, 'estimated', model);
        assert.deepStrictEqual(rates(model), rates(latest), model);
      }
    });

    test('a family without a version uses the latest rate', () => {
      const r = resolveModelPricing('opus', MANUAL);
      assert.strictEqual(r.source, 'estimated');
      assert.strictEqual(r.pricing.inputPerMillion, 4);
    });

    test('unknown or missing models use the manual rates', () => {
      assert.deepStrictEqual(resolveModelPricing('<synthetic>', MANUAL), { pricing: MANUAL, source: 'manual' });
      assert.deepStrictEqual(resolveModelPricing(undefined, MANUAL), { pricing: MANUAL, source: 'manual' });
      assert.deepStrictEqual(resolveModelPricing('gpt-9', MANUAL), { pricing: MANUAL, source: 'manual' });
    });
  });

  suite('resolveModelPricing — user overrides', () => {
    test('an override beats the built-in table; cache rates default from input', () => {
      const r = resolveModelPricing('claude-opus-6-20270101', MANUAL, undefined, {
        'claude-opus-6': { inputPerMillion: 6, outputPerMillion: 30 },
      });
      assert.strictEqual(r.source, 'override');
      assert.deepStrictEqual(r.pricing, { inputPerMillion: 6, outputPerMillion: 30, cacheReadPerMillion: 0.6, cacheCreatePerMillion: 7.5 });
    });

    test('the longest matching key wins and explicit cache rates are kept', () => {
      const r = resolveModelPricing('claude-opus-6-1', MANUAL, undefined, {
        'opus-6': { inputPerMillion: 6, outputPerMillion: 30 },
        'claude-opus-6-1': { inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 0.2 },
      });
      assert.deepStrictEqual([r.pricing.inputPerMillion, r.pricing.cacheReadPerMillion], [5, 0.2]);
    });

    test('invalid overrides are ignored', () => {
      const r = resolveModelPricing('claude-opus-5-5', MANUAL, undefined, {
        'opus-5-5': { inputPerMillion: -1, outputPerMillion: 20 },
      });
      assert.strictEqual(r.source, 'builtin');
    });
  });

  suite('usageCost / pricingSource', () => {
    const usage = tokens({ input_tokens: 1_000_000, output_tokens: 1_000_000 });

    test('prices by model when enabled', () => {
      assert.strictEqual(usageCost(usage, 'claude-opus-5-5', { pricing: DEFAULT_PRICING, useModelPricing: true }), 24);
    });

    test('regression: disabled model pricing equals the pre-model-pricing calculateCost', () => {
      const off: CostOptions = { pricing: MANUAL, useModelPricing: false, modelOverrides: { opus: { inputPerMillion: 1, outputPerMillion: 1 } } };
      for (const model of ['claude-opus-5-5', 'claude-haiku-5-5', '<synthetic>', undefined]) {
        assert.strictEqual(usageCost(usage, model, off), calculateCost(usage, MANUAL));
        assert.strictEqual(pricingSource(model, off), 'manual');
      }
    });

    test('1-hour cache writes are 2x the model input rate', () => {
      const write1h = tokens({ cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000 } });
      assert.strictEqual(usageCost(write1h, 'claude-opus-5-5'), 8);
    });
  });

  suite('published price list (platform.claude.com/docs/en/about-claude/pricing, 2026-10-31)', () => {
    // [model, input, 5m write, 1h write, cache hit, output] — copied from the official table
    const PUBLISHED: Array<[string, number, number, number, number, number]> = [
      ['claude-fable-5-1', 10, 12.50, 20, 0.25, 50],
      ['claude-mythos-5-1', 10, 12.50, 20, 0.25, 50],
      ['claude-fable-5', 10, 12.50, 20, 1, 50],
      ['claude-mythos-5', 10, 12.50, 20, 1, 50],
      ['claude-opus-5-5', 4, 5, 8, 0.20, 20],
      ['claude-opus-5', 5, 6.25, 10, 0.50, 25],
      ['claude-opus-4-8', 5, 6.25, 10, 0.50, 25],
      ['claude-opus-4-7', 5, 6.25, 10, 0.50, 25],
      ['claude-opus-4-6', 5, 6.25, 10, 0.50, 25],
      ['claude-opus-4-5', 5, 6.25, 10, 0.50, 25],
      ['claude-opus-4-1', 15, 18.75, 30, 1.50, 75],
      ['claude-opus-4-20250514', 15, 18.75, 30, 1.50, 75],
      ['claude-sonnet-5-5', 2, 2.50, 4, 0.10, 10],
      ['claude-sonnet-5', 2, 2.50, 4, 0.20, 10],
      ['claude-sonnet-4-6', 3, 3.75, 6, 0.30, 15],
      ['claude-sonnet-4-5', 3, 3.75, 6, 0.30, 15],
      ['claude-sonnet-4-20250514', 3, 3.75, 6, 0.30, 15],
      ['claude-haiku-5-5', 0.10, 0.125, 0.20, 0.01, 0.50],
      ['claude-haiku-4-5', 1, 1.25, 2, 0.10, 5],
      ['claude-3-5-haiku-20241022', 0.80, 1, 1.60, 0.08, 4],
    ];
    // 100K tokens per category: at the Haiku 5.5 threshold, not over it
    const M = 100_000;
    for (const [model, input, write5m, write1h, hit, output] of PUBLISHED) {
      test(model, () => {
        const near = (actual: number, perMTok: number, what: string) =>
          assert.ok(Math.abs(actual - perMTok / 10) < 1e-9, `${model} ${what}: ${actual * 10} != ${perMTok} / MTok`);
        near(usageCost(tokens({ input_tokens: M }), model), input, 'input');
        near(usageCost(tokens({ output_tokens: M }), model), output, 'output');
        near(usageCost(tokens({ cache_read_input_tokens: M }), model), hit, 'cache hit');
        near(usageCost(tokens({ cache_creation_input_tokens: M }), model), write5m, '5m write');
        near(usageCost(tokens({ cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M } }), model), write1h, '1h write');
      });
    }

    test('Haiku 5.5 over 100K prompt tokens', () => {
      // 150K prompt: 50K input + 100K cache read, all at the long-prompt card
      const cost = usageCost(tokens({ input_tokens: 50_000, cache_read_input_tokens: 100_000, output_tokens: 1_000_000 }), 'claude-haiku-5-5');
      assert.ok(Math.abs(cost - (0.05 * 0.50 + 0.1 * 0.05 + 2.50)) < 1e-9, String(cost));
    });
  });

  suite('pricing modifiers', () => {
    const M = 1_000_000;
    test('fast mode doubles every category (Opus 5.5: $8 / $40)', () => {
      assert.strictEqual(usageCost(tokens({ input_tokens: M, output_tokens: M, speed: 'fast' }), 'claude-opus-5-5'), 48);
      assert.strictEqual(usageCost(tokens({ input_tokens: M, output_tokens: M, speed: 'fast' }), 'claude-opus-4-8'), 60);
    });

    test('US-only inference is 1.1x on Claude 4.6+ only', () => {
      const us = tokens({ input_tokens: M, inference_geo: 'us' });
      assert.ok(Math.abs(usageCost(us, 'claude-opus-4-6') - 5.5) < 1e-9);
      const usHaiku = tokens({ input_tokens: 100_000, inference_geo: 'us' });
      assert.ok(Math.abs(usageCost(usHaiku, 'claude-haiku-5-5') - 0.011) < 1e-9);
      assert.strictEqual(usageCost(us, 'claude-opus-4-5'), 5);
      assert.strictEqual(usageCost(tokens({ input_tokens: M, inference_geo: 'global' }), 'claude-opus-4-6'), 5);
    });

    test('modifiers never apply to manual rates or overrides', () => {
      const fast = tokens({ input_tokens: M, speed: 'fast', inference_geo: 'us' });
      assert.strictEqual(pricingMultiplier(fast, 'claude-opus-5-5', 'manual'), 1);
      assert.strictEqual(pricingMultiplier(fast, 'claude-opus-5-5', 'override'), 1);
      assert.strictEqual(usageCost(fast, 'claude-opus-5-5', { pricing: MANUAL, useModelPricing: false }), 7);
    });
  });
});
