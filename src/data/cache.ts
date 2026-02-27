import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RateLimitData } from './apiClient';

interface CacheFile {
  version: 1
  updatedAt: string
  usageData: {
    utilization5h: number
    utilization7d: number
    resetIn5h: number
    resetIn7d: number
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
    if (parsed.version !== 1) { return null; }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache(data: RateLimitData): Promise<void> {
  const cache: CacheFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    usageData: {
      utilization5h: data.utilization5h,
      utilization7d: data.utilization7d,
      resetIn5h: data.resetIn5h,
      resetIn7d: data.resetIn7d,
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
