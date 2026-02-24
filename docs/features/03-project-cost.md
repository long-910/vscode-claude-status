# Feature 03: Project-Level Cost Tracking

## Purpose

**VSCode-exclusive feature** — tmux has no concept of "which project is open."
Map the currently open VSCode workspace to its corresponding Claude Code JSONL
directory and show project-specific costs.

This is the most differentiated feature from the tmux version.

---

## Workspace Detection

```typescript
async function getCurrentProjectDir(): Promise<string | null> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) return null

  // Use the first workspace folder (primary project)
  const workspacePath = folders[0].uri.fsPath
  return workspacePathToProjectDir(workspacePath)
}
```

### Path Mapping Logic

```typescript
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'

async function workspacePathToProjectDir(workspacePath: string): Promise<string | null> {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')

  // Strategy 1: Direct path conversion (Claude Code's known scheme)
  // /home/user/my-app → -home-user-my-app
  const hash = workspacePath.replace(/\//g, '-')
  const candidate = path.join(claudeProjectsDir, hash)
  if (await dirExists(candidate)) return candidate

  // Strategy 2: Scan all project dirs and match by content
  // (fallback for edge cases or future Claude Code versions)
  const dirs = await fs.readdir(claudeProjectsDir)
  for (const dir of dirs) {
    const projectPath = path.join(claudeProjectsDir, dir)
    // Check if any JSONL in this dir references the workspace path
    const matched = await dirMatchesWorkspace(projectPath, workspacePath)
    if (matched) return projectPath
  }

  return null
}

async function dirMatchesWorkspace(projectDir: string, workspacePath: string): Promise<boolean> {
  // Read first few lines of any JSONL to check for cwd field
  try {
    const files = await fs.readdir(projectDir)
    const jsonlFile = files.find(f => f.endsWith('.jsonl'))
    if (!jsonlFile) return false
    const content = await fs.readFile(path.join(projectDir, jsonlFile), 'utf-8')
    const firstLine = content.split('\n')[0]
    const parsed = JSON.parse(firstLine)
    return parsed.cwd === workspacePath
  } catch {
    return false
  }
}
```

> **Note:** Verify the actual JSONL structure during implementation.
> The `cwd` field may not exist. Adjust Strategy 2 accordingly.

---

## Cost Aggregation

```typescript
async function getProjectCost(projectDir: string): Promise<ProjectCostData> {
  const now = Date.now()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let costToday = 0
  let cost7d = 0
  let cost30d = 0
  let sessionCount = 0
  let lastActive: Date | null = null

  const files = await fs.readdir(projectDir)
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue

    const content = await fs.readFile(path.join(projectDir, file), 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (!entry.timestamp) continue

        const ts = new Date(entry.timestamp)
        const cost = entry.costUSD ?? calculateCost(entry.usage ?? {})
        const ageMs = now - ts.getTime()

        if (ts >= todayStart) costToday += cost
        if (ageMs < 7 * 24 * 3600 * 1000) cost7d += cost
        if (ageMs < 30 * 24 * 3600 * 1000) cost30d += cost

        if (!lastActive || ts > lastActive) lastActive = ts
      } catch {
        // skip malformed lines
      }
    }
    sessionCount++
  }

  return {
    projectName: path.basename(vscode.workspace.workspaceFolders![0].uri.fsPath),
    projectPath: projectDir,
    costToday,
    cost7d,
    cost30d,
    sessionCount,
    lastActive: lastActive ?? new Date(0),
  }
}
```

---

## Status Bar Integration

When a workspace is open, append project cost to the status bar label:

```
🤖 5h:78% 7d:84% | my-app:$3.21
```

When no workspace is open (e.g., untitled window):
```
🤖 5h:78% 7d:84%
```

The project name is truncated to 12 characters if longer:
```typescript
const shortName = projectName.length > 12
  ? projectName.slice(0, 11) + '…'
  : projectName
```

---

## Multi-Root Workspace Support

When VSCode has multiple workspace folders open (`vscode.workspace.workspaceFolders.length > 1`):

- Show aggregate cost of ALL open projects in status bar: `PJ:$5.43`
- In WebView, show each project as a separate card with its own cost breakdown
- Order by `costToday` descending

```typescript
async function getAllProjectCosts(): Promise<ProjectCostData[]> {
  const folders = vscode.workspace.workspaceFolders ?? []
  const results = await Promise.all(
    folders.map(async folder => {
      const projectDir = await workspacePathToProjectDir(folder.uri.fsPath)
      if (!projectDir) return null
      return getProjectCost(projectDir)
    })
  )
  return results
    .filter((r): r is ProjectCostData => r !== null)
    .sort((a, b) => b.costToday - a.costToday)
}
```

---

## Update Trigger

Project cost is recalculated:
- On FileWatcher JSONL change (same trigger as global refresh)
- On `vscode.workspace.onDidChangeWorkspaceFolders` event
- On WebView panel open

No API call is needed — project cost is derived entirely from local JSONL files.
