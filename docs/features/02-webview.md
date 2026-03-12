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
│  │  7d: [███████░░░] 84%⚠  resets in 4d 8h        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────┐  ┌──────────────────────────────┐│
│  │ TOKEN COST     │  │ PROJECT: my-app              ││
│  │ 5h:  $14.21    │  │ Today:  $3.21                ││
│  │ day: $14.21    │  │ 7 days: $18.45               ││
│  │ 7d:  $53.17    │  │ 30 days: $62.10              ││
│  │ Month: $426    │  └──────────────────────────────┘│
│  │ ▶ Token breakdown (5h)                           ││
│  └────────────────┘                                  │
│    ↳ expanded:                                       │
│      Input:       120k tok = $0.0036                 │
│      Output:       18k tok = $0.0270                 │
│      Cache read:  340k tok = $0.0001                 │
│      Cache create: 12k tok = $0.0000                 │
│      Cache hit ratio: 74% — Good! Cache is saving…  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  PREDICTION                                     │ │
│  │  [Rate Limit Timeline chart]                    │ │
│  │  100% ┤- - - - - - - - - ✕ (limit)             │ │
│  │   75% ┤- - - - - ⚠ (warn)                      │ │
│  │   78% ┤━━━━━━━━━━                               │ │
│  │      23:00   23:22  00:17                       │ │
│  │  Burn rate: $4.2/hr                             │ │
│  │  ⚠ 5h limit in ~45m (at 23:22)                 │ │
│  │  Daily budget: $12.50 / $20.00 (62%)            │ │
│  │  Weekly budget: $48.10 / $100 (48%)             │ │
│  │  💡 Recommendation: finish current task soon    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  PRICING & SETTINGS                    [▲ Hide] │ │
│  │  Input        $3.00  / 1M tokens               │ │
│  │  Output      $15.00  / 1M tokens               │ │
│  │  Cache read   $0.30  / 1M tokens               │ │
│  │  Cache create $3.75  / 1M tokens               │ │
│  │  [Claude.ai] [API enabled] [Cache TTL: 5m]     │ │
│  │  ⚙ Edit pricing & settings                     │ │
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
    pricing: TokenPricing,             // current claudeStatus.pricing.* values
    settings: {
      provider: string,                // detected/configured provider type
      apiEnabled: boolean,             // claudeStatus.rateLimitApi.enabled
      cacheTtlSeconds: number,         // claudeStatus.cache.ttlSeconds
      weeklyBudget: number | null,     // claudeStatus.budget.weeklyUsd
    },
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

---

## CSP and Event Handlers

**Critical:** The CSP `script-src 'nonce-...'` blocks all inline `onclick="fn()"` HTML
attribute handlers. Only the `<script nonce="...">` tag itself is trusted.

**Rule:** Never use `onclick`, `onchange`, or any other inline event attribute in the
WebView HTML. Always use one of these patterns instead:

```javascript
// Static elements — attach in script init block
document.getElementById('my-btn').addEventListener('click', myHandler);

// Dynamically generated elements — use document-level event delegation
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'dynamic-btn-id') { myHandler(); }
});
```

Assign unique `id` attributes to dynamically created buttons so the delegation handler
can identify them. Do not rely on class names alone (multiple elements may share a class).

---

## Rate Limit Timeline Chart

The Prediction card includes a Chart.js line chart (`<canvas id="predChart">`) that
visualises the projected 5 h utilization over the remaining window time.

**Visibility:** shown only when `providerType === 'claude-ai'` and `utilization5h > 0`.

**Data construction:**

1. Generate ~8 evenly-spaced time points from now to reset (`resetIn5h` seconds).
2. If `estimatedExhaustionIn` is set, insert that exact minute as an additional point.
3. For each point at time `t` (minutes from now):
   - If `t >= exhaustMin`: y = 100 %
   - Else: y = `currentPct + (100 − currentPct) × (t / exhaustMin)` (linear)
   - If no exhaustion predicted: y = `currentPct` (flat)
4. Reference datasets: flat lines at y = 75 (orange dashed) and y = 100 (red dashed).

**Chart options:** `animation: false`, y-axis 0–105 %, x-axis shows absolute time labels,
legend hidden, tooltip only on the projection dataset.

---

## Token Breakdown (collapsible)

Inside the Token Cost card, a `▶ Token breakdown (5h)` toggle button reveals
per-type token counts and costs using the `usage` and `pricing` fields from the
`update` message:

| Row | Formula |
|-----|---------|
| Input | `tokensIn5h / 1M × pricing.inputPerMillion` |
| Output | `tokensOut5h / 1M × pricing.outputPerMillion` |
| Cache read | `tokensCacheRead5h / 1M × pricing.cacheReadPerMillion` |
| Cache create | `tokensCacheCreate5h / 1M × pricing.cacheCreatePerMillion` |
| Cache hit ratio | `tokensCacheRead5h / (tokensIn5h + tokensCacheRead5h) × 100` |

The breakdown re-renders on every `update` message if the toggle is open.

---

## Pricing & Settings Card

Always-visible card (default expanded, toggle with `▲ Hide` / `▼ Show`) showing:

- **Pricing grid** — current `claudeStatus.pricing.*` values for all four token types
- **Status badges** — provider type, `rateLimitApi.enabled` state, cache TTL in minutes
- **Settings link** — button that posts `{ type: 'openSettings' }` to open VS Code
  settings filtered to `claudeStatus`

The card content is re-rendered on every `update` message regardless of open/closed state,
so it always reflects live settings without requiring a panel reload.
