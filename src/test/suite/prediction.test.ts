import * as assert from 'assert';
import { calculateBurnRate, buildRecommendation } from '../../data/prediction';

suite('Prediction', () => {
  suite('calculateBurnRate', () => {
    test('returns 0 with fewer than 2 entries', () => {
      assert.strictEqual(calculateBurnRate([]), 0);
      assert.strictEqual(calculateBurnRate([{ timestamp: Date.now(), cost: 1 }]), 0);
    });

    test('returns positive rate for 2+ entries', () => {
      const now = Date.now();
      const entries = [
        { timestamp: now - 1800_000, cost: 0.10 }, // 30 min ago
        { timestamp: now - 900_000,  cost: 0.10 }, // 15 min ago
      ];
      const rate = calculateBurnRate(entries);
      // 0.20 USD over 30 min = 0.40 USD/hr
      assert.ok(rate > 0, 'Burn rate should be positive');
      assert.ok(rate < 1.0, 'Burn rate should be reasonable');
    });
  });

  suite('buildRecommendation', () => {
    test('critical < 600s', () => {
      const msg = buildRecommendation(300);
      assert.ok(msg.includes('10 min'), `Expected 10 min warning, got: ${msg}`);
    });

    test('warning < 1800s', () => {
      const msg = buildRecommendation(1200);
      assert.ok(msg.includes('30 min'), `Expected 30 min warning, got: ${msg}`);
    });

    test('caution < 3600s', () => {
      const msg = buildRecommendation(2700);
      assert.ok(msg.includes('1 hour'), `Expected 1 hour caution, got: ${msg}`);
    });

    test('safe >= 3600s', () => {
      const msg = buildRecommendation(7200);
      assert.ok(msg.includes('Plenty'), `Expected safe message, got: ${msg}`);
    });
  });
});
