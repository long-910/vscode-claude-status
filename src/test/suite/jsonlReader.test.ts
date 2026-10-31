import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { calculateCost, forEachJsonlLine, readJsonlFile, resolveModelPricing, usageCost, DEFAULT_PRICING, TokenUsage } from '../../data/jsonlReader';

suite('JsonlReader', () => {
  test('calculateCost returns 0 for zero tokens', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    assert.strictEqual(cost, 0);
  });

  test('calculateCost uses correct pricing for input tokens', () => {
    const cost = calculateCost({
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    assert.strictEqual(cost, 3.00);
  });

  test('calculateCost uses correct pricing for output tokens', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    assert.strictEqual(cost, 15.00);
  });

  test('calculateCost uses correct pricing for cache read tokens', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
    });
    assert.strictEqual(cost, 0.30);
  });

  test('calculateCost uses correct pricing for cache creation tokens', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    assert.strictEqual(cost, 3.75);
  });

  test('calculateCost sums all token types', () => {
    const cost = calculateCost({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    assert.strictEqual(cost, 3.00 + 15.00 + 0.30 + 3.75);
  });

  test('calculateCost prices 1-hour TTL cache writes at 2x input', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 0,
        ephemeral_1h_input_tokens: 1_000_000,
      },
    });
    assert.strictEqual(cost, 6.00);
  });

  test('calculateCost splits a mixed cache-creation bucket by TTL', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 400_000,
        ephemeral_1h_input_tokens: 600_000,
      },
    });
    assert.strictEqual(cost, 0.4 * 3.75 + 0.6 * 6.00);
  });

  test('calculateCost keeps the whole bucket at the 5-minute rate without a breakdown', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    assert.strictEqual(cost, 3.75);
  });

  test('calculateCost clamps a 1-hour count that exceeds the aggregate', () => {
    const cost = calculateCost({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 5_000_000 },
    });
    assert.strictEqual(cost, 6.00);
  });

  test('calculateCost respects custom pricing for 1-hour cache writes', () => {
    const cost = calculateCost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      },
      {
        inputPerMillion: 1.00,
        outputPerMillion: 5.00,
        cacheReadPerMillion: 0.10,
        cacheCreatePerMillion: 1.25,
      }
    );
    assert.strictEqual(cost, 2.00);
  });

  suite('model-aware pricing', () => {
    const mtok = (fields: Partial<TokenUsage>): TokenUsage => ({
      input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...fields,
    });
    const inOut = (model: string) => {
      const p = resolveModelPricing(model, DEFAULT_PRICING);
      return [p.inputPerMillion, p.outputPerMillion];
    };

    test('resolves each model family to its published rate', () => {
      assert.deepStrictEqual(inOut('claude-fable-5-1'), [10, 50]);
      assert.deepStrictEqual(inOut('claude-fable-5'), [10, 50]);
      assert.deepStrictEqual(inOut('claude-opus-5-5'), [4, 20]);
      assert.deepStrictEqual(inOut('claude-opus-5'), [5, 25]);
      assert.deepStrictEqual(inOut('claude-opus-4-5-20251101'), [5, 25]);
      assert.deepStrictEqual(inOut('claude-sonnet-5-5'), [2, 10]);
      assert.deepStrictEqual(inOut('claude-sonnet-4-5-20250929'), [3, 15]);
      assert.deepStrictEqual(inOut('claude-3-5-sonnet-20241022'), [3, 15]);
      assert.deepStrictEqual(inOut('claude-haiku-5-5'), [0.10, 0.50]);
      assert.deepStrictEqual(inOut('claude-haiku-4-5-20251001'), [1, 5]);
      assert.deepStrictEqual(inOut('claude-3-5-haiku-20241022'), [0.80, 4]);
    });

    test('legacy Opus (3, 4.0, 4.1) matches before generic Opus', () => {
      assert.deepStrictEqual(inOut('claude-3-opus-20240229'), [15, 75]);
      assert.deepStrictEqual(inOut('claude-opus-4-20250514'), [15, 75]);
      assert.deepStrictEqual(inOut('claude-opus-4-1-20250805'), [15, 75]);
    });

    test('model-specific cache-read rates', () => {
      assert.strictEqual(resolveModelPricing('claude-fable-5-1', DEFAULT_PRICING).cacheReadPerMillion, 0.25);
      assert.strictEqual(resolveModelPricing('claude-opus-5-5', DEFAULT_PRICING).cacheReadPerMillion, 0.20);
      assert.strictEqual(resolveModelPricing('claude-sonnet-5-5', DEFAULT_PRICING).cacheReadPerMillion, 0.20);
    });

    test('Haiku 5.5 switches to the long-prompt rate card above 100K prompt tokens', () => {
      const short = resolveModelPricing('claude-haiku-5-5', DEFAULT_PRICING, mtok({ input_tokens: 50_000, cache_read_input_tokens: 50_000 }));
      const long = resolveModelPricing('claude-haiku-5-5', DEFAULT_PRICING, mtok({ input_tokens: 1_000, cache_read_input_tokens: 100_000 }));
      assert.strictEqual(short.inputPerMillion, 0.10);
      assert.strictEqual(long.inputPerMillion, 0.50);
      assert.strictEqual(long.outputPerMillion, 2.50);
    });

    test('unknown or missing models fall back to the manual rates', () => {
      const manual = { inputPerMillion: 7, outputPerMillion: 8, cacheReadPerMillion: 0.7, cacheCreatePerMillion: 8.75 };
      assert.strictEqual(resolveModelPricing('<synthetic>', manual), manual);
      assert.strictEqual(resolveModelPricing(undefined, manual), manual);
    });

    test('usageCost honours the useModelPricing toggle', () => {
      const usage = mtok({ input_tokens: 1_000_000, output_tokens: 1_000_000 });
      assert.strictEqual(usageCost(usage, 'claude-opus-5-5', { pricing: DEFAULT_PRICING, useModelPricing: true }), 24);
      assert.strictEqual(usageCost(usage, 'claude-opus-5-5', { pricing: DEFAULT_PRICING, useModelPricing: false }), 18);
    });

    test('1-hour cache writes are 2x the model input rate', () => {
      const usage = mtok({ cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000 } });
      assert.strictEqual(usageCost(usage, 'claude-opus-5-5'), 8);
    });

    test('readJsonlFile keeps message.model', async () => {
      const tmp = path.join(os.tmpdir(), `jsonlReader-model-${Date.now()}.jsonl`);
      await fs.writeFile(tmp, JSON.stringify({
        type: 'assistant', timestamp: new Date().toISOString(), requestId: 'r',
        message: { id: 'm', model: 'claude-haiku-4-5', usage: { input_tokens: 1, output_tokens: 1 } },
      }) + '\n');
      try {
        const entries = await readJsonlFile(tmp);
        assert.strictEqual(entries[0].message?.model, 'claude-haiku-4-5');
      } finally {
        await fs.unlink(tmp).catch(() => {});
      }
    });
  });

  suite('readJsonlFile deduplication', () => {
    let tmpFile: string;

    setup(async () => {
      tmpFile = path.join(os.tmpdir(), `jsonlReader-test-${Date.now()}.jsonl`);
    });

    teardown(async () => {
      try { await fs.unlink(tmpFile); } catch { /* ignore */ }
    });

    test('deduplicates entries sharing the same requestId', async () => {
      const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const entry = (uuid: string) => JSON.stringify({
        type: 'assistant',
        uuid,
        timestamp: new Date().toISOString(),
        requestId: 'req_abc123',
        message: { id: 'msg_xyz', usage },
      });
      await fs.writeFile(tmpFile, [entry('uuid-1'), entry('uuid-2'), entry('uuid-3')].join('\n'));

      const entries = await readJsonlFile(tmpFile);
      assert.strictEqual(entries.length, 1, 'should deduplicate to 1 entry per requestId');
    });

    test('deduplicates entries sharing the same message id when requestId absent', async () => {
      const usage = { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const entry = (uuid: string) => JSON.stringify({
        type: 'assistant',
        uuid,
        timestamp: new Date().toISOString(),
        message: { id: 'msg_dedup_fallback', usage },
      });
      await fs.writeFile(tmpFile, [entry('uuid-a'), entry('uuid-b')].join('\n'));

      const entries = await readJsonlFile(tmpFile);
      assert.strictEqual(entries.length, 1, 'should deduplicate to 1 entry per message id');
    });

    test('keeps distinct entries from different requestIds', async () => {
      const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const makeEntry = (requestId: string, uuid: string) => JSON.stringify({
        type: 'assistant', uuid, timestamp: new Date().toISOString(), requestId, message: { id: `msg_${requestId}`, usage },
      });
      await fs.writeFile(tmpFile, [makeEntry('req_1', 'u1'), makeEntry('req_2', 'u2')].join('\n'));

      const entries = await readJsonlFile(tmpFile);
      assert.strictEqual(entries.length, 2, 'distinct requestIds should produce 2 entries');
    });

    test('includes entries without requestId or message id (no key to deduplicate)', async () => {
      const usage = { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const entry = (uuid: string) => JSON.stringify({
        type: 'assistant', uuid, timestamp: new Date().toISOString(), message: { usage },
      });
      await fs.writeFile(tmpFile, [entry('u1'), entry('u2')].join('\n'));

      const entries = await readJsonlFile(tmpFile);
      assert.strictEqual(entries.length, 2, 'entries without dedup key should all be included');
    });
  });

  suite('forEachJsonlLine', () => {
    let tmpFile: string;

    setup(async () => {
      tmpFile = path.join(os.tmpdir(), `jsonlReader-lines-${Date.now()}.jsonl`);
    });

    teardown(async () => {
      try { await fs.unlink(tmpFile); } catch { /* ignore */ }
    });

    test('yields trimmed non-empty lines, handling CRLF', async () => {
      await fs.writeFile(tmpFile, '{"a":1}\r\n\r\n  {"b":2}  \n\n{"c":3}');
      const lines: string[] = [];
      await forEachJsonlLine(tmpFile, line => { lines.push(line); });
      assert.deepStrictEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}']);
    });

    test('stops reading when the callback returns false', async () => {
      await fs.writeFile(tmpFile, ['1', '2', '3', '4'].join('\n'));
      const lines: string[] = [];
      await forEachJsonlLine(tmpFile, line => { lines.push(line); return lines.length < 2; });
      assert.deepStrictEqual(lines, ['1', '2']);
    });

    test('rejects for a missing file', async () => {
      await assert.rejects(forEachJsonlLine(path.join(os.tmpdir(), 'does-not-exist-claude-status.jsonl'), () => {}));
    });

    test('readJsonlFile returns [] for a missing file', async () => {
      const entries = await readJsonlFile(path.join(os.tmpdir(), 'does-not-exist-claude-status.jsonl'));
      assert.deepStrictEqual(entries, []);
    });
  });
});
