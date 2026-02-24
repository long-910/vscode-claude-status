# Settings Specification

All settings are under the `claudeStatus` namespace in VSCode settings.

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

  "claudeStatus.cache.ttlSeconds": {
    "type": "number",
    "default": 300,
    "minimum": 60,
    "maximum": 3600,
    "description": "Cache TTL in seconds. API is not called more often than this when Claude Code is idle."
  },

  "claudeStatus.realtime.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable realtime polling (1 API call every cache.ttlSeconds). Increases API usage."
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
  }
}
```

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
  private get config() {
    return vscode.workspace.getConfiguration('claudeStatus')
  }

  get displayMode(): 'percent' | 'cost' {
    return this.config.get('displayMode', 'percent')
  }

  get cacheTtlSeconds(): number {
    return this.config.get('cache.ttlSeconds', 300)
  }

  get dailyBudget(): number | null {
    return this.config.get('budget.dailyUsd', null)
  }

  // ... etc

  async setDisplayMode(mode: 'percent' | 'cost'): Promise<void> {
    await this.config.update('displayMode', mode, vscode.ConfigurationTarget.Global)
  }
}
```

---

## Settings Change Listener

React to settings changes without requiring extension restart:

```typescript
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('claudeStatus')) {
    config.reload()
    statusBar.update(lastData)  // re-render with new settings
  }
})
```
