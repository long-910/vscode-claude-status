import * as vscode from 'vscode';
import { DataManager, ClaudeUsageData, PredictionData } from './data/dataManager';
import { StatusBarManager } from './statusBar';
import { DashboardPanel } from './webview/panel';
import { config } from './config';

// --- Notification system ---
// Deduplication: keys are cleared when the 5h rate-limit window resets
const notifiedKeys = new Set<string>();
let prevResetIn5h = 0;

function checkWindowReset(resetIn5h: number): void {
  // If resetIn5h increased by more than 1 hour, the window has reset
  if (resetIn5h > prevResetIn5h + 3600) {
    notifiedKeys.clear();
  }
  prevResetIn5h = resetIn5h;
}

async function checkAndNotify(data: ClaudeUsageData, prediction: PredictionData | null): Promise<void> {
  checkWindowReset(data.resetIn5h);
  if (!prediction) { return; }

  const { estimatedExhaustionIn } = prediction;

  // Rate limit warnings
  if (config.rateLimitWarning && estimatedExhaustionIn !== null) {
    const minRemaining = Math.round(estimatedExhaustionIn / 60);
    if (estimatedExhaustionIn < 600 && !notifiedKeys.has('ratelimit-critical')) {
      notifiedKeys.add('ratelimit-critical'); // mark before await to prevent duplicates
      const action = await vscode.window.showErrorMessage(
        `Claude Code: Rate limit in ~${minRemaining} min`,
        'Open Dashboard', 'Dismiss'
      );
      if (action === 'Open Dashboard') {
        vscode.commands.executeCommand('vscode-claude-status.openDashboard');
      }
    } else if (
      estimatedExhaustionIn < config.rateLimitWarningThresholdMinutes * 60 &&
      !notifiedKeys.has('ratelimit-warning')
    ) {
      notifiedKeys.add('ratelimit-warning');
      vscode.window.showWarningMessage(
        `Claude Code: Rate limit in ~${minRemaining} min`
      );
    }
  }

  // Budget warning
  if (config.budgetWarning && prediction.budgetRemaining !== null && config.dailyBudget !== null) {
    const remainingPct = (prediction.budgetRemaining / config.dailyBudget) * 100;
    if (remainingPct <= (100 - config.budgetAlertThreshold) && !notifiedKeys.has('budget')) {
      notifiedKeys.add('budget');
      const used = (config.dailyBudget - prediction.budgetRemaining).toFixed(2);
      vscode.window.showWarningMessage(
        `Claude Code: Daily budget ${config.budgetAlertThreshold}% used ($${used} / $${config.dailyBudget})`
      );
    }
  }
}

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
      const current = config.dailyBudget;
      const input = await vscode.window.showInputBox({
        prompt: 'Set daily budget in USD (leave empty to disable)',
        value: current !== null ? String(current) : '',
        placeHolder: 'e.g. 20',
        validateInput: (v) => {
          if (v === '') { return null; }
          const n = parseFloat(v);
          if (isNaN(n) || n < 0) { return 'Enter a non-negative number, or leave empty to disable'; }
          return null;
        },
      });
      if (input === undefined) { return; } // cancelled
      const value = input === '' ? null : parseFloat(input);
      await config.setDailyBudget(value);
      vscode.window.showInformationMessage(
        value === null ? 'Daily budget disabled.' : `Daily budget set to $${value.toFixed(2)}.`
      );
    }),
  );

  // React to data updates (usage + project costs are refreshed together)
  context.subscriptions.push(
    dataManager.onDidUpdate(data => {
      statusBar.update(data, dataManager.getLastProjectCosts());
      // Check for rate limit / budget notifications
      const prediction = dataManager.getLastPrediction();
      checkAndNotify(data, prediction).catch(() => {});
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
