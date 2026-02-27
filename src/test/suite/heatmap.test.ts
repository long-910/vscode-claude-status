import * as assert from 'assert';
import { aggregateByDay, aggregateByHour, EntryForHeatmap } from '../../webview/heatmap';

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
      const entries = [
        makeEntry(2, 0.10),   // 2 hours ago → today
        makeEntry(3, 0.20),   // 3 hours ago → today
        makeEntry(25, 0.05),  // 25 hours ago → yesterday
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
});
