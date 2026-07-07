import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  calculateCost, entryCost, findAllJsonlFiles, readJsonlFile, readUsageEntries,
  resolveModelPricing, wasJsonlUpdatedRecently, DEFAULT_PRICING, UsageEntry,
} from '../../data/jsonlReader';

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

  suite('readUsageEntries (shared deduplicated reader)', () => {
    let tmpFile: string;

    setup(async () => {
      tmpFile = path.join(os.tmpdir(), `usageEntries-test-${Date.now()}.jsonl`);
    });

    teardown(async () => {
      try { await fs.unlink(tmpFile); } catch { /* ignore */ }
    });

    test('deduplicates streaming entries sharing the same requestId', async () => {
      const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const entry = (uuid: string) => JSON.stringify({
        type: 'assistant',
        uuid,
        timestamp: new Date().toISOString(),
        requestId: 'req_shared',
        message: { id: 'msg_1', usage },
      });
      await fs.writeFile(tmpFile, [entry('u1'), entry('u2'), entry('u3')].join('\n'));

      const entries = await readUsageEntries(tmpFile);
      assert.strictEqual(entries.length, 1, 'should count each API call exactly once');
      assert.strictEqual(entries[0].usage.input_tokens, 100);
    });

    test('normalizes missing usage fields to 0 and parses timestamp to ms', async () => {
      const iso = '2026-01-15T10:00:00.000Z';
      await fs.writeFile(tmpFile, JSON.stringify({
        type: 'assistant',
        timestamp: iso,
        requestId: 'req_1',
        cwd: '/home/user/my-app',
        message: { usage: { input_tokens: 10, output_tokens: 5 } },
      }));

      const entries = await readUsageEntries(tmpFile);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].timestamp, new Date(iso).getTime());
      assert.strictEqual(entries[0].usage.cache_read_input_tokens, 0);
      assert.strictEqual(entries[0].usage.cache_creation_input_tokens, 0);
      assert.strictEqual(entries[0].cwd, '/home/user/my-app');
    });

    test('skips entries without usage or with invalid timestamps', async () => {
      const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      await fs.writeFile(tmpFile, [
        JSON.stringify({ type: 'assistant', timestamp: 'not-a-date', requestId: 'r1', message: { usage } }),
        JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), requestId: 'r2', message: {} }),
        JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), requestId: 'r3', message: { usage } }),
      ].join('\n'));

      const entries = await readUsageEntries(tmpFile);
      assert.strictEqual(entries.length, 1, 'only the valid entry should remain');
    });

    test('returns empty array for missing file', async () => {
      const entries = await readUsageEntries(path.join(os.tmpdir(), 'does-not-exist.jsonl'));
      assert.deepStrictEqual(entries, []);
    });
  });

  suite('model-aware pricing', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const entryFor = (model?: string): UsageEntry => ({ timestamp: Date.now(), usage, model });

    test('resolves Opus 4.5+ rates', () => {
      const p = resolveModelPricing('claude-opus-4-5-20251101', DEFAULT_PRICING);
      assert.strictEqual(p.inputPerMillion, 5.00);
      assert.strictEqual(p.outputPerMillion, 25.00);
    });

    test('resolves legacy Opus (4.1 and older) rates', () => {
      for (const m of ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-3-opus-20240229']) {
        const p = resolveModelPricing(m, DEFAULT_PRICING);
        assert.strictEqual(p.inputPerMillion, 15.00, m);
        assert.strictEqual(p.outputPerMillion, 75.00, m);
      }
    });

    test('resolves Sonnet and Haiku rates', () => {
      assert.strictEqual(resolveModelPricing('claude-sonnet-4-5-20250929', DEFAULT_PRICING).inputPerMillion, 3.00);
      assert.strictEqual(resolveModelPricing('claude-haiku-4-5-20251001', DEFAULT_PRICING).inputPerMillion, 1.00);
      assert.strictEqual(resolveModelPricing('claude-haiku-4-5-20251001', DEFAULT_PRICING).cacheReadPerMillion, 0.10);
    });

    test('falls back to provided pricing for unknown or missing model', () => {
      const custom = { inputPerMillion: 9, outputPerMillion: 9, cacheReadPerMillion: 9, cacheCreatePerMillion: 9 };
      assert.deepStrictEqual(resolveModelPricing('<synthetic>', custom), custom);
      assert.deepStrictEqual(resolveModelPricing(undefined, custom), custom);
    });

    test('entryCost uses model rates when enabled and manual rates when disabled', () => {
      const opts = { pricing: DEFAULT_PRICING, useModelPricing: true };
      assert.strictEqual(entryCost(entryFor('claude-haiku-4-5-20251001'), opts), 1.00);
      assert.strictEqual(entryCost(entryFor('claude-opus-4-6'), opts), 5.00);
      const manual = { pricing: DEFAULT_PRICING, useModelPricing: false };
      assert.strictEqual(entryCost(entryFor('claude-haiku-4-5-20251001'), manual), 3.00);
    });

    test('readUsageEntries surfaces the model field', async () => {
      const tmpFile = path.join(os.tmpdir(), `model-test-${Date.now()}.jsonl`);
      try {
        await fs.writeFile(tmpFile, JSON.stringify({
          type: 'assistant',
          timestamp: new Date().toISOString(),
          requestId: 'r1',
          message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 1, output_tokens: 1 } },
        }));
        const entries = await readUsageEntries(tmpFile);
        assert.strictEqual(entries[0].model, 'claude-sonnet-4-5-20250929');
      } finally {
        await fs.unlink(tmpFile).catch(() => {});
      }
    });
  });

  suite('findAllJsonlFiles mtime filter', () => {
    let tmpHome: string;
    let savedHome: string | undefined;
    let savedUserProfile: string | undefined;
    let freshFile: string;
    let oldFile: string;

    setup(async () => {
      tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-home-'));
      // os.homedir() resolves HOME (POSIX) / USERPROFILE (Windows)
      savedHome = process.env.HOME;
      savedUserProfile = process.env.USERPROFILE;
      process.env.HOME = tmpHome;
      process.env.USERPROFILE = tmpHome;

      const projectDir = path.join(tmpHome, '.claude', 'projects', '-test-project');
      await fs.mkdir(projectDir, { recursive: true });
      freshFile = path.join(projectDir, 'fresh.jsonl');
      oldFile = path.join(projectDir, 'old.jsonl');
      await fs.writeFile(freshFile, '');
      await fs.writeFile(oldFile, '');
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
      await fs.utimes(oldFile, tenDaysAgo, tenDaysAgo);
    });

    teardown(async () => {
      if (savedHome === undefined) { delete process.env.HOME; } else { process.env.HOME = savedHome; }
      if (savedUserProfile === undefined) { delete process.env.USERPROFILE; } else { process.env.USERPROFILE = savedUserProfile; }
      await fs.rm(tmpHome, { recursive: true, force: true });
    });

    test('returns all files when no cutoff is given', async () => {
      const files = await findAllJsonlFiles();
      assert.deepStrictEqual(files.sort(), [freshFile, oldFile].sort());
    });

    test('skips files whose mtime is older than the cutoff', async () => {
      const files = await findAllJsonlFiles(Date.now() - 8 * 24 * 3600 * 1000);
      assert.deepStrictEqual(files, [freshFile]);
    });

    test('wasJsonlUpdatedRecently reflects the freshest file', async () => {
      assert.strictEqual(await wasJsonlUpdatedRecently(300), true);
      const old = new Date(Date.now() - 3600 * 1000);
      await fs.utimes(freshFile, old, old);
      assert.strictEqual(await wasJsonlUpdatedRecently(300), false);
    });
  });
});
