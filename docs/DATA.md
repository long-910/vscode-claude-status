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

#### Model-aware pricing (default)

Every assistant entry carries `message.model`. With `claudeStatus.pricing.useModelPricing`
enabled (the default), each entry is priced by its model (`src/data/pricing.ts`):

1. **Normalize the id** — provider prefixes (`us.anthropic.`, `anthropic.`), snapshot dates
   (`-20250929`, `@20251101`), Bedrock version suffixes (`-v1:0`) and `[1m]` are removed:
   `us.anthropic.claude-sonnet-4-5-20250929-v1:0` → `claude-sonnet-4-5`.
2. **User override** — if a key of `claudeStatus.pricing.modelOverrides` is contained in the
   normalized id, that rate is used (longest key wins). Source: `override`.
3. **Family + version** — the id is parsed as `claude-<family>-<major>[-<minor>]` or the
   Claude 3 form `claude-<major>[-<minor>]-<family>` (Mythos uses Fable's rates). The rate is
   the newest table row whose version is ≤ the model's. Source: `builtin`.
4. **Newer than the table** — a known family with a version above the last row (e.g. a future
   `claude-opus-6`), or without a version, uses the family's latest row. Source: `estimated`;
   the dashboard marks it with `≈` and suggests an override.
5. **Unknown model** (e.g. `<synthetic>`, missing `model`) — the manual rates below. Source:
   `manual`.

Built-in table (USD per 1M tokens, Anthropic first-party pricing, checked against
[platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
on 2026-10-31; `pricing.test.ts` mirrors the published table):

| Family | From version | Input | Output | Cache read |
|---|---|---|---|---|
| Fable / Mythos | 5.0 | $10.00 | $50.00 | $1.00 |
| Fable / Mythos | 5.1 | $10.00 | $50.00 | $0.25 |
| Opus | 3.0 (3, 4.0, 4.1) | $15.00 | $75.00 | $1.50 |
| Opus | 4.5 (4.5 – 4.8) | $5.00 | $25.00 | $0.50 |
| Opus | 5.0 | $5.00 | $25.00 | $0.50 |
| Opus | 5.5 | $4.00 | $20.00 | $0.20 |
| Sonnet | 3.0 (3.x – 4.x) | $3.00 | $15.00 | $0.30 |
| Sonnet | 5.0 | $2.00 | $10.00 | $0.20 |
| Sonnet | 5.5 | $2.00 | $10.00 | $0.10 |
| Haiku | 3.0 | $0.25 | $1.25 | $0.03 |
| Haiku | 3.5 | $0.80 | $4.00 | $0.08 |
| Haiku | 4.5 | $1.00 | $5.00 | $0.10 |
| Haiku | 5.5 (prompt ≤ 100K tokens) | $0.10 | $0.50 | $0.01 |
| Haiku | 5.5 (prompt > 100K tokens) | $0.50 | $2.50 | $0.05 |

5-minute cache writes are 1.25x and 1-hour cache writes 2x the model's input rate. "Prompt"
for the Haiku 5.5 rate card is `input + cache read + cache creation` tokens of the entry.

**Pricing modifiers** recorded on `message.usage` (applied to built-in / estimated rates only,
never to manual rates or overrides):

| Field | Value | Multiplier |
|---|---|---|
| `usage.speed` | `"fast"` (fast mode: Opus 5.5 / 5 / 4.8) | 2x every category |
| `usage.inference_geo` | `"us"` (US-only inference, Claude 4.6+) | 1.1x every category |

Batch API discounts and partner platforms' own price lists (Bedrock, Google-managed Vertex)
are not modelled — Claude Code uses the Messages API, and partner prices differ by region.

**When Anthropic releases a model or changes a price:** add or edit a row in
`MODEL_RATES` (`src/data/pricing.ts`) — every released model gets its own row, even at an
unchanged price, so it is reported as `builtin` rather than `estimated` — and add the id to
the "every released model resolves as builtin" test in `pricing.test.ts`. Until a release
ships, users can set `claudeStatus.pricing.modelOverrides`.

All cost consumers (status bar totals, project cost, prediction, heatmap) take the same
`CostOptions` (`config.costOptions`), so they always agree. With `useModelPricing: false`
every entry uses the manual rates — identical to the calculation before model pricing.
The dashboard's token breakdown lists the 5-hour cost per model (`costByModel5h`) and how
each was priced (`pricingByModel5h`).

#### Manual rates

Default rates are based on Claude Sonnet 4.x pricing.
**All four rates are user-configurable** via `claudeStatus.pricing.*` settings.

| Token type | Setting key | Default (USD / 1M) |
|------------|-------------|-------------------|
| Input | `claudeStatus.pricing.inputPerMillion` | $3.00 |
| Output | `claudeStatus.pricing.outputPerMillion` | $15.00 |
| Cache read | `claudeStatus.pricing.cacheReadPerMillion` | $0.30 |
| Cache create (5-minute TTL) | `claudeStatus.pricing.cacheCreatePerMillion` | $3.75 |

Cache writes with a **1-hour TTL** are billed by Anthropic at 2x the input rate rather than
the 1.25x of the 5-minute tier, so they are priced as `inputPerMillion * 2` and follow the
`inputPerMillion` setting. Claude Code reports the split in `usage.cache_creation`
(`ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`); entries predating that field
keep the whole `cache_creation_input_tokens` bucket on the 5-minute rate.

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

const ONE_HOUR_CACHE_WRITE_MULTIPLIER = 2

function calculateCost(usage: TokenUsage, pricing: TokenPricing): number {
  const cacheCreateTotal = usage.cache_creation_input_tokens || 0
  const cacheCreate1h = Math.min(
    Math.max(usage.cache_creation?.ephemeral_1h_input_tokens || 0, 0),
    cacheCreateTotal
  )
  const cacheCreate5m = cacheCreateTotal - cacheCreate1h

  return (
    ((usage.input_tokens || 0) / 1_000_000) * pricing.inputPerMillion +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.outputPerMillion +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheReadPerMillion +
    (cacheCreate5m / 1_000_000) * pricing.cacheCreatePerMillion +
    (cacheCreate1h / 1_000_000) * pricing.inputPerMillion * ONE_HOUR_CACHE_WRITE_MULTIPLIER
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
- **Bounded retention.** Records older than 30 days (the widest window, project
  cost) are dropped, and files not modified in 30 days are evicted.

`readAllUsage()`, project cost and prediction all share this index. The heatmap
(up to `heatmap.days` of history) is computed separately, only while the
dashboard is open, reading at most 4 files at a time.

### Streaming Deduplication (applies to ALL readers)

Claude Code writes one JSONL entry per content block of a streaming response, all
sharing the same `requestId` and the same `usage`. Every reader — `readJsonlFile()`,
the usage index, and the heatmap — dedupes per file with `usageDedupeKey()`
(`requestId`, falling back to `message.id`). Entries with neither key are all counted.
New readers must use the same helper, or their totals will be inflated 2–4× in
agentic sessions.

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
export type ClaudeProvider = 'claude-ai' | 'claude-ai-usage' | 'aws-bedrock' | 'api-key' | 'unknown'

async function detectProvider(customCredPath?: string | null): Promise<ClaudeProvider> {
  // 1. OAuth credentials → claude-ai, or claude-ai-usage when the account is usage-based
  // 2. AWS env vars → aws-bedrock
  // 3. ANTHROPIC_API_KEY → api-key
  // 4. fallback → unknown
}
```

Non-`claude-ai` providers always use cost mode (no rate limit percentages).

**Usage-based plans** (`src/data/accountInfo.ts`): Claude Code stores the signed-in account in
its global config — `~/.claude.json`, or `<claudeHome>/.claude.json` when `claudeStatus.claudeHome`
points elsewhere (the `CLAUDE_CONFIG_DIR` layout) — as `oauthAccount.billingType`, copied from the
organization's `billing_type`. `"usage_based"` (e.g. usage-based Enterprise: seat fee plus all usage at
standard API rates, no per-seat 5-hour / weekly limits) maps to `claude-ai-usage`; Claude Code itself
switches its usage-limit handling off for that value. The file can be large (it holds per-project
history), so it is parsed only when its mtime or size changes. `claude-ai-usage` never calls the
rate-limit API — there are no windows to read, and the probe request would be billed against the
organization's spend limits.

`fetchRateLimitData()` rejects an error response that carries no unified rate-limit headers (expired
token, outage), so the caller falls back to the cache instead of reporting 0 % as live data; 429
responses carry the headers and are reported as `denied`.

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
