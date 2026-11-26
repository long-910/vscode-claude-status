#!/usr/bin/env node
/*
 * Regenerates the screenshots in docs/screenshots/ from the extension's own code.
 *
 *   npm run compile-tests          # builds out/ (the script loads the compiled modules)
 *   npm install --no-save playwright && npx playwright install chromium   # once
 *   node scripts/screenshots.js
 *
 * The dashboard HTML, the status bar label / tooltip and the sidebar tree come from
 * out/webview/panel.js, out/statusBar.js and out/treeView.js with a stubbed `vscode`
 * module and sample data (below), so the images always match the current UI. Each
 * image is rendered once per README language (en / ja / zh-cn).
 *
 * Offline / proxied environments: set SCREENSHOT_CDN_DIR to a folder laid out like
 * cdn.jsdelivr.net (npm/chart.js@4.4.0/…, npm/@vscode/codicons@0.0.36/…) and requests
 * to the CDN are served from it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.TZ = 'UTC';   // same clock in Node (sample data) and the browser (chart labels)

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');
const CODICONS = 'https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.36/dist/codicon.css';

// Fixed clock so labels ("resets in", chart times) are reproducible
const NOW = new Date('2026-11-26T14:20:00Z');
const LOCALES = [
  { id: 'en', bundle: null, nls: 'package.nls.json', browserLocale: 'en-US', suffix: '' },
  { id: 'ja', bundle: 'bundle.l10n.ja.json', nls: 'package.nls.ja.json', browserLocale: 'ja-JP', suffix: '.ja' },
  { id: 'zh-cn', bundle: 'bundle.l10n.zh-cn.json', nls: 'package.nls.zh-cn.json', browserLocale: 'zh-CN', suffix: '.zh' },
];

// ---- sample data ------------------------------------------------------------

const SETTINGS = {
  'budget.dailyUsd': 30,
  'budget.weeklyUsd': 150,
  'budget.monthlyUsd': 400,
};

const usage = {
  utilization5h: 0.62, utilization7d: 0.41,
  resetIn5h: 2 * 3600 + 5 * 60, resetIn7d: 3 * 86400 + 4 * 3600,
  limitStatus: 'allowed',
  cost5h: 8.42, costDay: 14.87, cost7d: 63.15, costMonth: 212.4,
  tokensIn5h: 48_200, tokensOut5h: 131_500, tokensCacheRead5h: 2_480_000, tokensCacheCreate5h: 412_000,
  costByModel5h: { 'claude-opus-5-5': 6.1, 'claude-sonnet-5-5': 2.05, 'claude-haiku-5-5': 0.27 },
  pricingByModel5h: { 'claude-opus-5-5': 'builtin', 'claude-sonnet-5-5': 'builtin', 'claude-haiku-5-5': 'builtin' },
  has7dLimit: true, providerType: 'claude-ai',
  lastUpdated: NOW, cacheAge: 40, dataSource: 'api',
};

const projectCosts = [{
  projectName: 'vscode-claude-status', projectPath: '/home/dev/vscode-claude-status',
  costToday: 6.31, cost7d: 27.9, cost30d: 96.45, sessionCount: 14, lastActive: NOW,
}];

const prediction = {
  estimatedExhaustionTime: new Date(NOW.getTime() + 95 * 60_000),
  estimatedExhaustionIn: 95 * 60,
  currentBurnRate: 4.8,
  budgetRemaining: SETTINGS['budget.dailyUsd'] - usage.costDay,
  budgetExhaustionTime: new Date(NOW.getTime() + 3 * 3600_000),
  safeToStartHeavyTask: true,
  recommendation: 'Plenty of capacity. Safe to start heavy tasks.',
  recommendationKey: 'safe',
};

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHeatmap() {
  const rand = rng(910);
  // Weekday working hours, a little evening use, quiet weekends
  const hourWeight = h => (h >= 9 && h <= 12 ? 1 : h >= 13 && h <= 18 ? 1.2 : h >= 20 && h <= 23 ? 0.5 : h <= 1 ? 0.25 : 0.03);
  const dayWeight = d => (d === 0 || d === 6 ? 0.25 : 1);
  const daily = [];
  const dowHour = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const hourTotals = new Array(24).fill(0);
  const hourCounts = new Array(24).fill(0);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(NOW); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const active = rand() > 0.12 || i < 10;
    let cost = 0;
    if (active) {
      for (let h = 0; h < 24; h++) {
        const c = hourWeight(h) * dayWeight(dow) * (0.3 + rand() * 1.4) * (0.5 + (90 - i) / 120);
        cost += c;
        if (i < 30) { dowHour[dow][h] += c; hourTotals[h] += c; hourCounts[h] += Math.round(c * 20); }
      }
    }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daily.push({ date: key, cost: Math.round(cost * 100) / 100, sessionCount: active ? 1 + Math.floor(rand() * 6) : 0, tokensTotal: Math.round(cost * 9000) });
  }
  const hourly = hourTotals.map((t, h) => ({ hour: h, avgCost: t / 30, count: hourCounts[h] }));
  return { daily, hourly, dowHour, generatedAt: NOW };
}
const heatmap = buildHeatmap();

// ---- `vscode` stub ----------------------------------------------------------

let bundle = {};
function t(message, ...args) {
  const text = bundle[message] ?? message;
  return text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));
}

class EventEmitter {
  constructor() { this.listeners = []; this.event = l => { this.listeners.push(l); return { dispose() {} }; }; }
  fire(v) { for (const l of this.listeners) { l(v); } }
  dispose() {}
}
class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } }
class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
class ThemeColor { constructor(id) { this.id = id; } }

let capturedHtml = '';
const vscodeStub = {
  l10n: { t },
  EventEmitter, TreeItem, ThemeIcon, ThemeColor,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Beside: -2 },
  workspace: {
    getConfiguration: () => ({ get: (key, def) => (key in SETTINGS ? SETTINGS[key] : def) }),
  },
  window: {
    createWebviewPanel: () => ({
      webview: {
        set html(v) { capturedHtml = v; },
        onDidReceiveMessage: () => ({ dispose() {} }),
        postMessage: () => Promise.resolve(true),
      },
      onDidDispose: () => ({ dispose() {} }),
      reveal() {}, dispose() {},
    }),
  },
  commands: { executeCommand: () => Promise.resolve() },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') { return vscodeStub; }
  return origLoad.call(this, request, ...rest);
};

const OUT = path.join(ROOT, 'out');
if (!fs.existsSync(path.join(OUT, 'webview', 'panel.js'))) {
  console.error('out/ not found — run `npm run compile-tests` first.');
  process.exit(1);
}
const { buildLabel, buildTooltip } = require(path.join(OUT, 'statusBar.js'));
const { ClaudeStatusTreeProvider } = require(path.join(OUT, 'treeView.js'));
const { DashboardPanel } = require(path.join(OUT, 'webview', 'panel.js'));
const { projectMonthCost } = require(path.join(OUT, 'data', 'budget.js'));

const fakeDataManager = {
  onDidUpdate: () => ({ dispose() {} }),
  setDashboardOpen() {},
  getLastData: () => usage,
  getLastProjectCosts: () => projectCosts,
  getUsageData: () => new Promise(() => {}),   // the script posts the update itself
  getHeatmapData: () => new Promise(() => {}),
};

function dashboardHtml() {
  DashboardPanel.dispose();
  DashboardPanel.createOrShow(fakeDataManager);
  return capturedHtml;
}

function dashboardMessage() {
  return {
    type: 'update',
    data: {
      usage, projectCosts, prediction, heatmap,
      monthEstimate: projectMonthCost(usage.costMonth, NOW),
      pricing: { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheCreatePerMillion: 3.75 },
      settings: {
        provider: 'claude-ai', providerLabel: 'Claude.ai', apiEnabled: true, cacheTtlSeconds: 300,
        weeklyBudget: SETTINGS['budget.weeklyUsd'], monthlyBudget: SETTINGS['budget.monthlyUsd'],
        statusBarFormat: null, useModelPricing: true, showTimeWindows: true,
      },
    },
  };
}

function treeRows() {
  const provider = new ClaudeStatusTreeProvider(fakeDataManager);
  const rows = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      const { item } = n;
      rows.push({
        depth, label: item.label, description: item.description || '',
        icon: item.iconPath ? item.iconPath.id : null,
        color: item.iconPath && item.iconPath.color ? item.iconPath.color.id : null,
        expanded: item.collapsibleState === 2,
      });
      if (n.children) { walk(n.children, depth + 1); }
    }
  };
  walk(provider.getChildren(), 0);
  return rows;
}

// ---- theme ------------------------------------------------------------------

// A subset of VS Code "Dark Modern" theme variables, as VS Code injects them into webviews
const THEME = {
  '--vscode-font-family': '"Segoe UI", Inter, "Noto Sans CJK JP", "IPAPGothic", "WenQuanYi Zen Hei", sans-serif',
  '--vscode-font-size': '13px',
  '--vscode-editor-font-family': '"JetBrains Mono", Consolas, monospace',
  '--vscode-editor-background': '#1f1f1f',
  '--vscode-editor-foreground': '#cccccc',
  '--vscode-foreground': '#cccccc',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-sideBar-background': '#181818',
  '--vscode-panel-border': '#2b2b2b',
  '--vscode-widget-border': '#313131',
  '--vscode-editorWidget-background': '#202020',
  '--vscode-button-background': '#0078d4',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#026ec1',
  '--vscode-button-secondaryBackground': '#313131',
  '--vscode-button-secondaryForeground': '#cccccc',
  '--vscode-progressBar-background': '#0078d4',
  '--vscode-input-background': '#313131',
  '--vscode-input-foreground': '#cccccc',
  '--vscode-input-border': '#3c3c3c',
  '--vscode-textLink-foreground': '#4daafc',
  '--vscode-textLink-activeForeground': '#4daafc',
  '--vscode-editorWarning-foreground': '#cca700',
  '--vscode-editorError-foreground': '#f85149',
  '--vscode-inputValidation-warningBackground': '#352a05',
  '--vscode-inputValidation-warningBorder': '#b89500',
  '--vscode-inputValidation-errorBackground': '#5a1d1d',
  '--vscode-inputValidation-errorBorder': '#be1100',
  '--vscode-charts-green': '#89d185',
  '--vscode-charts-yellow': '#cca700',
  '--vscode-charts-red': '#f14c4c',
  '--vscode-charts-blue': '#3794ff',
  '--vscode-list-hoverBackground': '#2a2d2e',
  '--vscode-scrollbarSlider-background': '#79797966',
};
const themeCss = `:root{${Object.entries(THEME).map(([k, v]) => `${k}:${v}`).join(';')}}`;

// ---- mock VS Code window (status bar, tooltip, sidebar) ---------------------

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const COLORS = { 'charts.red': '#f14c4c', 'charts.yellow': '#cca700' };

function windowHtml(label, tooltip, rows, sidebarTitle) {
  const activityIcon = fs.readFileSync(path.join(ROOT, 'images', 'activitybar.svg'), 'utf-8')
    .replace(/currentColor/g, '#d7d7d7');
  const tree = rows.map(r => `
    <div class="row" style="padding-left:${8 + r.depth * 16}px">
      <span class="codicon ${r.depth === 0 && r.expanded ? 'codicon-chevron-down' : 'codicon-blank'} twisty"></span>
      ${r.icon ? `<span class="codicon codicon-${r.icon}" style="${r.color ? `color:${COLORS[r.color] || ''}` : ''}"></span>` : ''}
      <span class="label">${esc(r.label)}</span><span class="desc">${esc(r.description)}</span>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${CODICONS}">
<style>${themeCss}
  *{box-sizing:border-box} body{margin:0;background:#1f1f1f;font-family:var(--vscode-font-family);font-size:13px;color:#ccc}
  .win{display:grid;grid-template-columns:48px 340px 1fr;grid-template-rows:1fr 22px;width:1100px;height:560px;border:1px solid #2b2b2b}
  .act{background:#181818;border-right:1px solid #2b2b2b;display:flex;flex-direction:column;align-items:center;padding-top:6px;gap:4px}
  .act .codicon{font-size:24px;color:#868686;padding:12px 0}
  .act .on{border-left:2px solid #0078d4;width:100%;display:flex;justify-content:center;padding:12px 0}
  .act .on svg{width:24px;height:24px}
  .side{background:#181818;border-right:1px solid #2b2b2b;overflow:hidden}
  .side h2{font-size:11px;font-weight:400;letter-spacing:.04em;margin:0;padding:10px 20px;color:#ccc;text-transform:uppercase}
  .side .hdr{font-size:11px;font-weight:700;padding:3px 8px;text-transform:uppercase;display:flex;align-items:center;gap:2px}
  .row{display:flex;align-items:center;gap:6px;height:22px;white-space:nowrap}
  .row .twisty{width:16px} .row .codicon{font-size:16px}
  .row .label{color:#ccc} .row .desc{color:#9d9d9d;font-size:12px;margin-left:4px;overflow:hidden;text-overflow:ellipsis}
  .editor{background:#1f1f1f;position:relative;font-family:var(--vscode-editor-font-family);font-size:13px;line-height:20px;padding:12px 0 0 0;color:#6e7681}
  .tabs{height:35px;background:#181818;border-bottom:1px solid #2b2b2b;margin-top:-12px;margin-bottom:10px;display:flex}
  .tab{padding:0 14px;display:flex;align-items:center;gap:6px;background:#1f1f1f;border-top:1px solid #0078d4;color:#fff;font-family:var(--vscode-font-family)}
  .code div{padding-left:20px;white-space:pre} .kw{color:#569cd6}.fn{color:#dcdcaa}.str{color:#ce9178}.ty{color:#4ec9b0}.cm{color:#6a9955}.id{color:#9cdcfe}.tx{color:#ccc}
  .status{grid-column:1/4;background:#181818;border-top:1px solid #2b2b2b;display:flex;align-items:center;font-size:12px;color:#ccc;position:relative}
  .status .item{padding:0 8px;height:100%;display:flex;align-items:center;gap:4px}
  .status .remote{background:#0078d4;color:#fff;padding:0 10px}
  .status .claude{background:rgba(255,255,255,.12)}
  .tooltip{position:absolute;left:120px;bottom:30px;background:#202020;border:1px solid #454545;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.5);padding:8px 10px;font-family:var(--vscode-font-family);font-size:13px;line-height:19px;color:#ccc;white-space:pre}
</style></head><body>
<div class="win">
  <div class="act">
    <span class="codicon codicon-files"></span><span class="codicon codicon-search"></span>
    <span class="codicon codicon-source-control"></span>
    <div class="on">${activityIcon}</div>
    <span class="codicon codicon-extensions"></span>
  </div>
  <div class="side">
    <h2>Claude Status</h2>
    <div class="hdr"><span class="codicon codicon-chevron-down"></span>${esc(sidebarTitle)}</div>
    ${tree}
  </div>
  <div class="editor">
    <div class="tabs"><div class="tab"><span class="codicon codicon-file-code" style="color:#3794ff"></span>extension.ts</div></div>
    <div class="code">
<div><span class="kw">import</span> <span class="tx">*</span> <span class="kw">as</span> <span class="id">vscode</span> <span class="kw">from</span> <span class="str">'vscode'</span><span class="tx">;</span></div>
<div> </div>
<div><span class="kw">export</span> <span class="kw">function</span> <span class="fn">activate</span><span class="tx">(</span><span class="id">context</span><span class="tx">: </span><span class="ty">vscode.ExtensionContext</span><span class="tx">) {</span></div>
<div><span class="cm">  // Claude Code is busy refactoring this file…</span></div>
<div><span class="tx">  </span><span class="kw">const</span> <span class="id">manager</span> <span class="tx">=</span> <span class="ty">DataManager</span><span class="tx">.</span><span class="fn">getInstance</span><span class="tx">();</span></div>
<div><span class="tx">  </span><span class="id">context</span><span class="tx">.</span><span class="id">subscriptions</span><span class="tx">.</span><span class="fn">push</span><span class="tx">(</span><span class="id">manager</span><span class="tx">);</span></div>
<div><span class="tx">}</span></div>
    </div>
    <div class="tooltip">${esc(tooltip)}</div>
  </div>
  <div class="status">
    <div class="item remote"><span class="codicon codicon-remote"></span></div>
    <div class="item"><span class="codicon codicon-source-control"></span>main</div>
    <div class="item claude">${esc(label)}</div>
    <div style="flex:1"></div>
    <div class="item">Ln 4, Col 12</div><div class="item">TypeScript</div><div class="item"><span class="codicon codicon-bell"></span></div>
  </div>
</div></body></html>`;
}

// ---- render -----------------------------------------------------------------

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    console.error('playwright not found — run `npm install --no-save playwright` first.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cdnDir = process.env.SCREENSHOT_CDN_DIR;
  const browser = await chromium.launch();

  for (const loc of LOCALES) {
    bundle = loc.bundle ? JSON.parse(fs.readFileSync(path.join(ROOT, 'l10n', loc.bundle), 'utf-8')) : {};
    const context = await browser.newContext({ locale: loc.browserLocale, timezoneId: 'UTC', deviceScaleFactor: 2 });
    if (cdnDir) {
      await context.route('https://cdn.jsdelivr.net/**', route => {
        const file = path.join(cdnDir, new URL(route.request().url()).pathname);
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
      });
    }

    // Dashboard
    const page = await context.newPage();
    page.on('pageerror', e => console.error('pageerror', e.message));
    page.on('console', m => { if (m.type() === 'error') { console.error('console', m.text()); } });
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 760, height: 900 });
    const raw = dashboardHtml();
    const nonce = /nonce="([^"]+)"/.exec(raw)[1];
    // Stand-in for the webview API, plus the theme variables VS Code would inject
    const html = raw.replace('</head>', `<style>${themeCss}</style>` +
      `<script nonce="${nonce}">window.acquireVsCodeApi = () => ({ postMessage() {}, setState() {}, getState() {} });</script></head>`);
    await page.setContent(html, { waitUntil: 'networkidle' });
    // The clock is frozen, so Chart.js animations would never finish
    await page.evaluate(() => { Chart.defaults.animation = false; });
    await page.evaluate(msg => window.postMessage(msg, '*'), JSON.parse(JSON.stringify(dashboardMessage())));
    await page.click('#breakdown-toggle');
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, `dashboard${loc.suffix}.png`), fullPage: true });
    await page.close();

    // Status bar + tooltip + sidebar
    const nls = JSON.parse(fs.readFileSync(path.join(ROOT, loc.nls), 'utf-8'));
    const label = buildLabel(usage, projectCosts);
    const tooltip = buildTooltip(usage, projectCosts);
    const win = await context.newPage();
    await win.setViewportSize({ width: 1102, height: 562 });
    await win.setContent(windowHtml(label, tooltip, treeRows(), nls['view.overview.title']), { waitUntil: 'networkidle' });
    await win.waitForTimeout(200);
    await win.screenshot({ path: path.join(OUT_DIR, `overview${loc.suffix}.png`) });
    await win.close();
    await context.close();
    console.log(`${loc.id}: ${label}`);
  }
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
