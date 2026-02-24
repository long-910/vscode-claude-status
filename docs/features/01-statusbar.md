# Feature 01: Status Bar Display

## Purpose

Always-visible Claude Code usage summary in the VSCode status bar (bottom bar).
Lightweight, non-blocking, updates automatically.

---

## Display Format

### Normal mode
```
🤖 5h:78% 7d:84% | PJ:$3.21
```

### Warning mode (≥75% utilization)
```
🤖 5h:78%⚠ 7d:84%⚠ | PJ:$3.21
```

### Denied (limit reached)
```
🤖 5h:100%✗ | PJ:$3.21
```

### No cache yet (initial state)
```
🤖 Claude: run refresh
```

### Stale data (Claude idle, cache expired)
```
🤖 5h:78% [32m ago] | PJ:$3.21
```

### No credentials
```
🤖 Not logged in
```

---

## Status Bar Item Specification

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left,
  100  // priority — appears near left side
)
statusBarItem.command = 'vscode-claude-status.openDashboard'
statusBarItem.tooltip = buildTooltip(data)  // see Tooltip section
```

### Position

Left side of status bar, priority 100 (between language selector area and git info).
Configurable via `claudeStatus.statusBar.alignment` setting ('left' | 'right').

---

## Color Coding

Use VSCode theme color IDs (not hardcoded hex):

| State | Color ID |
|-------|----------|
| Normal (< 75%) | `statusBar.foreground` (default, no change) |
| Warning (≥ 75%) | `statusBarItem.warningBackground` |
| Denied (100%) | `statusBarItem.errorBackground` |
| Stale data | `statusBar.foreground` with dimmed opacity via color `#888888` |
| No credentials | `statusBarItem.errorBackground` |

```typescript
function applyColor(item: vscode.StatusBarItem, status: LimitStatus, isStale: boolean) {
  if (isStale) {
    item.backgroundColor = undefined
    item.color = new vscode.ThemeColor('descriptionForeground')
    return
  }
  switch (status) {
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

```
Claude Code Usage
─────────────────────────────
5h window:   78% [XXXXXX..] resets in 2h 47m
7d window:   84% [XXXXXXX.] resets in 4.3d

Token Cost (local)
─────────────────────────────
5h:   in:38.5K out:127.8K  $14.21
day:  in:38.5K out:127.8K  $14.21
7d:   in:80.0K out:468.9K  $53.17

Project: my-app
  Today: $3.21  |  7d: $18.45

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
| User clicks "Refresh" in WebView | `DataManager.refresh(forceApi=true)` → update |

Timer implementation:
```typescript
const timer = setInterval(() => {
  dataManager.getUsageData().then(data => statusBar.update(data))
}, 60_000)
// Register for disposal: context.subscriptions.push({ dispose: () => clearInterval(timer) })
```

---

## Display Toggle (Cost Mode)

Command: `vscode-claude-status.toggleCostMode`  
Keyboard: `Ctrl+Shift+Alt+C` (default, configurable)

In cost mode, replace utilization percentage with dollar amount:
```
🤖 5h:$14.21 7d:$53.17 | PJ:$3.21
```

Toggle state is persisted in `vscode.workspace.getConfiguration()`:
```typescript
config.update('claudeStatus.displayMode', 'cost', vscode.ConfigurationTarget.Global)
```

---

## Accessibility

- `statusBarItem.name = 'Claude Code Usage'` — for screen readers
- Tooltip must convey all information shown in the label
- Do not rely solely on color to convey state (use text indicators ⚠ ✗)
