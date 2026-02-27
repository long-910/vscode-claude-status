import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DataManager, ClaudeUsageData, ProjectCostData, PredictionData, HeatmapData } from '../data/dataManager';
import { config } from '../config';

interface DashboardMessage {
  usage: ClaudeUsageData;
  projectCosts: ProjectCostData[];
  prediction: PredictionData | null;
  heatmap: HeatmapData | null;
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

    .alert {
      padding: 6px 8px;
      border-radius: 3px;
      margin: 6px 0;
      font-size: 0.9em;
    }
    .alert.warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }
    .alert.error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }

    .budget-configure {
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 0.9em;
    }
    .budget-configure input {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 3px 6px;
      border-radius: 2px;
      width: 80px;
      font-size: 0.9em;
    }
    .budget-configure label { color: var(--vscode-descriptionForeground); }
    .configure-link {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      padding: 0;
      font-size: 0.85em;
      text-decoration: underline;
    }
    .configure-link:hover { opacity: 0.8; }

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

    /* ---- Heatmap ---- */
    .heatmap-container { overflow-x: auto; padding-bottom: 4px; }
    .hm-header {
      display: flex;
      gap: 2px;
      margin-bottom: 2px;
    }
    .hm-col-label {
      width: 12px;
      flex-shrink: 0;
      font-size: 0.6em;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      overflow: hidden;
    }
    .heatmap-grid {
      display: grid;
      grid-template-rows: repeat(7, 12px);
      grid-auto-flow: column;
      grid-auto-columns: 12px;
      gap: 2px;
    }
    .hm-cell {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      cursor: default;
    }
    .hm-cell.l-empty,
    .hm-cell.l0 { background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
    .hm-cell.l1 { background-color: #0e4429; }
    .hm-cell.l2 { background-color: #006d32; }
    .hm-cell.l3 { background-color: #26a641; }
    .hm-cell.l4 { background-color: #39d353; }
    .heatmap-legend {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 0.8em;
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
    }
    .heatmap-legend .hm-cell { display: inline-block; flex-shrink: 0; }
    .hourly-title {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
      margin: 12px 0 4px;
    }
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

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
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

    let budgetConfigOpen = false;

    function fmtTime(isoStr) {
      if (!isoStr) { return '—'; }
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function updatePrediction(prediction, usage) {
      const el = document.getElementById('prediction-content');
      if (!prediction) {
        el.innerHTML = '<div class="placeholder">No prediction data</div>';
        return;
      }

      let html = '';

      // Burn rate
      if (prediction.currentBurnRate > 0) {
        html += '<div class="cost-row"><span class="cost-label">Burn rate</span>' +
          '<span>$' + prediction.currentBurnRate.toFixed(2) + '/hr</span></div>';
      } else {
        html += '<div class="cost-row"><span class="cost-label">Burn rate</span>' +
          '<span class="placeholder">Calculating…</span></div>';
      }

      // Rate limit exhaustion alert
      if (prediction.estimatedExhaustionIn !== null) {
        const atTime = fmtTime(prediction.estimatedExhaustionTime);
        if (prediction.estimatedExhaustionIn < 600) {
          html += '<div class="alert error">⛔ 5h limit in ~' +
            fmt(prediction.estimatedExhaustionIn) + ' (at ' + atTime + ')</div>';
        } else if (prediction.estimatedExhaustionIn < 1800) {
          html += '<div class="alert warning">⚠️ 5h limit in ~' +
            fmt(prediction.estimatedExhaustionIn) + ' (at ' + atTime + ')</div>';
        } else {
          html += '<div class="prediction-row">5h limit in ~' +
            fmt(prediction.estimatedExhaustionIn) + ' (at ' + atTime + ')</div>';
        }
      }

      // Daily budget section
      if (prediction.budgetRemaining !== null && usage) {
        const spent = usage.costDay;
        const total = spent + prediction.budgetRemaining;
        const usedPct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
        const fillClass = usedPct >= 80 ? ' error' : usedPct >= 60 ? ' warning' : '';

        html += '<div class="progress-row" style="margin-top:8px">' +
          '<div class="progress-labels">' +
          '<span>Daily budget</span>' +
          '<span>$' + spent.toFixed(2) + ' / $' + total.toFixed(2) +
          ' (' + Math.round(usedPct) + '%)</span>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill' + fillClass + '" style="width:' +
          usedPct.toFixed(1) + '%"></div></div>' +
          '</div>';

        if (prediction.budgetExhaustionTime) {
          const atBudget = fmtTime(prediction.budgetExhaustionTime);
          if (prediction.budgetRemaining === 0) {
            html += '<div class="alert error">💸 Daily budget exhausted</div>';
          } else if (usedPct >= 80) {
            html += '<div class="alert warning">💸 Budget exhausted ~' +
              atBudget + ' at this rate</div>';
          }
        }

        html += '<button class="configure-link" onclick="toggleBudgetConfig()">⚙ Configure budget</button>';
      } else {
        html += '<button class="configure-link" onclick="toggleBudgetConfig()">⚙ Set daily budget</button>';
      }

      // Recommendation
      html += '<div class="prediction-row" style="margin-top:8px">💡 ' +
        esc(prediction.recommendation) + '</div>';

      // Budget input form (toggled)
      html += '<div class="budget-configure" id="budget-form" style="display:' +
        (budgetConfigOpen ? 'flex' : 'none') + '">' +
        '<label>Daily budget ($):</label>' +
        '<input type="number" id="budget-input" min="0" step="5" placeholder="e.g. 20">' +
        '<button onclick="saveBudget()">Save</button>' +
        '<button onclick="clearBudget()">Disable</button>' +
        '</div>';

      el.innerHTML = html;
    }

    function toggleBudgetConfig() {
      budgetConfigOpen = !budgetConfigOpen;
      const form = document.getElementById('budget-form');
      if (form) { form.style.display = budgetConfigOpen ? 'flex' : 'none'; }
    }

    function saveBudget() {
      const input = document.getElementById('budget-input');
      const val = parseFloat(input ? input.value : '');
      if (!isNaN(val) && val >= 0) {
        vscode.postMessage({ type: 'setBudget', amount: val });
        budgetConfigOpen = false;
      }
    }

    function clearBudget() {
      vscode.postMessage({ type: 'setBudget', amount: null });
      budgetConfigOpen = false;
    }

    // ---- Heatmap -----------------------------------------------------------
    let hourlyChart = null;

    function getCostLevel(cost, maxCost) {
      if (cost === 0 || maxCost === 0) { return 0; }
      const r = cost / maxCost;
      if (r < 0.25) { return 1; }
      if (r < 0.50) { return 2; }
      if (r < 0.75) { return 3; }
      return 4;
    }

    function updateHeatmap(heatmap) {
      const el = document.getElementById('heatmap-content');
      const daysEl = document.getElementById('heatmap-days');

      if (!heatmap || !heatmap.daily || heatmap.daily.length === 0) {
        el.innerHTML = '<div class="placeholder">No usage history</div>';
        return;
      }

      const daily = heatmap.daily;
      const hourly = heatmap.hourly || [];
      if (daysEl) { daysEl.textContent = daily.length; }

      const maxCost = Math.max(...daily.map(d => d.cost), 0.001);

      // Day-of-week offset for first cell (0=Sun … 6=Sat)
      // Use noon to avoid UTC boundary shifting the date
      const firstDow = new Date(daily[0].date + 'T12:00:00').getDay();
      const allCells = [...Array(firstDow).fill(null), ...daily];
      const numCols = Math.ceil(allCells.length / 7);

      // Month header (one label per column-week)
      let headerHtml = '';
      let lastMonth = -1;
      for (let col = 0; col < numCols; col++) {
        let label = '';
        for (let row = 0; row < 7; row++) {
          const cell = allCells[col * 7 + row];
          if (cell) {
            const d = new Date(cell.date + 'T12:00:00');
            const m = d.getMonth();
            if (m !== lastMonth && (d.getDate() <= 7 || col === 0)) {
              label = d.toLocaleString('default', { month: 'short' });
              lastMonth = m;
            }
            break;
          }
        }
        headerHtml += '<div class="hm-col-label">' + (label ? esc(label) : '') + '</div>';
      }

      // Grid cells
      let gridHtml = '';
      for (let i = 0; i < firstDow; i++) {
        gridHtml += '<div class="hm-cell l-empty"></div>';
      }
      for (const day of daily) {
        const level = getCostLevel(day.cost, maxCost);
        const costStr = day.cost.toFixed(3);
        const sessions = day.sessionCount > 0 ? ' (' + day.sessionCount + ' msgs)' : '';
        gridHtml += '<div class="hm-cell l' + level +
          '" title="' + esc(day.date + ': $' + costStr + sessions) + '"></div>';
      }

      // Legend
      const legendHtml =
        '<div class="heatmap-legend">Less ' +
        '<div class="hm-cell l0"></div>' +
        '<div class="hm-cell l1"></div>' +
        '<div class="hm-cell l2"></div>' +
        '<div class="hm-cell l3"></div>' +
        '<div class="hm-cell l4"></div>' +
        ' More</div>';

      el.innerHTML =
        '<div class="heatmap-container">' +
        '<div class="hm-header">' + headerHtml + '</div>' +
        '<div class="heatmap-grid">' + gridHtml + '</div>' +
        '</div>' +
        legendHtml +
        '<div class="hourly-title">Avg cost by hour of day (last 30 days)</div>' +
        '<canvas id="hourlyChart" height="80"></canvas>';

      // Hourly bar chart (Chart.js)
      if (hourly.length > 0 && typeof Chart !== 'undefined') {
        if (hourlyChart) {
          try { hourlyChart.destroy(); } catch { /* ignore */ }
          hourlyChart = null;
        }
        const canvas = document.getElementById('hourlyChart');
        if (canvas) {
          const style = getComputedStyle(document.body);
          const fg = style.getPropertyValue('--vscode-editor-foreground').trim() || '#cccccc';
          const bar = style.getPropertyValue('--vscode-progressBar-background').trim() || '#007acc';
          hourlyChart = new Chart(canvas, {
            type: 'bar',
            data: {
              labels: Array.from({ length: 24 }, (_, i) => i + 'h'),
              datasets: [{
                data: hourly.map(h => h.avgCost),
                backgroundColor: bar,
                borderWidth: 0,
              }],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: ctx => {
                      const h = hourly[ctx.dataIndex];
                      return '$' + ctx.parsed.y.toFixed(4) + ' avg (' + h.count + ' msgs)';
                    },
                  },
                },
              },
              scales: {
                x: {
                  ticks: { color: fg, font: { size: 10 } },
                  grid: { display: false },
                },
                y: {
                  ticks: { color: fg, font: { size: 10 } },
                  beginAtZero: true,
                },
              },
            },
          });
        }
      }
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
        updatePrediction(msg.data.prediction, msg.data.usage);
        if (msg.data.heatmap) { updateHeatmap(msg.data.heatmap); }
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
      dataManager.onDidUpdate(data => { this.sendUpdate(data).catch(() => {}); })
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

  private handleMessage(msg: { type: string; amount?: number | null }): void {
    switch (msg.type) {
      case 'ready':
        // Fast first update (usage + prediction, cached heatmap or null)
        this.dataManager.getUsageData().then(data => this.sendUpdate(data)).catch(() => {});
        // Trigger heatmap computation; send a second update when ready
        if (!this.dataManager.getLastHeatmapData()) {
          this.dataManager.getHeatmapData().then(() => {
            const data = this.dataManager.getLastData();
            if (data) { this.sendUpdate(data).catch(() => {}); }
          }).catch(() => {});
        }
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
      case 'setBudget': {
        const amount = msg.amount;
        if (amount === null || typeof amount === 'number') {
          config.setDailyBudget(typeof amount === 'number' ? amount : null)
            .then(() => this.dataManager.forceRefresh())
            .catch(() => {});
        }
        break;
      }
    }
  }

  private async sendUpdate(usage: ClaudeUsageData): Promise<void> {
    const prediction = await this.dataManager.getPrediction();
    const heatmap = this.dataManager.getLastHeatmapData();
    const message: { type: string; data: DashboardMessage } = {
      type: 'update',
      data: {
        usage,
        projectCosts: this.dataManager.getLastProjectCosts(),
        prediction,
        heatmap,
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
