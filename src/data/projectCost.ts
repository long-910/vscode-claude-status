import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { calculateCost, forEachJsonlLine, TokenPricing, DEFAULT_PRICING } from './jsonlReader';
import { readUsageRecords } from './usageIndex';

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

    // Only the first 30 lines are inspected — stop reading there
    let matched = false;
    let seen = 0;
    await forEachJsonlLine(path.join(projectDir, jsonlFile), line => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.cwd === workspacePath) { matched = true; return false; }
      } catch {
        // skip malformed lines
      }
      return ++seen < 30;
    });
    return matched;
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

async function getProjectCostForDir(projectDir: string, projectName: string, pricing: TokenPricing = DEFAULT_PRICING): Promise<ProjectCostData> {
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
  // mtime of the newest file skipped by the 30-day filter, used as a lastActive
  // fallback when no file inside the window was read
  let newestSkippedMtime = 0;

  try {
    const files = await fs.readdir(projectDir);
    const recentFiles: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) { continue; }
      sessionCount++;

      const filePath = path.join(projectDir, file);
      // Transcripts are append-only, so a file untouched for 30 days holds no
      // entries inside any window below — skip reading it
      try {
        const fstat = await fs.stat(filePath);
        if (now - fstat.mtimeMs >= w30d) {
          newestSkippedMtime = Math.max(newestSkippedMtime, fstat.mtimeMs);
          continue;
        }
      } catch {
        continue;
      }
      recentFiles.push(filePath);
    }

    for (const { timestamp: tsMs, usage } of await readUsageRecords(recentFiles, now - w30d)) {
      const cost = calculateCost(usage, pricing);
      const ageMs = now - tsMs;

      if (ageMs < w30d) { cost30d += cost; }
      if (ageMs < w7d) { cost7d += cost; }
      if (tsMs >= todayStart.getTime()) { costToday += cost; }
      if (!lastActive || tsMs > lastActive.getTime()) { lastActive = new Date(tsMs); }
    }
  } catch {
    // graceful degradation
  }

  if (!lastActive && newestSkippedMtime > 0) {
    lastActive = new Date(newestSkippedMtime);
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

export async function getAllProjectCosts(pricing: TokenPricing = DEFAULT_PRICING): Promise<ProjectCostData[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) { return []; }

  const results = await Promise.all(
    folders.map(async folder => {
      const workspacePath = folder.uri.fsPath;
      const projectDir = await workspacePathToProjectDir(workspacePath);
      if (!projectDir) { return null; }
      const projectName = path.basename(workspacePath);
      return getProjectCostForDir(projectDir, projectName, pricing);
    })
  );

  return results
    .filter((r): r is ProjectCostData => r !== null)
    .sort((a, b) => b.costToday - a.costToday);
}
