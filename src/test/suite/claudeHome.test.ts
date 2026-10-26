import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { resolveClaudeHome, setClaudeHome, getClaudeHome } from '../../data/claudeHome';
import { getClaudeProjectsDir } from '../../data/jsonlReader';

suite('claudeHome', () => {
  teardown(() => {
    setClaudeHome('.claude');
  });

  test('defaults to ~/.claude', () => {
    const expected = path.join(os.homedir(), '.claude');
    assert.strictEqual(resolveClaudeHome(undefined), expected);
    assert.strictEqual(resolveClaudeHome(null), expected);
    assert.strictEqual(resolveClaudeHome(''), expected);
    assert.strictEqual(resolveClaudeHome('   '), expected);
    assert.strictEqual(getClaudeHome(), expected);
  });

  test('resolves relative paths against home directory', () => {
    assert.strictEqual(resolveClaudeHome('.claude-work'), path.join(os.homedir(), '.claude-work'));
  });

  test('expands ~ prefix', () => {
    assert.strictEqual(resolveClaudeHome('~'), os.homedir());
    assert.strictEqual(resolveClaudeHome('~/profiles/claude'), path.join(os.homedir(), 'profiles/claude'));
  });

  test('keeps absolute paths as-is', () => {
    const abs = path.resolve(os.tmpdir(), 'claude-home');
    assert.strictEqual(resolveClaudeHome(abs), abs);
  });

  test('getClaudeProjectsDir follows setClaudeHome', () => {
    const abs = path.resolve(os.tmpdir(), 'claude-home');
    setClaudeHome(abs);
    assert.strictEqual(getClaudeProjectsDir(), path.join(abs, 'projects'));
  });
});
