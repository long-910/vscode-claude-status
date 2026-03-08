import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { readAllUsage, wasJsonlUpdatedRecently } from './jsonlReader';
import { fetchRateLimitData, detectProvider, RateLimitData, ClaudeProvider } from './apiClient';
import { readCache, writeCache, isCacheValid, getCacheAge } from './cache';
import { getAllProjectCosts, ProjectCostData } from './projectCost';
import { computePrediction, PredictionData } from './prediction';
import { getHeatmapData as computeHeatmapData, HeatmapData } from '../webview/heatmap';
import { config } from '../config';

export { PredictionData, HeatmapData };

export interface ClaudeUsageData {
  // From API / cache
  utilization5h: number
  utilization7d: number
  resetIn5h: number
  resetIn7d: number
  limitStatus: 'allowed' | 'allowed_warning' | 'denied'

  // From local JSONL
  cost5h: number
  costDay: number
  cost7d: number
  tokensIn5h: number
  tokensOut5h: number
  tokensCacheRead5h: number
  tokensCacheCreate5h: number

  // Rate limit metadata
  has7dLimit: boolean      // false for plans without a 7d window or non-Claude.ai providers
  providerType: ClaudeProvider

  // Metadata
  lastUpdated: Date
  cacheAge: number
  dataSource: 'api' | 'cache' | 'stale' | 'no-credentials' | 'no-data' | 'local-only'
}

export { ProjectCostData };

export class DataManager {
  private static instance: DataManager;
  private readonly _onDidUpdate = new vscode.EventEmitter<ClaudeUsageData>();
  readonly onDidUpdate: vscode.Event<ClaudeUsageData> = this._onDidUpdate.event;

  private watcher: vscode.FileSystemWatcher | undefined;
  private lastData: ClaudeUsageData | undefined;
  private lastProjectCosts: ProjectCostData[] = [];
  private lastPrediction: PredictionData | null = null;
  private lastHeatmapData: HeatmapData | null = null;
  private heatmapComputedAt = 0;
  private readonly heatmapTtlMs = 5 * 60 * 1000; // 5-minute in-memory TTL
  private heatmapPending = false;

  private constructor() {}

  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  async getUsageData(forceRefresh = false): Promise<ClaudeUsageData> {
    const [localUsage, cache] = await Promise.all([readAllUsage(config.tokenPricing), readCache()]);

    // Determine provider type (user config or auto-detection)
    const configuredProvider = config.claudeProvider;
    const providerType: ClaudeProvider = configuredProvider === 'auto'
      ? await detectProvider(config.credentialsPath)
      : configuredProvider;

    let rateLimitData: RateLimitData | null = null;
    let dataSource: ClaudeUsageData['dataSource'] = 'no-data';

    if (providerType === 'claude-ai' && config.rateLimitApiEnabled) {
      // Fetch rate limits from Anthropic API
      if (forceRefresh || (await this.shouldCallApi(cache))) {
        try {
          rateLimitData = await fetchRateLimitData(config.credentialsPath);
          await writeCache(rateLimitData);
          dataSource = 'api';
        } catch {
          // credentials missing or network error — fall back to cache
          if (cache) {
            rateLimitData = this.cacheToRateLimitData(cache.usageData);
            dataSource = isCacheValid(cache, config.cacheTtlSeconds) ? 'cache' : 'stale';
          } else {
            dataSource = 'no-credentials';
          }
        }
      } else if (cache) {
        rateLimitData = this.cacheToRateLimitData(cache.usageData);
        dataSource = isCacheValid(cache, config.cacheTtlSeconds) ? 'cache' : 'stale';
      }
    } else if (providerType === 'claude-ai' && cache) {
      // API disabled by user but cache exists — show stale rate limit data with age indicator
      rateLimitData = this.cacheToRateLimitData(cache.usageData);
      dataSource = 'stale';
    } else {
      // Non-claude-ai provider, or no cache — cost only from local JSONL
      const hasCostData = localUsage.cost7d > 0 || localUsage.cost5h > 0;
      dataSource = hasCostData ? 'local-only' : 'no-credentials';
    }

    const cacheAge = cache ? getCacheAge(cache) : 0;

    const data: ClaudeUsageData = {
      utilization5h: rateLimitData?.utilization5h ?? 0,
      utilization7d: rateLimitData?.utilization7d ?? 0,
      resetIn5h: rateLimitData?.resetIn5h ?? 0,
      resetIn7d: rateLimitData?.resetIn7d ?? 0,
      limitStatus: rateLimitData?.limitStatus ?? 'allowed',
      has7dLimit: rateLimitData?.has7dLimit ?? false,
      providerType,
      ...localUsage,
      lastUpdated: new Date(),
      cacheAge,
      dataSource,
    };

    this.lastData = data;
    return data;
  }

  private cacheToRateLimitData(usageData: {
    utilization5h: number
    utilization7d: number
    reset5hAt: number
    reset7dAt: number
    limitStatus: string
  }): RateLimitData {
    const nowSec = Date.now() / 1000;
    return {
      utilization5h: usageData.utilization5h,
      utilization7d: usageData.utilization7d,
      resetIn5h: Math.max(0, usageData.reset5hAt - nowSec),
      resetIn7d: Math.max(0, usageData.reset7dAt - nowSec),
      limitStatus: usageData.limitStatus as RateLimitData['limitStatus'],
      // Derive from cached reset timestamp: non-zero means a 7d limit exists
      has7dLimit: usageData.reset7dAt > 0,
    };
  }

  private async shouldCallApi(cache: Awaited<ReturnType<typeof readCache>>): Promise<boolean> {
    if (!cache) { return true; }
    if (!isCacheValid(cache, config.cacheTtlSeconds)) {
      return await wasJsonlUpdatedRecently(300);
    }
    return false;
  }

  async refreshProjectCosts(): Promise<void> {
    try {
      this.lastProjectCosts = await getAllProjectCosts(config.tokenPricing);
    } catch {
      this.lastProjectCosts = [];
    }
  }

  getLastProjectCosts(): ProjectCostData[] {
    return this.lastProjectCosts;
  }

  async refresh(): Promise<void> {
    try {
      const [data] = await Promise.all([
        this.getUsageData(false),
        this.refreshProjectCosts(),
      ]);
      await this.getPrediction().catch(() => {});
      this._onDidUpdate.fire(data);

      // Heatmap is slow — compute in background, then fire a second update
      this.refreshHeatmapBackground();
    } catch {
      // ignore refresh errors
    }
  }

  async forceRefresh(): Promise<void> {
    try {
      const [data] = await Promise.all([
        this.getUsageData(true),
        this.refreshProjectCosts(),
      ]);
      await this.getPrediction().catch(() => {});
      // Invalidate heatmap cache to force recompute on next access
      this.heatmapComputedAt = 0;
      this._onDidUpdate.fire(data);

      this.refreshHeatmapBackground();
    } catch {
      // ignore refresh errors
    }
  }

  private refreshHeatmapBackground(): void {
    if (this.heatmapPending) { return; }
    this.heatmapPending = true;
    this.getHeatmapData().then(() => {
      this.heatmapPending = false;
      const freshData = this.lastData;
      if (freshData) { this._onDidUpdate.fire(freshData); }
    }).catch(() => { this.heatmapPending = false; });
  }

  startWatching(): void {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(os.homedir(), '.claude', 'projects')),
      '**/*.jsonl'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
  }

  async getPrediction(): Promise<PredictionData | null> {
    if (!this.lastData) { return null; }
    try {
      const prediction = await computePrediction(
        this.lastData.utilization5h,
        this.lastData.resetIn5h,
        this.lastData.cost5h,
        this.lastData.costDay,
        config.dailyBudget,
      );
      this.lastPrediction = prediction;
      return prediction;
    } catch {
      return this.lastPrediction;
    }
  }

  getLastPrediction(): PredictionData | null {
    return this.lastPrediction;
  }

  async getHeatmapData(): Promise<HeatmapData | null> {
    const now = Date.now();
    if (this.lastHeatmapData && now - this.heatmapComputedAt < this.heatmapTtlMs) {
      return this.lastHeatmapData;
    }
    try {
      const data = await computeHeatmapData(config.heatmapDays);
      this.lastHeatmapData = data;
      this.heatmapComputedAt = now;
      return data;
    } catch {
      return this.lastHeatmapData; // return stale on error
    }
  }

  getLastHeatmapData(): HeatmapData | null {
    return this.lastHeatmapData;
  }

  getLastData(): ClaudeUsageData | undefined {
    return this.lastData;
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidUpdate.dispose();
  }
}
