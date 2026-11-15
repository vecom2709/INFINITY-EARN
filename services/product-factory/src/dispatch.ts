import { cronTick } from '../../ai-orchestrator/src/queue.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { pendingBuilds, type Platform } from './external-build.ts';

/**
 * Sofort-Auslöser für externe Läufe (17.0). Gemessen am 14.–15.11.2026: GitHub startet den 15-Minuten-Zeitplan
 * dieses Repositories tatsächlich nur alle 3,7 bis 7,3 Stunden (Median 6,4 h). Wartet ein Bau- oder KI-Auftrag,
 * stößt der Worker deshalb den passenden Workflow direkt an (workflow_dispatch) – sofern der Eigentümer ein
 * GitHub-Token mit dem Recht „Actions: schreiben“ nur für dieses Repository hinterlegt hat (GITHUB_DISPATCH_TOKEN,
 * GITHUB_REPOSITORY). Ohne Token bleibt es beim Zeitplan; der Leitstand nennt dann die gemessene Wartezeit.
 * Übertragen wird nur „starte den Workflow“ – keine Kundendaten.
 */
export const MEASURED_SCHEDULE = { minMinutes: 221, medianMinutes: 384, maxMinutes: 439, measuredOn: '2026-11-15', runs: 9 } as const;
export const DISPATCH_MIN_INTERVAL_MS = 10 * 60_000;
const WORKFLOWS: Record<Platform, string> = { windows: 'win-build.yml', 'ai-claude': 'ai-job.yml' };

export type DispatchFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;
export interface DispatchResult { platform: Platform; outcome: 'NOT_CONFIGURED' | 'NOTHING_PENDING' | 'THROTTLED' | 'DISPATCHED' | 'FAILED'; status?: number }

export function dispatchConfigured(ctx: AppContext): boolean {
  return !!ctx.config.githubDispatch;
}

/** Erwartete Wartezeit bis zum Start eines externen Laufs – ehrlich, aus Konfiguration und Messung. */
export function expectedStartDelay(ctx: AppContext): { minutes: number; text: string } {
  return dispatchConfigured(ctx)
    ? { minutes: 15, text: 'Start in wenigen Minuten (Sofort-Auslöser aktiv)' }
    : { minutes: MEASURED_SCHEDULE.maxMinutes, text: `Start nach GitHub-Zeitplan: gemessen alle ${Math.round(MEASURED_SCHEDULE.minMinutes / 60)}–${Math.round(MEASURED_SCHEDULE.maxMinutes / 60)} Stunden (Stand ${MEASURED_SCHEDULE.measuredOn})` };
}

/** Im Takt aufgerufen: je Plattform höchstens ein Anstoß pro 10 Minuten, nur wenn wirklich etwas wartet. */
export async function dispatchPending(ctx: AppContext, fetchFn: DispatchFetch): Promise<DispatchResult[]> {
  const out: DispatchResult[] = [];
  for (const platform of ['windows', 'ai-claude'] as Platform[]) {
    const cfg = ctx.config.githubDispatch;
    if (!cfg) { out.push({ platform, outcome: 'NOT_CONFIGURED' }); continue; }
    if (pendingBuilds(ctx, platform) === 0) { out.push({ platform, outcome: 'NOTHING_PENDING' }); continue; }
    if (!cronTick(ctx, `dispatch:${platform}`, DISPATCH_MIN_INTERVAL_MS).created) { out.push({ platform, outcome: 'THROTTLED' }); continue; }
    try {
      const r = await fetchFn(`https://api.github.com/repos/${cfg.repository}/actions/workflows/${WORKFLOWS[platform]}/dispatches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'build-dispatch', 'content-type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      });
      const ok = r.status === 204;
      ctx.audit.record({ type: ok ? 'build.dispatch_sent' : 'build.dispatch_failed', actor: 'system', subjectType: 'workflow', subjectId: WORKFLOWS[platform], data: { status: r.status }, testMode: ctx.config.testMode });
      out.push({ platform, outcome: ok ? 'DISPATCHED' : 'FAILED', status: r.status });
    } catch {
      ctx.audit.record({ type: 'build.dispatch_failed', actor: 'system', subjectType: 'workflow', subjectId: WORKFLOWS[platform], data: { status: 0 }, testMode: ctx.config.testMode });
      out.push({ platform, outcome: 'FAILED', status: 0 });
    }
  }
  return out;
}
