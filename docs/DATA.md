# Data Layer Specification

## 1. JSONL Reader (`src/data/jsonlReader.ts`)

### Source Files

Claude Code writes session data to:
```
~/.claude/projects/<project-hash>/*.jsonl
```

Each line is a JSON object. Relevant fields:

```jsonc
// Token usage entry (type varies by Claude Code version)
{
  "timestamp": "2026-02-24T10:23:45.123Z",
  "costUSD": 0.0142,
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "cache_read_input_tokens": 8900,
    "cache_creation_input_tokens": 450
  }
}
```

**Important:** Not all lines have `costUSD` or `usage`. Skip lines that fail to parse
or lack the required fields. Never throw on parse errors — log and continue.

### Cost Calculation (fallback when `costUSD` is absent)

Use Claude Sonnet 4.x pricing (same as claude-tmux-status):

| Token type | USD / 1M tokens |
|------------|----------------|
| Input | $3.00 |
| Output | $15.00 |
| Cache read | $0.30 |
| Cache create | $3.75 |

```typescript
function calculateCost(usage: TokenUsage): number {
  return (
    (usage.input_tokens / 1_000_000) * 3.00 +
    (usage.output_tokens / 1_000_000) * 15.00 +
    (usage.cache_read_input_tokens / 1_000_000) * 0.30 +
    (usage.cache_creation_input_tokens / 1_000_000) * 3.75
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

Claude Code converts the workspace path to a hash by replacing `/` with `-`
and prepending `-`. Implement this mapping in `projectCost.ts`.

```typescript
function workspacePathToProjectDir(workspacePath: string): string {
  // /home/user/my-app → -home-user-my-app
  const hash = workspacePath.replace(/\//g, '-')
  return path.join(os.homedir(), '.claude', 'projects', hash)
}
```

> **Verify this mapping** against actual `~/.claude/projects/` directory names
> during first implementation. The exact scheme may differ. Add an integration
> test that reads real directories.

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

### Endpoint

Claude Code uses `POST /v1/messages` with a minimal payload to trigger rate-limit
headers in the response. Use the same approach as claude-tmux-status.

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': credentials.claudeAiOauthToken,  // from credentials.json
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5',   // cheapest model to minimize cost
    max_tokens: 1,
    messages: [{ role: 'user', content: '.' }],
  }),
})
```

### Rate Limit Headers to Extract

```
anthropic-ratelimit-unified-5h-utilization    → utilization5h (e.g. "0.78")
anthropic-ratelimit-unified-5h-reset          → ISO datetime string
anthropic-ratelimit-unified-7d-utilization    → utilization7d
anthropic-ratelimit-unified-7d-reset          → ISO datetime string
anthropic-ratelimit-unified-5h-allowed        → "true"/"false"
```

Parse `reset` header to compute seconds until reset:
```typescript
const resetDate = new Date(response.headers.get('anthropic-ratelimit-unified-5h-reset')!)
const resetIn5h = Math.max(0, (resetDate.getTime() - Date.now()) / 1000)
```

### Credentials File

```typescript
interface ClaudeCredentials {
  claudeAiOauthToken: string
}

const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
const creds: ClaudeCredentials = JSON.parse(await fs.readFile(credPath, 'utf-8'))
```

If the file doesn't exist or the token is invalid, set `dataSource: 'no-credentials'`
and show a status bar message guiding the user to log in with Claude Code.

---

## 3. Cache (`src/data/cache.ts`)

### Cache File Location

```
~/.claude/vscode-claude-status-cache.json
```

### Cache Schema

```typescript
interface CacheFile {
  version: 1
  updatedAt: string           // ISO datetime
  usageData: {
    utilization5h: number
    utilization7d: number
    resetIn5h: number
    resetIn7d: number
    limitStatus: string
  }
}
```

Cost and token data are NOT cached (always read from JSONL directly — it's local
and fast). Only the API response values are cached.

### Cache Validity Logic

```typescript
function isCacheValid(cache: CacheFile, ttlSeconds: number): boolean {
  const age = (Date.now() - new Date(cache.updatedAt).getTime()) / 1000
  return age < ttlSeconds
}
```

### When to Call the API

```typescript
async function shouldCallApi(): Promise<boolean> {
  const cache = await readCache()
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
