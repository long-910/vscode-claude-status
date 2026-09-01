# Feature 06 — Sidebar Tree View

A dedicated Activity Bar container with a native TreeView that surfaces the
extension's key numbers and quick actions without opening the dashboard panel.

---

## Contribution Points (`package.json`)

```jsonc
"viewsContainers": {
  "activitybar": [
    { "id": "claude-status", "title": "%view.container.title%", "icon": "images/activitybar.svg" }
  ]
},
"views": {
  "claude-status": [
    { "id": "claudeStatus.overview", "name": "%view.overview.title%" }
  ]
}
```

The icon is a monochrome SVG (gauge glyph) — VS Code recolors it via mask, so
use `currentColor` strokes only.

---

## Tree Structure

```
Rate Limit                     (claude-ai provider with rate-limit data only)
├─ 5h window    62% · resets in 1h 12m
└─ 7d window    41% · resets in 3d 2h    (only when has7dLimit)
Token Cost
├─ 5h           $1.23
├─ Today        $2.50
└─ 7 days       $10.00
Projects                        (only when workspace projects matched)
└─ <name>       Today: $3.21 · 7d: $18.45   (tooltip = project dir path)
Actions
├─ Open Dashboard      → vscode-claude-status.openDashboard
├─ Refresh Now         → vscode-claude-status.refresh
├─ Toggle % / $ Display → vscode-claude-status.toggleDisplayMode
└─ Set Budget…         → vscode-claude-status.setBudget
```

Special root states:

| State | Rendering |
|-------|-----------|
| No data yet | `Loading…` (spinner icon) + Actions |
| `no-credentials` | `Not logged in` (tooltip: run `claude login`) + Actions |

Utilization leaf icons use `ThemeColor`: `charts.yellow` at ≥ 75 %,
`charts.red` at ≥ 90 %.

---

## Refresh Model

`ClaudeStatusTreeProvider` (in `src/treeView.ts`):

- Subscribes to `DataManager.onDidUpdate` — refreshes whenever JSONL changes,
  a manual refresh runs, or workspace folders change.
- The extension's existing 60-second re-render timer also calls
  `treeProvider.refresh()` so the "resets in" countdowns stay current.
- No additional I/O: the tree reads only `getLastData()` /
  `getLastProjectCosts()` — it never triggers JSONL scans or API calls itself.

All labels go through `vscode.l10n.t()` (EN / JA / ZH).
