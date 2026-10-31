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
    costMonth: 30.00,
    tokensIn5h: 0,
    tokensOut5h: 0,
    tokensCacheRead5h: 0,
    tokensCacheCreate5h: 0,
    costByModel5h: {},
    pricingByModel5h: {},
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

  test('Token Cost shows Today only when pay-as-you-go time windows are off', async () => {
    const cfg = vscode.workspace.getConfiguration('claudeStatus');
    const prev = cfg.inspect<boolean>('payAsYouGo.showTimeWindows')?.globalValue;
    await cfg.update('payAsYouGo.showTimeWindows', false, vscode.ConfigurationTarget.Global);
    try {
      const costRows = (data: ClaudeUsageData) => {
        const provider = new ClaudeStatusTreeProvider(fakeManager(data));
        const section = provider.getChildren().find(n => n.item.label === 'Token Cost');
        assert.ok(section);
        const rows = provider.getChildren(section).map(n => String(n.item.label));
        provider.dispose();
        return rows;
      };
      assert.deepStrictEqual(costRows(makeData({ providerType: 'api-key', dataSource: 'local-only' })), ['Today', 'This month']);
      assert.deepStrictEqual(costRows(makeData()), ['5h', 'Today', '7 days', 'This month'], 'subscriptions unaffected');
    } finally {
      await cfg.update('payAsYouGo.showTimeWindows', prev, vscode.ConfigurationTarget.Global);
    }
  });

  test('This month shows spend against claudeStatus.budget.monthlyUsd', async () => {
    const cfg = vscode.workspace.getConfiguration('claudeStatus');
    const prev = cfg.inspect<number | null>('budget.monthlyUsd')?.globalValue;
    const monthRow = () => {
      const provider = new ClaudeStatusTreeProvider(fakeManager(makeData({ costMonth: 45 })));
      const section = provider.getChildren().find(n => n.item.label === 'Token Cost');
      const row = provider.getChildren(section).find(n => n.item.label === 'This month');
      provider.dispose();
      return row?.item.description;
    };
    try {
      await cfg.update('budget.monthlyUsd', undefined, vscode.ConfigurationTarget.Global);
      assert.strictEqual(monthRow(), '$45.00');
      await cfg.update('budget.monthlyUsd', 60, vscode.ConfigurationTarget.Global);
      assert.strictEqual(monthRow(), '$45.00 / $60.00 (75%)');
    } finally {
      await cfg.update('budget.monthlyUsd', prev, vscode.ConfigurationTarget.Global);
    }
  });
});
