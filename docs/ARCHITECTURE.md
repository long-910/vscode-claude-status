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

## Bundle Layout

The extension is split into two webpack chunks to minimise startup parse time:

| File | Size | When loaded |
|------|------|-------------|
| `dist/extension.js` | ~120 KiB | Always — at extension activation |
| `dist/panel.js` | ~60 KiB | On demand — first time the dashboard is opened |

`src/webview/panel.ts` is loaded via dynamic `import()` inside the `openDashboard`
command handler and is never parsed during the critical activation path.

---

## Modules

| Module | Responsibility | Spec |
|---|---|---|
| `extension.ts` | Activation, commands, settings listener, notifications (`checkAndNotify`) | [04](features/04-prediction.md#notification-system) |
| `config.ts` | Typed accessors for every `claudeStatus.*` setting, incl. `costOptions` | [SETTINGS](SETTINGS.md) |
| `statusBar.ts` | Status bar label / tooltip / colour; shared display helpers (`formatDuration`, `providerLabel`, `formatMonthCost`, `showTimeWindows`) used by every surface | [01](features/01-statusbar.md) |
| `treeView.ts` | Activity Bar *Usage Overview* — renders `getLastData()`, no I/O of its own | [06](features/06-treeview.md) |
| `webview/panel.ts` | Dashboard panel: HTML / CSS / JS and the message protocol | [02](features/02-webview.md) |
| `webview/heatmap.ts` | Daily / hourly / weekday × hour aggregation | [05](features/05-heatmap.md) |
| `webview/formatDuration.ts` | The one duration algorithm (60m / 24h rollover); mirrored by the inline `fmt()` in the dashboard JS | — |
| `data/dataManager.ts` | Singleton: refresh scheduling, provider choice, API vs cache, `onDidUpdate` | below |
| `data/jsonlReader.ts` | File discovery (`findAllJsonlFiles`), line streaming, `readAllUsage()` totals | [DATA](DATA.md#1-jsonl-reader-srcdatajsonlreaderts) |
| `data/usageIndex.ts` | Incremental per-file index; `parseUsageLine()` / `firstSeen()` — the only line parser and dedupe | [DATA](DATA.md#incremental-reading-srcdatausageindexts) |
| `data/pricing.ts` | Manual rates, per-model table, overrides, modifiers, `usageCost()` | [PRICING](PRICING.md) |
| `data/apiClient.ts` | Provider detection, rate-limit probe | [DATA](DATA.md#2-api-client-srcdataapiclientts), [PLANS](PLANS.md) |
| `data/accountInfo.ts` | Reads `oauthAccount.billingType` (usage-based plans) | [PLANS](PLANS.md#detection-claudestatusclaudeprovider-auto) |
| `data/cache.ts` | Rate-limit cache file | [DATA](DATA.md#3-cache-srcdatacachets) |
| `data/claudeHome.ts` | Resolves `claudeStatus.claudeHome` | [SETTINGS](SETTINGS.md#data-directory) |
| `data/projectCost.ts` | Workspace → project directory, per-project totals | [03](features/03-project-cost.md) |
| `data/prediction.ts` | Burn rate, exhaustion and budget prediction | [04](features/04-prediction.md) |
| `data/budget.ts` | Budget thresholds and once-per-period alert tracking | [04](features/04-prediction.md#notification-deduplication) |
| `data/localTime.ts` | Local calendar helpers (`localDateKey`, `startOfMonth`) | — |
| `data/exportUsage.ts` | CSV / JSON serializers for *Export Usage Data* | [SETTINGS](SETTINGS.md#export-usage-data) |

Pure modules (`pricing`, `budget`, `localTime`, `exportUsage`, `webview/formatDuration`,
`webview/heatmap` aggregations) have no `vscode` dependency and are unit-tested directly.

### DataManager (`src/data/dataManager.ts`)

Central singleton; every UI surface gets its data through it.

- `getUsageData(force?)` — provider detection, local totals (`readAllUsage`), API or cache.
- `refresh()` — single-flight; watcher events are coalesced (`scheduleRefresh`, 5 s).
- `forceRefresh()` — the *Refresh* command / button; invalidates the heatmap cache.
- `republish()` — re-sends the last data after a display-only setting change (no I/O).
- `getPrediction()`, `refreshProjectCosts()`, `getHeatmapData()` (5-minute cache, only
  computed while the dashboard is open — `setDashboardOpen()`), `invalidateHeatmap()`.
- `onDidUpdate` — fired after each refresh, and again when a background heatmap finishes.

---

## Data Flow

### When Claude Code is active (JSONL updated recently):

```
FileWatcher detects JSONL change
  → DataManager.scheduleRefresh()  [coalesced: at most once per 5 s]
  → DataManager.refresh()          [single-flight]
    → JsonlReader.readAllUsage()   [always — reads only bytes appended since last refresh]
    → ApiClient.fetchRateLimitData() [1 call — if cache stale AND rateLimitApi.enabled]
    → Cache.write()
    → onDidUpdate.fire()
      → StatusBar.update()
      → TreeView.refresh()           [sidebar; reads DataManager's last data, no I/O]
      → WebViewPanel.postMessage()
    → getHeatmapData() [background, only while the dashboard is open; fires second onDidUpdate when done]
```

### When Claude Code is idle:

```
StatusBar timer tick (every 60s)
  → DataManager.getUsageData()
    → Cache.read()            [no API call]
    → onDidUpdate.fire() if data changed
```

### Which provider calls the API

Only `claude-ai`, and only under the rules in [PLANS.md](PLANS.md#rate-limit-api-calls-claude-ai-only).
`claude-ai-usage`, `api-key`, `aws-bedrock` and `unknown` never call it.

### On WebView panel open:

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

The shapes are defined in the source; the fields that matter across modules:

| Type (file) | Key fields |
|---|---|
| `ClaudeUsageData` (`dataManager.ts`) | rate limits `utilization5h/7d`, `resetIn5h/7d`, `limitStatus`, `has7dLimit`; totals `cost5h`, `costDay`, `cost7d`, `costMonth`, `tokens*5h`, `costByModel5h`, `pricingByModel5h`; `providerType`, `dataSource`, `cacheAge` |
| `ProjectCostData` (`projectCost.ts`) | `projectName`, `projectPath`, `costToday`, `cost7d`, `cost30d`, `sessionCount`, `lastActive` |
| `PredictionData` (`prediction.ts`) | `currentBurnRate`, `estimatedExhaustionIn/Time`, `budgetRemaining`, `budgetExhaustionTime`, `recommendationKey` |
| `HeatmapData` (`heatmap.ts`) | `daily[]` (`date`, `cost`, `sessionCount`, `tokensTotal`), `hourly[]`, `dowHour[7][24]` |
| `UsageRecord` (`usageIndex.ts`) | `timestamp`, normalized `usage` (incl. `speed`, `inference_geo`), `model` |

**`dataSource` values:**

| Value | Meaning |
|-------|---------|
| `'api'` | Fresh data from the Anthropic API this refresh |
| `'cache'` | Cache valid (within TTL), no API call needed |
| `'stale'` | Cache expired or `rateLimitApi.enabled: false`; old rate data shown with `[Xm ago]` |
| `'local-only'` | No rate-limit data: pay-as-you-go provider (always for `claude-ai-usage`), or no cache; cost mode |
| `'no-credentials'` | No credentials and no local cost data |
| `'no-data'` | Fallback before any data is available (status bar: `Claude: run refresh`) |

---

## Security

- The OAuth access token is read from `<claudeHome>/.credentials.json`
  (`claudeStatus.credentials.path`; on macOS the Keychain entry `Claude Code-credentials`).
- The token is **never** stored in VS Code settings, logged, or sent anywhere except
  `api.anthropic.com` (`Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`).
- `claudeHome` and `credentials.path` are machine-scoped, so a workspace cannot redirect them.
- The WebView uses a strict Content Security Policy; external scripts come only from
  `https://cdn.jsdelivr.net` (Chart.js, pinned).

---

## Platform Support

| Platform | Status |
|----------|--------|
| Linux | ✅ Primary |
| macOS | ✅ Supported (Keychain credential fallback) |
| Windows + WSL2 | ✅ Supported — run the extension in WSL (VS Code *WSL* remote), where `os.homedir()` is the Linux home that holds `~/.claude` |
| Windows (native) | ⚠️ Not tested — paths come from `os.homedir()`; set `claudeStatus.claudeHome` if the data lives elsewhere |
