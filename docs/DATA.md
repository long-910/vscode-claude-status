# Data Layer Specification

## 1. JSONL Reader (`src/data/jsonlReader.ts`)

### Source Files

Claude Code writes session data to:
```
<claudeHome>/projects/<project-hash>/*.jsonl      # claudeHome defaults to ~/.claude
```

Each line is a JSON object. Relevant fields (verified against Claude Code v2.1.x):

```jsonc
// 'assistant' type entries contain usage data
{
  "type": "assistant",
  "timestamp": "2026-02-24T10:23:45.123Z",
  "cwd": "/home/user/my-project",
  "requestId": "req_011C…",              // shared by every content block of one response
  "message": {
    "id": "msg_01…",
    "model": "claude-opus-5-5",
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_read_input_tokens": 8900,
      "cache_creation_input_tokens": 450,
      "cache_creation": { "ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 450 },
      "speed": "fast",                    // only in fast mode
      "inference_geo": "us"               // only with US-only inference
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

Cost is always calculated from token counts — see **[PRICING.md](PRICING.md)** for model
resolution, the rate table, modifiers and settings.

### Time Windows

| Field | Window |
|---|---|
| `cost5h`, `tokens*5h`, `costByModel5h` | `timestamp >= now − 5 h` |
| `costDay` | since local midnight |
| `cost7d` | `timestamp >= now − 7 days` |
| `costMonth` | since local midnight on the 1st (`startOfMonth()`, `src/data/localTime.ts`) |
| project `costToday` / `cost7d` / `cost30d` | same rules, per workspace project (`projectCost.ts`) |
| heatmap | `heatmap.days` (30 / 60 / 90) days; hourly chart and punch card: 30 days |

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
```

If that directory does not exist, `workspacePathToProjectDir()` falls back to scanning
project directories for a transcript whose `cwd` equals the workspace path. See
[features/03-project-cost.md](features/03-project-cost.md).

### FileSystemWatcher

```typescript
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(vscode.Uri.file(getClaudeProjectsDir()), '**/*.jsonl')
)
// Coalesced: at most one refresh per 5 s while Claude Code is streaming
watcher.onDidChange(() => dataManager.scheduleRefresh())
watcher.onDidCreate(() => dataManager.scheduleRefresh())
```

`refresh()` is single-flight: a call made while one is running waits for it and
triggers exactly one more pass afterwards.

### Incremental Reading (`src/data/usageIndex.ts`)

Transcripts can grow to ~100 MB and Claude Code appends to them many times per
second while streaming. To keep the extension host's memory and CPU flat (#48):

- **Never read a whole file into memory.** Files are read in 1 MiB chunks and
  split on `\n` at the byte level.
- **Read each byte once.** Per file, the index keeps the byte offset consumed so
  far, the dedupe keys seen, and slim usage records (timestamp + token counts).
  On the next refresh only the appended bytes are read. A trailing line without
  `\n` is deferred until it is complete. A file that shrinks or gets a new inode
  is re-read from the start.
- **Skip old files.** A transcript's mtime is >= every entry in it, so files
  whose mtime is older than the window being aggregated are not read at all.
- **Bounded retention.** Records older than 32 days (the widest window: the calendar
  month, up to 31 days, plus a day of margin) are dropped, and files not modified in 32
  days are evicted. `readAllUsage()` reads files modified since the earlier of 7 days ago
  and the 1st of the month.

`readAllUsage()`, project cost and prediction all share this index. The heatmap
(up to `heatmap.days` of history) is read separately — only while the dashboard is open,
at most 4 files at a time — with the same file discovery (`findAllJsonlFiles()`) and the
same line parser.

### Line parsing and streaming deduplication (all readers)

`parseUsageLine()` (`usageIndex.ts`) is the only place that decides which lines carry usage
and how usage is normalized; the usage index and the heatmap both use it.

Claude Code writes one JSONL entry per content block of a streaming response, all sharing
the same `requestId` and the same `usage`. Each reader dedupes per file with `firstSeen()`
on the key from `usageDedupeKey()` (`requestId`, falling back to `message.id`); entries with
neither key are all counted. A new reader must go through `parseUsageLine()` / `firstSeen()`,
or its totals will be inflated 2–4× in agentic sessions.

---

## 2. API Client (`src/data/apiClient.ts`)

### When the API is called

Only for the `claude-ai` provider — see [PLANS.md](PLANS.md#rate-limit-api-calls-claude-ai-only)
for the full table. `claudeStatus.rateLimitApi.enabled` is the master switch.
`claudeStatus.realtime.enabled` adds polling while Claude Code is idle, never more often than
every 5 minutes (`rateLimitCallDue()` in `dataManager.ts`).

**Default flow:**

```
Claude active  →  JSONL updated  →  1 API call  →  cache  →  display %
Claude idle    →  read cache only (no API call)  →  show stale age
```

**When `rateLimitApi.enabled: false`:**

```
Cache exists (claude-ai)  →  show cached % with [Xm ago] stale indicator
No cache or non-claude-ai →  cost-only mode (no percentages)
```

The probe costs ≈ 9 tokens of `claude-haiku-4-5` (≈ $0.00013) — about $0.002 / month at
4 active hours a day.

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

const credPath = customPath ?? path.join(getClaudeHome(), '.credentials.json')
// macOS: no file → Keychain entry "Claude Code-credentials"
const creds: ClaudeCredentials = JSON.parse(await fs.readFile(credPath, 'utf-8'))
const token = creds.claudeAiOauth?.accessToken
```

If the file doesn't exist or the token is missing, set `dataSource: 'no-credentials'`
and show a status bar message guiding the user to log in with Claude Code.

### Provider Detection

`detectProvider()` returns `'claude-ai' | 'claude-ai-usage' | 'aws-bedrock' | 'api-key' | 'unknown'`.
The detection order and what each provider shows are in [PLANS.md](PLANS.md).

**Usage-based plans** (`src/data/accountInfo.ts`): `readOAuthAccountInfo()` reads
`oauthAccount.billingType` from Claude Code's global config (`getGlobalConfigPath()`:
`~/.claude.json`, or `<claudeHome>/.claude.json` for a custom data directory — the
`CLAUDE_CONFIG_DIR` layout). The file can be large (it holds per-project history), so it is
parsed again only when its mtime or size changes. `"usage_based"` → `claude-ai-usage`, which
never calls the rate-limit API.

`fetchRateLimitData()` rejects an error response that carries no unified rate-limit headers (expired
token, outage), so the caller falls back to the cache instead of reporting 0 % as live data; 429
responses carry the headers and are reported as `denied`.

---

## 3. Cache (`src/data/cache.ts`)

### Cache File Location

```
<claudeHome>/vscode-claude-status-cache.json      # ~/.claude by default
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
`<claudeHome>/projects/` has an `mtime` within the last `seconds` seconds.
