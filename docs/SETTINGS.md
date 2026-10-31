# Settings

All settings live under the `claudeStatus` namespace (**Settings → Extensions → Claude Status**).
`package.json` (`contributes.configuration`, descriptions in `package.nls*.json`) is the source
of truth; the tables below are generated from it, and `docs.test.ts` fails if a setting is
missing here or in the READMEs.

Which settings matter depends on your plan — see [PLANS.md](PLANS.md#recommended-settings).
Pricing settings are explained in [PRICING.md](PRICING.md).

Contents: [Settings](#all-settings) · [Custom status bar format](#custom-status-bar-format) ·
[Commands](#commands) · [Keybindings](#keybindings) · [For developers](#for-developers)

---

## All settings

### Display

| Setting (`claudeStatus.…`) | Type | Default | Description |
|---|---|---|---|
| `displayMode` | `"percent"` \| `"cost"` | `"percent"` | Status bar display mode: utilization percentage or USD cost. |
| `statusBar.alignment` | `"left"` \| `"right"` | `"left"` | Position of the status bar item. |
| `statusBar.showProjectCost` | boolean | `true` | Show current project cost in the status bar. |
| `statusBar.format` | string \| null | `null` | Custom status bar format string. Placeholders: ${usage5h} / ${usage7d} (utilization 0-100), ${bar5h} / ${bar7d} (▰▰▱▱▱ meters), ${cost5h}, ${cost7d}, ${costDay}, ${costMonth} (USD, e.g. 1.23). Set to null to use the default format. |
| `statusBar.showSparkline` | boolean | `false` | Show a compact utilization meter (▰▰▰▱▱) next to the 5h percentage in the status bar (percent mode, Claude.ai only). Custom formats can use the ${bar5h} / ${bar7d} placeholders instead. |
| `payAsYouGo.showTimeWindows` | boolean | `true` | Show 5-hour / 7-day window figures for pay-as-you-go usage (API key, AWS Bedrock, other non-subscription providers). These windows are Claude.ai subscription rate limits; turn this off to show today's cost instead. Has no effect on Claude.ai subscriptions. |
| `heatmap.days` | `30` \| `60` \| `90` | `90` | Number of days shown in the usage heatmap. |

### Plan, data source & API

| Setting (`claudeStatus.…`) | Type | Default | Description |
|---|---|---|---|
| `claudeProvider` | `"auto"` \| `"claude-ai"` \| `"claude-ai-usage"` \| `"aws-bedrock"` \| `"api-key"` | `"auto"` | Claude provider type. Controls whether rate limit percentages or cost is shown in the status bar. |
| `claudeHome` | string | `".claude"` | Claude Code data directory (projects, credentials, cache). Relative paths resolve against the home directory; absolute paths and ~ are supported. Default: .claude (~/.claude). *(user settings only)* |
| `credentials.path` | string \| null | `null` | Custom path to the Claude credentials file. Leave null to use <claudeHome>/.credentials.json (macOS falls back to the Keychain). *(user settings only)* |
| `rateLimitApi.enabled` | boolean | `true` | Enable fetching rate-limit utilization (5h/7d %) from the Anthropic API (Claude.ai subscriptions only). When disabled, no new API calls are made: the last cached percentages are still shown with an age suffix (e.g. [10m ago]); without a cache only local token cost is shown. Default: true — API consumption is negligible because calls are made only while Claude Code is actively running. |
| `cache.ttlSeconds` | number (60–3600) | `300` | Cache TTL in seconds. API is not called more often than this when Claude Code is idle. |
| `realtime.enabled` | boolean | `false` | Also refresh the rate-limit % while Claude Code is idle (Claude.ai subscriptions; requires rateLimitApi.enabled). Idle polling happens every cache.ttlSeconds but never more often than every 5 minutes — about 12 small API calls per idle hour. |

### Budgets & notifications

| Setting (`claudeStatus.…`) | Type | Default | Description |
|---|---|---|---|
| `budget.dailyUsd` | number \| null | `null` | Daily budget in USD. Set to null to disable. |
| `budget.weeklyUsd` | number \| null | `null` | Weekly budget in USD. Set to null to disable. |
| `budget.monthlyUsd` | number \| null | `null` | Monthly spending budget in USD for the current calendar month (null = disabled) — e.g. to match a spend limit on a usage-based Enterprise plan. Shown in the dashboard, sidebar and tooltip; warns once a month at budget.alertThresholdPercent. |
| `budget.alertThresholdPercent` | number (1–100) | `80` | Show budget warning when usage exceeds this percentage of the budget. |
| `notifications.budgetWarning` | boolean | `true` | Show a notification when a daily or monthly budget threshold is reached (at most once per day / month). |
| `notifications.rateLimitWarning` | boolean | `true` | Show notification when rate limit is approaching. |
| `notifications.rateLimitWarningThresholdMinutes` | number (5–120) | `30` | Show rate limit warning this many minutes before exhaustion. |

### Pricing

| Setting (`claudeStatus.…`) | Type | Default | Description |
|---|---|---|---|
| `pricing.useModelPricing` | boolean | `true` | Price each entry by its model (Opus, Sonnet, Haiku, Fable…) using built-in Anthropic rates. Unrecognized models — and every entry when disabled — use the claudeStatus.pricing.* rates above. |
| `pricing.modelOverrides` | object | `{}` | Per-model rates (USD per 1M tokens) that take precedence over the built-in table — use this for a newly released model or a price change before the extension is updated. Keys match part of the model id (the longest match wins), e.g. `{ "claude-opus-6": { "inputPerMillion": 4, "outputPerMillion": 20 } }`. Cache read defaults to 0.1× input and cache create to 1.25× input. |
| `pricing.inputPerMillion` | number | `3` | Manual rate: USD per 1M input tokens, used for unrecognized models and for every entry when pricing.useModelPricing is off. Default: $3.00 (Claude Sonnet 4.x). |
| `pricing.outputPerMillion` | number | `15` | Manual rate: USD per 1M output tokens, used for unrecognized models and for every entry when pricing.useModelPricing is off. Default: $15.00 (Claude Sonnet 4.x). |
| `pricing.cacheReadPerMillion` | number | `0.3` | Manual rate: USD per 1M cache-read tokens, used for unrecognized models and for every entry when pricing.useModelPricing is off. Default: $0.30 (Claude Sonnet 4.x). |
| `pricing.cacheCreatePerMillion` | number | `3.75` | Manual rate: USD per 1M 5-minute cache-write tokens (1-hour writes are 2x input), used for unrecognized models and for every entry when pricing.useModelPricing is off. Default: $3.75 (Claude Sonnet 4.x). |

### Data directory

- `claudeStatus.claudeHome` and `claudeStatus.credentials.path` are `machine`-scoped: they can be
  set in user (or remote) settings only, never in a workspace's `.vscode/settings.json`, so an
  opened repository cannot redirect where the extension reads credentials or writes its cache.
- On macOS, when no `.credentials.json` exists in the data directory, the extension falls back to
  the default Keychain entry (`Claude Code-credentials`). That entry belongs to the default
  `~/.claude` profile, so with a custom `claudeHome` the rate-limit numbers may come from a
  different account than the token cost. Point `claudeStatus.credentials.path` at the profile's
  credentials file if this matters.

---

## Custom Status Bar Format

Set `claudeStatus.statusBar.format` to a template string to replace the default auto-generated label.

### Placeholders

| Placeholder | Type | Example output | Notes |
|-------------|------|----------------|-------|
| `${usage5h}` | integer 0–100 | `35` | 5h rate-limit utilization. Always `0` for non-claude-ai providers. |
| `${usage7d}` | integer 0–100 | `72` | 7d rate-limit utilization. `0` if no 7d window. |
| `${bar5h}` | 5-char meter | `▰▰▱▱▱` | 5h utilization as a compact meter (rounded to nearest fifth). |
| `${bar7d}` | 5-char meter | `▰▰▰▰▱` | 7d utilization as a compact meter. All-empty if no 7d window. |
| `${cost5h}` | decimal string | `1.23` | Local token cost in the last 5h (USD, 2 decimal places). |
| `${cost7d}` | decimal string | `5.67` | Local token cost in the last 7 days (USD, 2 decimal places). |
| `${costDay}` | decimal string | `2.34` | Local token cost today (USD, 2 decimal places). |
| `${costMonth}` | decimal string | `45.10` | Local token cost this calendar month (USD, 2 decimal places). |

### Examples

```json
// Match the issue request — percent utilization only
"claudeStatus.statusBar.format": "Claude Usage 5h:${usage5h}% 7d:${usage7d}%"
// → Claude Usage 5h:35% 7d:72%

// Cost-focused display
"claudeStatus.statusBar.format": "🤖 5h:$${cost5h} today:$${costDay}"
// → 🤖 5h:$1.23 today:$2.34

// Mixed — util% and cost together
"claudeStatus.statusBar.format": "${usage5h}% | $${costDay}"
// → 35% | $2.34
```

### Behaviour notes

- When `format` is `null` (default), the existing automatic label logic is used (respects `displayMode`, provider type, stale/denied states, project cost suffix).
- `no-credentials` and `no-data` states always show their standard messages regardless of `format`.
- Color coding (warning/error backgrounds) is not affected by a custom format — it still reflects `limitStatus`.
- The stale-age suffix (`[Xm ago]`) is **not** appended automatically in custom format mode. Include it manually if needed, or leave `format` as `null` to keep it.

---

## Commands

| Command | Title | What it does |
|---|---|---|
| `vscode-claude-status.openDashboard` | Claude Status: Open Dashboard | Open the dashboard panel (also: click the status bar item) |
| `vscode-claude-status.refresh` | Claude Status: Refresh Now | Re-read transcripts and fetch rate limits now (counts as one API call on `claude-ai`) |
| `vscode-claude-status.toggleDisplayMode` | Claude Status: Toggle % / $ Display | Switch `displayMode` |
| `vscode-claude-status.setBudget` | Claude Status: Set Budget... | Set or clear the **daily** budget (`budget.dailyUsd`); weekly / monthly budgets are set in Settings |
| `vscode-claude-status.exportUsage` | Claude Status: Export Usage Data... | Export the daily history (see below) |

### Export Usage Data

Exports the daily usage history — the same aggregation as the heatmap, covering
`heatmap.days` days — to a file chosen in a save dialog (default name
`claude-usage-YYYY-MM-DD.csv|json`, local date):

- **CSV** — `date,cost_usd,messages,tokens`, one row per day (zero-activity days included),
  cost with 4 decimal places.
- **JSON** — `{ exportedAt, days, totalCostUsd, daily: [{date, costUsd, messages, tokens}] }`.

Serializers: `src/data/exportUsage.ts` (pure functions, unit-tested).

---

## Keybindings

| Key | Command |
|---|---|
| `Ctrl+Shift+Alt+C` (`⌘⇧⌥C` on macOS) | Toggle % / $ display |

---

## For developers

- Read settings only through the typed accessors in `src/config.ts` (`config.displayMode`,
  `config.costOptions`, …) — never `getConfiguration('claudeStatus')` elsewhere.
- `src/extension.ts` reacts to `onDidChangeConfiguration` without a reload:
  `claudeHome` → restart the watcher and re-read; `pricing.*` → recompute costs (a normal
  refresh); `payAsYouGo.*` → re-render from the last data (no I/O); anything else → re-render
  the status bar.
- Adding a setting: declare it in `package.json` with a `%…%` description in all three
  `package.nls*.json`, add an accessor in `config.ts`, then add it to the tables here and to the
  Configuration section of all three READMEs (`docs.test.ts` checks this).
