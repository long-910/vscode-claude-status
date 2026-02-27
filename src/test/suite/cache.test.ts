import * as assert from 'assert';
import { isCacheValid, getCacheAge } from '../../data/cache';

// Minimal CacheFile shape for testing (without importing private type)
interface TestCacheFile {
  version: 2
  updatedAt: string
  usageData: {
    utilization5h: number
    utilization7d: number
    reset5hAt: number
    reset7dAt: number
    limitStatus: string
  }
}

function makeCache(ageSeconds: number): TestCacheFile {
  const updatedAt = new Date(Date.now() - ageSeconds * 1000).toISOString();
  const nowSec = Date.now() / 1000;
  return {
    version: 2,
    updatedAt,
    usageData: {
      utilization5h: 0.5,
      utilization7d: 0.3,
      reset5hAt: nowSec + 1800,
      reset7dAt: nowSec + 86400,
      limitStatus: 'allowed',
    },
  };
}

suite('Cache', () => {
  test('isCacheValid returns true when cache is fresh', () => {
    const cache = makeCache(100) as Parameters<typeof isCacheValid>[0];
    assert.strictEqual(isCacheValid(cache, 300), true);
  });

  test('isCacheValid returns false when cache is stale', () => {
    const cache = makeCache(400) as Parameters<typeof isCacheValid>[0];
    assert.strictEqual(isCacheValid(cache, 300), false);
  });

  test('isCacheValid returns false exactly at boundary', () => {
    const cache = makeCache(300) as Parameters<typeof isCacheValid>[0];
    assert.strictEqual(isCacheValid(cache, 300), false);
  });

  test('getCacheAge returns approximate age in seconds', () => {
    const cache = makeCache(120) as Parameters<typeof getCacheAge>[0];
    const age = getCacheAge(cache);
    assert.ok(age >= 119 && age <= 125, `Expected ~120s, got ${age}`);
  });
});
