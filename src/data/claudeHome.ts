import * as path from 'path';
import * as os from 'os';

export const DEFAULT_CLAUDE_HOME = '.claude';

// Resolves the claudeStatus.claudeHome setting to an absolute directory.
// Relative values (including the default ".claude") resolve against the home directory.
export function resolveClaudeHome(value?: string | null): string {
  const v = (value ?? '').trim() || DEFAULT_CLAUDE_HOME;
  if (v === '~') { return os.homedir(); }
  if (v.startsWith('~/') || v.startsWith('~\\')) { return path.join(os.homedir(), v.slice(2)); }
  if (path.isAbsolute(v)) { return v; }
  return path.join(os.homedir(), v);
}

let claudeHome = resolveClaudeHome(DEFAULT_CLAUDE_HOME);

export function setClaudeHome(value?: string | null): void {
  claudeHome = resolveClaudeHome(value);
}

export function getClaudeHome(): string {
  return claudeHome;
}
