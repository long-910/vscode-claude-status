import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readUsageRecords, clearUsageIndex, firstSeen, parseUsageLine, INDEX_RETENTION_MS } from '../../data/usageIndex';

suite('UsageIndex', () => {
  let tmpFile: string;
  const since = () => Date.now() - INDEX_RETENTION_MS;

  const entry = (requestId: string, input = 10, ageMs = 0) => JSON.stringify({
    type: 'assistant',
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    requestId,
    message: { id: `msg_${requestId}`, content: 'x', usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }) + '\n';

  setup(() => {
    clearUsageIndex();
    tmpFile = path.join(os.tmpdir(), `usageIndex-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  });

  teardown(async () => {
    clearUsageIndex();
    try { await fs.unlink(tmpFile); } catch { /* ignore */ }
  });

  test('reads assistant usage entries', async () => {
    await fs.writeFile(tmpFile, entry('r1', 10) + '{"type":"user"}\n' + 'not json\n' + entry('r2', 20));
    const records = await readUsageRecords([tmpFile], since());
    assert.deepStrictEqual(records.map(r => r.usage.input_tokens), [10, 20]);
  });

  test('picks up appended lines and dedupes across appends', async () => {
    await fs.writeFile(tmpFile, entry('r1', 10));
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 1);

    // Streaming duplicate of r1 plus a new request
    await fs.appendFile(tmpFile, entry('r1', 10) + entry('r2', 20));
    const records = await readUsageRecords([tmpFile], since());
    assert.deepStrictEqual(records.map(r => r.usage.input_tokens), [10, 20]);
  });

  test('defers a partially written trailing line until it is complete', async () => {
    const line = entry('r1', 10);
    await fs.writeFile(tmpFile, line.slice(0, 20));
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 0);

    await fs.appendFile(tmpFile, line.slice(20));
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 1);
  });

  test('counts a complete final line without a trailing newline', async () => {
    await fs.writeFile(tmpFile, entry('r1', 10).trimEnd());
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 1);
    // ... exactly once
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 1);
  });

  test('re-reads from the start when the file shrinks', async () => {
    await fs.writeFile(tmpFile, entry('r1', 10) + entry('r2', 20));
    assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 2);

    await fs.writeFile(tmpFile, entry('r3', 30));
    const records = await readUsageRecords([tmpFile], since());
    assert.deepStrictEqual(records.map(r => r.usage.input_tokens), [30]);
  });

  test('filters by sinceMs and drops entries older than retention', async () => {
    const hour = 3600 * 1000;
    await fs.writeFile(tmpFile, entry('old', 1, INDEX_RETENTION_MS + hour) + entry('mid', 2, 2 * hour) + entry('new', 3));
    assert.deepStrictEqual((await readUsageRecords([tmpFile], since())).map(r => r.usage.input_tokens), [2, 3]);
    assert.deepStrictEqual((await readUsageRecords([tmpFile], Date.now() - hour)).map(r => r.usage.input_tokens), [3]);
  });

  test('concurrent callers do not double count', async () => {
    await fs.writeFile(tmpFile, entry('r1') + entry('r2') + entry('r3'));
    const [a, b] = await Promise.all([
      readUsageRecords([tmpFile], since()),
      readUsageRecords([tmpFile], since()),
    ]);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(b.length, 3);
  });

  test('handles multi-byte characters split across chunk boundaries', async () => {
    // Pad the first line past the 1 MiB read chunk with multi-byte characters
    const big = JSON.stringify({ type: 'user', text: 'あ'.repeat(400_000) }) + '\n';
    await fs.writeFile(tmpFile, big + entry('r1', 7));
    const records = await readUsageRecords([tmpFile], since());
    assert.deepStrictEqual(records.map(r => r.usage.input_tokens), [7]);
  });

  test('returns [] for a missing file', async () => {
    const records = await readUsageRecords([path.join(os.tmpdir(), 'does-not-exist-usage-index.jsonl')], since());
    assert.deepStrictEqual(records, []);
  });
  test('keeps message.model on each record', async () => {
    await fs.writeFile(tmpFile, JSON.stringify({
      type: 'assistant', timestamp: new Date().toISOString(), requestId: 'r1',
      message: { model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1 } },
    }) + '\n');
    const [record] = await readUsageRecords([tmpFile], since());
    assert.strictEqual(record.model, 'claude-opus-5-5');
  });

  test('keeps pricing modifiers (speed, inference_geo) only when present', async () => {
    const rec = (requestId: string, extra: Record<string, unknown>) => JSON.stringify({
      type: 'assistant', timestamp: new Date().toISOString(), requestId,
      message: { model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1, ...extra } },
    }) + '\n';
    await fs.writeFile(tmpFile, rec('a', { speed: 'fast', inference_geo: 'us' }) + rec('b', {}));
    const [a, b] = await readUsageRecords([tmpFile], since());
    assert.strictEqual(a.usage.speed, 'fast');
    assert.strictEqual(a.usage.inference_geo, 'us');
    assert.ok(!('speed' in b.usage) && !('inference_geo' in b.usage));
  });

  suite('parseUsageLine / firstSeen (shared with the heatmap)', () => {
    const usage = { input_tokens: 5, output_tokens: 2 };
    const ts = new Date().toISOString();

    test('dedupe key: requestId, falling back to message.id, else none', () => {
      assert.strictEqual(parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: ts, requestId: 'r', message: { id: 'm', usage } }))?.dedupeKey, 'r');
      assert.strictEqual(parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: ts, message: { id: 'm', usage } }))?.dedupeKey, 'm');
      assert.strictEqual(parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: ts, message: { usage } }))?.dedupeKey, null);
    });

    test('skips non-assistant, malformed and usage-less lines', () => {
      assert.strictEqual(parseUsageLine('{"type":"user","timestamp":"x"}'), null);
      assert.strictEqual(parseUsageLine('not json'), null);
      assert.strictEqual(parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: ts, message: { id: 'm' } }))?.record, null);
      assert.strictEqual(parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: 'bad', message: { usage } }))?.record, null);
    });

    test('normalizes missing token fields to 0 and keeps model', () => {
      const r = parseUsageLine(JSON.stringify({ type: 'assistant', timestamp: ts, message: { model: 'claude-opus-5-5', usage: { output_tokens: 3 } } }))?.record;
      assert.deepStrictEqual([r?.usage.input_tokens, r?.usage.output_tokens, r?.usage.cache_read_input_tokens, r?.model], [0, 3, 0, 'claude-opus-5-5']);
    });

    test('firstSeen dedupes keyed lines and always counts keyless ones', () => {
      const seen = new Set<string>();
      assert.deepStrictEqual([firstSeen(seen, 'a'), firstSeen(seen, 'a'), firstSeen(seen, null), firstSeen(seen, null)], [true, false, true, true]);
    });

    test('streaming duplicates sharing message.id (no requestId) count once', async () => {
      const line = JSON.stringify({ type: 'assistant', timestamp: ts, message: { id: 'msg_x', usage } }) + '\n';
      await fs.writeFile(tmpFile, line + line + line);
      assert.strictEqual((await readUsageRecords([tmpFile], since())).length, 1);
    });
  });
});
