import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CLAUDE_HOME, getClaudeHome, resolveClaudeHome } from './claudeHome';

// Claude Code keeps the signed-in account in its global config — ~/.claude.json,
// or <CLAUDE_CONFIG_DIR>/.claude.json when the data directory is moved — under
// `oauthAccount`. `billingType` is the organization's billing type from the
// Anthropic API: "usage_based" for usage-based Enterprise / Team plans, which
// are billed at API rates and have no 5-hour / weekly windows. Claude Code
// itself turns its usage-limit handling off for "usage_based".

export interface OAuthAccountInfo {
  billingType: string | null
}

/** Path of Claude Code's global config for the current claudeStatus.claudeHome. */
export function getGlobalConfigPath(): string {
  const home = getClaudeHome();
  return home === resolveClaudeHome(DEFAULT_CLAUDE_HOME)
    ? path.join(os.homedir(), '.claude.json')
    : path.join(home, '.claude.json');
}

// The file also holds per-project history and can be large: parse it again
// only when its mtime or size changes
let cached: { path: string; mtimeMs: number; size: number; info: OAuthAccountInfo | null } | undefined;

/** The signed-in account's billing info, or null when unknown (no file, not signed in). */
export async function readOAuthAccountInfo(): Promise<OAuthAccountInfo | null> {
  const configPath = getGlobalConfigPath();
  let stat;
  try {
    stat = await fs.stat(configPath);
  } catch {
    cached = undefined;
    return null;
  }
  if (cached && cached.path === configPath && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.info;
  }

  let info: OAuthAccountInfo | null = null;
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf-8')) as { oauthAccount?: { billingType?: unknown } };
    if (parsed.oauthAccount && typeof parsed.oauthAccount === 'object') {
      const billingType = parsed.oauthAccount.billingType;
      info = { billingType: typeof billingType === 'string' ? billingType : null };
    }
  } catch {
    // unreadable or mid-write — treat as unknown, retry on the next change
  }
  cached = { path: configPath, mtimeMs: stat.mtimeMs, size: stat.size, info };
  return info;
}

export function isUsageBased(info: OAuthAccountInfo | null): boolean {
  return info?.billingType === 'usage_based';
}

/** Drop the cached file contents (tests). */
export function clearAccountInfoCache(): void {
  cached = undefined;
}
