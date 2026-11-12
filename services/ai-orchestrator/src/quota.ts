import type { AppContext } from '../../core-api/src/context.ts';

/**
 * Kontingente. Das Claude-Abo bietet keine maschinenlesbare Restkontingent-API; das Tageslimit
 * ist daher ein vom Eigentümer gepflegter Schätzwert (AI_DAILY_TASK_LIMIT, Standard 0 = keine
 * automatisch gestarteten KI-Jobs). Free-Tier-Zähler werden lokal gemessen.
 */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

export function getUsage(ctx: AppContext, counter: string): number {
  return ctx.db.get<{ used: number }>('SELECT used FROM usage_counters WHERE counter = ? AND window_key = ?', counter, dayKey(ctx.clock()))?.used ?? 0;
}

export function incrementUsage(ctx: AppContext, counter: string, by = 1): number {
  const key = dayKey(ctx.clock());
  ctx.db.run(
    `INSERT INTO usage_counters (counter, window_key, used) VALUES (?, ?, ?)
     ON CONFLICT (counter, window_key) DO UPDATE SET used = used + excluded.used`,
    counter,
    key,
    by,
  );
  return getUsage(ctx, counter);
}

export function aiQuotaAvailable(ctx: AppContext): boolean {
  return getUsage(ctx, 'ai_tasks') < ctx.config.ai.dailyTaskLimit;
}

/** Drosselung ab FREE_TIER_THROTTLE_AT_BPS des Tageslimits (IE-095). */
export function freeTierThrottled(ctx: AppContext): boolean {
  const used = getUsage(ctx, 'platform_requests');
  return used * 10000 >= ctx.config.freeTier.dailyRequestLimit * ctx.config.freeTier.throttleAtBps;
}
