import * as vscode from 'vscode';
import { DataManager } from './data/dataManager';
import { StatusBarManager } from './statusBar';
import { DashboardPanel } from './webview/panel';
import { config } from './config';

export function activate(context: vscode.ExtensionContext) {
  const dataManager = DataManager.getInstance();
  const statusBar = new StatusBarManager();

  // Helper: update status bar with latest usage + project costs
  function updateStatusBar(): void {
    const data = dataManager.getLastData();
    if (data) {
      statusBar.update(data, dataManager.getLastProjectCosts());
    }
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-claude-status.openDashboard', () => {
      DashboardPanel.createOrShow(dataManager);
    }),
    vscode.commands.registerCommand('vscode-claude-status.refresh', async () => {
      await dataManager.forceRefresh();
    }),
    vscode.commands.registerCommand('vscode-claude-status.toggleDisplayMode', async () => {
      const next = config.displayMode === 'percent' ? 'cost' : 'percent';
      await config.setDisplayMode(next);
      updateStatusBar();
    }),
    vscode.commands.registerCommand('vscode-claude-status.setBudget', async () => {
      vscode.window.showInformationMessage('Budget settings coming soon!');
    }),
  );

  // React to data updates (usage + project costs are refreshed together)
  context.subscriptions.push(
    dataManager.onDidUpdate(data => {
      statusBar.update(data, dataManager.getLastProjectCosts());
    })
  );

  // Re-render on settings change without restart
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeStatus')) {
        updateStatusBar();
      }
    })
  );

  // Re-fetch project costs when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      dataManager.refreshProjectCosts().then(() => updateStatusBar()).catch(() => {});
    })
  );

  // Start JSONL file watcher
  dataManager.startWatching();

  // Initial load: usage data + project costs (no API call — cache first)
  Promise.all([
    dataManager.getUsageData(),
    dataManager.refreshProjectCosts(),
  ]).then(([data]) => {
    statusBar.update(data, dataManager.getLastProjectCosts());
  }).catch(() => {
    // graceful degradation: status bar stays in "loading..." state
  });

  // Timer: re-render every 60 seconds from cache
  const timer = setInterval(() => {
    dataManager.getUsageData()
      .then(data => statusBar.update(data, dataManager.getLastProjectCosts()))
      .catch(() => {});
  }, 60_000);

  context.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    { dispose: () => statusBar.dispose() },
    { dispose: () => dataManager.dispose() },
  );
}

export function deactivate() {
  DashboardPanel.dispose();
}
