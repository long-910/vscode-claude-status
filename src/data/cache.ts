import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RateLimitData } from './apiClient';

interface CacheFile {
  version: 2
  updatedAt: string
  usageData: {
    utilization5h: number
    utilization7d: number
    // Unix timestamps in seconds (absolute, not relative) so that remaining
    // time can be recalculated correctly after reading a stale cache entry.
    reset5hAt: number
    reset7dAt: number
    limitStatus: string
  }
}

function getCachePath(): string {
  return path.join(os.homedir(), '.claude', 'vscode-claude-status-cache.json');
}

export async function readCache(): Promise<CacheFile | null> {
  try {
    const content = await fs.readFile(getCachePath(), 'utf-8');
    const parsed = JSON.parse(content) as CacheFile;
    if (parsed.version !== 2) { return null; }  // v1 caches used relative times; reject them
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache(data: RateLimitData): Promise<void> {
  const nowSec = Date.now() / 1000;
  const cache: CacheFile = {
    version: 2,
    updatedAt: new Date().toISOString(),
    usageData: {
      utilization5h: data.utilization5h,
      utilization7d: data.utilization7d,
      // Store absolute reset timestamps so remaining time stays correct
      reset5hAt: nowSec + data.resetIn5h,
      reset7dAt: nowSec + data.resetIn7d,
      limitStatus: data.limitStatus,
    },
  };
  try {
    await fs.writeFile(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // ignore write failures (e.g. read-only FS)
  }
}

export function isCacheValid(cache: CacheFile, ttlSeconds: number): boolean {
  const age = (Date.now() - new Date(cache.updatedAt).getTime()) / 1000;
  return age < ttlSeconds;
}

export function getCacheAge(cache: CacheFile): number {
  return (Date.now() - new Date(cache.updatedAt).getTime()) / 1000;
}
