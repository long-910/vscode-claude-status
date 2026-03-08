# Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        VSCode Extension Host                 │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │  StatusBar   │    │  WebView     │    │  FileWatcher  │ │
│  │  (always on) │    │  Panel       │    │  (JSONL)      │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬────────┘ │
│         │                   │                    │          │
│         └───────────────────┴────────────────────┘          │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  DataManager    │                      │
│                    │  (singleton)    │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│         ┌───────────────────┼───────────────────┐           │
│         │                   │                   │           │
│  ┌──────▼──────┐  ┌─────────▼──────┐  ┌────────▼──────┐   │
│  │ JsonlReader │  │   ApiClient    │  │    Cache      │   │
│  │ (local)     │  │ (rate headers) │  │ (disk-backed) │   │
│  └─────────────┘  └────────────────┘  └───────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  ~/.claude/     │
                    │  projects/      │
                    │  **/*.jsonl     │
                    └─────────────────┘
```

---

## Core Components

### DataManager (`src/data/dataManager.ts`)

Central singleton. All UI components get data exclusively through this class.

**Responsibilities:**
- Orchestrate JsonlReader, ApiClient, and Cache
- Decide when to make API calls (respect rate limits and `rateLimitApi.enabled`)
- Emit `onDidUpdate` event when data changes
- Provide typed data accessors for each feature

**Key method signatures:**
```typescript
class DataManager {
  // Singleton
  static getInstance(): DataManager

  // Events
  readonly onDidUpdate: vscode.Event<ClaudeUsageData>

  // Data accessors
  async getUsageData(forceRefresh?: boolean): Promise<ClaudeUsageData>
  async getPrediction(): Promise<PredictionData | null>
  async getHeatmapData(): Promise<HeatmapData | null>

  // Project costs (multi-root aware)
  async refreshProjectCosts(): Promise<void>
  getLastProjectCosts(): ProjectCostData[]

  // Lifecycle
  async refresh(): Promise<void>
  async forceRefresh(): Promise<void>
  startWatching(): void
  dispose(): void
}
```

---

### Data Flow

#### When Claude Code is active (JSONL updated recently):

```
FileWatcher detects JSONL change
  → DataManager.refresh()
    → JsonlReader.readAllUsage()   [always — fast, local]
    → ApiClient.fetchRateLimitData() [1 call — if cache stale AND rateLimitApi.enabled]
    → Cache.write()
    → onDidUpdate.fire()
      → StatusBar.update()
      → WebViewPanel.postMessage()
    → getHeatmapData() [background, fires second onDidUpdate when done]
```

#### When Claude Code is idle:

```
StatusBar timer tick (every 60s)
  → DataManager.getUsageData()
    → Cache.read()            [no API call]
    → onDidUpdate.fire() if data changed
```

#### When `rateLimitApi.enabled: false` (claude-ai provider):

```
DataManager.getUsageData()
  → Cache.read()
  → if cache exists → rateLimitData from cache, dataSource = 'stale'
  → if no cache    → dataSource = 'local-only' (cost mode only)
```

#### On WebView panel open:

```
User clicks status bar
  → WebViewPanel.show()
    → DataManager.getUsageData()      [cache or API]
    → DataManager.refreshProjectCosts()  [JSONL only, no API]
    → DataManager.getPrediction()        [calculated, no API]
    → DataManager.getHeatmapData()       [JSONL only, no API, cached 5 min]
    → WebViewPanel.postMessage({ type: 'update', data: ... })
```

---

## Data Types

```typescript
// Core usage data (from API + JSONL)
interface ClaudeUsageData {
  // From Anthropic API response headers (or cache)
  utilization5h: number        // 0.0–1.0
  utilization7d: number        // 0.0–1.0
  resetIn5h: number            // seconds until 5h window resets
  resetIn7d: number            // seconds until 7d window resets
  limitStatus: 'allowed' | 'allowed_warning' | 'denied'
  has7dLimit: boolean          // false on non-Max plans or non-claude-ai providers

  // From local JSONL aggregation (always calculated from tokens — no costUSD field)
  cost5h: number               // USD
  costDay: number              // USD
  cost7d: number               // USD
  tokensIn5h: number
  tokensOut5h: number
  tokensCacheRead5h: number
  tokensCacheCreate5h: number

  // Provider type (controls whether % or cost mode is used)
  providerType: 'claude-ai' | 'aws-bedrock' | 'api-key' | 'unknown'

  // Metadata
  lastUpdated: Date
  cacheAge: number             // seconds since last API call (0 if no cache)
  dataSource: 'api' | 'cache' | 'stale' | 'local-only' | 'no-credentials' | 'no-data'
}
```

**`dataSource` values:**

| Value | Meaning |
|-------|---------|
| `'api'` | Fresh data from Anthropic API this refresh |
| `'cache'` | Cache valid (within TTL), no API call needed |
| `'stale'` | Cache expired or `rateLimitApi.enabled=false`; showing old rate data with `[Xm ago]` |
| `'local-only'` | Non-claude-ai provider or no cache; cost mode only, no rate % |
| `'no-credentials'` | No credentials / no JSONL data found |
| `'no-data'` | Credentials OK but no JSONL data yet |

```typescript
// Per-project cost (JSONL only)
interface ProjectCostData {
  projectName: string          // derived from workspace folder name
  projectPath: string          // ~/.claude/projects/<hash>/
  costToday: number            // USD
  cost7d: number               // USD
  cost30d: number              // USD
  sessionCount: number         // number of JSONL files in project dir
  lastActive: Date
}

// Prediction
interface PredictionData {
  estimatedExhaustionTime: Date | null  // null if pace is slow
  estimatedExhaustionIn: number | null  // seconds, null if safe
  currentBurnRate: number               // USD/hour
  budgetRemaining: number | null        // null if no budget set
  budgetExhaustionTime: Date | null
  safeToStartHeavyTask: boolean
  recommendation: string                // human-readable advice
}

// Heatmap
interface HeatmapData {
  daily: DailyUsage[]          // last N days (configurable, default 90)
  hourly: HourlyUsage[]        // last 30 days, by hour-of-day
}

interface DailyUsage {
  date: string                 // ISO date "2026-02-24"
  cost: number                 // USD
  sessionCount: number
  tokensTotal: number
}

interface HourlyUsage {
  hour: number                 // 0–23
  avgCost: number              // USD average per entry at this hour
  count: number                // number of entries at this hour
}
```

---

## API Call Budget

The extension must minimize Anthropic API calls (same policy as claude-tmux-status).

| Situation | API calls |
|-----------|-----------|
| JSONL updated (Claude active) | 1 call → cached |
| Cache age < TTL, Claude idle | 0 calls (read cache) |
| Cache stale, Claude idle | 0 calls (show stale data with age label) |
| `rateLimitApi.enabled: false`, cache exists | 0 calls (show cached % with stale age) |
| `rateLimitApi.enabled: false`, no cache | 0 calls (cost-only mode) |
| User clicks "↻ Refresh" button | 1 call |
| Extension activation | 0 calls (read cache first) |
| Realtime mode (opt-in, every 5min) | ~288/day |

Default cache TTL: **300 seconds** (configurable, see SETTINGS.md)

---

## Security

- The extension reads `~/.claude/.credentials.json` to obtain the OAuth access token
- The token is **never** stored in VSCode settings, logged, or sent anywhere except `api.anthropic.com`
- Authentication uses `Authorization: Bearer <token>` + `anthropic-beta: oauth-2025-04-20` header
- The WebView uses a strict Content Security Policy (CSP)
- External scripts loaded only from `https://cdn.jsdelivr.net` (Chart.js)

---

## Platform Support

| Platform | Status |
|----------|--------|
| Linux (native) | ✅ Primary |
| macOS | ✅ Supported |
| Windows (WSL2) | ✅ Supported (homedir resolved via WSL path) |
| Windows (native) | ⚠️ Limited (Claude Code itself requires WSL) |

For WSL2: detect if running inside WSL via `process.env.WSL_DISTRO_NAME`, then resolve
`~/.claude/` as `/home/<user>/.claude/` rather than the Windows home directory.
