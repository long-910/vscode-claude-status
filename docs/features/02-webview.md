# Feature 02: WebView Dashboard Panel

## Purpose

Rich visual dashboard that opens when the user clicks the status bar item.
Shows all usage data in a single scrollable panel. VSCode-native look and feel
using CSS variables from the active theme.

---

## Panel Specification

```typescript
const panel = vscode.window.createWebviewPanel(
  'claudeStatusDashboard',
  'Claude Code Usage',
  vscode.ViewColumn.Beside,   // opens to the right of active editor
  {
    enableScripts: true,
    retainContextWhenHidden: true,   // keep state when tab is hidden
    localResourceRoots: [],          // no local file access needed
  }
)
```

Only one panel instance at a time. If already open, `panel.reveal()`.

---

## Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
  style-src 'unsafe-inline';
  img-src data:;
  connect-src 'none';
">
```

`nonce` is a random 16-byte hex string generated per panel creation (`crypto.randomBytes(16).toString('hex')`).
All inline `<script>` tags must include `nonce="${nonce}"`.

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Claude Code Usage    [↻ Refresh] [$ / %] [⚙]       │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  CURRENT USAGE                                  │ │
│  │  5h: [████████░░] 78%   resets in 2h 47m       │ │
│  │  7d: [███████░░░] 84%⚠  resets in 4.3d         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────┐  ┌──────────────────────────────┐│
│  │ TOKEN COST     │  │ PROJECT: my-app              ││
│  │ 5h:  $14.21    │  │ Today:  $3.21                ││
│  │ day: $14.21    │  │ 7 days: $18.45               ││
│  │ 7d:  $53.17    │  │ 30 days: $62.10              ││
│  └────────────────┘  └──────────────────────────────┘│
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  PREDICTION                                     │ │
│  │  Burn rate: $4.2/hr                             │ │
│  │  ⚠ At this rate, 5h limit in ~45 minutes        │ │
│  │  💡 Recommendation: finish current task soon    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  USAGE HISTORY (last 90 days)                   │ │
│  │  [GitHub-style heatmap grid]                    │ │
│  │                                                 │ │
│  │  HOURLY PATTERN (avg by hour of day)            │ │
│  │  [Bar chart 0–23h]                              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Last updated: just now                              │
└──────────────────────────────────────────────────────┘
```

### Header Buttons

| Button | Action |
|--------|--------|
| `↻ Refresh` | Force-refresh data (API + JSONL); shows spinner while loading |
| `$ / %` | Toggle between cost and percent display mode |
| `⚙` | Open VSCode settings filtered to `claudeStatus` |

---

## Theme Integration

Use VSCode CSS variables so the panel respects Light/Dark/High Contrast themes:

```css
body {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.card {
  background-color: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 12px;
}

.progress-fill {
  background-color: var(--vscode-progressBar-background);
}
.progress-fill.warning {
  background-color: var(--vscode-editorWarning-foreground);
}
.progress-fill.error {
  background-color: var(--vscode-editorError-foreground);
}

button {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 2px;
}
button:hover { background-color: var(--vscode-button-hoverBackground); }
button:disabled { opacity: 0.5; cursor: default; }
```

---

## Message Protocol (Extension ↔ WebView)

### Extension → WebView

```typescript
// Send data update
panel.webview.postMessage({
  type: 'update',
  data: {
    usage: ClaudeUsageData,
    projectCosts: ProjectCostData[],   // array (multi-root aware)
    prediction: PredictionData | null,
    heatmap: HeatmapData | null,
  }
})

// Send display mode change
panel.webview.postMessage({
  type: 'setDisplayMode',
  mode: 'cost' | 'percent'
})
```

### WebView → Extension

```typescript
// In WebView JS:
vscode.postMessage({ type: 'ready' })           // sent on DOMContentLoaded
vscode.postMessage({ type: 'refresh' })          // user clicks ↻ Refresh
vscode.postMessage({ type: 'toggleMode' })       // user clicks $ / %
vscode.postMessage({ type: 'setBudget', amount: 50.0 })  // user saves budget
vscode.postMessage({ type: 'openSettings' })     // user clicks ⚙

// In extension handler:
panel.webview.onDidReceiveMessage(msg => {
  switch (msg.type) {
    case 'ready':
      // send initial data
      sendUpdate(lastData)
      break
    case 'refresh':
      dataManager.forceRefresh()
      break
    case 'toggleMode': {
      const next = config.displayMode === 'percent' ? 'cost' : 'percent'
      config.setDisplayMode(next).then(() => {
        panel.webview.postMessage({ type: 'setDisplayMode', mode: next })
      })
      break
    }
    case 'setBudget':
      config.setDailyBudget(msg.amount).then(() => dataManager.forceRefresh())
      break
    case 'openSettings':
      vscode.commands.executeCommand('workbench.action.openSettings', 'claudeStatus')
      break
  }
})
```

---

## Progress Bar Component

Pure CSS — no external library needed:

```html
<div class="progress-row">
  <div class="progress-labels">
    <span>5h window</span>
    <span>78% — resets in 2h 47m</span>
  </div>
  <div class="progress-track">
    <div class="progress-fill warning" style="width: 78%"></div>
  </div>
</div>
```

```css
.progress-track {
  height: 8px;
  background-color: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
```

---

## Refresh Behavior

When user clicks "↻ Refresh":
1. Show spinner on button (`<span class="spinning">⟳</span>`, button disabled)
2. Send `{ type: 'refresh' }` to extension
3. Extension calls `DataManager.forceRefresh()`
4. `onDidUpdate` fires → extension posts `{ type: 'update', data: ... }`
5. WebView receives update → re-renders → removes spinner

The heatmap is computed in background after the initial update fires a second `onDidUpdate`.
The WebView re-renders heatmap when it receives this second update.

---

## Heatmap In-Memory Cache

`DataManager.getHeatmapData()` caches the computed result in memory for 5 minutes
(`heatmapTtlMs = 5 * 60 * 1000`) to avoid re-reading all JSONL on every refresh.
`forceRefresh()` invalidates the heatmap cache (`heatmapComputedAt = 0`).
