import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Actual structure of ~/.claude/.credentials.json (verified against Claude Code v2.1.x)
interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string
    expiresAt: number
  }
}

export interface RateLimitData {
  utilization5h: number
  utilization7d: number
  resetIn5h: number
  resetIn7d: number
  limitStatus: 'allowed' | 'allowed_warning' | 'denied'
}

async function readCredentials(customPath?: string | null): Promise<string> {
  const credPath = customPath ?? path.join(os.homedir(), '.claude', '.credentials.json');
  const content = await fs.readFile(credPath, 'utf-8');
  const creds = JSON.parse(content) as ClaudeCredentials;
  const token = creds.claudeAiOauth?.accessToken;
  if (!token) {
    throw new Error('No OAuth access token found in credentials file');
  }
  return token;
}

export async function fetchRateLimitData(customCredPath?: string | null): Promise<RateLimitData> {
  const token = await readCredentials(customCredPath);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    }),
  });

  const util5h = parseFloat(response.headers.get('anthropic-ratelimit-unified-5h-utilization') ?? '0');
  const util7d = parseFloat(response.headers.get('anthropic-ratelimit-unified-7d-utilization') ?? '0');
  const reset5hStr = response.headers.get('anthropic-ratelimit-unified-5h-reset');
  const reset7dStr = response.headers.get('anthropic-ratelimit-unified-7d-reset');
  // Status header value is "allowed" or "denied" (not a boolean)
  const status5h = response.headers.get('anthropic-ratelimit-unified-5h-status');

  // Reset values are Unix timestamps in seconds (not ISO date strings)
  const nowSec = Date.now() / 1000;
  const resetIn5h = reset5hStr ? Math.max(0, parseInt(reset5hStr, 10) - nowSec) : 0;
  const resetIn7d = reset7dStr ? Math.max(0, parseInt(reset7dStr, 10) - nowSec) : 0;

  let limitStatus: 'allowed' | 'allowed_warning' | 'denied';
  if (status5h === 'denied') {
    limitStatus = 'denied';
  } else if (util5h >= 0.75 || util7d >= 0.75) {
    limitStatus = 'allowed_warning';
  } else {
    limitStatus = 'allowed';
  }

  return { utilization5h: util5h, utilization7d: util7d, resetIn5h, resetIn7d, limitStatus };
}
