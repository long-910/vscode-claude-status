import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { DataManager, ClaudeUsageData, PredictionData } from './data/dataManager';
import { dailyUsageToCsv, dailyUsageToJson, exportFileName } from './data/exportUsage';
import { StatusBarManager } from './statusBar';
import { ClaudeStatusTreeProvider } from './treeView';
import { config } from './config';
import { setClaudeHome } from './data/claudeHome';
import { BudgetAlertTracker, budgetThresholdReached } from './data/budget';

// --- Notification system ---
// Deduplication: rate-limit keys are cleared when the 5h rate-limit window resets
const notifiedKeys = new Set<string>();
// Budget alerts: once per calendar day / month. The daily one is also re-armed
// on a window reset, as before; the monthly one is not.
const budgetAlerts = new BudgetAlertTracker();
let prevResetIn5h = 0;

function checkWindowReset(resetIn5h: number): void {
  // If resetIn5h increased by more than 1 hour, the window has reset
  if (resetIn5h > prevResetIn5h + 3600) {
    notifiedKeys.clear();
    budgetAlerts.rearm('day');
  }
  prevResetIn5h = resetIn5h;
}

async function checkAndNotify(data: ClaudeUsageData, prediction: PredictionData | null): Promise<void> {
  checkWindowReset(data.resetIn5h);

  // Monthly budget — from the usage totals, independent of the prediction
  const monthlyBudget = config.monthlyBudget;
  if (
    config.budgetWarning &&
    budgetThresholdReached(data.costMonth, monthlyBudget, config.budgetAlertThreshold) &&
    budgetAlerts.shouldShow('month')
  ) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('Claude Code: Monthly budget {0}% used (${1} / ${2})',
        Math.round((data.costMonth / (monthlyBudget as number)) * 100), data.costMonth.toFixed(2), monthlyBudget as number)
    );
  }

  if (!prediction) { return; }

  const { estimatedExhaustionIn } = prediction;

  // Rate limit warnings
  if (config.rateLimitWarning && estimatedExhaustionIn !== null) {
    const minRemaining = Math.round(estimatedExhaustionIn / 60);
    if (estimatedExhaustionIn < 600 && !notifiedKeys.has('ratelimit-critical')) {
      notifiedKeys.add('ratelimit-critical'); // mark before await to prevent duplicates
      const action = await vscode.window.showErrorMessage(
        vscode.l10n.t('Claude Code: Rate limit in ~{0} min', minRemaining),
        vscode.l10n.t('Open Dashboard'), vscode.l10n.t('Dismiss')
      );
      if (action === vscode.l10n.t('Open Dashboard')) {
        vscode.commands.executeCommand('vscode-claude-status.openDashboard');
      }
    } else if (
      estimatedExhaustionIn < config.rateLimitWarningThresholdMinutes * 60 &&
      !notifiedKeys.has('ratelimit-warning')
    ) {
      notifiedKeys.add('ratelimit-warning');
      vscode.window.showWarningMessage(
        vscode.l10n.t('Claude Code: Rate limit in ~{0} min', minRemaining)
      );
    }
  }

  // Budget warning
  if (config.budgetWarning && prediction.budgetRemaining !== null && config.dailyBudget !== null) {
    const remainingPct = (prediction.budgetRemaining / config.dailyBudget) * 100;
    if (remainingPct <= (100 - config.budgetAlertThreshold) && budgetAlerts.shouldShow('day')) {
      const used = (config.dailyBudget - prediction.budgetRemaining).toFixed(2);
      vscode.window.showWarningMessage(
        vscode.l10n.t('Claude Code: Daily budget {0}% used (${1} / ${2})', config.budgetAlertThreshold, used, config.dailyBudget)
      );
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  setClaudeHome(config.claudeHome);
  const dataManager = DataManager.getInstance();
  const statusBar = new StatusBarManager();

  // Sidebar tree view (refreshes itself on dataManager updates)
  const treeProvider = new ClaudeStatusTreeProvider(dataManager);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claudeStatus.overview', treeProvider),
    treeProvider,
  );

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
      import(/* webpackChunkName: "panel" */ './webview/panel.js')
        .then(({ DashboardPanel }) => DashboardPanel.createOrShow(dataManager))
        .catch(() => {});
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
        prompt: vscode.l10n.t('Set daily budget in USD (leave empty to disable)'),
        value: current !== null ? String(current) : '',
        placeHolder: vscode.l10n.t('e.g. 20'),
        validateInput: (v) => {
          if (v === '') { return null; }
          const n = parseFloat(v);
          if (isNaN(n) || n < 0) { return vscode.l10n.t('Enter a non-negative number, or leave empty to disable'); }
          return null;
        },
      });
      if (input === undefined) { return; } // cancelled
      const value = input === '' ? null : parseFloat(input);
      await config.setDailyBudget(value);
      vscode.window.showInformationMessage(
        value === null
          ? vscode.l10n.t('Daily budget disabled.')
          : vscode.l10n.t('Daily budget set to ${0}.', value.toFixed(2))
      );
    }),
    vscode.commands.registerCommand('vscode-claude-status.exportUsage', async () => {
      type FormatPick = vscode.QuickPickItem & { format: 'csv' | 'json' };
      const picks: FormatPick[] = [
        {
          label: 'CSV',
          description: vscode.l10n.t('Spreadsheet-friendly (date, cost, messages, tokens)'),
          format: 'csv',
        },
        {
          label: 'JSON',
          description: vscode.l10n.t('Machine-readable with export metadata'),
          format: 'json',
        },
      ];
      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: vscode.l10n.t('Select export format'),
      });
      if (!pick) { return; } // cancelled

      const heatmap = await dataManager.getHeatmapData();
      const daily = heatmap?.daily ?? [];
      if (daily.every(d => d.sessionCount === 0)) {
        vscode.window.showWarningMessage(vscode.l10n.t('No usage history to export yet.'));
        return;
      }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), exportFileName(pick.format, new Date()))),
        filters: pick.format === 'csv' ? { CSV: ['csv'] } : { JSON: ['json'] },
      });
      if (!uri) { return; } // cancelled

      const content = pick.format === 'csv' ? dailyUsageToCsv(daily) : dailyUsageToJson(daily);
      try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage(
          vscode.l10n.t('Usage history exported to {0}', uri.fsPath)
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          vscode.l10n.t('Failed to export usage history: {0}', String(err))
        );
      }
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
      if (e.affectsConfiguration('claudeStatus.claudeHome')) {
        setClaudeHome(config.claudeHome);
        dataManager.restartWatching();
        dataManager.refresh().catch(() => {});
      }
      if (e.affectsConfiguration('claudeStatus.pricing')) {
        // Costs are computed at read time — recompute with the new rates. A normal
        // refresh: the API is only called under the usual cache / activity rules
        dataManager.invalidateHeatmap();
        dataManager.refresh().catch(() => {});
      } else if (e.affectsConfiguration('claudeStatus.payAsYouGo')) {
        // Display-only: re-render status bar, sidebar and dashboard, no I/O
        dataManager.republish();
      }
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
      .then(data => {
        statusBar.update(data, dataManager.getLastProjectCosts());
        treeProvider.refresh(); // keep "resets in" countdowns current
      })
      .catch(() => {});
  }, 60_000);

  context.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    { dispose: () => statusBar.dispose() },
    { dispose: () => dataManager.dispose() },
  );
}

export function deactivate() {
  // Fire-and-forget: webpack returns the cached module synchronously if already loaded
  import('./webview/panel.js').then(({ DashboardPanel }) => DashboardPanel.dispose()).catch(() => {});
}
