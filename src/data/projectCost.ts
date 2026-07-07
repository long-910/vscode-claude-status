import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { entryCost, readUsageEntries, CostOptions, DEFAULT_COST_OPTIONS } from './jsonlReader';

export interface ProjectCostData {
  projectName: string
  projectPath: string
  costToday: number
  cost7d: number
  cost30d: number
  sessionCount: number
  lastActive: Date
}

// Verified against real ~/.claude/projects/ directory names:
// Claude Code replaces every non-alphanumeric character with '-'
// e.g. /home/user/sb_git/my-app → -home-user-sb-git-my-app
export function workspacePathToHash(workspacePath: string): string {
  return workspacePath.replace(/[^a-zA-Z0-9]/g, '-');
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// Strategy 2: scan the project dir's JSONL files and match by top-level cwd field
async function dirMatchesWorkspace(projectDir: string, workspacePath: string): Promise<boolean> {
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFile = files.find(f => f.endsWith('.jsonl'));
    if (!jsonlFile) { return false; }

    const content = await fs.readFile(path.join(projectDir, jsonlFile), 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(0, 30);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.cwd === workspacePath) { return true; }
      } catch {
        // skip malformed lines
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function workspacePathToProjectDir(workspacePath: string): Promise<string | null> {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

  // Strategy 1: Direct path conversion (Claude Code's known scheme)
  const hash = workspacePathToHash(workspacePath);
  const candidate = path.join(claudeProjectsDir, hash);
  if (await dirExists(candidate)) { return candidate; }

  // Strategy 2: Scan all project dirs and match by cwd field in JSONL
  try {
    const dirs = await fs.readdir(claudeProjectsDir);
    for (const dir of dirs) {
      const projectPath = path.join(claudeProjectsDir, dir);
      if (!(await dirExists(projectPath))) { continue; }
      if (await dirMatchesWorkspace(projectPath, workspacePath)) { return projectPath; }
    }
  } catch {
    // graceful degradation if projects dir is unreadable
  }

  return null;
}

async function getProjectCostForDir(projectDir: string, projectName: string, options: CostOptions = DEFAULT_COST_OPTIONS): Promise<ProjectCostData> {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const w7d = 7 * 24 * 3600 * 1000;
  const w30d = 30 * 24 * 3600 * 1000;

  let costToday = 0;
  let cost7d = 0;
  let cost30d = 0;
  let sessionCount = 0;
  let lastActive: Date | null = null;

  try {
    const files = await fs.readdir(projectDir);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) { continue; }
      sessionCount++;

      // Deduplicated read — streaming responses write one line per content
      // block sharing the same requestId; count each API call once
      const entries = await readUsageEntries(path.join(projectDir, file));
      for (const entry of entries) {
        const tsMs = entry.timestamp;
        const cost = entryCost(entry, options);
        const ageMs = now - tsMs;

        if (ageMs < w30d) { cost30d += cost; }
        if (ageMs < w7d) { cost7d += cost; }
        if (tsMs >= todayStart.getTime()) { costToday += cost; }
        if (!lastActive || tsMs > lastActive.getTime()) { lastActive = new Date(tsMs); }
      }
    }
  } catch {
    // graceful degradation
  }

  return {
    projectName,
    projectPath: projectDir,
    costToday,
    cost7d,
    cost30d,
    sessionCount,
    lastActive: lastActive ?? new Date(0),
  };
}

export async function getAllProjectCosts(options: CostOptions = DEFAULT_COST_OPTIONS): Promise<ProjectCostData[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) { return []; }

  const results = await Promise.all(
    folders.map(async folder => {
      const workspacePath = folder.uri.fsPath;
      const projectDir = await workspacePathToProjectDir(workspacePath);
      if (!projectDir) { return null; }
      const projectName = path.basename(workspacePath);
      return getProjectCostForDir(projectDir, projectName, options);
    })
  );

  return results
    .filter((r): r is ProjectCostData => r !== null)
    .sort((a, b) => b.costToday - a.costToday);
}
