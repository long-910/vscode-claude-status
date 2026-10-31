import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { clearAccountInfoCache, getGlobalConfigPath, isUsageBased, readOAuthAccountInfo } from '../../data/accountInfo';
import { detectProvider, fetchRateLimitData } from '../../data/apiClient';
import { DEFAULT_CLAUDE_HOME, setClaudeHome } from '../../data/claudeHome';

suite('Account info / usage-based plans', () => {
  let home: string;
  let credPath: string;
  const writeConfig = (oauthAccount: unknown) =>
    fs.writeFile(path.join(home, '.claude.json'), JSON.stringify({ projects: {}, oauthAccount }));

  setup(async () => {
    clearAccountInfoCache();
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'account-info-'));
    credPath = path.join(home, '.credentials.json');
    await fs.writeFile(credPath, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token', expiresAt: Date.now() + 3600e3 } }));
    setClaudeHome(home);
  });

  teardown(async () => {
    setClaudeHome(DEFAULT_CLAUDE_HOME);
    clearAccountInfoCache();
    await fs.rm(home, { recursive: true, force: true });
  });

  test('global config lives in ~/.claude.json, or inside a custom claudeHome', () => {
    assert.strictEqual(getGlobalConfigPath(), path.join(home, '.claude.json'));
    setClaudeHome(DEFAULT_CLAUDE_HOME);
    assert.strictEqual(getGlobalConfigPath(), path.join(os.homedir(), '.claude.json'));
  });

  test('reads oauthAccount.billingType and re-reads when the file changes', async () => {
    assert.strictEqual(await readOAuthAccountInfo(), null, 'no file');
    await writeConfig({ billingType: 'usage_based' });
    assert.deepStrictEqual(await readOAuthAccountInfo(), { billingType: 'usage_based' });
    await writeConfig({ billingType: 'stripe_subscription', emailAddress: 'a@example.com' });
    assert.deepStrictEqual(await readOAuthAccountInfo(), { billingType: 'stripe_subscription' });
    await fs.writeFile(path.join(home, '.claude.json'), '{ not json');
    assert.strictEqual(await readOAuthAccountInfo(), null, 'unparseable');
  });

  test('isUsageBased', () => {
    assert.strictEqual(isUsageBased({ billingType: 'usage_based' }), true);
    assert.strictEqual(isUsageBased({ billingType: 'stripe_subscription' }), false);
    assert.strictEqual(isUsageBased(null), false);
  });

  test('detectProvider: usage-based sign-in → claude-ai-usage, otherwise claude-ai', async () => {
    assert.strictEqual(await detectProvider(credPath), 'claude-ai', 'no global config');
    await writeConfig({ billingType: 'stripe_subscription' });
    assert.strictEqual(await detectProvider(credPath), 'claude-ai');
    await writeConfig({ billingType: 'usage_based', organizationName: 'Acme' });
    assert.strictEqual(await detectProvider(credPath), 'claude-ai-usage');
  });

  suite('fetchRateLimitData', () => {
    const realFetch = globalThis.fetch;
    const respond = (status: number, headers: Record<string, string>) => {
      globalThis.fetch = (async () => new Response('{}', { status, headers })) as typeof fetch;
    };
    teardown(() => { globalThis.fetch = realFetch; });

    test('parses the unified rate-limit headers', async () => {
      const reset = Math.floor(Date.now() / 1000) + 3600;
      respond(200, {
        'anthropic-ratelimit-unified-5h-utilization': '0.62',
        'anthropic-ratelimit-unified-5h-reset': String(reset),
        'anthropic-ratelimit-unified-5h-status': 'allowed',
      });
      const r = await fetchRateLimitData(credPath);
      assert.strictEqual(r.utilization5h, 0.62);
      assert.strictEqual(r.has7dLimit, false);
      assert.ok(r.resetIn5h > 3500 && r.resetIn5h <= 3600);
    });

    test('a 429 with headers reports denied', async () => {
      respond(429, { 'anthropic-ratelimit-unified-5h-utilization': '1', 'anthropic-ratelimit-unified-5h-status': 'denied' });
      assert.strictEqual((await fetchRateLimitData(credPath)).limitStatus, 'denied');
    });

    test('regression: an error without headers rejects instead of reporting 0%', async () => {
      respond(401, {});
      await assert.rejects(fetchRateLimitData(credPath), /HTTP 401/);
    });
  });
});
