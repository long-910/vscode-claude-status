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

`nonce` is a random UUID generated per panel creation. All inline `<script>` tags
must include `nonce="${nonce}"`.

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Claude Code Usage            [↻ Refresh] [$ / %]    │
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

.progress-bar-fill {
  background-color: var(--vscode-progressBar-background);
}

.progress-bar-fill.warning {
  background-color: var(--vscode-editorWarning-foreground);
}

.progress-bar-fill.error {
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

button:hover {
  background-color: var(--vscode-button-hoverBackground);
}
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
    projectCost: ProjectCostData | null,
    prediction: PredictionData,
    heatmap: HeatmapData,
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
vscode.postMessage({ type: 'refresh' })
vscode.postMessage({ type: 'toggleMode' })
vscode.postMessage({ type: 'setBudget', amount: 50.0 })
vscode.postMessage({ type: 'ready' })   // sent on DOMContentLoaded

// In extension:
panel.webview.onDidReceiveMessage(msg => {
  switch (msg.type) {
    case 'refresh': dataManager.refresh(true); break
    case 'toggleMode': config.toggleDisplayMode(); break
    case 'setBudget': config.setBudget(msg.amount); break
    case 'ready': panel.webview.postMessage({ type: 'update', data: ... }); break
  }
})
```

---

## Progress Bar Component

Pure CSS — no external library needed:

```html
<div class="progress-container">
  <div class="progress-label">
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
1. Show spinner on button
2. Send `{ type: 'refresh' }` to extension
3. Extension calls `DataManager.refresh(forceApi=true)`
4. `onDidUpdate` fires → extension posts `{ type: 'update', data: ... }`
5. WebView receives and re-renders
6. Remove spinner

Spinner: replace button text with `⟳` + CSS animation, restore after update received.
