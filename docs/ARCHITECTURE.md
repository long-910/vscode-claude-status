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
- Decide when to make API calls (respect rate limits)
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
  async getProjectCost(workspacePath: string): Promise<ProjectCostData>
  async getPrediction(): Promise<PredictionData>
  async getHeatmapData(days: number): Promise<HeatmapData>

  // Lifecycle
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
    → JsonlReader.readAll()   [always — no API call]
    → ApiClient.fetchHeaders() [1 call — if cache stale]
    → Cache.write()
    → onDidUpdate.fire()
      → StatusBar.update()
      → WebViewPanel.postMessage()
```

#### When Claude Code is idle:

```
StatusBar timer tick (every 60s)
  → DataManager.getUsageData()
    → Cache.read()            [no API call]
    → onDidUpdate.fire() if data changed
```

#### On WebView panel open:

```
User clicks status bar
  → WebViewPanel.show()
    → DataManager.getUsageData()    [cache or API]
    → DataManager.getProjectCost()  [JSONL only, no API]
    → DataManager.getPrediction()   [calculated, no API]
    → DataManager.getHeatmapData()  [JSONL only, no API]
    → WebViewPanel.render()
```

---

## Data Types

```typescript
// Core usage data (from API + JSONL)
interface ClaudeUsageData {
  // From Anthropic API response headers
  utilization5h: number        // 0.0–1.0
  utilization7d: number        // 0.0–1.0
  resetIn5h: number            // seconds until 5h window resets
  resetIn7d: number            // seconds until 7d window resets
  limitStatus: 'allowed' | 'allowed_warning' | 'denied'

  // From local JSONL aggregation
  cost5h: number               // USD
  costDay: number              // USD
  cost7d: number               // USD
  tokensIn5h: number
  tokensOut5h: number
  tokensCacheRead5h: number
  tokensCacheCreate5h: number

  // Metadata
  lastUpdated: Date
  cacheAge: number             // seconds since last API call
  dataSource: 'api' | 'cache' | 'stale'
}

// Per-project cost (JSONL only)
interface ProjectCostData {
  projectName: string          // derived from workspace folder name
  projectPath: string          // ~/.claude/projects/<hash>/
  costToday: number            // USD
  cost7d: number               // USD
  cost30d: number              // USD
  sessionCount: number
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
  daily: DailyUsage[]          // last 90 days
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
  avgCost: number              // USD average per occurrence
  count: number                // how many days had activity at this hour
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
| User clicks "Refresh" button | 1 call |
| Extension activation | 0 calls (read cache first) |
| Realtime mode (opt-in, every 5min) | ~288/day |

Default cache TTL: **300 seconds** (configurable, see SETTINGS.md)

---

## Security

- The extension reads `~/.claude/.credentials.json` to obtain the API token
- The token is **never** stored in VSCode settings, logged, or sent anywhere except `api.anthropic.com`
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
