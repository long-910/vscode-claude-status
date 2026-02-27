import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DataManager, ClaudeUsageData, ProjectCostData } from '../data/dataManager';
import { config } from '../config';

// Placeholder types for features 04–05 (will be replaced with real types)
type PredictionData = Record<string, unknown> | null;
type HeatmapData = Record<string, unknown> | null;

interface DashboardMessage {
  usage: ClaudeUsageData;
  projectCosts: ProjectCostData[];
  prediction: PredictionData;
  heatmap: HeatmapData;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function getWebviewContent(nonce: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
    style-src 'unsafe-inline';
    img-src data:;
    connect-src 'none';
  ">
  <title>Claude Code Usage</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 16px;
      margin: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 1.2em;
      font-weight: 600;
    }
    .header-actions { display: flex; gap: 8px; }

    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 0.9em;
    }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: default; }

    .card {
      background-color: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 10px 0;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    @media (max-width: 480px) { .two-col { grid-template-columns: 1fr; } }

    .progress-row { margin-bottom: 10px; }
    .progress-row:last-child { margin-bottom: 0; }
    .progress-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 0.9em;
    }
    .progress-track {
      height: 8px;
      background-color: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      background-color: var(--vscode-progressBar-background);
      transition: width 0.3s ease;
    }
    .progress-fill.warning { background-color: var(--vscode-editorWarning-foreground); }
    .progress-fill.error   { background-color: var(--vscode-editorError-foreground); }

    .cost-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 0.95em;
    }
    .cost-label { color: var(--vscode-descriptionForeground); }

    .prediction-row { padding: 3px 0; font-size: 0.95em; }

    .placeholder {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-size: 0.9em;
    }

    .footer {
      color: var(--vscode-descriptionForeground);
      font-size: 0.8em;
      margin-top: 8px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinning { display: inline-block; animation: spin 1s linear infinite; }
  </style>
</head>
<body>

  <div class="header">
    <h1>Claude Code Usage</h1>
    <div class="header-actions">
      <button id="btn-refresh">↻ Refresh</button>
      <button id="btn-toggle">$ / %</button>
    </div>
  </div>

  <!-- Current Usage -->
  <div class="card">
    <div class="card-title">Current Usage</div>
    <div class="progress-row">
      <div class="progress-labels">
        <span>5h window</span>
        <span id="usage-5h-label">—</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="usage-5h-fill" style="width:0%"></div>
      </div>
    </div>
    <div class="progress-row">
      <div class="progress-labels">
        <span>7d window</span>
        <span id="usage-7d-label">—</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="usage-7d-fill" style="width:0%"></div>
      </div>
    </div>
  </div>

  <div class="two-col">
    <!-- Token Cost -->
    <div class="card">
      <div class="card-title">Token Cost</div>
      <div class="cost-row">
        <span class="cost-label">5h</span>
        <span id="cost-5h">—</span>
      </div>
      <div class="cost-row">
        <span class="cost-label">Today</span>
        <span id="cost-day">—</span>
      </div>
      <div class="cost-row">
        <span class="cost-label">7 days</span>
        <span id="cost-7d">—</span>
      </div>
    </div>

    <!-- Project Cost (Feature 03) -->
    <div class="card">
      <div class="card-title">Project</div>
      <div id="project-cost-content">
        <div class="placeholder">Loading project data…</div>
      </div>
    </div>
  </div>

  <!-- Prediction (Feature 04) -->
  <div class="card">
    <div class="card-title">Prediction</div>
    <div id="prediction-content">
      <div class="placeholder">Loading prediction…</div>
    </div>
  </div>

  <!-- Usage History (Feature 05) -->
  <div class="card">
    <div class="card-title">
      Usage History (last <span id="heatmap-days">90</span> days)
    </div>
    <div id="heatmap-content">
      <div class="placeholder">Loading usage history…</div>
    </div>
  </div>

  <div class="footer" id="footer">Last updated: —</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let currentMode = 'percent';
    let lastData = null;
    let refreshing = false;

    // Notify extension that the WebView is ready
    vscode.postMessage({ type: 'ready' });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      setRefreshing(true);
      vscode.postMessage({ type: 'refresh' });
    });

    document.getElementById('btn-toggle').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleMode' });
    });

    function setRefreshing(value) {
      refreshing = value;
      const btn = document.getElementById('btn-refresh');
      if (value) {
        btn.innerHTML = '<span class="spinning">⟳</span>';
        btn.disabled = true;
      } else {
        btn.textContent = '↻ Refresh';
        btn.disabled = false;
      }
    }

    function fmt(seconds) {
      if (seconds < 3600) { return Math.round(seconds / 60) + 'm'; }
      const h = Math.floor(seconds / 3600);
      const m = Math.round((seconds % 3600) / 60);
      return m === 0 ? h + 'h' : h + 'h ' + m + 'm';
    }

    function pct(util) {
      return Math.round(util * 100) + '%';
    }

    function updateUsage(usage, mode) {
      const denied = usage.limitStatus === 'denied';
      const warn5h = usage.utilization5h >= 0.75 ? ' ⚠' : '';
      const warn7d = usage.utilization7d >= 0.75 ? ' ⚠' : '';
      const deniedFlag = denied ? '✗' : '';

      if (mode === 'cost') {
        document.getElementById('usage-5h-label').textContent =
          '$' + usage.cost5h.toFixed(2) + ' — resets in ' + fmt(usage.resetIn5h);
        document.getElementById('usage-7d-label').textContent =
          '$' + usage.cost7d.toFixed(2) + ' — resets in ' + fmt(usage.resetIn7d);
      } else {
        document.getElementById('usage-5h-label').textContent =
          pct(usage.utilization5h) + warn5h + deniedFlag + ' — resets in ' + fmt(usage.resetIn5h);
        document.getElementById('usage-7d-label').textContent =
          pct(usage.utilization7d) + warn7d + ' — resets in ' + fmt(usage.resetIn7d);
      }

      const fill5h = document.getElementById('usage-5h-fill');
      fill5h.style.width = Math.min(100, usage.utilization5h * 100) + '%';
      fill5h.className = 'progress-fill' +
        (denied ? ' error' : usage.utilization5h >= 0.75 ? ' warning' : '');

      const fill7d = document.getElementById('usage-7d-fill');
      fill7d.style.width = Math.min(100, usage.utilization7d * 100) + '%';
      fill7d.className = 'progress-fill' + (usage.utilization7d >= 0.75 ? ' warning' : '');

      document.getElementById('cost-5h').textContent  = '$' + usage.cost5h.toFixed(2);
      document.getElementById('cost-day').textContent = '$' + usage.costDay.toFixed(2);
      document.getElementById('cost-7d').textContent  = '$' + usage.cost7d.toFixed(2);

      const ageStr = usage.cacheAge < 60
        ? 'just now'
        : Math.round(usage.cacheAge / 60) + 'm ago';
      const srcLabel = usage.dataSource === 'stale' ? ' (stale)'
                     : usage.dataSource === 'api'   ? ' (live)' : '';
      document.getElementById('footer').textContent =
        'Last updated: ' + ageStr + srcLabel;
    }

    function updateProjectCosts(projectCosts) {
      const el = document.getElementById('project-cost-content');
      if (!projectCosts || projectCosts.length === 0) {
        el.innerHTML = '<div class="placeholder">No project data</div>';
        return;
      }
      // Single project: show detailed breakdown
      if (projectCosts.length === 1) {
        const pj = projectCosts[0];
        el.innerHTML =
          '<div class="cost-row"><span class="cost-label" style="font-weight:600">' + esc(pj.projectName) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">Today</span><span>$' + pj.costToday.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">7 days</span><span>$' + pj.cost7d.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">30 days</span><span>$' + pj.cost30d.toFixed(2) + '</span></div>';
        return;
      }
      // Multi-root: show each project
      let html = '';
      for (const pj of projectCosts) {
        html +=
          '<div style="margin-bottom:8px">' +
          '<div class="cost-row"><span class="cost-label" style="font-weight:600">' + esc(pj.projectName) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">Today</span><span>$' + pj.costToday.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">7d</span><span>$' + pj.cost7d.toFixed(2) + '</span></div>' +
          '</div>';
      }
      el.innerHTML = html;
    }

    function updatePrediction(prediction) {
      const el = document.getElementById('prediction-content');
      if (!prediction) {
        el.innerHTML = '<div class="placeholder">No prediction data</div>';
        return;
      }
      let html = '<div class="prediction-row">Burn rate: $' + prediction.currentBurnRate.toFixed(2) + '/hr</div>';
      if (prediction.estimatedExhaustionIn !== null) {
        html += '<div class="prediction-row">⚠ At this rate, 5h limit in ~' + fmt(prediction.estimatedExhaustionIn) + '</div>';
      }
      html += '<div class="prediction-row">💡 ' + esc(prediction.recommendation) + '</div>';
      el.innerHTML = html;
    }

    // Minimal HTML escape to prevent XSS from data strings
    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'update') {
        if (refreshing) { setRefreshing(false); }
        lastData = msg.data;
        updateUsage(msg.data.usage, currentMode);
        updateProjectCosts(msg.data.projectCosts);
        updatePrediction(msg.data.prediction);
        // Heatmap rendering: Feature 05
      } else if (msg.type === 'setDisplayMode') {
        currentMode = msg.mode;
        if (lastData) { updateUsage(lastData.usage, currentMode); }
      }
    });
  </script>
</body>
</html>`;
}

export class DashboardPanel {
  private static instance: DashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly dataManager: DataManager,
  ) {
    const nonce = generateNonce();

    this.panel = vscode.window.createWebviewPanel(
      'claudeStatusDashboard',
      'Claude Code Usage',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    this.panel.webview.html = getWebviewContent(nonce);

    // Handle messages from WebView
    this.panel.webview.onDidReceiveMessage(
      msg => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    // Push data updates to the WebView
    this.disposables.push(
      dataManager.onDidUpdate(data => this.sendUpdate(data))
    );

    // Clean up when panel is closed
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  static createOrShow(dataManager: DataManager): void {
    if (DashboardPanel.instance) {
      DashboardPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    DashboardPanel.instance = new DashboardPanel(dataManager);
  }

  static dispose(): void {
    DashboardPanel.instance?.dispose();
  }

  private handleMessage(msg: { type: string; amount?: number }): void {
    switch (msg.type) {
      case 'ready':
        // Send current data immediately when WebView signals it's ready
        this.dataManager.getUsageData().then(data => this.sendUpdate(data)).catch(() => {});
        break;
      case 'refresh':
        this.dataManager.forceRefresh().catch(() => {});
        break;
      case 'toggleMode': {
        const next = config.displayMode === 'percent' ? 'cost' : 'percent';
        config.setDisplayMode(next).then(() => {
          this.panel.webview.postMessage({ type: 'setDisplayMode', mode: next });
        }).catch(() => {});
        break;
      }
      case 'setBudget':
        if (typeof msg.amount === 'number') {
          config.setDisplayMode('cost').catch(() => {}); // placeholder until Feature 04
        }
        break;
    }
  }

  private sendUpdate(usage: ClaudeUsageData): void {
    const message: { type: string; data: DashboardMessage } = {
      type: 'update',
      data: {
        usage,
        projectCosts: this.dataManager.getLastProjectCosts(),
        prediction: null,    // Feature 04
        heatmap: null,       // Feature 05
      },
    };
    this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    DashboardPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
