# vscode-claude-status

> Claude Code token usage & cost — always visible in your VS Code status bar.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.109.0-007ACC?style=flat-square)](https://code.visualstudio.com/)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)

🌐 [English](README.md) | [日本語](README.ja.md)

---

## Overview

**vscode-claude-status** is a Visual Studio Code extension that monitors your
[Claude Code](https://claude.ai/code) usage in real time — without leaving your editor.

It reads session data from `~/.claude/projects/` locally (no extra network calls)
and queries the Anthropic API at most once per 5 minutes to fetch rate-limit
utilization headers.  All token costs are calculated client-side using current
Claude Sonnet 4.x pricing.

---

## Features

### 📊 Status Bar — Always Visible

Real-time usage summary pinned to the VS Code status bar.

| State | Example |
|-------|---------|
| Normal (% mode) | `🤖 5h:45% 7d:62%` |
| Warning ≥ 75% | `🤖 5h:78%⚠ 7d:84%⚠` |
| Rate limit hit | `🤖 5h:100%✗` |
| Cost mode | `🤖 5h:$14.21 7d:$53.17` |
| With project cost | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| Stale cache | `🤖 5h:78% 7d:84% [10m ago]` |
| Not logged in | `🤖 Not logged in` |

Hover for a detailed tooltip with full token breakdown and reset times.

### 🗂 Dashboard Panel

Click the status bar item to open a rich dashboard panel with:

- **Current Usage** — colour-coded progress bars for 5 h and 7 d windows
- **Token Cost** — 5 h / today / 7 d cost calculated from local JSONL data
- **Project Cost** — per-workspace breakdown (today / 7 days / 30 days)
- **Prediction** — burn rate ($/hr), time-to-exhaustion, daily budget tracking
- **Usage History** _(planned)_ — GitHub-style heatmap + hourly pattern chart

The panel supports light, dark, and high-contrast VS Code themes natively.

### 🗂 Project-Level Cost Tracking *(VS Code-exclusive)*

Automatically maps the open workspace folder to its Claude Code session
directory and shows how much you've spent **for that specific project** —
today, this week, and this month.

Multi-root workspaces are fully supported: each folder gets its own breakdown
in the dashboard, and the status bar shows the aggregate.

```
🤖 5h:78% 7d:84% | my-app:$3.21          ← single workspace
🤖 5h:78% 7d:84% | PJ:$5.43              ← multi-root aggregate
```

### 🔮 Usage Prediction & Budget Alerts

Based on the last 30 minutes of activity, the extension predicts how long until
the 5 h rate limit is exhausted and warns you before it happens.

- **Burn rate** — current consumption in $/hr (rolling 30-minute window)
- **Time-to-exhaustion** — estimated minutes until the 5 h window is full,
  capped at the next window reset time
- **Safety indicator** — "Safe to start heavy task" if > 30 min remains
- **Daily budget** — set an optional USD cap; progress bar and alerts fire when
  the configured threshold (default 80 %) is reached
- **VS Code notifications** — non-blocking warning at ≤ 30 min, error dialog
  at ≤ 10 min (with "Open Dashboard" action); budget alert fires once per window
- Notification deduplication — each alert fires at most once per 5 h window;
  keys are cleared automatically when the window resets

Configure via **Settings → Claude Status** or the command palette:

```
Claude Status: Set Budget...
```

### 📅 Usage History Heatmap *(planned)*

- GitHub Contributions-style daily heatmap for the last 30 / 60 / 90 days
- Hourly usage pattern bar chart — visualise when you use Claude Code most

---

## Requirements

- **VS Code** 1.109 or newer
- **Claude Code CLI** installed and authenticated (`claude login`)
  — this creates `~/.claude/.credentials.json` used for API calls
- **Claude Code sessions** — the extension reads `~/.claude/projects/**/*.jsonl`

---

## Installation

### VS Code Marketplace *(coming soon)*

Search **"Claude Status"** in the Extensions panel, or:

```bash
code --install-extension long-kudo.vscode-claude-status
```

### Install from VSIX

1. Download the `.vsix` from the [Releases](https://github.com/long-910/vscode-claude-status/releases) page.
2. In VS Code: **Extensions (Ctrl+Shift+X)** → **⋯** → **Install from VSIX…**

### Build from Source

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
npm run package       # → vscode-claude-status-*.vsix
```

---

## Usage

The extension activates automatically on VS Code startup (`onStartupFinished`).

| Action | Result |
|--------|--------|
| Glance at status bar | Live utilization / cost |
| Click status bar | Open dashboard panel |
| `Ctrl+Shift+Alt+C` (`⌘⇧⌥C` on Mac) | Toggle `%` ↔ `$` display mode |
| **Claude Status: Refresh Now** | Force API refresh |
| **Claude Status: Open Dashboard** | Open dashboard panel |
| **Claude Status: Toggle % / $ Display** | Switch display mode |
| **Claude Status: Set Budget…** | Set or disable daily USD budget |

---

## Configuration

All settings are under the `claudeStatus` namespace in VS Code Settings.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudeStatus.displayMode` | `"percent"` \| `"cost"` | `"percent"` | Status bar display mode |
| `claudeStatus.statusBar.alignment` | `"left"` \| `"right"` | `"left"` | Status bar position |
| `claudeStatus.statusBar.showProjectCost` | `boolean` | `true` | Show project cost in status bar |
| `claudeStatus.cache.ttlSeconds` | `number` (60–3600) | `300` | API cache TTL in seconds |
| `claudeStatus.realtime.enabled` | `boolean` | `false` | Poll API every TTL seconds |
| `claudeStatus.budget.dailyUsd` | `number \| null` | `null` | Daily budget in USD (`null` = disabled) |
| `claudeStatus.budget.weeklyUsd` | `number \| null` | `null` | Weekly budget in USD |
| `claudeStatus.budget.alertThresholdPercent` | `number` (1–100) | `80` | Budget alert threshold % |
| `claudeStatus.notifications.rateLimitWarning` | `boolean` | `true` | Warn when rate limit is near |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `number` (5–120) | `30` | Minutes before limit to show warning |
| `claudeStatus.notifications.budgetWarning` | `boolean` | `true` | Warn when budget threshold exceeded |
| `claudeStatus.heatmap.days` | `30 \| 60 \| 90` | `90` | Days shown in usage heatmap |
| `claudeStatus.credentials.path` | `string \| null` | `null` | Custom credentials file path |

```jsonc
// Example: settings.json
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.cache.ttlSeconds": 120,
  "claudeStatus.budget.dailyUsd": 5.00,
  "claudeStatus.budget.alertThresholdPercent": 80,
  "claudeStatus.statusBar.showProjectCost": true
}
```

---

## How It Works

### Data Flow

```
JSONL file updated by Claude Code
  → FileWatcher detects change
    → DataManager.refresh()
      → JsonlReader aggregates token costs   (local, instant)
      → ApiClient fetches rate-limit headers (1 API call, then cached)
      → StatusBar & Dashboard update
```

When Claude Code is idle the extension reads only from the local cache — no API
calls are made until Claude Code becomes active again (JSONL modified recently).

### JSONL Format (verified against Claude Code v2.1.x)

```jsonc
// ~/.claude/projects/<project-hash>/<session-uuid>.jsonl
{
  "type": "assistant",
  "timestamp": "2026-02-28T10:23:45.123Z",
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

### Project Path Mapping

Claude Code encodes the workspace path into a directory name by replacing every
non-alphanumeric character with `-`:

```
/home/user/sb_git/my-app
  → ~/.claude/projects/-home-user-sb-git-my-app/
```

The extension uses this as Strategy 1, falling back to scanning JSONL `cwd`
fields for edge cases (Strategy 2).

### Token Cost Formula

Costs are calculated using **Claude Sonnet 4.x** pricing (same as
[claude-tmux-status](https://github.com/long-910/claude-tmux-status)):

| Token type | $/1 M tokens |
|------------|-------------|
| Input | $3.00 |
| Output | $15.00 |
| Cache read | $0.30 |
| Cache creation | $3.75 |

---

## CI / CD

This repository uses two GitHub Actions workflows.

### CI (`ci.yml`) — Lint, Build & Test

Triggered on every **push** and **pull request** to `main`.

```
push / pull_request → main
  └── matrix: ubuntu-latest / macos-latest / windows-latest
        ├── npm ci
        ├── npm run lint
        ├── npm run compile
        └── npm test  (Linux: xvfb-run for headless VSCode)
```

All three platforms must pass before a PR can be merged.

### Release (`release.yml`) — Package & Publish

Triggered when a **version tag** (`v*`) is pushed (e.g. `git tag v0.2.0 && git push --tags`).

```
push tag v*
  ├── npm ci
  ├── npm run lint
  ├── npm run compile
  ├── npm test  (xvfb-run)
  ├── vsce package  →  *.vsix
  ├── Extract release notes from CHANGELOG.md
  ├── Create GitHub Release  (attaches .vsix, marks pre-release if tag contains "-")
  └── Publish to VS Marketplace  (requires VSCE_PAT secret)
```

#### Required Secrets

| Secret | Description |
|--------|-------------|
| `VSCE_PAT` | Personal Access Token for [VS Marketplace](https://marketplace.visualstudio.com/) publishing |

`GITHUB_TOKEN` is provided automatically by GitHub Actions and needs no configuration.

#### Release Flow (step by step)

1. Merge all changes to `main` and make sure CI is green.
2. Update `CHANGELOG.md` — add a `## [X.Y.Z]` section with release notes.
3. Bump `"version"` in `package.json` to match.
4. Commit: `git commit -m "chore: release vX.Y.Z"`
5. Tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
6. The Release workflow runs automatically — GitHub Release is created and the
   extension is published to the Marketplace within a few minutes.

> **Pre-release**: Tags containing `-` (e.g. `v0.2.0-beta.1`) are automatically
> marked as pre-release on GitHub and published with `--pre-release` to the Marketplace.

---

## Development

### Setup

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
```

### Commands

```bash
npm run compile        # webpack bundle (development)
npm run watch          # watch mode
npm run compile-tests  # compile test files to out/
npm run lint           # ESLint
npm test               # full test suite
npm run package        # production .vsix
```

Press **F5** in VS Code to launch the Extension Development Host.

### Project Structure

```
vscode-claude-status/
├── src/
│   ├── extension.ts          # activate / deactivate
│   ├── config.ts             # typed settings wrapper
│   ├── statusBar.ts          # status bar item + label / tooltip builders
│   ├── data/
│   │   ├── jsonlReader.ts    # JSONL parser + token cost aggregator
│   │   ├── apiClient.ts      # Anthropic API rate-limit header fetcher
│   │   ├── cache.ts          # disk-backed cache (~/.claude/…cache.json)
│   │   ├── dataManager.ts    # central data orchestrator (singleton)
│   │   ├── projectCost.ts    # workspace → JSONL mapping + per-project costs
│   │   └── prediction.ts     # burn rate, time-to-exhaustion, budget prediction
│   ├── webview/
│   │   └── panel.ts          # WebView dashboard panel (HTML embedded)
│   └── test/suite/
│       ├── jsonlReader.test.ts
│       ├── projectCost.test.ts
│       ├── prediction.test.ts
│       ├── cache.test.ts
│       └── statusBar.test.ts
├── docs/                     # detailed feature & architecture specs
├── CLAUDE.md                 # AI assistant implementation guidance
├── CHANGELOG.md
└── package.json
```

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                 VS Code Extension Host               │
│                                                      │
│  StatusBar   DashboardPanel   FileWatcher(JSONL)     │
│      └────────────┴──────────────────┘               │
│                   │                                  │
│           ┌───────▼───────┐                          │
│           │  DataManager  │  (singleton)              │
│           └───────┬───────┘                          │
│                   │                                  │
│      ┌────────────┼────────────┐                     │
│      │            │            │                     │
│ JsonlReader   ApiClient     Cache                    │
│ ProjectCost  (rate headers) (disk)                   │
└──────────────────────────────────────────────────────┘
          │
  ~/.claude/projects/
    <hash>/<session>.jsonl
```

---

## Roadmap

| Feature | Status |
|---------|--------|
| Data layer (JSONL reader, API client, cache) | ✅ v0.1.0 |
| Status bar with % / $ display | ✅ v0.1.0 |
| WebView dashboard skeleton | ✅ v0.1.0 |
| Project-level cost tracking | ✅ v0.1.0 |
| Usage prediction & budget alerts | ✅ v0.2.0 |
| Session history heatmap | 🔜 v0.3.0 |
| VS Code Marketplace publication | 🔜 v0.3.0 |

---

## Related Projects

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmux status bar version (same author, Python)
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — file encoding viewer (same author)

---

## Contributing

Contributions are welcome.
Please read [CLAUDE.md](CLAUDE.md) for coding conventions and implementation order before starting work.

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Run `npm run lint && npm run compile-tests` — must be clean before committing
4. Submit a pull request

---

## License

[MIT](LICENSE) — © 2026 long-910
