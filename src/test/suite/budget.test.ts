import * as assert from 'assert';
import { BudgetAlertTracker, budgetPeriodKey, budgetThresholdReached } from '../../data/budget';
import { localDateKey, startOfMonth } from '../../data/localTime';

suite('Budget', () => {
  test('startOfMonth is local midnight on the 1st', () => {
    const start = new Date(startOfMonth(new Date(2026, 9, 31, 23, 59)));
    assert.deepStrictEqual([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()], [2026, 9, 1, 0, 0]);
    assert.strictEqual(startOfMonth(new Date(2026, 0, 1, 0, 0)), new Date(2026, 0, 1).getTime());
  });

  test('localDateKey is the local calendar date', () => {
    assert.strictEqual(localDateKey(new Date(2026, 0, 2, 0, 30)), '2026-01-02');
    assert.strictEqual(localDateKey(new Date(2026, 11, 31, 23, 59).getTime()), '2026-12-31');
  });

  test('budgetPeriodKey uses the local calendar', () => {
    assert.strictEqual(budgetPeriodKey('day', new Date(2026, 9, 5, 23, 59)), '2026-10-05');
    assert.strictEqual(budgetPeriodKey('month', new Date(2026, 9, 5)), '2026-10');
  });

  test('budgetThresholdReached', () => {
    assert.strictEqual(budgetThresholdReached(79.9, 100, 80), false);
    assert.strictEqual(budgetThresholdReached(80, 100, 80), true);
    assert.strictEqual(budgetThresholdReached(500, null, 80), false, 'no budget');
    assert.strictEqual(budgetThresholdReached(500, 0, 80), false, 'zero budget is disabled');
  });

  suite('BudgetAlertTracker', () => {
    test('shows each alert once per calendar period', () => {
      const t = new BudgetAlertTracker();
      assert.strictEqual(t.shouldShow('month', new Date(2026, 9, 3)), true);
      assert.strictEqual(t.shouldShow('month', new Date(2026, 9, 28)), false, 'same month');
      assert.strictEqual(t.shouldShow('month', new Date(2026, 10, 1)), true, 'next month');
      assert.strictEqual(t.shouldShow('day', new Date(2026, 9, 3, 9)), true);
      assert.strictEqual(t.shouldShow('day', new Date(2026, 9, 3, 18)), false, 'same day');
    });

    test('regression: the daily alert re-arms on a new day (pay-as-you-go has no window resets)', () => {
      const t = new BudgetAlertTracker();
      assert.strictEqual(t.shouldShow('day', new Date(2026, 9, 3, 23)), true);
      assert.strictEqual(t.shouldShow('day', new Date(2026, 9, 4, 1)), true);
    });

    test('rearm re-arms only the given kind (window reset keeps the old daily behaviour)', () => {
      const t = new BudgetAlertTracker();
      const now = new Date(2026, 9, 3, 12);
      t.shouldShow('day', now);
      t.shouldShow('month', now);
      t.rearm('day');
      assert.strictEqual(t.shouldShow('day', now), true);
      assert.strictEqual(t.shouldShow('month', now), false, 'monthly alert stays once a month');
    });
  });
});
