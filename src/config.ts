import * as vscode from 'vscode';

export class ExtensionConfig {
  private get cfg() {
    return vscode.workspace.getConfiguration('claudeStatus');
  }

  get displayMode(): 'percent' | 'cost' {
    return this.cfg.get('displayMode', 'percent');
  }

  get statusBarAlignment(): 'left' | 'right' {
    return this.cfg.get('statusBar.alignment', 'left');
  }

  get showProjectCost(): boolean {
    return this.cfg.get('statusBar.showProjectCost', true);
  }

  get cacheTtlSeconds(): number {
    return this.cfg.get('cache.ttlSeconds', 300);
  }

  get realtimeEnabled(): boolean {
    return this.cfg.get('realtime.enabled', false);
  }

  get dailyBudget(): number | null {
    return this.cfg.get('budget.dailyUsd', null);
  }

  get weeklyBudget(): number | null {
    return this.cfg.get('budget.weeklyUsd', null);
  }

  get budgetAlertThreshold(): number {
    return this.cfg.get('budget.alertThresholdPercent', 80);
  }

  get rateLimitWarning(): boolean {
    return this.cfg.get('notifications.rateLimitWarning', true);
  }

  get rateLimitWarningThresholdMinutes(): number {
    return this.cfg.get('notifications.rateLimitWarningThresholdMinutes', 30);
  }

  get budgetWarning(): boolean {
    return this.cfg.get('notifications.budgetWarning', true);
  }

  get heatmapDays(): number {
    return this.cfg.get('heatmap.days', 90);
  }

  get credentialsPath(): string | null {
    return this.cfg.get('credentials.path', null);
  }

  async setDisplayMode(mode: 'percent' | 'cost'): Promise<void> {
    await this.cfg.update('displayMode', mode, vscode.ConfigurationTarget.Global);
  }
}

export const config = new ExtensionConfig();
