# Feature 01: Status Bar Display

## Purpose

Always-visible Claude Code usage summary in the VSCode status bar (bottom bar).
Lightweight, non-blocking, updates automatically.

---

## Display Format

### Percent mode (claude-ai provider, `displayMode: "percent"`)

```
🤖 5h:78% 7d:84% | my-app:$3.21
```

### Warning mode (≥75% utilization)
```
🤖 5h:78%⚠ 7d:84%⚠ | my-app:$3.21
```

### Denied (limit reached)
```
🤖 5h:100%✗ | my-app:$3.21
```

### Stale data (cache expired, or `rateLimitApi.enabled: false` with cached data)
```
🤖 5h:78% 7d:84% [32m ago] | my-app:$3.21   ← minutes (< 1 h)
🤖 5h:78% 7d:84% [2h 15m ago] | my-app:$3.21 ← hours  (1 h – 23 h)
🤖 5h:78% 7d:84% [1d 3h ago] | my-app:$3.21  ← days   (≥ 24 h)
```

### Cost mode (non-claude-ai provider, or `displayMode: "cost"`)
```
🤖 5h:$14.21 7d:$53.17 | my-app:$3.21
```

### No data yet (initial state)
```
🤖 Claude: run refresh
```

### No credentials
```
🤖 Not logged in
```

---

## Provider Behavior

| Provider | Rate % shown | Mode |
|----------|-------------|------|
| `claude-ai`, API enabled | Yes | percent (default) or cost |
| `claude-ai`, API disabled, cache exists | Yes (stale) | percent with `[X ago]` (m / h / d) |
| `claude-ai`, API disabled, no cache | No | cost only |
| `aws-bedrock` / `api-key` / `unknown` | No | cost only (always) |

---

## Status Bar Item Specification

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left,
  100  // priority — appears near left side
)
statusBarItem.name = 'Claude Code Usage'  // for screen readers
statusBarItem.command = 'vscode-claude-status.openDashboard'
statusBarItem.tooltip = buildTooltip(data)
```

### Position

Left side of status bar, priority 100.
Configurable via `claudeStatus.statusBar.alignment` setting (`'left'` | `'right'`).

---

## Color Coding

Use VSCode theme color IDs (not hardcoded hex):

| State | Background | Foreground |
|-------|-----------|------------|
| Normal (< 75%) | — | — (default) |
| Warning (≥ 75%) | `statusBarItem.warningBackground` | `statusBarItem.warningForeground` |
| Denied (100%) | `statusBarItem.errorBackground` | `statusBarItem.errorForeground` |
| Stale data | — | `descriptionForeground` (dimmed) |
| No credentials | `statusBarItem.errorBackground` | `statusBarItem.errorForeground` |
| Non-claude-ai | — | — (default) |

```typescript
function applyColor(item: vscode.StatusBarItem, data: ClaudeUsageData): void {
  const { limitStatus, dataSource, providerType } = data

  if (dataSource === 'no-credentials') {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground')
    return
  }
  if (dataSource === 'stale') {
    item.backgroundColor = undefined
    item.color = new vscode.ThemeColor('descriptionForeground')
    return
  }
  // Non-claude-ai providers: no warning/error colors
  if (providerType !== 'claude-ai') {
    item.backgroundColor = undefined
    item.color = undefined
    return
  }
  switch (limitStatus) {
    case 'denied':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
      item.color = new vscode.ThemeColor('statusBarItem.errorForeground')
      break
    case 'allowed_warning':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground')
      break
    default:
      item.backgroundColor = undefined
      item.color = undefined
  }
}
```

---

## Tooltip (hover text)

### Claude.ai provider
```
Claude Code Usage
─────────────────────────────
5h window:   78% [XXXXXX..] resets in 2h 47m
7d window:   84% [XXXXXXX.] resets in 4d 8h

Token Cost (local)
─────────────────────────────
5h:   in:38.5K out:127.8K  $14.21
day:  $14.21
7d:   $53.17

Project: my-app
  Today: $3.21  |  7d: $18.45

Last updated: just now
Click to open dashboard →
```

### Non-claude-ai provider (e.g. AWS Bedrock)
```
Claude Code (AWS Bedrock)
─────────────────────────────

Token Cost (local)
─────────────────────────────
5h:   in:38.5K out:127.8K  $14.21
day:  $14.21
7d:   $53.17

Last updated: just now
Click to open dashboard →
```

Build with `\n`-separated string. VSCode renders tooltip as plain text.

---

## Update Timing

| Event | Action |
|-------|--------|
| Extension activation | Read cache → update immediately |
| JSONL file change (FileWatcher) | `DataManager.refresh()` → update |
| Timer (every 60 seconds) | Re-render from cache (no API call) |
| User clicks "↻ Refresh" in WebView | `DataManager.forceRefresh()` → update |

Timer implementation:
```typescript
const timer = setInterval(() => {
  dataManager.refresh().catch(() => {})
}, 60_000)
context.subscriptions.push({ dispose: () => clearInterval(timer) })
```

---

## Display Toggle (Cost Mode)

Command: `vscode-claude-status.toggleDisplayMode`
Keyboard: `Ctrl+Shift+Alt+C` (default, configurable)

In cost mode, replace utilization percentage with dollar amount:
```
🤖 5h:$14.21 7d:$53.17 | my-app:$3.21
```

Toggle state is persisted in `vscode.workspace.getConfiguration()`:
```typescript
config.setDisplayMode('cost')  // → claudeStatus.displayMode
```

---

## Accessibility

- `statusBarItem.name = 'Claude Code Usage'` — for screen readers
- Tooltip must convey all information shown in the label
- Do not rely solely on color to convey state (use text indicators ⚠ ✗)
