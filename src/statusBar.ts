import * as vscode from 'vscode';
import { ClaudeUsageData, ProjectCostData } from './data/dataManager';
import { config } from './config';

function formatDuration(seconds: number): string {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (mins === 0) { return `${hours}h`; }
  return `${hours}h ${mins}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
  return `${n}`;
}

function formatPercent(util: number): string {
  return `${Math.round(util * 100)}%`;
}

function buildBar(utilization: number, width: number): string {
  const filled = Math.round(Math.min(1, utilization) * width);
  return 'X'.repeat(filled) + '.'.repeat(width - filled);
}

function truncateName(name: string): string {
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
}

export function buildLabel(data: ClaudeUsageData, projectCosts: ProjectCostData[] = []): string {
  const { dataSource, utilization5h, utilization7d, limitStatus, cost5h, cost7d, cacheAge, has7dLimit, providerType } = data;
  const displayMode = config.displayMode;

  if (dataSource === 'no-credentials') {
    return '🤖 Not logged in';
  }
  if (dataSource === 'no-data') {
    return '🤖 Claude: run refresh';
  }

  const isStale = dataSource === 'stale';
  const staleSuffix = isStale ? ` [${Math.round(cacheAge / 60)}m ago]` : '';

  // Non-Claude.ai providers (Bedrock, API key, local-only) always use cost mode
  const useCostMode = providerType !== 'claude-ai' || dataSource === 'local-only' || displayMode === 'cost';

  let part5h: string;
  let part7d: string;

  if (useCostMode) {
    part5h = `5h:$${cost5h.toFixed(2)}`;
    part7d = ` 7d:$${cost7d.toFixed(2)}`;
  } else {
    // percent mode — Claude.ai only
    if (limitStatus === 'denied') {
      part5h = `5h:100%✗`;
      part7d = '';
    } else {
      const warn5h = utilization5h >= 0.75 ? '⚠' : '';
      part5h = `5h:${formatPercent(utilization5h)}${warn5h}`;
      if (has7dLimit) {
        const warn7d = utilization7d >= 0.75 ? '⚠' : '';
        part7d = ` 7d:${formatPercent(utilization7d)}${warn7d}`;
      } else {
        part7d = '';
      }
    }
  }

  // Project cost suffix
  let projectPart = '';
  if (config.showProjectCost && projectCosts.length > 0) {
    if (projectCosts.length === 1) {
      const pj = projectCosts[0];
      const shortName = truncateName(pj.projectName);
      projectPart = ` | ${shortName}:$${pj.costToday.toFixed(2)}`;
    } else {
      // Multi-root: aggregate
      const total = projectCosts.reduce((sum, p) => sum + p.costToday, 0);
      projectPart = ` | PJ:$${total.toFixed(2)}`;
    }
  }

  const main = `🤖 ${part5h}${part7d}${projectPart}`;
  return isStale ? `${main}${staleSuffix}` : main;
}

export function buildTooltip(data: ClaudeUsageData, projectCosts: ProjectCostData[] = []): string {
  const {
    utilization5h, utilization7d, resetIn5h, resetIn7d,
    cost5h, costDay, cost7d, tokensIn5h, tokensOut5h,
    cacheAge, dataSource, has7dLimit, providerType,
  } = data;

  if (dataSource === 'no-credentials') {
    return 'Claude Code is not logged in.\nRun: claude login';
  }
  if (dataSource === 'no-data') {
    return 'No usage data found.\nClick to open dashboard →';
  }

  const lastUpdated = cacheAge < 60 ? 'just now' : `${Math.round(cacheAge / 60)}m ago`;
  const lines: string[] = [];

  if (providerType === 'claude-ai') {
    // Rate limit section — only for Claude.ai subscriptions
    const bar5h = buildBar(utilization5h, 8);
    lines.push(
      'Claude Code Usage',
      '─────────────────────────────',
      `5h window:   ${formatPercent(utilization5h)} [${bar5h}] resets in ${formatDuration(resetIn5h)}`,
    );
    if (has7dLimit) {
      const bar7d = buildBar(utilization7d, 8);
      lines.push(`7d window:   ${formatPercent(utilization7d)} [${bar7d}] resets in ${formatDuration(resetIn7d)}`);
    }
    lines.push('');
  } else {
    const providerLabel = providerType === 'aws-bedrock' ? 'AWS Bedrock'
      : providerType === 'api-key' ? 'API Key'
      : 'Claude Code';
    lines.push(`Claude Code (${providerLabel})`, '─────────────────────────────', '');
  }

  lines.push(
    'Token Cost (local)',
    '─────────────────────────────',
    `5h:   in:${formatTokens(tokensIn5h)} out:${formatTokens(tokensOut5h)}  $${cost5h.toFixed(2)}`,
    `day:  $${costDay.toFixed(2)}`,
    `7d:   $${cost7d.toFixed(2)}`,
  );

  if (projectCosts.length > 0) {
    lines.push('');
    for (const pj of projectCosts) {
      lines.push(`Project: ${pj.projectName}`);
      lines.push(`  Today: $${pj.costToday.toFixed(2)}  |  7d: $${pj.cost7d.toFixed(2)}`);
    }
  }

  lines.push('', `Last updated: ${lastUpdated}`, 'Click to open dashboard →');
  return lines.join('\n');
}

function applyColor(item: vscode.StatusBarItem, data: ClaudeUsageData): void {
  const { limitStatus, dataSource, providerType } = data;

  if (dataSource === 'no-credentials') {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    return;
  }

  if (dataSource === 'stale') {
    item.backgroundColor = undefined;
    item.color = new vscode.ThemeColor('descriptionForeground');
    return;
  }

  // Non-Claude.ai providers don't have rate limits — no warning/error colors
  if (providerType !== 'claude-ai') {
    item.backgroundColor = undefined;
    item.color = undefined;
    return;
  }

  switch (limitStatus) {
    case 'denied':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
      break;
    case 'allowed_warning':
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      break;
    default:
      item.backgroundColor = undefined;
      item.color = undefined;
  }
}

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    const alignment = config.statusBarAlignment === 'right'
      ? vscode.StatusBarAlignment.Right
      : vscode.StatusBarAlignment.Left;
    this.item = vscode.window.createStatusBarItem(alignment, 100);
    this.item.name = 'Claude Code Usage';
    this.item.command = 'vscode-claude-status.openDashboard';
    this.item.text = '🤖 Claude: loading...';
    this.item.show();
  }

  update(data: ClaudeUsageData, projectCosts: ProjectCostData[] = []): void {
    this.item.text = buildLabel(data, projectCosts);
    this.item.tooltip = buildTooltip(data, projectCosts);
    applyColor(this.item, data);
  }

  dispose(): void {
    this.item.dispose();
  }
}
