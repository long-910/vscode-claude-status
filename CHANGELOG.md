# Changelog

All notable changes to **vscode-claude-status** are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned — v0.2.0
- Usage prediction: burn rate ($/hr) and time-to-exhaustion estimate
- Daily / weekly budget with configurable alert threshold
- Session history heatmap (GitHub Contributions-style, 30/60/90 days)
- Hourly usage pattern bar chart
- VS Code Marketplace publication

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
  - `vscode-claude-status.setBudget` — (placeholder, v0.2.0).
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

[Unreleased]: https://github.com/long-910/vscode-claude-status/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/long-910/vscode-claude-status/releases/tag/v0.1.0
