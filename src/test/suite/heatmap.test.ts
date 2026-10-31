import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { aggregateByDay, aggregateByDowHour, aggregateByHour, getHeatmapData, EntryForHeatmap } from '../../webview/heatmap';
import { DEFAULT_CLAUDE_HOME, setClaudeHome } from '../../data/claudeHome';

// Helper: create a fake entry at `hoursAgo` hours before now
function makeEntry(hoursAgo: number, cost = 0.01, hour?: number): EntryForHeatmap {
  const ts = Date.now() - hoursAgo * 3600 * 1000;
  return { timestamp: ts, cost, tokens: 1000, hour: hour ?? new Date(ts).getHours() };
}

suite('Heatmap', () => {

  suite('aggregateByDay', () => {
    test('returns exactly `days` entries', () => {
      const result = aggregateByDay([], 90);
      assert.strictEqual(result.length, 90);
    });

    test('fills missing days with zeroes', () => {
      const result = aggregateByDay([], 7);
      for (const d of result) {
        assert.strictEqual(d.cost, 0);
        assert.strictEqual(d.sessionCount, 0);
        assert.strictEqual(d.tokensTotal, 0);
      }
    });

    test('aggregates costs for active days', () => {
      // Anchor to local start-of-today so the test is deterministic at any
      // time of day (hours-ago offsets cross midnight when run before 03:00)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const at = (offsetMs: number, cost: number): EntryForHeatmap => {
        const ts = startOfToday.getTime() + offsetMs;
        return { timestamp: ts, cost, tokens: 1000, hour: new Date(ts).getHours() };
      };
      const entries = [
        at(2 * 3600 * 1000, 0.10),    // today 02:00
        at(3 * 3600 * 1000, 0.20),    // today 03:00
        at(-12 * 3600 * 1000, 0.05),  // yesterday 12:00
      ];
      const result = aggregateByDay(entries, 7);
      const today = result[result.length - 1];
      const yesterday = result[result.length - 2];

      assert.ok(Math.abs(today.cost - 0.30) < 1e-9, `today cost should be ~0.30, got ${today.cost}`);
      assert.strictEqual(today.sessionCount, 2);
      assert.ok(Math.abs(yesterday.cost - 0.05) < 1e-9, `yesterday cost should be ~0.05, got ${yesterday.cost}`);
      assert.strictEqual(yesterday.sessionCount, 1);
    });

    test('dates are in YYYY-MM-DD format', () => {
      const result = aggregateByDay([], 3);
      for (const d of result) {
        assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `Invalid date format: ${d.date}`);
      }
    });

    test('result is in ascending date order', () => {
      const result = aggregateByDay([], 10);
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i].date >= result[i - 1].date,
          `Dates out of order: ${result[i - 1].date} then ${result[i].date}`);
      }
    });
  });

  suite('aggregateByHour', () => {
    test('returns exactly 24 entries', () => {
      const result = aggregateByHour([], 30);
      assert.strictEqual(result.length, 24);
    });

    test('hours are 0-23', () => {
      const result = aggregateByHour([], 30);
      for (let h = 0; h < 24; h++) {
        assert.strictEqual(result[h].hour, h);
      }
    });

    test('avgCost is 0 for hours with no activity', () => {
      const result = aggregateByHour([], 30);
      for (const h of result) {
        assert.strictEqual(h.avgCost, 0);
        assert.strictEqual(h.count, 0);
      }
    });

    test('computes avgCost correctly', () => {
      const entries: EntryForHeatmap[] = [
        { timestamp: Date.now() - 1000, cost: 0.10, tokens: 100, hour: 9 },
        { timestamp: Date.now() - 2000, cost: 0.20, tokens: 100, hour: 9 },
        { timestamp: Date.now() - 3000, cost: 0.30, tokens: 100, hour: 14 },
      ];
      const result = aggregateByHour(entries, 30);
      assert.ok(Math.abs(result[9].avgCost - 0.15) < 1e-9, `hour 9 avg should be 0.15`);
      assert.strictEqual(result[9].count, 2);
      assert.ok(Math.abs(result[14].avgCost - 0.30) < 1e-9, `hour 14 avg should be 0.30`);
      assert.strictEqual(result[14].count, 1);
    });

    test('ignores entries outside the days window', () => {
      const old: EntryForHeatmap = {
        timestamp: Date.now() - 31 * 24 * 3600 * 1000, // 31 days ago
        cost: 99,
        tokens: 1000,
        hour: 0,
      };
      const result = aggregateByHour([old], 30);
      assert.strictEqual(result[0].count, 0);
      assert.strictEqual(result[0].avgCost, 0);
    });
  });
  suite('getHeatmapData', () => {
    let tmpHome: string;

    setup(async () => {
      tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'heatmap-test-'));
      await fs.mkdir(path.join(tmpHome, 'projects', '-proj'), { recursive: true });
      setClaudeHome(tmpHome);
    });

    teardown(async () => {
      setClaudeHome(DEFAULT_CLAUDE_HOME);
      await fs.rm(tmpHome, { recursive: true, force: true });
    });

    test('counts streaming duplicates (shared requestId) once', async () => {
      const line = (requestId: string) => JSON.stringify({
        type: 'assistant',
        timestamp: new Date().toISOString(),
        requestId,
        message: { id: `msg_${requestId}`, model: 'claude-sonnet-4-5', usage: { input_tokens: 1_000_000, output_tokens: 0 } },
      });
      // One API call written as three content-block lines, plus a second call
      await fs.writeFile(path.join(tmpHome, 'projects', '-proj', 's.jsonl'),
        [line('r1'), line('r1'), line('r1'), line('r2')].join('\n') + '\n');

      const data = await getHeatmapData(7);
      const today = data.daily[data.daily.length - 1];
      assert.strictEqual(today.sessionCount, 2);
      assert.ok(Math.abs(today.cost - 6.00) < 1e-9, `expected $6.00, got ${today.cost}`);
    });

    test('applies pricing modifiers recorded on usage (fast mode = 2x)', async () => {
      const entry = (requestId: string, speed?: string) => JSON.stringify({
        type: 'assistant', timestamp: new Date().toISOString(), requestId,
        message: { model: 'claude-opus-5-5', usage: { input_tokens: 1_000_000, output_tokens: 0, ...(speed ? { speed } : {}) } },
      });
      await fs.writeFile(path.join(tmpHome, 'projects', '-proj', 's.jsonl'),
        [entry('standard'), entry('fast', 'fast')].join('\n') + '\n');
      const total = (await getHeatmapData(7)).daily.reduce((s, d) => s + d.cost, 0);
      assert.ok(Math.abs(total - (4 + 8)) < 1e-9, `expected $12, got ${total}`);
    });
  });

  suite('aggregateByDowHour', () => {
    // Build an entry at a fixed local weekday/hour within the last week
    function entryAt(dow: number, hour: number, cost: number): EntryForHeatmap {
      const d = new Date();
      d.setHours(hour, 30, 0, 0);
      // Walk back to the requested day of week (0-6 days ago -> within window)
      const diff = (d.getDay() - dow + 7) % 7;
      d.setDate(d.getDate() - diff);
      if (d.getTime() > Date.now()) { d.setDate(d.getDate() - 7); }
      return { timestamp: d.getTime(), cost, tokens: 100, hour: d.getHours() };
    }

    test('returns a 7x24 grid of zeroes for no entries', () => {
      const grid = aggregateByDowHour([], 30);
      assert.strictEqual(grid.length, 7);
      for (const row of grid) {
        assert.strictEqual(row.length, 24);
        assert.ok(row.every(c => c === 0));
      }
    });

    test('accumulates cost into the correct weekday/hour cell', () => {
      const entries = [
        entryAt(1, 9, 0.10),   // Monday 09:xx
        entryAt(1, 9, 0.20),   // Monday 09:xx
        entryAt(5, 22, 0.05),  // Friday 22:xx
      ];
      const grid = aggregateByDowHour(entries, 30);
      assert.ok(Math.abs(grid[1][9] - 0.30) < 1e-9, `Mon 9h should be 0.30, got ${grid[1][9]}`);
      assert.ok(Math.abs(grid[5][22] - 0.05) < 1e-9, `Fri 22h should be 0.05, got ${grid[5][22]}`);
      const total = grid.flat().reduce((s, c) => s + c, 0);
      assert.ok(Math.abs(total - 0.35) < 1e-9, 'no cost should leak into other cells');
    });

    test('ignores entries outside the days window', () => {
      const old: EntryForHeatmap = {
        timestamp: Date.now() - 31 * 24 * 3600 * 1000,
        cost: 99,
        tokens: 100,
        hour: 0,
      };
      const grid = aggregateByDowHour([old], 30);
      assert.ok(grid.flat().every(c => c === 0));
    });
  });
});

