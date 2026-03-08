# Feature 03: Project-Level Cost Tracking

## Purpose

**VSCode-exclusive feature** — tmux has no concept of "which project is open."
Map the currently open VSCode workspace to its corresponding Claude Code JSONL
directory and show project-specific costs.

This is the most differentiated feature from the tmux version.

---

## Workspace Detection

```typescript
async function getAllProjectCosts(pricing: TokenPricing): Promise<ProjectCostData[]> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return []

  const results = await Promise.all(
    folders.map(async folder => {
      const workspacePath = folder.uri.fsPath
      const projectDir = await workspacePathToProjectDir(workspacePath)
      if (!projectDir) return null
      const projectName = path.basename(workspacePath)
      return getProjectCostForDir(projectDir, projectName, pricing)
    })
  )

  return results
    .filter((r): r is ProjectCostData => r !== null)
    .sort((a, b) => b.costToday - a.costToday)
}
```

### Path Mapping Logic

Claude Code converts workspace paths by replacing **every non-alphanumeric character** with `-`:

```
/home/user/sb_git/my-app  →  -home-user-sb-git-my-app
```

```typescript
export function workspacePathToHash(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, '-')  // NOT just '/'
}

export async function workspacePathToProjectDir(workspacePath: string): Promise<string | null> {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')

  // Strategy 1: Direct path conversion (Claude Code's known scheme)
  const hash = workspacePathToHash(workspacePath)
  const candidate = path.join(claudeProjectsDir, hash)
  if (await dirExists(candidate)) return candidate

  // Strategy 2: Scan all project dirs and match by top-level cwd field in JSONL
  try {
    const dirs = await fs.readdir(claudeProjectsDir)
    for (const dir of dirs) {
      const projectPath = path.join(claudeProjectsDir, dir)
      if (!(await dirExists(projectPath))) continue
      if (await dirMatchesWorkspace(projectPath, workspacePath)) return projectPath
    }
  } catch {
    // graceful degradation if projects dir is unreadable
  }

  return null
}

async function dirMatchesWorkspace(projectDir: string, workspacePath: string): Promise<boolean> {
  // Check top-level cwd field in first 30 lines of any JSONL in the directory
  try {
    const files = await fs.readdir(projectDir)
    const jsonlFile = files.find(f => f.endsWith('.jsonl'))
    if (!jsonlFile) return false

    const content = await fs.readFile(path.join(projectDir, jsonlFile), 'utf-8')
    const lines = content.split('\n').filter(Boolean).slice(0, 30)
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        if (obj.cwd === workspacePath) return true
      } catch { /* skip malformed lines */ }
    }
    return false
  } catch {
    return false
  }
}
```

---

## Cost Aggregation

> [!WARNING]
> Token costs shown here are **estimates only**, calculated from Anthropic's
> publicly announced pricing at the time of implementation.
> Rates may change — update `claudeStatus.pricing.*` settings if needed.
> See [DATA.md](../DATA.md) for the full rate table.

```typescript
async function getProjectCostForDir(
  projectDir: string,
  projectName: string,
  pricing: TokenPricing
): Promise<ProjectCostData> {
  // Reads all .jsonl files in the directory
  // Parses type === 'assistant' entries only
  // Usage is at entry.message.usage (NOT entry.usage; no costUSD field)
  // Accumulates: costToday, cost7d, cost30d, sessionCount, lastActive
}
```

Key points:
- `sessionCount` = number of `.jsonl` files in the project directory
- `lastActive` = most recent timestamp across all entries
- Cost always calculated from tokens via `calculateCost(usage, pricing)`

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
