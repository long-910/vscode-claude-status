import * as assert from 'assert';
import { dailyUsageToCsv, dailyUsageToJson } from '../../data/exportUsage';
import type { DailyUsage } from '../../webview/heatmap';

const sample: DailyUsage[] = [
  { date: '2026-07-05', cost: 1.23456, sessionCount: 12, tokensTotal: 45000 },
  { date: '2026-07-06', cost: 0, sessionCount: 0, tokensTotal: 0 },
  { date: '2026-07-07', cost: 2.5, sessionCount: 3, tokensTotal: 9000 },
];

suite('ExportUsage', () => {
  suite('dailyUsageToCsv', () => {
    test('emits header plus one row per day, newline-terminated', () => {
      const csv = dailyUsageToCsv(sample);
      const lines = csv.split('\n');
      assert.strictEqual(lines[0], 'date,cost_usd,messages,tokens');
      assert.strictEqual(lines.length, 5, 'header + 3 rows + trailing newline');
      assert.strictEqual(lines[4], '');
    });

    test('formats cost with 4 decimal places', () => {
      const csv = dailyUsageToCsv(sample);
      assert.ok(csv.includes('2026-07-05,1.2346,12,45000'), csv);
      assert.ok(csv.includes('2026-07-06,0.0000,0,0'), csv);
    });

    test('handles empty input', () => {
      assert.strictEqual(dailyUsageToCsv([]), 'date,cost_usd,messages,tokens\n');
    });
  });

  suite('dailyUsageToJson', () => {
    test('round-trips through JSON.parse with expected shape', () => {
      const parsed = JSON.parse(dailyUsageToJson(sample));
      assert.strictEqual(parsed.days, 3);
      assert.strictEqual(parsed.daily.length, 3);
      assert.deepStrictEqual(parsed.daily[0], {
        date: '2026-07-05',
        costUsd: 1.2346,
        messages: 12,
        tokens: 45000,
      });
      assert.ok(!isNaN(new Date(parsed.exportedAt).getTime()), 'exportedAt is a valid date');
    });

    test('totalCostUsd sums all days', () => {
      const parsed = JSON.parse(dailyUsageToJson(sample));
      assert.strictEqual(parsed.totalCostUsd, 3.7346);
    });

    test('handles empty input', () => {
      const parsed = JSON.parse(dailyUsageToJson([]));
      assert.strictEqual(parsed.days, 0);
      assert.strictEqual(parsed.totalCostUsd, 0);
      assert.deepStrictEqual(parsed.daily, []);
    });
  });
});
