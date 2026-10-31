import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readAllUsage } from '../../data/jsonlReader';
import { calculateCost, CostOptions, DEFAULT_COST_OPTIONS, DEFAULT_PRICING } from '../../data/pricing';
import { clearUsageIndex } from '../../data/usageIndex';
import { computePrediction } from '../../data/prediction';
import { getHeatmapData } from '../../webview/heatmap';
import { DataManager } from '../../data/dataManager';
import { DEFAULT_CLAUDE_HOME, setClaudeHome } from '../../data/claudeHome';

// Regression tests: every cost consumer must price entries the same way and
// honour the pricing settings (prediction and heatmap used to ignore them).

const MANUAL = { inputPerMillion: 7, outputPerMillion: 8, cacheReadPerMillion: 0.7, cacheCreatePerMillion: 8.75 };
const MANUAL_ONLY: CostOptions = { pricing: MANUAL, useModelPricing: false };
const USAGE = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function line(requestId: string, model: string, ageMs: number): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: new Date(Date.now() - ageMs).toISOString(),
    requestId,
    message: { id: `msg_${requestId}`, model, usage: USAGE },
  });
}

suite('Cost options (regression)', () => {
  let home: string;
  let file: string;

  setup(async () => {
    clearUsageIndex();
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'cost-options-'));
    const dir = path.join(home, 'projects', '-proj');
    await fs.mkdir(dir, { recursive: true });
    file = path.join(dir, 's.jsonl');
    // Two Opus 5.5 calls 10 and 20 minutes ago (one written twice, as streaming does)
    await fs.writeFile(file, [
      line('r1', 'claude-opus-5-5', 20 * 60e3),
      line('r1', 'claude-opus-5-5', 20 * 60e3),
      line('r2', 'claude-opus-5-5', 10 * 60e3),
    ].join('\n') + '\n');
    setClaudeHome(home);
  });

  teardown(async () => {
    setClaudeHome(DEFAULT_CLAUDE_HOME);
    clearUsageIndex();
    await fs.rm(home, { recursive: true, force: true });
  });

  const opusCost = 1 * 4 + 0.1 * 20;                       // $6 per call at Opus 5.5 rates
  const manualCost = calculateCost(USAGE, MANUAL);         // $7.80 per call
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  test('readAllUsage: model pricing, per-model totals and sources', async () => {
    const u = await readAllUsage(DEFAULT_COST_OPTIONS);
    assert.ok(near(u.cost5h, 2 * opusCost), `cost5h ${u.cost5h}`);
    assert.ok(near(u.costByModel5h['claude-opus-5-5'], 2 * opusCost));
    assert.strictEqual(u.pricingByModel5h['claude-opus-5-5'], 'builtin');
  });

  test('readAllUsage: per-model totals merge provider-prefixed and dated ids', async () => {
    await fs.appendFile(file, line('r9', 'us.anthropic.claude-opus-5-5-v1:0', 60e3) + '\n');
    const u = await readAllUsage(DEFAULT_COST_OPTIONS);
    assert.deepStrictEqual(Object.keys(u.costByModel5h), ['claude-opus-5-5']);
    assert.ok(near(u.costByModel5h['claude-opus-5-5'], 3 * opusCost));
  });

  test('readAllUsage: useModelPricing=false prices exactly like before model pricing', async () => {
    const u = await readAllUsage(MANUAL_ONLY);
    assert.ok(near(u.cost5h, 2 * manualCost), `cost5h ${u.cost5h}`);
    assert.ok(near(u.cost7d, 2 * manualCost));
    assert.strictEqual(u.pricingByModel5h['claude-opus-5-5'], 'manual');
  });

  test('readAllUsage: default pricing equals the old Sonnet-rate result when disabled', async () => {
    const u = await readAllUsage({ pricing: DEFAULT_PRICING, useModelPricing: false });
    assert.ok(near(u.cost5h, 2 * calculateCost(USAGE, DEFAULT_PRICING)));
  });

  test('prediction: burn rate follows the cost options', async () => {
    const withModel = await computePrediction(0, 0, 0, 0, null, DEFAULT_COST_OPTIONS);
    const manual = await computePrediction(0, 0, 0, 0, null, MANUAL_ONLY);
    assert.ok(withModel.currentBurnRate > 0);
    // Each call measures its span up to "now", so allow for the elapsed milliseconds
    assert.ok(Math.abs(manual.currentBurnRate / withModel.currentBurnRate - manualCost / opusCost) < 1e-4,
      `ratio ${manual.currentBurnRate / withModel.currentBurnRate}`);
  });

  test('heatmap: costs follow the cost options and streaming duplicates count once', async () => {
    // Sum over the window — the two calls may straddle midnight
    const totals = async (o: CostOptions) => {
      const daily = (await getHeatmapData(7, o)).daily;
      return { cost: daily.reduce((s, d) => s + d.cost, 0), calls: daily.reduce((s, d) => s + d.sessionCount, 0) };
    };
    const withModel = await totals(DEFAULT_COST_OPTIONS);
    const manual = await totals(MANUAL_ONLY);
    assert.strictEqual(withModel.calls, 2);
    assert.ok(near(withModel.cost, 2 * opusCost), `model-priced ${withModel.cost}`);
    assert.ok(near(manual.cost, 2 * manualCost), `manual ${manual.cost}`);
  });

  test('DataManager.invalidateHeatmap forces the next access to recompute', async () => {
    const dm = DataManager.getInstance();
    dm.restartWatching();   // drop any heatmap cached by other suites
    const total = (d: Awaited<ReturnType<DataManager['getHeatmapData']>>) =>
      (d?.daily ?? []).reduce((s, day) => s + day.sessionCount, 0);

    assert.strictEqual(total(await dm.getHeatmapData()), 2);
    await fs.appendFile(file, line('r3', 'claude-opus-5-5', 5 * 60e3) + '\n');
    assert.strictEqual(total(await dm.getHeatmapData()), 2, 'served from the 5-minute cache');
    dm.invalidateHeatmap();
    assert.strictEqual(total(await dm.getHeatmapData()), 3, 'recomputed after invalidation');
  });

  test('DataManager passes the pricing settings to usage totals and the heatmap', async () => {
    const cfg = () => vscode.workspace.getConfiguration('claudeStatus');
    const prevModel = cfg().inspect<boolean>('pricing.useModelPricing')?.globalValue;
    const prevProvider = cfg().inspect<string>('claudeProvider')?.globalValue;
    const dm = DataManager.getInstance();
    dm.restartWatching();
    try {
      // Local-only provider: no credentials lookup, no API call
      await cfg().update('claudeProvider', 'api-key', vscode.ConfigurationTarget.Global);
      await cfg().update('pricing.useModelPricing', false, vscode.ConfigurationTarget.Global);
      dm.invalidateHeatmap();
      const sonnetRateCall = calculateCost(USAGE, DEFAULT_PRICING);   // the default manual rates
      const usage = await dm.getUsageData();
      assert.ok(near(usage.cost5h, 2 * sonnetRateCall), `usage cost5h ${usage.cost5h}`);
      const heatmap = await dm.getHeatmapData();
      const total = (heatmap?.daily ?? []).reduce((s, d) => s + d.cost, 0);
      assert.ok(near(total, 2 * sonnetRateCall), `heatmap total ${total}`);
    } finally {
      await cfg().update('pricing.useModelPricing', prevModel, vscode.ConfigurationTarget.Global);
      await cfg().update('claudeProvider', prevProvider, vscode.ConfigurationTarget.Global);
      dm.invalidateHeatmap();
    }
  });

  test('a usage-based Claude.ai provider never calls the rate-limit API', async () => {
    const cfg = () => vscode.workspace.getConfiguration('claudeStatus');
    const prevProvider = cfg().inspect<string>('claudeProvider')?.globalValue;
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
    try {
      await cfg().update('claudeProvider', 'claude-ai-usage', vscode.ConfigurationTarget.Global);
      const usage = await DataManager.getInstance().getUsageData(true);   // even when forced
      assert.strictEqual(calls, 0);
      assert.strictEqual(usage.providerType, 'claude-ai-usage');
      assert.strictEqual(usage.dataSource, 'local-only');
      assert.ok(usage.cost5h > 0);
    } finally {
      globalThis.fetch = realFetch;
      await cfg().update('claudeProvider', prevProvider, vscode.ConfigurationTarget.Global);
    }
  });

  test('readAllUsage: costMonth counts the calendar month only', async () => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const now = Date.now();
    // One call just after the 1st (or a second ago on the 1st's first minute), one just before it
    await fs.writeFile(file, [
      line('this-month', 'claude-opus-5-5', now - Math.min(monthStart.getTime() + 60e3, now - 1000)),
      line('last-month', 'claude-opus-5-5', now - (monthStart.getTime() - 3600e3)),
    ].join('\n') + '\n');
    clearUsageIndex();
    const u = await readAllUsage(DEFAULT_COST_OPTIONS);
    assert.ok(near(u.costMonth, opusCost), `costMonth ${u.costMonth}`);
  });
});
