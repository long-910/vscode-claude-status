import * as fs from 'fs/promises';
import { findAllJsonlFiles, calculateCost, TokenUsage } from './jsonlReader';

export interface PredictionData {
  estimatedExhaustionTime: Date | null  // null if pace is slow or unknown
  estimatedExhaustionIn: number | null  // seconds, null if safe/unknown
  currentBurnRate: number               // USD/hour (0 if < 2 entries in window)
  budgetRemaining: number | null        // null if no budget set
  budgetExhaustionTime: Date | null
  safeToStartHeavyTask: boolean
  recommendation: string
}

interface TimestampedCost {
  timestamp: number  // ms
  cost: number       // USD
}

async function readRecentCosts(windowMs: number): Promise<TimestampedCost[]> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const result: TimestampedCost[] = [];

  const files = await findAllJsonlFiles();
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) { continue; }
        try {
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          if (obj.type !== 'assistant' || typeof obj.timestamp !== 'string') { continue; }
          const ts = new Date(obj.timestamp).getTime();
          if (isNaN(ts) || ts < cutoff) { continue; }
          const msg = obj.message as { usage?: Partial<TokenUsage> } | undefined;
          if (!msg?.usage) { continue; }
          const cost = calculateCost({
            input_tokens: msg.usage.input_tokens ?? 0,
            output_tokens: msg.usage.output_tokens ?? 0,
            cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
          });
          if (cost > 0) { result.push({ timestamp: ts, cost }); }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

export function calculateBurnRate(entries: ReadonlyArray<{ timestamp: number; cost: number }>): number {
  if (entries.length < 2) { return 0; }
  const totalCost = entries.reduce((sum, e) => sum + e.cost, 0);
  const spanMs = Date.now() - entries[0].timestamp;
  const spanHours = spanMs / (1000 * 3600);
  return spanHours > 0 ? totalCost / spanHours : 0;
}

export function buildRecommendation(exhaustionIn: number): string {
  if (exhaustionIn < 600)  { return 'Less than 10 min remaining. Save your work and pause.'; }
  if (exhaustionIn < 1800) { return 'Less than 30 min remaining. Wrap up current task.'; }
  if (exhaustionIn < 3600) { return 'About 1 hour remaining. Plan your next task accordingly.'; }
  return 'Plenty of capacity. Safe to start heavy tasks.';
}

export async function computePrediction(
  utilization5h: number,
  resetIn5h: number,
  cost5h: number,
  costToday: number,
  dailyBudget: number | null,
): Promise<PredictionData> {
  const entries = await readRecentCosts(30 * 60 * 1000);
  const burnRateUsdPerHour = calculateBurnRate(entries);

  // --- Rate limit exhaustion ---
  let estimatedExhaustionTime: Date | null = null;
  let estimatedExhaustionIn: number | null = null;
  let safeToStartHeavyTask = true;
  let recommendation = 'Plenty of capacity. Safe to start heavy tasks.';

  if (utilization5h >= 1.0) {
    estimatedExhaustionTime = new Date();
    estimatedExhaustionIn = 0;
    safeToStartHeavyTask = false;
    recommendation = 'Rate limit reached. Wait for reset.';
  } else if (burnRateUsdPerHour > 0 && utilization5h > 0) {
    // Estimate total capacity: cost5h corresponds to utilization5h fraction used
    const estimatedCapacityUsd = cost5h / utilization5h;
    const remainingUsd = estimatedCapacityUsd * (1.0 - utilization5h);
    const hoursUntilExhaustion = remainingUsd / burnRateUsdPerHour;
    const secondsUntilExhaustion = hoursUntilExhaustion * 3600;
    // Cap at reset time — exhaustion can't be after the window resets
    const effectiveSeconds = Math.min(secondsUntilExhaustion, resetIn5h);

    estimatedExhaustionTime = new Date(Date.now() + effectiveSeconds * 1000);
    estimatedExhaustionIn = effectiveSeconds;
    safeToStartHeavyTask = effectiveSeconds > 1800;
    recommendation = buildRecommendation(effectiveSeconds);
  }

  // --- Budget exhaustion ---
  let budgetRemaining: number | null = null;
  let budgetExhaustionTime: Date | null = null;

  if (dailyBudget !== null) {
    const remaining = dailyBudget - costToday;
    budgetRemaining = Math.max(0, remaining);
    if (remaining <= 0) {
      budgetExhaustionTime = new Date();
    } else if (burnRateUsdPerHour > 0) {
      const hoursUntil = remaining / burnRateUsdPerHour;
      budgetExhaustionTime = new Date(Date.now() + hoursUntil * 3600 * 1000);
    }
  }

  return {
    estimatedExhaustionTime,
    estimatedExhaustionIn,
    currentBurnRate: burnRateUsdPerHour,
    budgetRemaining,
    budgetExhaustionTime,
    safeToStartHeavyTask,
    recommendation,
  };
}
