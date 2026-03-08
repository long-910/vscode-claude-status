import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { DataManager, ClaudeUsageData, ProjectCostData, PredictionData, HeatmapData } from '../data/dataManager';
import { config } from '../config';
import type { TokenPricing } from '../data/jsonlReader';

interface DashboardSettings {
  provider: string;
  apiEnabled: boolean;
  cacheTtlSeconds: number;
  weeklyBudget: number | null;
}

interface DashboardMessage {
  usage: ClaudeUsageData;
  projectCosts: ProjectCostData[];
  prediction: PredictionData | null;
  heatmap: HeatmapData | null;
  pricing: TokenPricing;
  settings: DashboardSettings;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function buildI18n(): Record<string, string> {
  const t = vscode.l10n.t.bind(vscode.l10n);
  return {
    title:              t('Claude Code Usage'),
    refresh:            t('↻ Refresh'),
    toggleMode:         t('$ / %'),
    currentUsage:       t('Current Usage'),
    window5h:           t('5h window'),
    window7d:           t('7d window'),
    tokenCost:          t('Token Cost'),
    today:              t('Today'),
    days7:              t('7 days'),
    days7short:         t('7d'),
    days30:             t('30 days'),
    monthEst:           t('Month (est.)'),
    project:            t('Project'),
    prediction:         t('Prediction'),
    pricingSettings:    t('Pricing & Settings'),
    usageHistory:       t('Usage History'),
    loadingProject:     t('Loading project data…'),
    noProjectData:      t('No project data'),
    loadingPrediction:  t('Loading prediction…'),
    noPredictionData:   t('No prediction data'),
    loadingHistory:     t('Loading usage history…'),
    noUsageHistory:     t('No usage history'),
    tokenBreakdown:     t('Token breakdown (5h)'),
    hide:               t('▲ Hide'),
    show:               t('▼ Show'),
    burnRate:           t('Burn rate'),
    perHour:            t('/hr'),
    dailyBudget:        t('Daily budget'),
    weeklyBudget:       t('Weekly budget'),
    budgetExhausted:    t('💸 Daily budget exhausted'),
    weeklyExhausted:    t('⚠️ Weekly budget exhausted'),
    weeklyNearlyExhausted: t('⚠️ Weekly budget nearly exhausted'),
    configureBudget:    t('⚙ Configure budget'),
    setDailyBudget:     t('⚙ Set daily budget'),
    dailyBudgetLabel:   t('Daily budget ($):'),
    budgetPlaceholder:  t('e.g. 20'),
    save:               t('Save'),
    disable:            t('Disable'),
    input:              t('Input'),
    output:             t('Output'),
    cacheRead:          t('Cache read'),
    cacheCreate:        t('Cache create'),
    cacheGood:          t('Good! Cache is saving cost.'),
    cacheLow:           t('Low cache reuse.'),
    noCacheReads:       t('No cache reads in this window.'),
    apiEnabled:         t('API enabled'),
    apiDisabled:        t('API disabled'),
    editSettings:       t('⚙ Edit pricing & settings'),
    stale:              t('(stale)'),
    live:               t('(live)'),
    justNow:            t('just now'),
    lastUpdated:        t('Last updated:'),
    utilization:        t('Utilization'),
    warningLine:        t('Warning (75%)'),
    limitLine:          t('Limit (100%)'),
    less:               t('Less'),
    more:               t('More'),
    avgByHour:          t('Avg cost by hour of day (last 30 days)'),
    resetsIn:           t('resets in'),
    calculating:        t('Calculating…'),
    cacheTtl:           t('Cache TTL'),
    limitIn5hCritical:  t('⛔ 5h limit in ~'),
    limitIn5hWarning:   t('⚠️ 5h limit in ~'),
    limitIn5h:          t('5h limit in ~'),
    atTime:             t('at'),
    budgetExhaustedAt:  t('💸 Budget exhausted ~'),
    atThisRate:         t('at this rate'),
    cacheHitRatio:      t('Cache hit ratio:'),
    msgs:               t('msgs'),
    avg:                t('avg'),
    mAgoFormat:         t('{0}m ago', '__N__'),
    recSafe:            t('Plenty of capacity. Safe to start heavy tasks.'),
    recCaution:         t('About 1 hour remaining. Plan your next task accordingly.'),
    recWarning:         t('Less than 30 min remaining. Wrap up current task.'),
    recCritical:        t('Less than 10 min remaining. Save your work and pause.'),
    recRateLimitReached: t('Rate limit reached. Wait for reset.'),
  };
}

function getWebviewContent(nonce: string, i18n: Record<string, string>): string {
  const i18nJson = JSON.stringify(i18n);
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
  <title>${i18n.title}</title>
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

    .detail-toggle {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      padding: 0;
      font-size: 0.8em;
      text-decoration: none;
    }
    .detail-toggle:hover { opacity: 0.8; }

    .token-breakdown {
      margin-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 6px;
    }
    .token-breakdown .cost-row { font-size: 0.85em; }
    .token-breakdown .cost-label {
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .cache-efficiency {
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
    }

    .pricing-grid {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 3px 10px;
      font-size: 0.88em;
      margin: 6px 0;
      align-items: center;
    }
    .pricing-grid .pg-label { color: var(--vscode-descriptionForeground); }
    .pricing-grid .pg-rate {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .pricing-grid .pg-unit { color: var(--vscode-descriptionForeground); font-size: 0.85em; }

    .settings-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
      font-size: 0.85em;
      align-items: center;
    }
    .settings-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 0.85em;
    }
    .settings-badge.ok   { background: #0e4429; color: #39d353; }
    .settings-badge.warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-editorWarning-foreground); }

    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0 0 10px 0;
    }
    .card-title-row .card-title { margin: 0; }

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
    <h1>${i18n.title}</h1>
    <div class="header-actions">
      <button id="btn-refresh">${i18n.refresh}</button>
      <button id="btn-toggle">${i18n.toggleMode}</button>
      <button id="btn-settings">⚙</button>
    </div>
  </div>

  <!-- Current Usage -->
  <div class="card">
    <div class="card-title">${i18n.currentUsage}</div>
    <div class="progress-row">
      <div class="progress-labels">
        <span>${i18n.window5h}</span>
        <span id="usage-5h-label">—</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="usage-5h-fill" style="width:0%"></div>
      </div>
    </div>
    <div class="progress-row" id="usage-7d-row">
      <div class="progress-labels">
        <span>${i18n.window7d}</span>
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
      <div class="card-title">${i18n.tokenCost}</div>
      <div class="cost-row">
        <span class="cost-label">5h</span>
        <span id="cost-5h">—</span>
      </div>
      <div class="cost-row">
        <span class="cost-label">${i18n.today}</span>
        <span id="cost-day">—</span>
      </div>
      <div class="cost-row">
        <span class="cost-label">${i18n.days7}</span>
        <span id="cost-7d">—</span>
      </div>
      <div class="cost-row" id="cost-month-row" style="display:none">
        <span class="cost-label">${i18n.monthEst}</span>
        <span id="cost-month">—</span>
      </div>
      <div style="margin-top:6px">
        <button class="detail-toggle" id="breakdown-toggle">▶ ${i18n.tokenBreakdown}</button>
        <div id="token-breakdown" class="token-breakdown" style="display:none"></div>
      </div>
    </div>

    <!-- Project Cost (Feature 03) -->
    <div class="card">
      <div class="card-title">${i18n.project}</div>
      <div id="project-cost-content">
        <div class="placeholder">${i18n.loadingProject}</div>
      </div>
    </div>
  </div>

  <!-- Prediction (Feature 04) -->
  <div class="card">
    <div class="card-title">${i18n.prediction}</div>
    <canvas id="predChart" height="90" style="display:none; margin-bottom:10px"></canvas>
    <div id="prediction-content">
      <div class="placeholder">${i18n.loadingPrediction}</div>
    </div>
  </div>

  <!-- Pricing & Settings (collapsible) -->
  <div class="card">
    <div class="card-title-row">
      <div class="card-title">${i18n.pricingSettings}</div>
      <button class="detail-toggle" id="pricing-toggle">${i18n.hide}</button>
    </div>
    <div id="pricing-content"></div>
  </div>

  <!-- Usage History (Feature 05) -->
  <div class="card">
    <div class="card-title">
      ${i18n.usageHistory} (<span id="heatmap-days">90</span> ${i18n.days7})
    </div>
    <div id="heatmap-content">
      <div class="placeholder">${i18n.loadingHistory}</div>
    </div>
  </div>

  <div class="footer" id="footer">${i18n.lastUpdated} —</div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script nonce="${nonce}">
    const i18n = ${i18nJson};
    const vscode = acquireVsCodeApi();

    let currentMode = 'percent';
    let lastData = null;
    let refreshing = false;
    let breakdownOpen = false;
    let pricingOpen = true;

    // Notify extension that the WebView is ready
    vscode.postMessage({ type: 'ready' });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      setRefreshing(true);
      vscode.postMessage({ type: 'refresh' });
    });

    document.getElementById('btn-toggle').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleMode' });
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    document.getElementById('breakdown-toggle').addEventListener('click', toggleBreakdown);
    document.getElementById('pricing-toggle').addEventListener('click', togglePricing);

    // Event delegation for dynamically generated buttons
    document.addEventListener('click', e => {
      const id = e.target && e.target.id;
      if (id === 'budget-configure-btn') { toggleBudgetConfig(); }
      else if (id === 'budget-save-btn')  { saveBudget(); }
      else if (id === 'budget-clear-btn') { clearBudget(); }
      else if (id === 'pricing-settings-btn') { vscode.postMessage({ type: 'openSettings' }); }
    });

    function setRefreshing(value) {
      refreshing = value;
      const btn = document.getElementById('btn-refresh');
      if (value) {
        btn.innerHTML = '<span class="spinning">⟳</span>';
        btn.disabled = true;
      } else {
        btn.textContent = i18n.refresh;
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
      const isClaudeAi = usage.providerType === 'claude-ai';
      const useCostMode = !isClaudeAi || usage.dataSource === 'local-only' || mode === 'cost';
      const show7d = usage.has7dLimit && isClaudeAi;

      // Show/hide 7d row
      const row7d = document.getElementById('usage-7d-row');
      if (row7d) { row7d.style.display = show7d ? '' : 'none'; }

      if (useCostMode) {
        const resetSuffix5h = isClaudeAi && usage.resetIn5h > 0
          ? ' — ' + i18n.resetsIn + ' ' + fmt(usage.resetIn5h) : '';
        document.getElementById('usage-5h-label').textContent =
          '$' + usage.cost5h.toFixed(2) + resetSuffix5h;
        if (show7d) {
          document.getElementById('usage-7d-label').textContent =
            '$' + usage.cost7d.toFixed(2) + ' — ' + i18n.resetsIn + ' ' + fmt(usage.resetIn7d);
        }
      } else {
        // percent mode — claude-ai only
        const warn5h = usage.utilization5h >= 0.75 ? ' ⚠' : '';
        const deniedFlag = denied ? '✗' : '';
        document.getElementById('usage-5h-label').textContent =
          pct(usage.utilization5h) + warn5h + deniedFlag + ' — ' + i18n.resetsIn + ' ' + fmt(usage.resetIn5h);
        if (show7d) {
          const warn7d = usage.utilization7d >= 0.75 ? ' ⚠' : '';
          document.getElementById('usage-7d-label').textContent =
            pct(usage.utilization7d) + warn7d + ' — ' + i18n.resetsIn + ' ' + fmt(usage.resetIn7d);
        }
      }

      const fill5h = document.getElementById('usage-5h-fill');
      if (isClaudeAi) {
        fill5h.style.width = Math.min(100, usage.utilization5h * 100) + '%';
        fill5h.className = 'progress-fill' +
          (denied ? ' error' : usage.utilization5h >= 0.75 ? ' warning' : '');
      } else {
        fill5h.style.width = '0%';
        fill5h.className = 'progress-fill';
      }

      if (show7d) {
        const fill7d = document.getElementById('usage-7d-fill');
        fill7d.style.width = Math.min(100, usage.utilization7d * 100) + '%';
        fill7d.className = 'progress-fill' + (usage.utilization7d >= 0.75 ? ' warning' : '');
      }

      document.getElementById('cost-5h').textContent  = '$' + usage.cost5h.toFixed(2);
      document.getElementById('cost-day').textContent = '$' + usage.costDay.toFixed(2);
      document.getElementById('cost-7d').textContent  = '$' + usage.cost7d.toFixed(2);

      // Monthly projection
      const monthRow = document.getElementById('cost-month-row');
      if (monthRow) {
        const dailyAvg = usage.costDay > 0 ? usage.costDay
          : usage.cost7d > 0 ? usage.cost7d / 7 : 0;
        if (dailyAvg > 0) {
          document.getElementById('cost-month').textContent = '$' + (dailyAvg * 30).toFixed(2);
          monthRow.style.display = '';
        } else {
          monthRow.style.display = 'none';
        }
      }

      const ageStr = usage.cacheAge < 60
        ? i18n.justNow
        : i18n.mAgoFormat.replace('__N__', String(Math.round(usage.cacheAge / 60)));
      const srcLabel = usage.dataSource === 'stale' ? ' ' + i18n.stale
                     : usage.dataSource === 'api'   ? ' ' + i18n.live : '';
      document.getElementById('footer').textContent =
        i18n.lastUpdated + ' ' + ageStr + srcLabel;
    }

    function updateProjectCosts(projectCosts) {
      const el = document.getElementById('project-cost-content');
      if (!projectCosts || projectCosts.length === 0) {
        el.innerHTML = '<div class="placeholder">' + i18n.noProjectData + '</div>';
        return;
      }
      // Single project: show detailed breakdown
      if (projectCosts.length === 1) {
        const pj = projectCosts[0];
        el.innerHTML =
          '<div class="cost-row"><span class="cost-label" style="font-weight:600">' + esc(pj.projectName) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.today + '</span><span>$' + pj.costToday.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.days7 + '</span><span>$' + pj.cost7d.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.days30 + '</span><span>$' + pj.cost30d.toFixed(2) + '</span></div>';
        return;
      }
      // Multi-root: show each project
      let html = '';
      for (const pj of projectCosts) {
        html +=
          '<div style="margin-bottom:8px">' +
          '<div class="cost-row"><span class="cost-label" style="font-weight:600">' + esc(pj.projectName) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.today + '</span><span>$' + pj.costToday.toFixed(2) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.days7short + '</span><span>$' + pj.cost7d.toFixed(2) + '</span></div>' +
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

    function updatePrediction(prediction, usage, settings) {
      const el = document.getElementById('prediction-content');
      if (!prediction) {
        el.innerHTML = '<div class="placeholder">' + i18n.noPredictionData + '</div>';
        return;
      }

      let html = '';

      // Burn rate
      if (prediction.currentBurnRate > 0) {
        html += '<div class="cost-row"><span class="cost-label">' + i18n.burnRate + '</span>' +
          '<span>$' + prediction.currentBurnRate.toFixed(2) + i18n.perHour + '</span></div>';
      } else {
        html += '<div class="cost-row"><span class="cost-label">' + i18n.burnRate + '</span>' +
          '<span class="placeholder">' + i18n.calculating + '</span></div>';
      }

      // Rate limit exhaustion alert
      if (prediction.estimatedExhaustionIn !== null) {
        const atTime = fmtTime(prediction.estimatedExhaustionTime);
        if (prediction.estimatedExhaustionIn < 600) {
          html += '<div class="alert error">' + i18n.limitIn5hCritical +
            fmt(prediction.estimatedExhaustionIn) + ' (' + i18n.atTime + ' ' + atTime + ')</div>';
        } else if (prediction.estimatedExhaustionIn < 1800) {
          html += '<div class="alert warning">' + i18n.limitIn5hWarning +
            fmt(prediction.estimatedExhaustionIn) + ' (' + i18n.atTime + ' ' + atTime + ')</div>';
        } else {
          html += '<div class="prediction-row">' + i18n.limitIn5h +
            fmt(prediction.estimatedExhaustionIn) + ' (' + i18n.atTime + ' ' + atTime + ')</div>';
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
          '<span>' + i18n.dailyBudget + '</span>' +
          '<span>$' + spent.toFixed(2) + ' / $' + total.toFixed(2) +
          ' (' + Math.round(usedPct) + '%)</span>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill' + fillClass + '" style="width:' +
          usedPct.toFixed(1) + '%"></div></div>' +
          '</div>';

        if (prediction.budgetExhaustionTime) {
          const atBudget = fmtTime(prediction.budgetExhaustionTime);
          if (prediction.budgetRemaining === 0) {
            html += '<div class="alert error">' + i18n.budgetExhausted + '</div>';
          } else if (usedPct >= 80) {
            html += '<div class="alert warning">' + i18n.budgetExhaustedAt +
              atBudget + ' ' + i18n.atThisRate + '</div>';
          }
        }

        html += '<button class="configure-link" id="budget-configure-btn">' + i18n.configureBudget + '</button>';
      } else {
        html += '<button class="configure-link" id="budget-configure-btn">' + i18n.setDailyBudget + '</button>';
      }

      // Weekly budget
      if (settings && settings.weeklyBudget && usage) {
        const weeklySpent = usage.cost7d;
        const weeklyTotal = settings.weeklyBudget;
        const weeklyPct = Math.min(100, (weeklySpent / weeklyTotal) * 100);
        const weeklyFillClass = weeklyPct >= 80 ? ' error' : weeklyPct >= 60 ? ' warning' : '';
        html += '<div class="progress-row" style="margin-top:8px">' +
          '<div class="progress-labels">' +
          '<span>' + i18n.weeklyBudget + '</span>' +
          '<span>$' + weeklySpent.toFixed(2) + ' / $' + weeklyTotal.toFixed(2) +
          ' (' + Math.round(weeklyPct) + '%)</span>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill' + weeklyFillClass + '" style="width:' +
          weeklyPct.toFixed(1) + '%"></div></div>' +
          '</div>';
        if (weeklyPct >= 80) {
          html += '<div class="alert warning">' +
            (weeklyPct >= 100 ? i18n.weeklyExhausted : i18n.weeklyNearlyExhausted) + '</div>';
        }
      }

      // Recommendation (i18n via recommendationKey)
      const recI18n = {
        'safe':               i18n.recSafe,
        'caution':            i18n.recCaution,
        'warning':            i18n.recWarning,
        'critical':           i18n.recCritical,
        'rate-limit-reached': i18n.recRateLimitReached,
      };
      const recText = recI18n[prediction.recommendationKey] || esc(prediction.recommendation);
      html += '<div class="prediction-row" style="margin-top:8px">💡 ' + recText + '</div>';

      // Budget input form (toggled)
      html += '<div class="budget-configure" id="budget-form" style="display:' +
        (budgetConfigOpen ? 'flex' : 'none') + '">' +
        '<label>' + i18n.dailyBudgetLabel + '</label>' +
        '<input type="number" id="budget-input" min="0" step="5" placeholder="' + i18n.budgetPlaceholder + '">' +
        '<button id="budget-save-btn">' + i18n.save + '</button>' +
        '<button id="budget-clear-btn">' + i18n.disable + '</button>' +
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

    // ---- Token Breakdown ---------------------------------------------------

    function toggleBreakdown() {
      breakdownOpen = !breakdownOpen;
      const el = document.getElementById('token-breakdown');
      const btn = document.getElementById('breakdown-toggle');
      if (el) { el.style.display = breakdownOpen ? 'block' : 'none'; }
      if (btn) { btn.textContent = (breakdownOpen ? '▼' : '▶') + ' ' + i18n.tokenBreakdown; }
      if (breakdownOpen && lastData) {
        renderTokenBreakdown(lastData.usage, lastData.pricing);
      }
    }

    function renderTokenBreakdown(usage, pricing) {
      const el = document.getElementById('token-breakdown');
      if (!el || !pricing) { return; }

      function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
      function tokenCost(tokens, ratePerM) { return (tokens / 1_000_000) * ratePerM; }

      const inCost   = tokenCost(usage.tokensIn5h,         pricing.inputPerMillion);
      const outCost  = tokenCost(usage.tokensOut5h,        pricing.outputPerMillion);
      const rdCost   = tokenCost(usage.tokensCacheRead5h,  pricing.cacheReadPerMillion);
      const crCost   = tokenCost(usage.tokensCacheCreate5h, pricing.cacheCreatePerMillion);

      const totalIn = usage.tokensIn5h + usage.tokensCacheRead5h;
      const cacheHitRatio = totalIn > 0
        ? Math.round((usage.tokensCacheRead5h / totalIn) * 100) : 0;

      let html =
        '<div class="cost-row"><span class="cost-label">' + i18n.input + '</span>' +
        '<span>' + fmtK(usage.tokensIn5h) + ' tok = $' + inCost.toFixed(4) + '</span></div>' +
        '<div class="cost-row"><span class="cost-label">' + i18n.output + '</span>' +
        '<span>' + fmtK(usage.tokensOut5h) + ' tok = $' + outCost.toFixed(4) + '</span></div>';

      if (usage.tokensCacheRead5h > 0 || usage.tokensCacheCreate5h > 0) {
        html +=
          '<div class="cost-row"><span class="cost-label">' + i18n.cacheRead + '</span>' +
          '<span>' + fmtK(usage.tokensCacheRead5h) + ' tok = $' + rdCost.toFixed(4) + '</span></div>' +
          '<div class="cost-row"><span class="cost-label">' + i18n.cacheCreate + '</span>' +
          '<span>' + fmtK(usage.tokensCacheCreate5h) + ' tok = $' + crCost.toFixed(4) + '</span></div>';
      }

      html += '<div class="cache-efficiency">';
      if (usage.tokensCacheRead5h > 0) {
        html += i18n.cacheHitRatio + ' ' + cacheHitRatio + '% — ';
        if (cacheHitRatio >= 50) {
          html += i18n.cacheGood;
        } else {
          html += i18n.cacheLow;
        }
      } else {
        html += i18n.noCacheReads;
      }
      html += '</div>';

      el.innerHTML = html;
    }

    // ---- Pricing & Settings -----------------------------------------------

    function togglePricing() {
      pricingOpen = !pricingOpen;
      const el = document.getElementById('pricing-content');
      const btn = document.getElementById('pricing-toggle');
      if (el) {
        el.style.display = pricingOpen ? '' : 'none';
        if (pricingOpen && lastData) {
          renderPricingContent(lastData.pricing, lastData.settings);
        }
      }
      if (btn) { btn.textContent = pricingOpen ? i18n.hide : i18n.show; }
    }

    function renderPricingContent(pricing, settings) {
      const el = document.getElementById('pricing-content');
      if (!el || !pricing) { return; }

      const providerLabel = {
        'claude-ai': 'Claude.ai',
        'aws-bedrock': 'AWS Bedrock',
        'api-key': 'API Key',
      }[settings.provider] || settings.provider;

      const apiStatus = settings.apiEnabled
        ? '<span class="settings-badge ok">' + i18n.apiEnabled + '</span>'
        : '<span class="settings-badge warn">' + i18n.apiDisabled + '</span>';

      const cacheMins = Math.round(settings.cacheTtlSeconds / 60);

      let html =
        '<div class="pricing-grid">' +
        '<span class="pg-label">' + i18n.input + '</span>' +
        '<span class="pg-rate">$' + pricing.inputPerMillion.toFixed(2) + '</span>' +
        '<span class="pg-unit">/ 1M tokens</span>' +
        '<span class="pg-label">' + i18n.output + '</span>' +
        '<span class="pg-rate">$' + pricing.outputPerMillion.toFixed(2) + '</span>' +
        '<span class="pg-unit">/ 1M tokens</span>' +
        '<span class="pg-label">' + i18n.cacheRead + '</span>' +
        '<span class="pg-rate">$' + pricing.cacheReadPerMillion.toFixed(2) + '</span>' +
        '<span class="pg-unit">/ 1M tokens</span>' +
        '<span class="pg-label">' + i18n.cacheCreate + '</span>' +
        '<span class="pg-rate">$' + pricing.cacheCreatePerMillion.toFixed(2) + '</span>' +
        '<span class="pg-unit">/ 1M tokens</span>' +
        '</div>' +
        '<div class="settings-row">' +
        '<span class="settings-badge">' + esc(providerLabel) + '</span>' +
        apiStatus +
        '<span class="settings-badge">' + i18n.cacheTtl + ': ' + cacheMins + 'm</span>' +
        '</div>' +
        '<div style="margin-top:8px">' +
        '<button class="configure-link" id="pricing-settings-btn">' + i18n.editSettings + '</button>' +
        '</div>';

      el.innerHTML = html;
    }

    // ---- Prediction Chart --------------------------------------------------
    let predChart = null;

    function updatePredictionChart(usage, prediction) {
      const canvas = document.getElementById('predChart');
      if (!canvas) { return; }

      const isClaudeAi = usage && usage.providerType === 'claude-ai';
      const hasUtil    = usage && usage.utilization5h > 0 && usage.resetIn5h > 0;

      if (!isClaudeAi || !hasUtil || typeof Chart === 'undefined') {
        canvas.style.display = 'none';
        if (predChart) { try { predChart.destroy(); } catch { /* ignore */ } predChart = null; }
        return;
      }

      canvas.style.display = 'block';

      const nowMs      = Date.now();
      const resetMin   = usage.resetIn5h / 60;
      const currentPct = Math.min(100, usage.utilization5h * 100);
      const exhaustMin = (prediction && prediction.estimatedExhaustionIn != null)
        ? prediction.estimatedExhaustionIn / 60 : null;

      // Generate 8-10 evenly-spaced time points, plus exact exhaustion point
      const keyMins = new Set();
      const steps = 8;
      for (let i = 0; i <= steps; i++) { keyMins.add(i * resetMin / steps); }
      if (exhaustMin && exhaustMin > 0 && exhaustMin < resetMin) { keyMins.add(exhaustMin); }
      const sortedMins = Array.from(keyMins).sort((a, b) => a - b);

      const labels = [];
      const projValues = [];

      for (const t of sortedMins) {
        const absMs = nowMs + t * 60000;
        labels.push(new Date(absMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        let y;
        if (exhaustMin && t >= exhaustMin) {
          y = 100;
        } else if (exhaustMin && exhaustMin > 0) {
          // Linear interpolation: currentPct at t=0 → 100% at t=exhaustMin
          y = currentPct + (100 - currentPct) * (t / exhaustMin);
        } else {
          // Won't exhaust in this window — show flat line
          y = currentPct;
        }
        projValues.push(Math.round(y * 10) / 10);
      }

      // Colour the projection line by severity
      const lineColor = currentPct >= 90 ? '#cc3333'
        : currentPct >= 75 ? '#e8a838'
        : (getComputedStyle(document.body).getPropertyValue('--vscode-progressBar-background').trim() || '#007acc');

      const fg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim() || '#ccc';
      const refLen = labels.length;

      if (predChart) { try { predChart.destroy(); } catch { /* ignore */ } predChart = null; }

      predChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: i18n.utilization,
              data: projValues,
              borderColor: lineColor,
              backgroundColor: lineColor + '22',
              borderWidth: 2,
              pointRadius: projValues.map((_, i) => (i === 0 || (exhaustMin && Math.abs(sortedMins[i] - exhaustMin) < 0.01)) ? 4 : 0),
              fill: true,
              tension: 0,
            },
            {
              label: i18n.warningLine,
              data: Array(refLen).fill(75),
              borderColor: '#e8a83888',
              borderWidth: 1,
              borderDash: [4, 3],
              pointRadius: 0,
              fill: false,
            },
            {
              label: i18n.limitLine,
              data: Array(refLen).fill(100),
              borderColor: '#cc333388',
              borderWidth: 1,
              borderDash: [4, 3],
              pointRadius: 0,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: item => item.datasetIndex === 0,
              callbacks: {
                label: ctx => i18n.utilization + ': ' + ctx.parsed.y.toFixed(1) + '%',
              },
            },
          },
          scales: {
            x: {
              ticks: { color: fg, font: { size: 10 }, maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              min: 0,
              max: 105,
              ticks: {
                color: fg,
                font: { size: 10 },
                callback: v => v + '%',
                stepSize: 25,
              },
              grid: { color: fg + '22' },
            },
          },
        },
      });
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
        el.innerHTML = '<div class="placeholder">' + i18n.noUsageHistory + '</div>';
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
        const sessions = day.sessionCount > 0 ? ' (' + day.sessionCount + ' ' + i18n.msgs + ')' : '';
        gridHtml += '<div class="hm-cell l' + level +
          '" title="' + esc(day.date + ': $' + costStr + sessions) + '"></div>';
      }

      // Legend
      const legendHtml =
        '<div class="heatmap-legend">' + i18n.less + ' ' +
        '<div class="hm-cell l0"></div>' +
        '<div class="hm-cell l1"></div>' +
        '<div class="hm-cell l2"></div>' +
        '<div class="hm-cell l3"></div>' +
        '<div class="hm-cell l4"></div>' +
        ' ' + i18n.more + '</div>';

      el.innerHTML =
        '<div class="heatmap-container">' +
        '<div class="hm-header">' + headerHtml + '</div>' +
        '<div class="heatmap-grid">' + gridHtml + '</div>' +
        '</div>' +
        legendHtml +
        '<div class="hourly-title">' + i18n.avgByHour + '</div>' +
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
                      return '$' + ctx.parsed.y.toFixed(4) + ' ' + i18n.avg + ' (' + h.count + ' ' + i18n.msgs + ')';
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
        updatePrediction(msg.data.prediction, msg.data.usage, msg.data.settings);
        updatePredictionChart(msg.data.usage, msg.data.prediction);
        if (msg.data.heatmap) { updateHeatmap(msg.data.heatmap); }
        // Refresh open panels on data update
        if (breakdownOpen) { renderTokenBreakdown(msg.data.usage, msg.data.pricing); }
        renderPricingContent(msg.data.pricing, msg.data.settings);
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
      vscode.l10n.t('Claude Code Usage'),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    this.panel.webview.html = getWebviewContent(nonce, buildI18n());

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
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'claudeStatus');
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
        pricing: config.tokenPricing,
        settings: {
          provider: usage.providerType,
          apiEnabled: config.rateLimitApiEnabled,
          cacheTtlSeconds: config.cacheTtlSeconds,
          weeklyBudget: config.weeklyBudget,
        },
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
