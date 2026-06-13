# Settings Specification

All settings are under the `claudeStatus` namespace in VSCode settings.

---

## Quick Reference — Plan × Settings Matrix

What the status bar and dashboard show, depending on your Claude plan and key settings.

### Step 1 — Identify your provider

| You use… | `claudeProvider` (auto-detected) |
|----------|----------------------------------|
| Claude.ai subscription (Pro / Max) | `claude-ai` |
| AWS Bedrock | `aws-bedrock` |
| Anthropic API key (`ANTHROPIC_API_KEY`) | `api-key` |

### Step 2 — What you see

| Provider | Plan tier | `rateLimitApi.enabled` | `displayMode` | Status bar | Rate limit bars in dashboard |
|----------|-----------|----------------------|---------------|------------|------------------------------|
| `claude-ai` | Max (5h + 7d windows) | `true` (default) | `percent` (default) | `🤖 5h:78% 7d:84%` | ✅ Both windows |
| `claude-ai` | Pro/other (5h only) | `true` (default) | `percent` (default) | `🤖 5h:78%` | ✅ 5h only |
| `claude-ai` | any | `true` (default) | `cost` | `🤖 5h:$14.21 7d:$53.17` | ✅ Shown (bars hidden in label) |
| `claude-ai` | any | `false` + cache exists | `percent` | `🤖 5h:78% [10m ago]` | ⚠️ Stale (dimmed) |
| `claude-ai` | any | `false` + no cache | any | `🤖 5h:$0.00 7d:$0.00` | ❌ Not shown |
| `aws-bedrock` | — | — | — | `🤖 5h:$14.21 7d:$53.17` | ❌ Not shown (no rate limits) |
| `api-key` | — | — | — | `🤖 5h:$14.21 7d:$53.17` | ❌ Not shown (no rate limits) |

### Step 3 — Recommended settings per use case

| Use case | Recommended settings |
|----------|----------------------|
| Claude.ai — see live % in real time | `rateLimitApi.enabled: true`, `displayMode: "percent"` (defaults) |
| Claude.ai — prefer cost over % | `displayMode: "cost"` |
| Claude.ai — offline / no outbound HTTPS | `rateLimitApi.enabled: false` (cached % still shown if previously fetched) |
| AWS Bedrock / API key | No extra config needed — cost mode is automatic |
| Track spending against a budget | Set `budget.dailyUsd` in dashboard or settings |

> **Note on stale data:** When `rateLimitApi.enabled: false`, the extension never makes
> new API calls but still shows the last-fetched rate limit % with a `[Xm ago]` indicator
> so you know how old the data is. The % only disappears if there is no cache at all
> (e.g. first run with API disabled).

---

## Full Settings Schema (`package.json` contributes.configuration)

```json
{
  "claudeStatus.displayMode": {
    "type": "string",
    "enum": ["percent", "cost"],
    "default": "percent",
    "description": "Status bar display mode: utilization percentage or USD cost."
  },

  "claudeStatus.statusBar.alignment": {
    "type": "string",
    "enum": ["left", "right"],
    "default": "left",
    "description": "Position of the status bar item."
  },

  "claudeStatus.statusBar.showProjectCost": {
    "type": "boolean",
    "default": true,
    "description": "Show current project cost in the status bar."
  },

  "claudeStatus.statusBar.format": {
    "type": ["string", "null"],
    "default": null,
    "description": "Custom status bar format string. Use placeholders: ${usage5h}, ${usage7d}, ${cost5h}, ${cost7d}, ${costDay}. null = default auto-generated label."
  },

  "claudeStatus.cache.ttlSeconds": {
    "type": "number",
    "default": 300,
    "minimum": 60,
    "maximum": 3600,
    "description": "Cache TTL in seconds. API is not called more often than this when Claude Code is idle."
  },

  "claudeStatus.rateLimitApi.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable fetching rate-limit utilization (5h/7d %) from the Anthropic API. When disabled, no new API calls are made. If a prior cache exists, the cached percentages are still shown with a stale-age indicator (e.g. '[10m ago]'). If no cache exists, only local token cost is shown. API consumption is negligible by default because calls are made only when Claude Code is actively running."
  },

  "claudeStatus.realtime.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Poll the rate-limit API every cache.ttlSeconds regardless of Claude Code activity. Requires rateLimitApi.enabled to be true. Increases API usage."
  },

  "claudeStatus.budget.dailyUsd": {
    "type": ["number", "null"],
    "default": null,
    "minimum": 0,
    "description": "Daily budget in USD. Set to null to disable."
  },

  "claudeStatus.budget.weeklyUsd": {
    "type": ["number", "null"],
    "default": null,
    "minimum": 0,
    "description": "Weekly budget in USD. Set to null to disable."
  },

  "claudeStatus.budget.alertThresholdPercent": {
    "type": "number",
    "default": 80,
    "minimum": 1,
    "maximum": 100,
    "description": "Show budget warning when usage exceeds this percentage of the budget."
  },

  "claudeStatus.notifications.rateLimitWarning": {
    "type": "boolean",
    "default": true,
    "description": "Show notification when rate limit is approaching."
  },

  "claudeStatus.notifications.rateLimitWarningThresholdMinutes": {
    "type": "number",
    "default": 30,
    "minimum": 5,
    "maximum": 120,
    "description": "Show rate limit warning this many minutes before exhaustion."
  },

  "claudeStatus.notifications.budgetWarning": {
    "type": "boolean",
    "default": true,
    "description": "Show notification when budget threshold is exceeded."
  },

  "claudeStatus.heatmap.days": {
    "type": "number",
    "default": 90,
    "enum": [30, 60, 90],
    "description": "Number of days shown in the usage heatmap."
  },

  "claudeStatus.credentials.path": {
    "type": ["string", "null"],
    "default": null,
    "description": "Custom path to Claude credentials file. Leave null to use default (~/.claude/.credentials.json)."
  },

  "claudeStatus.claudeProvider": {
    "type": "string",
    "enum": ["auto", "claude-ai", "aws-bedrock", "api-key"],
    "enumDescriptions": [
      "Auto-detect: checks credentials file, then AWS/API key environment variables.",
      "Claude.ai subscription — shows rate limit utilization (5h window, 7d window if available).",
      "AWS Bedrock — no rate limits, shows token cost only.",
      "Anthropic API key — no rate limits, shows token cost only."
    ],
    "default": "auto",
    "description": "Claude provider type. Controls whether rate limit percentages or cost is shown in the status bar."
  },

  // --- Token pricing (user-adjustable when Anthropic changes rates) ---
  "claudeStatus.pricing.inputPerMillion": {
    "type": "number",
    "default": 3.00,
    "minimum": 0,
    "description": "Cost per 1M input tokens in USD. Default: $3.00 (Claude Sonnet 4.x)."
  },
  "claudeStatus.pricing.outputPerMillion": {
    "type": "number",
    "default": 15.00,
    "minimum": 0,
    "description": "Cost per 1M output tokens in USD. Default: $15.00 (Claude Sonnet 4.x)."
  },
  "claudeStatus.pricing.cacheReadPerMillion": {
    "type": "number",
    "default": 0.30,
    "minimum": 0,
    "description": "Cost per 1M cache-read tokens in USD. Default: $0.30 (Claude Sonnet 4.x)."
  },
  "claudeStatus.pricing.cacheCreatePerMillion": {
    "type": "number",
    "default": 3.75,
    "minimum": 0,
    "description": "Cost per 1M cache-creation tokens in USD. Default: $3.75 (Claude Sonnet 4.x)."
  }
}
```

---

## Custom Status Bar Format

Set `claudeStatus.statusBar.format` to a template string to replace the default auto-generated label.

### Placeholders

| Placeholder | Type | Example output | Notes |
|-------------|------|----------------|-------|
| `${usage5h}` | integer 0–100 | `35` | 5h rate-limit utilization. Always `0` for non-claude-ai providers. |
| `${usage7d}` | integer 0–100 | `72` | 7d rate-limit utilization. `0` if no 7d window. |
| `${cost5h}` | decimal string | `1.23` | Local token cost in the last 5h (USD, 2 decimal places). |
| `${cost7d}` | decimal string | `5.67` | Local token cost in the last 7 days (USD, 2 decimal places). |
| `${costDay}` | decimal string | `2.34` | Local token cost today (USD, 2 decimal places). |

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

## Commands (`package.json` contributes.commands)

```json
[
  {
    "command": "vscode-claude-status.openDashboard",
    "title": "Claude Status: Open Dashboard"
  },
  {
    "command": "vscode-claude-status.refresh",
    "title": "Claude Status: Refresh Now"
  },
  {
    "command": "vscode-claude-status.toggleDisplayMode",
    "title": "Claude Status: Toggle % / $ Display"
  },
  {
    "command": "vscode-claude-status.setBudget",
    "title": "Claude Status: Set Budget..."
  }
]
```

---

## Keybindings (`package.json` contributes.keybindings)

```json
[
  {
    "command": "vscode-claude-status.toggleDisplayMode",
    "key": "ctrl+shift+alt+c",
    "mac": "cmd+shift+alt+c"
  }
]
```

---

## Settings Access Pattern

Always access settings through a typed wrapper to avoid magic strings:

```typescript
// src/config.ts
export class ExtensionConfig {
  private get cfg() {
    return vscode.workspace.getConfiguration('claudeStatus')
  }

  get displayMode(): 'percent' | 'cost' {
    return this.cfg.get('displayMode', 'percent')
  }

  get cacheTtlSeconds(): number {
    return this.cfg.get('cache.ttlSeconds', 300)
  }

  get rateLimitApiEnabled(): boolean {
    return this.cfg.get('rateLimitApi.enabled', true)
  }

  get dailyBudget(): number | null {
    return this.cfg.get('budget.dailyUsd', null)
  }

  get claudeProvider(): 'auto' | ClaudeProvider {
    return this.cfg.get('claudeProvider', 'auto')
  }

  // ... etc

  async setDisplayMode(mode: 'percent' | 'cost'): Promise<void> {
    await this.cfg.update('displayMode', mode, vscode.ConfigurationTarget.Global)
  }

  async setDailyBudget(value: number | null): Promise<void> {
    await this.cfg.update('budget.dailyUsd', value, vscode.ConfigurationTarget.Global)
  }
}
```

---

## Settings Change Listener

React to settings changes without requiring extension restart:

```typescript
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('claudeStatus')) {
    statusBar.update(lastData)  // re-render with new settings
  }
})
```
