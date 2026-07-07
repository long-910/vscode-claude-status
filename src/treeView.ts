import * as vscode from 'vscode';
import { DataManager, ClaudeUsageData, ProjectCostData } from './data/dataManager';
import { formatDuration } from './statusBar';

// Tree node: a plain TreeItem plus optional pre-built children
interface TreeNode {
  item: vscode.TreeItem;
  children?: TreeNode[];
}

function leaf(
  label: string,
  options: {
    description?: string;
    icon?: string;
    iconColor?: vscode.ThemeColor;
    command?: string;
    tooltip?: string;
  } = {}
): TreeNode {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  if (options.description) { item.description = options.description; }
  if (options.icon) { item.iconPath = new vscode.ThemeIcon(options.icon, options.iconColor); }
  if (options.tooltip) { item.tooltip = options.tooltip; }
  if (options.command) {
    item.command = { command: options.command, title: label };
  }
  return { item };
}

function section(label: string, icon: string, children: TreeNode[]): TreeNode {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
  item.iconPath = new vscode.ThemeIcon(icon);
  return { item, children };
}

function utilizationColor(utilization: number): vscode.ThemeColor | undefined {
  if (utilization >= 0.9) { return new vscode.ThemeColor('charts.red'); }
  if (utilization >= 0.75) { return new vscode.ThemeColor('charts.yellow'); }
  return undefined;
}

function buildUsageSection(data: ClaudeUsageData): TreeNode | null {
  if (data.providerType !== 'claude-ai') { return null; }
  if (data.dataSource === 'local-only' || data.dataSource === 'no-credentials' || data.dataSource === 'no-data') {
    return null;
  }

  const children: TreeNode[] = [
    leaf(vscode.l10n.t('5h window'), {
      description: `${Math.round(data.utilization5h * 100)}% · ${vscode.l10n.t('resets in {0}', formatDuration(data.resetIn5h))}`,
      icon: 'pulse',
      iconColor: utilizationColor(data.utilization5h),
    }),
  ];
  if (data.has7dLimit) {
    children.push(
      leaf(vscode.l10n.t('7d window'), {
        description: `${Math.round(data.utilization7d * 100)}% · ${vscode.l10n.t('resets in {0}', formatDuration(data.resetIn7d))}`,
        icon: 'pulse',
        iconColor: utilizationColor(data.utilization7d),
      })
    );
  }
  return section(vscode.l10n.t('Rate Limit'), 'dashboard', children);
}

function buildCostSection(data: ClaudeUsageData): TreeNode {
  return section(vscode.l10n.t('Token Cost'), 'credit-card', [
    leaf('5h', { description: `$${data.cost5h.toFixed(2)}`, icon: 'flame' }),
    leaf(vscode.l10n.t('Today'), { description: `$${data.costDay.toFixed(2)}`, icon: 'calendar' }),
    leaf(vscode.l10n.t('7 days'), { description: `$${data.cost7d.toFixed(2)}`, icon: 'history' }),
  ]);
}

function buildProjectsSection(projects: ProjectCostData[]): TreeNode | null {
  if (projects.length === 0) { return null; }
  return section(
    vscode.l10n.t('Projects'),
    'folder-library',
    projects.map(pj =>
      leaf(pj.projectName, {
        description: `${vscode.l10n.t('Today')}: $${pj.costToday.toFixed(2)} · 7d: $${pj.cost7d.toFixed(2)}`,
        icon: 'folder',
        tooltip: pj.projectPath,
      })
    )
  );
}

function buildActionsSection(): TreeNode {
  return section(vscode.l10n.t('Actions'), 'tools', [
    leaf(vscode.l10n.t('Open Dashboard'), { icon: 'graph', command: 'vscode-claude-status.openDashboard' }),
    leaf(vscode.l10n.t('Refresh Now'), { icon: 'refresh', command: 'vscode-claude-status.refresh' }),
    leaf(vscode.l10n.t('Toggle % / $ Display'), { icon: 'arrow-swap', command: 'vscode-claude-status.toggleDisplayMode' }),
    leaf(vscode.l10n.t('Set Budget…'), { icon: 'target', command: 'vscode-claude-status.setBudget' }),
  ]);
}

export class ClaudeStatusTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> = this._onDidChangeTreeData.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly dataManager: DataManager) {
    this.subscription = dataManager.onDidUpdate(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    return node.item;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (node) { return node.children ?? []; }

    const data = this.dataManager.getLastData();
    if (!data) {
      return [leaf(vscode.l10n.t('Loading…'), { icon: 'loading~spin' }), buildActionsSection()];
    }
    if (data.dataSource === 'no-credentials') {
      return [
        leaf(vscode.l10n.t('Not logged in'), { icon: 'account', tooltip: vscode.l10n.t('Claude Code is not logged in.\nRun: claude login') }),
        buildActionsSection(),
      ];
    }

    const sections: TreeNode[] = [];
    const usage = buildUsageSection(data);
    if (usage) { sections.push(usage); }
    sections.push(buildCostSection(data));
    const projects = buildProjectsSection(this.dataManager.getLastProjectCosts());
    if (projects) { sections.push(projects); }
    sections.push(buildActionsSection());
    return sections;
  }

  dispose(): void {
    this.subscription.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
