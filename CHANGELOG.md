# Changelog

All notable changes to **vscode-claude-status** are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.4.0] — 2026-03-08

### Added

- **Rate Limit Timeline chart** — Chart.js line chart in the Prediction card showing
  projected 5h utilization from now to the next window reset. Includes:
  - Solid fill line from current utilization to predicted exhaustion point (100 %)
  - Linear projection continues flat at 100 % through to reset if exhaustion is predicted
  - Orange dashed reference line at 75 % (warning threshold)
  - Red dashed reference line at 100 % (hard limit)
  - Line colour adapts to severity: blue → orange (≥ 75 %) → red (≥ 90 %)
  - Tooltip shows utilization % at each time point
  - Chart hidden automatically for non-claude-ai providers and when no utilization
    data is available

- **Token breakdown** — collapsible section inside the Token Cost card (▶ toggle):
  - Per-type token counts and individual costs for the 5 h window:
    Input tokens (`$X.XX/M`), Output tokens, Cache read, Cache create
  - **Cache hit ratio** — percentage of input tokens served from cache (`cache_read /
    (input + cache_read)`); shows "Good! Cache is saving cost." when ≥ 50 %
  - All costs use the currently configured `claudeStatus.pricing.*` rates

- **Monthly cost projection** — "Month (est.)" row in the Token Cost card:
  - Derived from today's JSONL cost × 30 (falls back to 7-day average if today = $0)
  - Hidden when no cost data is available yet

- **Weekly budget progress bar** — shown in the Prediction card when
  `claudeStatus.budget.weeklyUsd` is set:
  - Progress bar, spent / total / percentage display
  - Warning alert at ≥ 80 % of weekly budget

- **Pricing & Settings card** — always-visible card above the Usage History section:
  - Token pricing grid: Input / Output / Cache read / Cache create (per 1M tokens)
  - Status badges: provider type, API enabled/disabled state, cache TTL
  - "⚙ Edit pricing & settings" button opens VSCode settings filtered to `claudeStatus`
  - Collapsible via "▲ Hide" / "▼ Show" toggle (default: expanded)

### Fixed

- **CSP: inline `onclick` attributes blocked** — all `onclick="fn()"` HTML attributes
  have been replaced with `addEventListener` calls (for static buttons) and a single
  document-level event delegation handler (for dynamically generated buttons).
  This fixes Token breakdown, Pricing & Settings toggle, budget configure / save /
  disable buttons, and the "Edit pricing & settings" link — all of which were silently
  blocked by the `script-src 'nonce-...'` Content Security Policy.

### Changed

- `DashboardMessage` now includes `pricing: TokenPricing` and
  `settings: { provider, apiEnabled, cacheTtlSeconds, weeklyBudget }` so the WebView
  can render the Pricing & Settings card and token breakdown without extra round-trips.
- Pricing & Settings card re-renders on every data update to stay in sync when settings
  change while the dashboard is open.

---

## [0.3.3] — 2026-03-05

### Added

- **Multi-provider support** — the extension now handles AWS Bedrock and direct
  API key users in addition to Claude.ai subscriptions:
  - **Auto-detection** (`claudeStatus.claudeProvider: "auto"`, default) — checks
    for an OAuth credentials file first; if absent, inspects environment variables
    (`ANTHROPIC_BEDROCK_BASE_URL`, `AWS_BEDROCK_RUNTIME_URL`, `CLAUDE_AWS_REGION`
    for Bedrock; `ANTHROPIC_API_KEY` for API key); falls back to cost-only display
    when local JSONL data is available, or `Not logged in` when no data exists.
  - **Explicit provider setting** (`claudeStatus.claudeProvider`) — can be set to
    `"claude-ai"`, `"aws-bedrock"`, or `"api-key"` to skip auto-detection.
  - AWS Bedrock / API key users: rate-limit percentages are hidden; status bar
    always shows token cost (`5h:$0.15 7d:$0.42`) computed from local JSONL.
- **`has7dLimit` detection** — the 7 d utilization window is now detected at
  runtime from the presence of `anthropic-ratelimit-unified-7d-reset` response
  header. Plans that only expose a 5 h window (e.g. certain Claude.ai tiers)
  will show only `5h:X%` without a 7 d column.
- **`claudeStatus.claudeProvider`** setting added to `package.json` contributes
  (enum: `"auto"` | `"claude-ai"` | `"aws-bedrock"` | `"api-key"`, default `"auto"`).

### Changed

- **`src/data/apiClient.ts`** — `RateLimitData` gains `has7dLimit: boolean`;
  `fetchRateLimitData` sets it from header presence; `allowed_warning` no longer
  triggers on 7 d utilization when `has7dLimit` is false; new exported
  `detectProvider()` performs credential + env-var probing.
- **`src/data/dataManager.ts`** — `ClaudeUsageData` gains `has7dLimit` and
  `providerType`; `dataSource` union extended with `'local-only'`; `getUsageData`
  skips API rate-limit call for non-claude-ai providers.
- **`src/statusBar.ts`** — `buildLabel` forces cost mode for non-claude-ai
  providers and omits 7 d column when `has7dLimit` is false; `buildTooltip`
  shows rate-limit bars only for claude-ai and adapts header for other providers;
  `applyColor` skips warning/error colours for non-claude-ai providers.
- **`src/config.ts`** — added `claudeProvider` getter.
- **`src/test/suite/statusBar.test.ts`** — `makeData` helper updated with
  `has7dLimit: true` and `providerType: 'claude-ai'` defaults.

---

## [0.3.2] — 2026-03-01

### Added

- **`CONTRIBUTING.md`** (new) — consolidated developer guide replacing
  `DEVELOPMENT.md`; covers local setup, project structure, architecture,
  data flow, JSONL format, token cost formula, CI/CD workflows, release
  procedure, and feature spec index.
- **`.github/dependabot.yml`** (new) — Dependabot configuration for automatic
  dependency updates: npm (weekly, Monday 03:00 JST) and GitHub Actions (weekly,
  Monday 03:00 JST); minor/patch updates grouped; `@types/vscode` major bumps
  ignored; PRs assigned to `long-910` with `dependencies` labels.
- **`package.json`** — Added `sponsor.url` (`https://github.com/sponsors/long-910`)
  and `bugs.url` fields for VS Code Marketplace display.

### Changed

- **`README.md`** / **`README.ja.md`** — Added GitHub Sponsors badge; Contributing
  section now links to `CONTRIBUTING.md`.
- **`package.json`** — Formatted `enum` arrays to multi-line JSON style
  (cosmetic; no functional change).
- **`.gitignore`** — Added `*Zone.Identifier` to suppress Windows/WSL
  alternate data stream files from being tracked.

### Removed

- **`DEVELOPMENT.md`** — content fully migrated to `CONTRIBUTING.md`.
- **`vsc-extension-quickstart.md`** — VS Code scaffold template, superseded
  by project-specific documentation.

---

## [0.3.1] — 2026-02-28

### Changed

- **`README.md`** — split into user-facing content only; removed How It Works,
  CI/CD, and Development sections; fixed Marketplace install section
  (removed "coming soon" label)
- **`README.ja.md`** — full sync with English README in the same structure
- **`DEVELOPMENT.md`** (new) — dedicated developer guide containing:
  data flow, JSONL format, project path mapping, token cost formula,
  CI/CD workflows, release procedure, local setup, project structure,
  and architecture diagram
- **`CLAUDE.md`** — added rule: never push directly to `main`; always open a PR

---

## [0.3.0] — 2026-02-28

### Added

#### Session History Heatmap — Feature 05

- **`src/webview/heatmap.ts`** (new) — Data aggregation engine:
  - `getHeatmapData(days)` — reads all projects' JSONL in parallel
    (`Promise.all`); skips directories/files with `mtime < cutoff` for
    performance; returns `HeatmapData { daily, hourly, generatedAt }`.
  - `aggregateByDay(entries, days)` — groups entries by local date key
    (`YYYY-MM-DD`), fills every day in the window with zeroes for gaps,
    returns array in ascending date order.
  - `aggregateByHour(entries, days)` — buckets entries into 24 local-hour
    slots for the last 30 days, computes `avgCost` and `count` per hour.
  - Helper functions exported for unit testing.
- **`src/data/dataManager.ts`** — Added `getHeatmapData()` with a 5-minute
  in-memory TTL cache and `getLastHeatmapData()` (synchronous).
  `refresh()` / `forceRefresh()` fire `onDidUpdate` twice: once immediately
  (fast; usage + prediction), then again when the heatmap finishes in the
  background (`refreshHeatmapBackground()`). A `heatmapPending` guard
  prevents concurrent recomputes.
- **`src/webview/panel.ts`** — Full heatmap section in the dashboard:
  - **Daily heatmap** — CSS grid (`grid-template-rows: repeat(7, 12px);
    grid-auto-flow: column`) with day-of-week padding for correct alignment,
    month labels, five green intensity levels (l0–l4) based on cost relative
    to the window maximum, hover tooltip showing date + cost + message count.
  - **Hourly bar chart** — `<canvas id="hourlyChart">` rendered by
    Chart.js 4.4.0 loaded from `cdn.jsdelivr.net`; respects VS Code CSS
    variables for foreground and progress-bar colours; previous chart
    instance is destroyed before re-render to prevent leaks.
  - Chart.js CDN script tag added (nonce-gated, allowed by existing CSP).
  - `HeatmapData` placeholder type replaced with real import from
    `dataManager`; `sendUpdate()` passes `getLastHeatmapData()`.
  - On WebView `ready`, a background heatmap load is triggered if no cached
    data is available, followed by a second `sendUpdate` when complete.
- **`src/test/suite/heatmap.test.ts`** (new) — Unit tests for pure functions:
  `aggregateByDay` (length, zero-fill, cost accumulation, date format, sort
  order) and `aggregateByHour` (length, hour indices, avg computation, window
  cutoff).

---

## [0.2.0] — 2026-02-28

### Added

#### Usage Prediction & Budget Alerts — Feature 04

- **`src/data/prediction.ts`** (new) — Prediction engine with three exported
  pure functions (`calculateBurnRate`, `buildRecommendation`) and a main async
  entry point (`computePrediction`):
  - Reads the last 30-minute JSONL window to compute a burn rate in USD/hour.
  - Estimates time until the 5 h rate-limit window is exhausted:
    derives total capacity from `cost5h / utilization5h`, then divides
    remaining capacity by current burn rate; result is capped at `resetIn5h`
    so the prediction is never beyond the next window reset.
  - Returns `safeToStartHeavyTask: true` when > 30 minutes remain.
  - Optional daily budget: computes `budgetRemaining` and `budgetExhaustionTime`
    from `costToday` and burn rate.
- **`src/data/dataManager.ts`** — Added `getPrediction()` (computes fresh,
  caches result) and `getLastPrediction()` (returns cached value synchronously).
  `refresh()` / `forceRefresh()` now call `getPrediction()` before firing
  `onDidUpdate`, so notification listeners always see an up-to-date prediction.
- **`src/config.ts`** — Added `setDailyBudget(value: number | null)` method.
- **`src/webview/panel.ts`** — Replaced placeholder `PredictionData` type with
  the real import from `dataManager`.  `sendUpdate()` is now `async` and calls
  `getPrediction()` on each update.  The Prediction card in the dashboard now
  shows:
  - Burn rate row (`$X.XX/hr`)
  - Rate-limit exhaustion alert (info / warning / error styling by severity)
  - Daily budget progress bar + exhaustion time (when budget is set)
  - Collapsible budget input form ("⚙ Set daily budget" / "⚙ Configure budget")
  - Recommendation text
  The `setBudget` message handler now calls `config.setDailyBudget()` and
  triggers `forceRefresh()` instead of a no-op placeholder.
- **`src/extension.ts`** — Notification system:
  - `notifiedKeys` `Set<string>` deduplicates alerts within a session window.
  - `checkWindowReset()` clears keys when `resetIn5h` jumps by > 1 h (window
    reset detected).
  - `checkAndNotify()` fires `showWarningMessage` at ≤ threshold minutes,
    `showErrorMessage` with "Open Dashboard" action at ≤ 10 min; marks key
    **before** `await` to prevent duplicate dialogs.
  - Budget warning fires once when `budgetRemaining / dailyBudget` falls below
    `(100 − alertThresholdPercent) %`.
  - `vscode-claude-status.setBudget` command now opens an `InputBox` with
    validation; empty input disables the budget, a number saves it.
- **`src/test/suite/prediction.test.ts`** (new) — Unit tests for pure functions:
  `calculateBurnRate` (zero-entry edge case, positive rate) and
  `buildRecommendation` (all four severity levels).

---

## [0.1.0] — 2026-02-28

Initial release implementing the full data layer, status bar, WebView dashboard,
and project-level cost tracking.

### Added

#### Data Layer (`src/data/`)
- **`jsonlReader.ts`** — Parses `~/.claude/projects/**/*.jsonl` locally (no network);
  aggregates `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens` for the last 5 h, today, and 7 d windows.
  Calculates USD cost using Claude Sonnet 4.x pricing
  ($3.00 / $15.00 / $0.30 / $3.75 per 1 M tokens).
- **`apiClient.ts`** — Fetches Anthropic rate-limit utilization headers
  (`anthropic-ratelimit-unified-5h-utilization`, `7d-utilization`, reset times)
  with a minimum 5-minute call interval when Claude Code is idle.
  Reads OAuth token from `~/.claude/.credentials.json`.
- **`cache.ts`** — Disk-backed JSON cache at `~/.claude/vscode-claude-status-cache.json`
  (version 1). Stores API response only; JSONL costs are always read fresh.
  Exposes `readCache()`, `writeCache()`, `isCacheValid()`, `getCacheAge()`.
- **`dataManager.ts`** — Singleton data orchestrator.  Owns a
  `vscode.EventEmitter<ClaudeUsageData>` that fires on every refresh.
  Starts a `FileSystemWatcher` on `~/.claude/projects/**/*.jsonl` so the
  extension reacts within seconds of any Claude Code activity.
  Exposes `getUsageData()`, `forceRefresh()`, `refreshProjectCosts()`.
- **`projectCost.ts`** — Maps open VS Code workspace folders to their Claude Code
  session directories using two strategies:
  1. Hash: replace every non-alphanumeric character with `-`
     (`/home/user/my-app` → `-home-user-my-app`).
  2. Fallback: scan JSONL `cwd` fields for exact path match.
  Aggregates `costToday`, `cost7d`, `cost30d`, `sessionCount`, `lastActive`
  per project. Multi-root workspaces are each tracked independently.

#### Status Bar (`src/statusBar.ts`)
- Persistent status bar item (left-aligned, priority 10).
- **Percent mode** (default): `🤖 5h:45% 7d:62%`
- **Cost mode**: `🤖 5h:$14.21 7d:$53.17`
- Warning indicator `⚠` when utilisation ≥ 75 %.
- Denied indicator `✗` when rate limit is hit.
- Stale cache suffix `[10m ago]` when cached data is more than 5 minutes old.
- Project cost suffix `| my-app:$3.21` (single workspace) or
  `| PJ:$5.43` (multi-root aggregate).
- Rich hover tooltip with full token breakdown, reset countdown, and project
  cost table.

#### WebView Dashboard (`src/webview/panel.ts`)
- `DashboardPanel` singleton — opens a side panel with live usage data.
- HTML/CSS/JS embedded as a TypeScript template literal (no separate HTML
  file required; compatible with webpack bundling and `.vscodeignore`).
- Content Security Policy with per-session nonce; Chart.js loaded from CDN.
- Sections: Current Usage (colour-coded progress bars), Token Cost (5 h /
  today / 7 d), Project Cost (today / 7 d / 30 d per workspace folder).
- Responds to `vscode.postMessage` protocol: `ready`, `refresh`,
  `toggleMode`, `setBudget` from panel → extension; `update`,
  `setDisplayMode` from extension → panel.
- Supports VS Code light, dark, and high-contrast themes via CSS variables.

#### Extension Entry Point (`src/extension.ts`)
- Activation event: `onStartupFinished`.
- Commands registered:
  - `vscode-claude-status.openDashboard` — open / reveal dashboard panel.
  - `vscode-claude-status.refresh` — force immediate API + JSONL refresh.
  - `vscode-claude-status.toggleDisplayMode` — toggle `%` ↔ `$` mode.
  - `vscode-claude-status.setBudget` — set or disable daily budget via InputBox.
- Keyboard shortcut: `Ctrl+Shift+Alt+C` (`⌘⇧⌥C` on macOS) for toggle.
- 60-second render timer for stale-age display even when JSONL is unchanged.
- Workspace folder change listener re-fetches project costs automatically.

#### Configuration (`package.json` contributes)
- `claudeStatus.displayMode` (`"percent"` | `"cost"`, default `"percent"`)
- `claudeStatus.statusBar.alignment` (`"left"` | `"right"`, default `"left"`)
- `claudeStatus.statusBar.showProjectCost` (boolean, default `true`)
- `claudeStatus.cache.ttlSeconds` (60–3600, default `300`)
- `claudeStatus.realtime.enabled` (boolean, default `false`)
- `claudeStatus.budget.dailyUsd` (number | null, default `null`)
- `claudeStatus.budget.weeklyUsd` (number | null, default `null`)
- `claudeStatus.budget.alertThresholdPercent` (1–100, default `80`)
- `claudeStatus.notifications.rateLimitWarning` (boolean, default `true`)
- `claudeStatus.notifications.rateLimitWarningThresholdMinutes` (5–120, default `30`)
- `claudeStatus.notifications.budgetWarning` (boolean, default `true`)
- `claudeStatus.heatmap.days` (30 | 60 | 90, default `90`)
- `claudeStatus.credentials.path` (string | null, default `null`)

#### Tests (`src/test/suite/`)
- `jsonlReader.test.ts` — unit tests for `calculateCost()` pricing formula.
- `cache.test.ts` — unit tests for `isCacheValid()` and `getCacheAge()`.
- `statusBar.test.ts` — label / tooltip builder tests covering all display
  states (not-logged-in, no-data, denied, warning, stale, project costs,
  multi-root aggregate).
- `projectCost.test.ts` — unit tests for `workspacePathToHash()` including
  the real-world `sb_git` path verified against live Claude Code data.

### Technical Notes
- JSONL entries are read from `entry.message.usage` (not `entry.usage` as
  some older docs suggest); the `costUSD` field is not present in current
  Claude Code output and is therefore always computed client-side.
- Project directory hash uses `replace(/[^a-zA-Z0-9]/g, '-')` — verified
  against real `~/.claude/projects/` directory names.

---

[0.4.0]: https://github.com/long-910/vscode-claude-status/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/long-910/vscode-claude-status/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/long-910/vscode-claude-status/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/long-910/vscode-claude-status/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/long-910/vscode-claude-status/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/long-910/vscode-claude-status/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/long-910/vscode-claude-status/releases/tag/v0.1.0
