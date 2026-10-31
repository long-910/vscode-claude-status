# vscode-claude-status

> Claude Code token usage & cost — always visible in your VS Code status bar.

![vscode-claude-status social preview](https://repository-images.githubusercontent.com/1165729413/1dc1fbe5-b0d9-45f9-9b5b-c5ad06e36d10)

<div align="center">

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Open VSX](https://img.shields.io/open-vsx/v/long-kudo/vscode-claude-status?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/long-kudo/vscode-claude-status)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.73.0-007ACC?style=flat-square)](https://code.visualstudio.com/)

[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/long-910)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/long910)

🌐 [English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

</div>

## Overview

**vscode-claude-status** is a Visual Studio Code extension that monitors your
[Claude Code](https://claude.ai/code) usage in real time — without leaving your editor.

It reads session data from `~/.claude/projects/` locally (no extra network calls)
and queries the Anthropic API at most once per 5 minutes to fetch rate-limit
utilization headers. All token costs are calculated client-side, priced per model
(Opus, Sonnet, Haiku, Fable…) with built-in rates. Models newer than the built-in
table are estimated from their family's latest rate, and exact rates can be set with
`claudeStatus.pricing.modelOverrides`.

> [!NOTE]
> **API calls are minimal and only happen while Claude Code is active.**
> The rate-limit API call fires only when a JSONL file was recently updated —
> when you stop using Claude Code, the extension stops calling the API entirely.
> Each call uses ≈ 9 tokens of `claude-haiku-4-5` (≈ $0.00013).
> Typical cost with default settings: **< $0.01 / month**.
> Set `claudeStatus.rateLimitApi.enabled: false` to stop all new API calls.
> If a prior cache exists, the last-fetched rate-limit % is still shown with a `[Xm ago]`
> staleness indicator. Without any cache, the display falls back to cost-only.

> [!WARNING]
> **Cost figures are estimates** at Anthropic's list API prices (checked 2026-10-31),
> calculated from local transcripts. Negotiated discounts, seat fees and partner
> (Bedrock / Vertex) pricing are not included. For a new model or a price change, set
> `claudeStatus.pricing.modelOverrides` — see [docs/PRICING.md](docs/PRICING.md).

---

## Features

### 📊 Status Bar — Always Visible

Real-time usage summary pinned to the VS Code status bar.

| State | Example |
|-------|---------|
| Normal (% mode, Claude.ai Max) | `🤖 5h:45% 7d:62%` |
| Warning ≥ 75% | `🤖 5h:78%⚠ 7d:84%⚠` |
| Rate limit hit | `🤖 5h:100%✗` |
| 5h-only plan (no 7d window) | `🤖 5h:45%` |
| Cost mode | `🤖 5h:$14.21 7d:$53.17` |
| Pay-as-you-go (API key, Bedrock, usage-based Enterprise) | `🤖 5h:$0.15 7d:$0.42` |
| Pay-as-you-go, `payAsYouGo.showTimeWindows: false` | `🤖 Today:$0.15` |
| With meter (`statusBar.showSparkline`) | `🤖 5h:▰▰▰▱▱ 62% 7d:41%` |
| With project cost | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| Stale cache | `🤖 5h:78% 7d:84% [10m ago]` |
| Not logged in | `🤖 Not logged in` |

Hover for a detailed tooltip with full token breakdown and reset times.

### 🧭 Sidebar Overview *(VS Code-native)*

A dedicated Activity Bar icon opens a native tree view with rate-limit windows,
token costs (5h / today / 7d / this month, with the monthly budget), per-project costs,
and quick actions — all the key numbers without opening the dashboard panel.

### 🗂 Dashboard Panel

Click the status bar item to open a rich dashboard panel with:

- **Current Usage** — colour-coded progress bars for 5 h and 7 d windows
- **Token Cost** — 5 h / today / 7 d / this month / month (est.) costs; expandable **token breakdown**
  shows per-type counts (input / output / cache read / cache create), a per-model cost list
  for the 5 h window, and cache hit ratio
- **Project Cost** — per-workspace breakdown (today / 7 days / 30 days)
- **Prediction** — burn rate ($/hr), time-to-exhaustion, daily / weekly / monthly budget tracking;
  **Rate Limit Timeline chart** visualises the projected 5 h utilization from now to reset
- **Pricing & Settings** — always-visible card showing current token pricing rates,
  provider, API state, and cache TTL; opens VS Code settings with one click
- **Usage History** — GitHub-style daily heatmap, hourly pattern bar chart and weekday × hour punch card

The panel supports light, dark, and high-contrast VS Code themes natively.

<div align="center">
<img width="574" alt="Dashboard screenshot" src="https://raw.githubusercontent.com/long-910/vscode-claude-status/main/docs/screenshots/dashboard.png" />
</div>

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
- **Weekly budget** — optional USD weekly cap with progress bar (`claudeStatus.budget.weeklyUsd`)
- **Monthly budget** — optional USD cap for the calendar month (`claudeStatus.budget.monthlyUsd`), e.g. to
  track a spend limit on a usage-based Enterprise plan; *This month* is also shown in the sidebar and tooltip
- **VS Code notifications** — non-blocking warning at ≤ 30 min, error dialog
  at ≤ 10 min (with "Open Dashboard" action); budget alerts at most once per day / month

Configure via **Settings → Claude Status** or the command palette:

```
Claude Status: Set Budget...
```

### 📅 Usage History Heatmap

Understand your long-term usage patterns at a glance.

- **Daily heatmap** — GitHub Contributions-style grid for the last 30 / 60 / 90 days;
  green intensity reflects daily spend; hover any cell for exact date and cost
- **Hourly bar chart** — average cost per hour of day (last 30 days); shows when
  you typically use Claude Code most heavily
- **Punch card** — weekday × hour cost matrix (last 30 days); shows weekly patterns
  such as "Monday mornings"

Number of days is configurable via `claudeStatus.heatmap.days` (30 / 60 / 90).

---

## Requirements

- **VS Code** 1.73 or newer
- **Claude Code** with at least one session — the extension reads
  `~/.claude/projects/**/*.jsonl` (or `claudeStatus.claudeHome`) for token cost

---

## Supported Plans

The plan is detected automatically; no extra login is needed.

| Plan | Detected from | Status bar | Rate-limit API |
|---|---|---|---|
| Claude.ai Pro / Max, seat-based Team / Enterprise | `claude login` credentials (`~/.claude/.credentials.json` or the macOS Keychain) | `5h:45% 7d:32%` — the 7d part hides itself when the plan has no weekly window | at most once per 5 min, only while Claude Code is active |
| Usage-based Claude.ai plan (e.g. usage-based Enterprise) | Claude Code's account info (`billingType: "usage_based"` in `~/.claude.json`) | cost only | never |
| Anthropic API key | `ANTHROPIC_API_KEY` | cost only | never |
| AWS Bedrock | AWS environment variables | cost only | never |

On pay-as-you-go plans, `claudeStatus.payAsYouGo.showTimeWindows: false` shows today's cost
instead of the 5h / 7d figures, and `claudeStatus.budget.monthlyUsd` tracks a spend limit.
If detection picks the wrong plan, set `claudeStatus.claudeProvider`.
Details: [docs/PLANS.md](docs/PLANS.md).

> Developed and tested on a Claude.ai Pro plan; other plans are supported on a best-effort
> basis. Please [open an issue](https://github.com/long-910/vscode-claude-status/issues)
> with your plan type if something looks wrong.

---

## Installation

### VS Code Marketplace

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
| **Claude Status: Export Usage Data…** | Export daily usage history to CSV or JSON |

---

## Configuration

All settings are under the `claudeStatus` namespace in VS Code Settings. Full reference:
[docs/SETTINGS.md](docs/SETTINGS.md).

### Display

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStatus.displayMode` | `"percent"` | `"percent"` or `"cost"` in the status bar |
| `claudeStatus.statusBar.alignment` | `"left"` | `"left"` or `"right"` |
| `claudeStatus.statusBar.showProjectCost` | `true` | Show the current project's cost in the status bar |
| `claudeStatus.statusBar.format` | `null` | Custom label, e.g. `"${usage5h}% \| $${costDay}"`. Placeholders: `${usage5h}`, `${usage7d}`, `${bar5h}`, `${bar7d}`, `${cost5h}`, `${cost7d}`, `${costDay}`, `${costMonth}` |
| `claudeStatus.statusBar.showSparkline` | `false` | Compact 5h meter (▰▰▰▱▱) next to the percentage |
| `claudeStatus.payAsYouGo.showTimeWindows` | `true` | Pay-as-you-go plans: `false` shows today's cost instead of 5h / 7d figures (subscriptions unaffected) |
| `claudeStatus.heatmap.days` | `90` | Days in the usage heatmap (30 / 60 / 90) |

### Plan, data source & API

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStatus.claudeProvider` | `"auto"` | `"auto"`, `"claude-ai"`, `"claude-ai-usage"` (usage-based Claude.ai plan), `"aws-bedrock"`, `"api-key"` |
| `claudeStatus.claudeHome` | `".claude"` | Claude Code data directory (relative to home; absolute and `~` work). User settings only |
| `claudeStatus.credentials.path` | `null` | Custom credentials file. User settings only |
| `claudeStatus.rateLimitApi.enabled` | `true` | Fetch rate-limit % (subscriptions). Off: no API calls; the last cached % stays visible with `[Xm ago]` |
| `claudeStatus.cache.ttlSeconds` | `300` | Rate-limit cache TTL (60–3600 s) |
| `claudeStatus.realtime.enabled` | `false` | Not implemented — has no effect |

### Budgets & notifications

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStatus.budget.dailyUsd` | `null` | Daily budget in USD (`null` = off) |
| `claudeStatus.budget.weeklyUsd` | `null` | Budget for the last 7 days (dashboard bar) |
| `claudeStatus.budget.monthlyUsd` | `null` | Budget for the calendar month, e.g. an Enterprise spend limit |
| `claudeStatus.budget.alertThresholdPercent` | `80` | Warn at this % of the daily / monthly budget |
| `claudeStatus.notifications.budgetWarning` | `true` | Budget notifications (at most once per day / month) |
| `claudeStatus.notifications.rateLimitWarning` | `true` | Warn before the 5h limit is reached (subscriptions) |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `30` | Minutes before exhaustion to warn (5–120) |

### Pricing

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStatus.pricing.useModelPricing` | `true` | Price each entry by its model with built-in rates |
| `claudeStatus.pricing.modelOverrides` | `{}` | Exact rates per model, e.g. `{ "claude-opus-6": { "inputPerMillion": 4, "outputPerMillion": 20 } }` |
| `claudeStatus.pricing.inputPerMillion` | `3.00` | Manual rates (USD / 1M tokens) for unrecognized models, or for everything when model pricing is off |
| `claudeStatus.pricing.outputPerMillion` | `15.00` | 〃 |
| `claudeStatus.pricing.cacheReadPerMillion` | `0.30` | 〃 |
| `claudeStatus.pricing.cacheCreatePerMillion` | `3.75` | 〃 |

```jsonc
// Example: usage-based Enterprise with a $400 monthly spend limit
{
  "claudeStatus.payAsYouGo.showTimeWindows": false,   // 🤖 Today:$3.21 instead of 5h / 7d
  "claudeStatus.budget.monthlyUsd": 400,
  "claudeStatus.budget.dailyUsd": 30
}

// Example: Claude.ai subscription, cost view, no outbound API calls
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.rateLimitApi.enabled": false
}
```

---

## Roadmap

| Feature | Status |
|---------|--------|
| Status bar, dashboard, project cost, prediction & budget alerts, heatmap | ✅ v0.1.0 – v0.3.0 |
| Rate Limit Timeline, token breakdown, weekly budget, Pricing & Settings card | ✅ v0.4.0 |
| i18n — English / Japanese / Chinese | ✅ v0.4.1 |
| macOS Keychain credential fallback (Claude Code v2.x+) | ✅ v0.6.0 |
| Configurable data directory, OOM fix (incremental reads) | ✅ v0.7.0 |
| Model-aware pricing (checked against the official price list), per-model breakdown, model overrides | ✅ Unreleased |
| Usage-based Enterprise support, pay-as-you-go view, monthly budget | ✅ Unreleased |
| Sidebar tree view, status bar meter, usage export (CSV / JSON), punch card | ✅ Unreleased |

---

## Documentation

Specifications, plan behaviour, pricing and the full settings reference live in
[docs/](docs/README.md).

---

## Related Projects

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmux status bar version (same author, Python)
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — file encoding viewer (same author)

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions,
architecture overview, and release procedures.

---

## Contributors

Thanks to everyone who has contributed to this project!

[![Contributors](https://contrib.rocks/image?repo=long-910/vscode-claude-status&exclude=dependabot%5Bbot%5D)](https://github.com/long-910/vscode-claude-status/graphs/contributors)

---

## License

[MIT](LICENSE) — © 2026 long-910
