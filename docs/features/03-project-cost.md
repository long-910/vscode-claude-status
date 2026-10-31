# Feature 03: Project-Level Cost Tracking

## Purpose

**VSCode-exclusive feature** — tmux has no concept of "which project is open."
Map the currently open VSCode workspace to its corresponding Claude Code JSONL
directory and show project-specific costs.

This is the most differentiated feature from the tmux version.

---

## Workspace Detection

`getAllProjectCosts(options: CostOptions)` (`src/data/projectCost.ts`) maps every workspace
folder to its Claude Code project directory and returns one `ProjectCostData` per match,
sorted by today's cost. Folders without a matching directory are skipped.

### Path Mapping Logic

Claude Code names a project directory after the workspace path, replacing **every
non-alphanumeric character** with `-`:

```
/home/user/sb_git/my-app  →  <claudeHome>/projects/-home-user-sb-git-my-app
```

`workspacePathToProjectDir()` tries, in order:

1. **Direct conversion** — `workspacePathToHash()` (`path.replace(/[^a-zA-Z0-9]/g, '-')`);
   used when that directory exists.
2. **`cwd` scan** — for each project directory, stream the first 30 lines of one transcript
   (`forEachJsonlLine()`, stops early) and match the top-level `cwd` field against the
   workspace path.

Returns `null` when neither matches (graceful degradation if the projects directory is
missing or unreadable).

---

## Cost Aggregation

`getProjectCostForDir()` reads the project's transcripts through the shared usage index
(only files modified in the last 30 days; appended bytes only), prices each entry with the
same `CostOptions` as every other view ([PRICING.md](../PRICING.md)), and accumulates:

| Field | Meaning |
|---|---|
| `costToday` / `cost7d` / `cost30d` | cost since local midnight / in the last 7 / 30 days |
| `sessionCount` | number of `.jsonl` files in the project directory |
| `lastActive` | newest entry timestamp; falls back to the newest transcript mtime when nothing is inside 30 days |

---

## Status Bar Integration

When a workspace is open, append project cost to the status bar label:

**Single workspace:**
```
🤖 5h:78% 7d:84% | my-app:$3.21
```

**Multi-root workspace (aggregated):**
```
🤖 5h:78% 7d:84% | PJ:$5.43
```

When no workspace is open (e.g., untitled window):
```
🤖 5h:78% 7d:84%
```

The project name is truncated to 12 characters if longer:
```typescript
const shortName = name.length > 12 ? name.slice(0, 11) + '…' : name
```

---

## Multi-Root Workspace Support

When VSCode has multiple workspace folders open (`vscode.workspace.workspaceFolders.length > 1`):

- Show **aggregate** cost of ALL open projects in status bar: `PJ:$5.43`
- In WebView, show each project as a separate card with its own cost breakdown
- Results are sorted by `costToday` descending

---

## Update Trigger

Project cost is recalculated:
- On FileWatcher JSONL change (same trigger as global refresh, via `DataManager.refresh()`)
- On WebView panel open (via `DataManager.refreshProjectCosts()`)

No API call is needed — project cost is derived entirely from local JSONL files.
