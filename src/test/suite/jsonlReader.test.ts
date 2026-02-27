import * as assert from 'assert';
import { calculateCost } from '../../data/jsonlReader';

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
});
