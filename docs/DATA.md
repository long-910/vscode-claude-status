# Data Layer Specification

## 1. JSONL Reader (`src/data/jsonlReader.ts`)

### Source Files

Claude Code writes session data to:
```
~/.claude/projects/<project-hash>/*.jsonl
```

Each line is a JSON object. Relevant fields (verified against Claude Code v2.1.x):

```jsonc
// 'assistant' type entries contain usage data
{
  "type": "assistant",
  "timestamp": "2026-02-24T10:23:45.123Z",
  "cwd": "/home/user/my-project",
  "message": {
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_read_input_tokens": 8900,
      "cache_creation_input_tokens": 450
    }
  }
}
```

> **Important verified facts:**
> - `costUSD` field does **not** exist — always calculate cost from token counts
> - Usage data is at `entry.message.usage`, **not** `entry.usage`
> - Only `type === 'assistant'` entries have usage; skip all other types
> - `cwd` is at the top level of every entry
> - Skip lines that fail to parse or lack required fields — never throw on parse errors

### Cost Calculation

Default rates are based on Claude Sonnet 4.x pricing.
**All four rates are user-configurable** via `claudeStatus.pricing.*` settings.

| Token type | Setting key | Default (USD / 1M) |
|------------|-------------|-------------------|
| Input | `claudeStatus.pricing.inputPerMillion` | $3.00 |
| Output | `claudeStatus.pricing.outputPerMillion` | $15.00 |
| Cache read | `claudeStatus.pricing.cacheReadPerMillion` | $0.30 |
| Cache create | `claudeStatus.pricing.cacheCreatePerMillion` | $3.75 |

> [!WARNING]
> **Pricing disclaimer — costs are estimates only.**
> Default rates reflect Anthropic's publicly announced pricing at the time of
> implementation. Anthropic may change rates at any time without notice.
> If pricing has changed, update the `claudeStatus.pricing.*` settings to match
> the latest figures on the [Anthropic pricing page](https://www.anthropic.com/pricing).

```typescript
export interface TokenPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  cacheCreatePerMillion: number
}

function calculateCost(usage: TokenUsage, pricing: TokenPricing): number {
  return (
    ((usage.input_tokens || 0) / 1_000_000) * pricing.inputPerMillion +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.outputPerMillion +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheReadPerMillion +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheCreatePerMillion
  )
}
```

### Time Windows

- **5h window**: entries where `timestamp >= now - 5 * 3600 * 1000`
- **Day window**: entries where `timestamp >= start of today (local time)`
- **7d window**: entries where `timestamp >= now - 7 * 24 * 3600 * 1000`

### Project Path Mapping

```
Workspace path:  /home/user/projects/my-app
JSONL directory: ~/.claude/projects/-home-user-projects-my-app/
```

Claude Code converts the workspace path by replacing **every non-alphanumeric character**
with `-` (not just `/`). Implemented in `projectCost.ts`:

```typescript
export function workspacePathToHash(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, '-')
}

function workspacePathToProjectDir(workspacePath: string): string {
  const hash = workspacePathToHash(workspacePath)
  return path.join(os.homedir(), '.claude', 'projects', hash)
}
```

### FileSystemWatcher

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(
    vscode.Uri.file(path.join(os.homedir(), '.claude', 'projects')),
    '**/*.jsonl'
  )
)
watcher.onDidChange(() => dataManager.refresh())
watcher.onDidCreate(() => dataManager.refresh())
```

---

## 2. API Client (`src/data/apiClient.ts`)

### When the API is called

The rate-limit API call is controlled by two settings:

| Setting | Default | Behaviour |
|---------|---------|-----------|
| `claudeStatus.rateLimitApi.enabled` | `true` | Master switch — set to `false` to stop API calls |
| `claudeStatus.realtime.enabled` | `false` | When `true`, polls every `cache.ttlSeconds` regardless of activity |

**Default flow (`rateLimitApi.enabled: true`, `realtime.enabled: false`):**

```
Claude active  →  JSONL updated  →  1 API call  →  cache  →  display %
Claude idle    →  read cache only (no API call)  →  show stale age
```

**When `rateLimitApi.enabled: false`:**

```
Cache exists (claude-ai)  →  show cached % with [Xm ago] stale indicator
No cache or non-claude-ai →  cost-only mode (no percentages)
```

> [!NOTE]
> **Why is the default enabled, and why is API consumption negligible?**
>
> The API is called only when Claude Code has been **recently active** — i.e., a
> JSONL file was updated within the last `cache.ttlSeconds` (default: 5 min).
> When you stop using Claude Code, the extension stops calling the API entirely.
>
> Each call sends a minimal 1-token payload to `claude-haiku-4-5-20251001` solely to
> retrieve response headers — no real work is done by the model.
> Typical cost: **≈ $0.00013 per call (≈ 9 tokens)**.
>
> | Usage pattern | Calls/day | Estimated cost/month |
> |---------------|-----------|----------------------|
> | 4 h active/day (default mode) | ~48 | ~$0.002 |
> | Always-on realtime mode | ~288 | ~$0.012 |
>
> Disable with `claudeStatus.rateLimitApi.enabled: false` if your environment
> blocks outbound HTTPS to `api.anthropic.com`. Cached percentages will still
> be shown (with a stale-age indicator) as long as a prior cache file exists.

### Endpoint

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,        // OAuth token (NOT x-api-key)
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20',      // REQUIRED for OAuth tokens
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',        // cheapest model, pinned version
    max_tokens: 1,
    messages: [{ role: 'user', content: '.' }],
  }),
})
```

### Rate Limit Headers to Extract

```
anthropic-ratelimit-unified-5h-utilization  → util5h  (float, e.g. "0.78")
anthropic-ratelimit-unified-5h-reset        → Unix timestamp SECONDS (not ISO string)
anthropic-ratelimit-unified-5h-status       → "allowed" or "denied"
anthropic-ratelimit-unified-7d-utilization  → util7d  (absent on non-Max plans)
anthropic-ratelimit-unified-7d-reset        → Unix timestamp SECONDS (absent on non-Max plans)
```

> **Important:** Reset headers are **Unix timestamps in seconds**, not ISO date strings.
> The 7d headers are only present on Claude.ai Max plans; their absence means `has7dLimit = false`.

```typescript
const nowSec = Date.now() / 1000
const reset5hStr = response.headers.get('anthropic-ratelimit-unified-5h-reset')
const reset7dStr = response.headers.get('anthropic-ratelimit-unified-7d-reset')
const has7dLimit = reset7dStr !== null

const resetIn5h = reset5hStr ? Math.max(0, parseInt(reset5hStr, 10) - nowSec) : 0
const resetIn7d = reset7dStr ? Math.max(0, parseInt(reset7dStr, 10) - nowSec) : 0
```

`limitStatus` derivation:

```typescript
let limitStatus: 'allowed' | 'allowed_warning' | 'denied'
const status5h = response.headers.get('anthropic-ratelimit-unified-5h-status')
if (status5h === 'denied') {
  limitStatus = 'denied'
} else if (util5h >= 0.75 || (has7dLimit && util7d >= 0.75)) {
  limitStatus = 'allowed_warning'
} else {
  limitStatus = 'allowed'
}
```

### Credentials File

Actual structure of `~/.claude/.credentials.json` (verified):

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "expiresAt": 1772234688300
  }
}
```

```typescript
interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string
    expiresAt: number
  }
}

const credPath = customPath ?? path.join(os.homedir(), '.claude', '.credentials.json')
const creds: ClaudeCredentials = JSON.parse(await fs.readFile(credPath, 'utf-8'))
const token = creds.claudeAiOauth?.accessToken
```

If the file doesn't exist or the token is missing, set `dataSource: 'no-credentials'`
and show a status bar message guiding the user to log in with Claude Code.

### Provider Detection

```typescript
export type ClaudeProvider = 'claude-ai' | 'aws-bedrock' | 'api-key' | 'unknown'

async function detectProvider(customCredPath?: string | null): Promise<ClaudeProvider> {
  // 1. OAuth credentials → claude-ai
  // 2. AWS env vars → aws-bedrock
  // 3. ANTHROPIC_API_KEY → api-key
  // 4. fallback → unknown
}
```

Non-`claude-ai` providers always use cost mode (no rate limit percentages).

---

## 3. Cache (`src/data/cache.ts`)

### Cache File Location

```
~/.claude/vscode-claude-status-cache.json
```

### Cache Schema (Version 2)

```typescript
interface CacheFile {
  version: 2
  updatedAt: string           // ISO datetime
  usageData: {
    utilization5h: number
    utilization7d: number
    reset5hAt: number         // absolute Unix timestamp (seconds) — NOT relative seconds
    reset7dAt: number         // 0 if no 7d limit (non-Max plan)
    limitStatus: string
  }
}
```

> **Schema version history:**
> - v1: stored `resetIn5h`/`resetIn7d` as relative seconds from cache write time
> - v2: stores `reset5hAt`/`reset7dAt` as absolute Unix timestamps (correct across cache reads)

Cost and token data are NOT cached (always read from JSONL directly — it's local
and fast). Only the API response values are cached.

### Cache Validity Logic

```typescript
function isCacheValid(cache: CacheFile, ttlSeconds: number): boolean {
  const age = (Date.now() - new Date(cache.updatedAt).getTime()) / 1000
  return age < ttlSeconds
}

function getCacheAge(cache: CacheFile): number {
  return (Date.now() - new Date(cache.updatedAt).getTime()) / 1000
}
```

### When to Call the API

```typescript
async function shouldCallApi(cache): Promise<boolean> {
  if (!cache) return true                          // no cache yet
  if (!isCacheValid(cache, config.cacheTtl)) {
    const jsonlUpdatedRecently = await wasJsonlUpdatedRecently(300) // 5 min
    return jsonlUpdatedRecently                    // only call if Claude was active
  }
  return false                                     // cache is fresh
}
```

`wasJsonlUpdatedRecently(seconds)`: check if any `.jsonl` file under
`~/.claude/projects/` has an `mtime` within the last `seconds` seconds.
