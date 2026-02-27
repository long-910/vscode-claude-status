import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface ClaudeCredentials {
  claudeAiOauthToken: string
}

export interface RateLimitData {
  utilization5h: number
  utilization7d: number
  resetIn5h: number
  resetIn7d: number
  limitStatus: 'allowed' | 'allowed_warning' | 'denied'
}

async function readCredentials(customPath?: string | null): Promise<ClaudeCredentials> {
  const credPath = customPath ?? path.join(os.homedir(), '.claude', '.credentials.json');
  const content = await fs.readFile(credPath, 'utf-8');
  return JSON.parse(content) as ClaudeCredentials;
}

export async function fetchRateLimitData(customCredPath?: string | null): Promise<RateLimitData> {
  const creds = await readCredentials(customCredPath);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': creds.claudeAiOauthToken,
      'anthropic-version': '2023-06-01',
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
  const allowed5h = response.headers.get('anthropic-ratelimit-unified-5h-allowed');

  const resetIn5h = reset5hStr
    ? Math.max(0, (new Date(reset5hStr).getTime() - Date.now()) / 1000)
    : 0;
  const resetIn7d = reset7dStr
    ? Math.max(0, (new Date(reset7dStr).getTime() - Date.now()) / 1000)
    : 0;

  let limitStatus: 'allowed' | 'allowed_warning' | 'denied';
  if (allowed5h === 'false') {
    limitStatus = 'denied';
  } else if (util5h >= 0.75 || util7d >= 0.75) {
    limitStatus = 'allowed_warning';
  } else {
    limitStatus = 'allowed';
  }

  return { utilization5h: util5h, utilization7d: util7d, resetIn5h, resetIn7d, limitStatus };
}
