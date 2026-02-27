import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { readAllUsage, wasJsonlUpdatedRecently } from './jsonlReader';
import { fetchRateLimitData, RateLimitData } from './apiClient';
import { readCache, writeCache, isCacheValid, getCacheAge } from './cache';
import { getAllProjectCosts, ProjectCostData } from './projectCost';
import { computePrediction, PredictionData } from './prediction';
import { config } from '../config';

export { PredictionData };

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

  // Metadata
  lastUpdated: Date
  cacheAge: number
  dataSource: 'api' | 'cache' | 'stale' | 'no-credentials' | 'no-data'
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

  private constructor() {}

  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  async getUsageData(forceRefresh = false): Promise<ClaudeUsageData> {
    const [localUsage, cache] = await Promise.all([readAllUsage(), readCache()]);

    let rateLimitData: RateLimitData | null = null;
    let dataSource: ClaudeUsageData['dataSource'] = 'no-data';

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

    const cacheAge = cache ? getCacheAge(cache) : 0;

    const data: ClaudeUsageData = {
      utilization5h: rateLimitData?.utilization5h ?? 0,
      utilization7d: rateLimitData?.utilization7d ?? 0,
      resetIn5h: rateLimitData?.resetIn5h ?? 0,
      resetIn7d: rateLimitData?.resetIn7d ?? 0,
      limitStatus: rateLimitData?.limitStatus ?? 'allowed',
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
      this.lastProjectCosts = await getAllProjectCosts();
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
      // Compute prediction before firing so getLastPrediction() is fresh in listeners
      await this.getPrediction().catch(() => {});
      this._onDidUpdate.fire(data);
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
      this._onDidUpdate.fire(data);
    } catch {
      // ignore refresh errors
    }
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

  getLastData(): ClaudeUsageData | undefined {
    return this.lastData;
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidUpdate.dispose();
  }
}
