import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { calculateCost, forEachJsonlLine } from '../../data/jsonlReader';

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
  });
});
