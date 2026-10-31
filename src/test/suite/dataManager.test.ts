import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DataManager, rateLimitCallDue, IDLE_MIN_API_INTERVAL_SEC } from '../../data/dataManager';
import * as vscode from 'vscode';
import { setClaudeHome } from '../../data/claudeHome';
import { config } from '../../config';
import { readAllUsage } from '../../data/jsonlReader';
import { indexedFileCount } from '../../data/usageIndex';

suite('DataManager', () => {
  let homeA: string;
  let homeB: string;

  setup(async () => {
    homeA = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-a-'));
    homeB = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-b-'));
    const projectDir = path.join(homeA, 'projects', '-tmp-project');
    await fs.mkdir(projectDir, { recursive: true });
    const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    await fs.writeFile(path.join(projectDir, 'session.jsonl'), JSON.stringify({
      type: 'assistant',
      uuid: 'u1',
      timestamp: new Date().toISOString(),
      message: { id: 'msg_1', usage },
    }));
  });

  teardown(async () => {
    setClaudeHome('.claude');
    DataManager.getInstance().restartWatching();
    await fs.rm(homeA, { recursive: true, force: true });
    await fs.rm(homeB, { recursive: true, force: true });
  });

  test('heatmap follows claudeHome changes without waiting for the TTL', async () => {
    const dm = DataManager.getInstance();
    const totalCost = (d: Awaited<ReturnType<DataManager['getHeatmapData']>>) =>
      (d?.daily ?? []).reduce((sum, day) => sum + day.cost, 0);

    setClaudeHome(homeA);
    dm.restartWatching();
    assert.ok(totalCost(await dm.getHeatmapData()) > 0, 'heatmap should include homeA usage');

    setClaudeHome(homeB);
    dm.restartWatching();
    assert.strictEqual(totalCost(await dm.getHeatmapData()), 0, 'heatmap should not keep homeA usage');
  });

  // ---- #48 / #47: extension host OOM while Claude Code is streaming ----------
  // These pin the parts of the fix that are about scheduling rather than reading.

  // DataManager's private members, for spying
  interface Internals {
    refreshOnce(): Promise<void>
    scheduleRefresh(): void
    getHeatmapData(): Promise<unknown>
    watchDelayMs: number
    watchTimer: unknown
  }
  const internals = (dm: DataManager) => dm as unknown as Internals;

  test('regression (#48): overlapping refresh() calls never run concurrently and coalesce into one rerun', async () => {
    const dm = internals(DataManager.getInstance());
    const original = dm.refreshOnce;
    let running = 0, maxRunning = 0, runs = 0;
    dm.refreshOnce = async () => {
      running++; runs++; maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 20));
      running--;
    };
    try {
      const real = DataManager.getInstance();
      await Promise.all([real.refresh(), real.refresh(), real.refresh(), real.refresh(), real.refresh()]);
      assert.strictEqual(maxRunning, 1, 'never two passes at once');
      assert.strictEqual(runs, 2, 'the first pass plus exactly one queued rerun');
    } finally {
      dm.refreshOnce = original;
    }
  });

  test('regression (#48): a burst of watcher events schedules a single refresh', async () => {
    const real = DataManager.getInstance();
    const dm = internals(real);
    const originalDelay = dm.watchDelayMs;
    const originalRefresh = real.refresh;
    let refreshes = 0;
    real.refresh = async () => { refreshes++; };
    dm.watchDelayMs = 30;
    try {
      for (let i = 0; i < 50; i++) { dm.scheduleRefresh(); }   // 50 appends while streaming
      await new Promise(r => setTimeout(r, 80));
      assert.strictEqual(refreshes, 1);
      dm.scheduleRefresh();                                       // later events start a new window
      await new Promise(r => setTimeout(r, 80));
      assert.strictEqual(refreshes, 2);
    } finally {
      real.refresh = originalRefresh;
      dm.watchDelayMs = originalDelay;
    }
  });

  test('regression (#48): the heatmap is computed only while the dashboard is open', async () => {
    const real = DataManager.getInstance();
    const dm = internals(real);
    const original = dm.getHeatmapData;
    let computed = 0;
    dm.getHeatmapData = async () => { computed++; return null; };
    const cfg = vscode.workspace.getConfiguration('claudeStatus');
    const prevProvider = cfg.inspect<string>('claudeProvider')?.globalValue;
    await cfg.update('claudeProvider', 'api-key', vscode.ConfigurationTarget.Global);   // no API call
    try {
      setClaudeHome(homeA);
      real.setDashboardOpen(false);
      await real.refresh();
      assert.strictEqual(computed, 0, 'dashboard closed');
      real.setDashboardOpen(true);
      await real.refresh();
      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(computed, 1, 'dashboard open');
    } finally {
      real.setDashboardOpen(false);
      dm.getHeatmapData = original;
      await cfg.update('claudeProvider', prevProvider, vscode.ConfigurationTarget.Global);
    }
  });

  // ---- 0.6.2: an empty credentials.path must fall back to the default ----------
  test('regression (0.6.2): an empty credentials.path setting means "use the default"', async () => {
    const cfg = vscode.workspace.getConfiguration('claudeStatus');
    const prev = cfg.inspect<string | null>('credentials.path')?.globalValue;
    try {
      await cfg.update('credentials.path', '', vscode.ConfigurationTarget.Global);
      assert.strictEqual(config.credentialsPath, null);
      await cfg.update('credentials.path', '/tmp/creds.json', vscode.ConfigurationTarget.Global);
      assert.strictEqual(config.credentialsPath, '/tmp/creds.json');
    } finally {
      await cfg.update('credentials.path', prev, vscode.ConfigurationTarget.Global);
    }
  });

  test('regression (#52): changing claudeHome drops the old directory\'s transcripts from memory', async () => {
    setClaudeHome(homeA);
    await readAllUsage();
    assert.ok(indexedFileCount() > 0);
    setClaudeHome(homeB);
    DataManager.getInstance().restartWatching();
    assert.strictEqual(indexedFileCount(), 0);
  });

  test('regression (#16): with rateLimitApi disabled, a subscription keeps showing the cached % as stale, without calling the API', async () => {
    const cfg = vscode.workspace.getConfiguration('claudeStatus');
    const prev = {
      provider: cfg.inspect<string>('claudeProvider')?.globalValue,
      api: cfg.inspect<boolean>('rateLimitApi.enabled')?.globalValue,
    };
    const nowSec = Date.now() / 1000;
    await fs.writeFile(path.join(homeA, 'vscode-claude-status-cache.json'), JSON.stringify({
      version: 2, updatedAt: new Date(Date.now() - 600e3).toISOString(),
      usageData: { utilization5h: 0.42, utilization7d: 0.1, reset5hAt: nowSec + 3600, reset7dAt: nowSec + 86400, limitStatus: 'allowed' },
    }));
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
    try {
      setClaudeHome(homeA);
      await cfg.update('claudeProvider', 'claude-ai', vscode.ConfigurationTarget.Global);
      await cfg.update('rateLimitApi.enabled', false, vscode.ConfigurationTarget.Global);
      const data = await DataManager.getInstance().getUsageData(true);
      assert.strictEqual(data.dataSource, 'stale');
      assert.strictEqual(data.utilization5h, 0.42);
      assert.strictEqual(calls, 0);
    } finally {
      globalThis.fetch = realFetch;
      await cfg.update('claudeProvider', prev.provider, vscode.ConfigurationTarget.Global);
      await cfg.update('rateLimitApi.enabled', prev.api, vscode.ConfigurationTarget.Global);
    }
  });

  // ---- claudeStatus.realtime.enabled -------------------------------------------
  suite('rate-limit API scheduling', () => {
    const due = (cacheAgeSec: number | null, activeRecently: boolean, realtime: boolean, ttlSec = 300) =>
      rateLimitCallDue({ cacheAgeSec, ttlSec, activeRecently, realtime });

    test('regression: unchanged without realtime — call only when stale and Claude Code is active', () => {
      assert.strictEqual(due(null, false, false), true, 'no cache yet');
      assert.strictEqual(due(100, true, false), false, 'cache fresh');
      assert.strictEqual(due(400, true, false), true, 'stale + active');
      assert.strictEqual(due(4000, false, false), false, 'stale + idle → never');
    });

    test('realtime polls while idle, but never more often than every 5 minutes', () => {
      assert.strictEqual(IDLE_MIN_API_INTERVAL_SEC, 300);
      assert.strictEqual(due(400, false, true), true, 'idle, 400 s old');
      assert.strictEqual(due(90, false, true, 60), false, 'ttl 60 s does not lower the idle floor');
      assert.strictEqual(due(299, false, true, 60), false);
      assert.strictEqual(due(300, false, true, 60), true);
      assert.strictEqual(due(700, false, true, 600), true, 'a longer ttl is respected');
      assert.strictEqual(due(500, false, true, 600), false);
    });

    test('DataManager: idle + realtime calls the API once the cache is 5 min old; idle without realtime never does', async () => {
      const cfg = vscode.workspace.getConfiguration('claudeStatus');
      const keys = ['claudeProvider', 'realtime.enabled', 'credentials.path', 'cache.ttlSeconds'];
      const prev = Object.fromEntries(keys.map(k => [k, cfg.inspect(k)?.globalValue]));
      const credPath = path.join(homeA, '.credentials.json');
      await fs.writeFile(credPath, JSON.stringify({ claudeAiOauth: { accessToken: 't', expiresAt: Date.now() + 3600e3 } }));
      // Claude Code idle: no transcript changed in the last 5 minutes
      const tenMinAgo = (Date.now() - 600e3) / 1000;
      await fs.utimes(path.join(homeA, 'projects', '-tmp-project', 'session.jsonl'), tenMinAgo, tenMinAgo);
      const writeCacheAged = (ageSec: number) => fs.writeFile(path.join(homeA, 'vscode-claude-status-cache.json'), JSON.stringify({
        version: 2, updatedAt: new Date(Date.now() - ageSec * 1000).toISOString(),
        usageData: { utilization5h: 0.3, utilization7d: 0, reset5hAt: Date.now() / 1000 + 3600, reset7dAt: 0, limitStatus: 'allowed' },
      }));
      const realFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return new Response('{}', { status: 200, headers: { 'anthropic-ratelimit-unified-5h-utilization': '0.5', 'anthropic-ratelimit-unified-5h-status': 'allowed' } });
      }) as typeof fetch;
      try {
        setClaudeHome(homeA);
        await cfg.update('claudeProvider', 'claude-ai', vscode.ConfigurationTarget.Global);
        await cfg.update('credentials.path', credPath, vscode.ConfigurationTarget.Global);
        await cfg.update('cache.ttlSeconds', 60, vscode.ConfigurationTarget.Global);
        const dm = DataManager.getInstance();

        await cfg.update('realtime.enabled', false, vscode.ConfigurationTarget.Global);
        await writeCacheAged(400);
        assert.strictEqual((await dm.getUsageData()).dataSource, 'stale');
        assert.strictEqual(calls, 0, 'idle without realtime: no call');

        await cfg.update('realtime.enabled', true, vscode.ConfigurationTarget.Global);
        await writeCacheAged(120);
        await dm.getUsageData();
        assert.strictEqual(calls, 0, 'cache 2 min old: below the 5-minute idle floor');

        await writeCacheAged(400);
        const data = await dm.getUsageData();
        assert.strictEqual(calls, 1, 'cache 400 s old: one call');
        assert.strictEqual(data.dataSource, 'api');
        assert.strictEqual(data.utilization5h, 0.5);
        await dm.getUsageData();
        assert.strictEqual(calls, 1, 'the fresh cache is used right after');
      } finally {
        globalThis.fetch = realFetch;
        for (const k of keys) { await cfg.update(k, prev[k], vscode.ConfigurationTarget.Global); }
      }
    });
  });
});
