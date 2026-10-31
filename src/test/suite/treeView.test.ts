import * as assert from 'assert';
import * as vscode from 'vscode';
import { ClaudeStatusTreeProvider } from '../../treeView';
import type { ClaudeUsageData, DataManager, ProjectCostData } from '../../data/dataManager';

function makeData(overrides: Partial<ClaudeUsageData> = {}): ClaudeUsageData {
  return {
    utilization5h: 0.5,
    utilization7d: 0.3,
    resetIn5h: 3600,
    resetIn7d: 86400,
    limitStatus: 'allowed',
    has7dLimit: true,
    providerType: 'claude-ai',
    cost5h: 1.23,
    costDay: 2.50,
    cost7d: 10.00,
    tokensIn5h: 0,
    tokensOut5h: 0,
    tokensCacheRead5h: 0,
    tokensCacheCreate5h: 0,
    costByModel5h: {},
    lastUpdated: new Date(),
    cacheAge: 0,
    dataSource: 'api',
    ...overrides,
  };
}

// Only the members the provider uses
function fakeManager(data: ClaudeUsageData | undefined, projects: ProjectCostData[] = []): DataManager {
  const emitter = new vscode.EventEmitter<ClaudeUsageData>();
  return {
    onDidUpdate: emitter.event,
    getLastData: () => data,
    getLastProjectCosts: () => projects,
  } as unknown as DataManager;
}

function labels(provider: ClaudeStatusTreeProvider): string[] {
  return provider.getChildren().map(n => String(provider.getTreeItem(n).label));
}

suite('TreeView', () => {
  test('shows Loading and Actions before the first data', () => {
    const provider = new ClaudeStatusTreeProvider(fakeManager(undefined));
    assert.deepStrictEqual(labels(provider), ['Loading…', 'Actions']);
    provider.dispose();
  });

  test('shows Not logged in for no-credentials', () => {
    const provider = new ClaudeStatusTreeProvider(fakeManager(makeData({ dataSource: 'no-credentials' })));
    assert.deepStrictEqual(labels(provider), ['Not logged in', 'Actions']);
    provider.dispose();
  });

  test('includes Rate Limit, Token Cost, Projects and Actions for Claude.ai', () => {
    const project: ProjectCostData = {
      projectName: 'my-app', projectPath: '/p', costToday: 1, cost7d: 2, cost30d: 3,
      sessionCount: 1, lastActive: new Date(),
    };
    const provider = new ClaudeStatusTreeProvider(fakeManager(makeData(), [project]));
    assert.deepStrictEqual(labels(provider), ['Rate Limit', 'Token Cost', 'Projects', 'Actions']);

    const rateLimit = provider.getChildren()[0];
    assert.strictEqual(provider.getChildren(rateLimit).length, 2, '5h and 7d windows');
    provider.dispose();
  });

  test('hides Rate Limit for local-only providers', () => {
    const provider = new ClaudeStatusTreeProvider(
      fakeManager(makeData({ providerType: 'aws-bedrock', dataSource: 'local-only' })));
    assert.deepStrictEqual(labels(provider), ['Token Cost', 'Actions']);
    provider.dispose();
  });

  test('Actions include Export Usage Data', () => {
    const provider = new ClaudeStatusTreeProvider(fakeManager(makeData()));
    const actions = provider.getChildren().find(n => n.item.label === 'Actions');
    assert.ok(actions);
    const commands = provider.getChildren(actions).map(n => n.item.command?.command);
    assert.ok(commands.includes('vscode-claude-status.exportUsage'));
    provider.dispose();
  });
});
