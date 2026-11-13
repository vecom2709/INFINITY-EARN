import { activeStops } from '../../core-api/src/policy-store.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { latestProbe } from '../../product-factory/src/external-build.ts';
import { getCapability, routeCapability } from '../../product-factory/src/registry.ts';
import type { JobRow } from './queue.ts';
import { aiQuotaAvailable, freeTierThrottled, getUsage } from './quota.ts';

/**
 * INFINITY EARN 16.0 – Job Director / Production Router.
 * Ordnet jede Arbeit einer Ausführungsumgebung zu und sagt ehrlich, ob sie JETZT machbar ist.
 * Nur was hier als machbar gilt, darf verbindlich zugesagt werden. Alle Angaben stammen aus echten Zuständen
 * (Konfiguration, Datenbank, letzter Probebau) – nichts wird geschätzt oder vorgetäuscht.
 */

export type EnvironmentId = 'worker' | 'github-windows' | 'ai-claude' | 'macos' | 'linux-desktop' | 'mobile' | 'media';
export interface EnvironmentStatus { id: EnvironmentId; label: string; available: boolean; reason: string; cost: string }

export type WorkType =
  | 'kalkulation' | 'office' | 'web-software' | 'windows-exe' | 'macos-linux' | 'mobile-app' | 'webdesign' | 'text' | 'grafik-medien'
  | 'kundengespraech' | 'angebot' | 'qualitaetssicherung' | 'auslieferung' | 'kundenbetreuung' | 'individuelle-software';

/** Arbeitstyp → Umgebung. Deterministische Abläufe laufen im Worker; kreative/individuelle Arbeit braucht KI. */
export const WORK_ROUTES: Record<WorkType, { env: EnvironmentId; capabilities: string[]; note: string }> = {
  kalkulation: { env: 'worker', capabilities: ['b2b-calc-csv', 'b2b-calc-pdf', 'b2b-calc-bundle'], note: 'Kalkulation als CSV/PDF/Paket – vollautomatisch' },
  office: { env: 'worker', capabilities: ['b2b-calc-csv', 'b2b-calc-bundle'], note: 'Nur die freigegebenen Office-Formate (Kalkulationen); freie Office-Dokumente brauchen KI' },
  'web-software': { env: 'worker', capabilities: ['mini-ww'], note: 'Mini-Warenwirtschaft (Browser-Programm) – vollautomatisch' },
  'windows-exe': { env: 'github-windows', capabilities: ['win-lager'], note: 'Echtes Windows-Programm, gebaut auf dem GitHub-Windows-Server' },
  'macos-linux': { env: 'macos', capabilities: [], note: 'Kein Mac/Linux-Desktop-Build eingerichtet' },
  'mobile-app': { env: 'mobile', capabilities: [], note: 'Kein Android/iOS-Build eingerichtet (Apple-Konto kostet Geld)' },
  webdesign: { env: 'ai-claude', capabilities: [], note: 'Individuelle Gestaltung braucht KI' },
  text: { env: 'ai-claude', capabilities: [], note: 'Texterstellung braucht KI' },
  'grafik-medien': { env: 'media', capabilities: [], note: 'Keine lizenzierte Bild-/Video-Engine' },
  kundengespraech: { env: 'ai-claude', capabilities: [], note: 'Freie Antworten brauchen KI; Standardantworten (Berater, Status) laufen ohne' },
  angebot: { env: 'worker', capabilities: [], note: 'Angebote für freigegebene Produktarten werden deterministisch berechnet' },
  qualitaetssicherung: { env: 'worker', capabilities: [], note: 'Abnahmeprüfung je Produktart – automatisch' },
  auslieferung: { env: 'worker', capabilities: [], note: 'Signierte Download-Links nach bestätigter Zahlung und bestandener Prüfung' },
  kundenbetreuung: { env: 'worker', capabilities: [], note: 'Portal, Status, Nachsorge, Änderungswünsche – ohne KI' },
  'individuelle-software': { env: 'ai-claude', capabilities: [], note: 'Individuelle Programmierung braucht KI und eine isolierte Testumgebung' },
};

const PROBE_MAX_AGE_MS = 14 * 86_400_000;

/** Ehrlicher Stand jeder Ausführungsumgebung. */
export function environments(ctx: AppContext): EnvironmentStatus[] {
  const probe = latestProbe(ctx);
  const probeOk = probe?.state === 'DONE' && probe.qa_passed === 1 && ctx.clock().getTime() - Date.parse(probe.updated_at) < PROBE_MAX_AGE_MS;
  const win = !ctx.config.buildAgentToken
    ? { available: false, reason: 'Bau-Agent nicht eingerichtet (BUILD_AGENT_TOKEN fehlt)' }
    : probeOk
      ? { available: true, reason: `Letzter Probebau bestanden (${probe?.updated_at.slice(0, 10)})` }
      : { available: false, reason: probe ? `Letzter Probebau ${probe.state === 'DONE' ? 'älter als 14 Tage' : probe.state}` : 'Noch kein bestandener Probebau' };
  return [
    { id: 'worker', label: 'Cloudflare Worker (24/7)', available: !freeTierThrottled(ctx), reason: freeTierThrottled(ctx) ? 'Tageskontingent des kostenlosen Tarifs fast erreicht – gedrosselt' : `Takt jede Minute, ${getUsage(ctx, 'platform_requests')} Anfragen heute`, cost: '0 € (Free-Tarif)' },
    { id: 'github-windows', label: 'GitHub-Windows-Server', ...win, cost: '0 € (öffentliches Repository)' },
    { id: 'ai-claude', label: 'Claude (KI-Produktion)', available: false, reason: aiQuotaAvailable(ctx) ? 'Kontingent freigegeben, aber kein offiziell erlaubter automatischer Ausführungsweg eingerichtet' : 'Kein automatischer KI-Ausführungsweg eingerichtet (AI_DAILY_TASK_LIMIT=0). Abo ist keine 24/7-API; API-Schlüssel kostet Geld und braucht deine Freigabe.', cost: '—' },
    { id: 'macos', label: 'macOS/Linux-Desktop', available: false, reason: 'Nicht eingerichtet', cost: '—' },
    { id: 'mobile', label: 'Android/iOS', available: false, reason: 'Nicht eingerichtet (Apple-Entwicklerkonto kostenpflichtig)', cost: '—' },
    { id: 'media', label: 'Grafik/Video', available: false, reason: 'Keine lizenzierte Engine', cost: '—' },
  ];
}

export interface Assessment { workType: WorkType; env: EnvironmentId; feasible: boolean; status: 'READY' | 'RESOURCE_BLOCKED' | 'AI_QUOTA_BLOCKED' | 'OWNER_APPROVAL_REQUIRED'; blockers: string[]; note: string }

/** Darf diese Arbeit jetzt verbindlich zugesagt werden? Prüft Umgebung, Produktart, Standard-Akte und Notstopp. */
export function assess(ctx: AppContext, workType: WorkType, capabilityId?: string): Assessment {
  const route = WORK_ROUTES[workType];
  const env = environments(ctx).find((e) => e.id === route.env) as EnvironmentStatus;
  const blockers: string[] = [];
  if (!env.available) blockers.push(`${env.label}: ${env.reason}`);
  if (capabilityId) {
    if (!route.capabilities.includes(capabilityId)) blockers.push(`Produktart ${capabilityId} passt nicht zu ${workType}`);
    const r = routeCapability(capabilityId);
    if (!r.ok) blockers.push(r.reason);
  } else if (route.env !== 'worker' && route.capabilities.length === 0) {
    blockers.push('Keine geprüfte Produktart für diese Arbeit');
  }
  const stops = activeStops(ctx);
  if (stops.has('STOP_ALL_JOBS') || stops.has('PAUSE_PRODUCTION')) blockers.push('Produktion per Stopp-Schalter angehalten');
  const stopped = blockers.some((x) => x.includes('Stopp-Schalter'));
  const status: Assessment['status'] = blockers.length === 0 ? 'READY' : route.env === 'ai-claude' ? 'AI_QUOTA_BLOCKED' : stopped && blockers.length === 1 ? 'OWNER_APPROVAL_REQUIRED' : 'RESOURCE_BLOCKED';
  return { workType, env: route.env, feasible: blockers.length === 0, status, blockers, note: route.note };
}

/** Einheitlicher Job-Status (16.0) aus dem tatsächlichen Warteschlangen-Zustand. */
/** QA_PENDING: Abnahme läuft synchron direkt nach dem Bau bzw. Hochladen – der Zustand ist daher nie dauerhaft sichtbar. */
export type JobStatus = 'WAITING' | 'READY' | 'RUNNING' | 'QA_PENDING' | 'COMPLETED' | 'FAILED' | 'RETRY_SCHEDULED' | 'AI_QUOTA_BLOCKED' | 'RESOURCE_BLOCKED' | 'OWNER_APPROVAL_REQUIRED';
export const JOB_STATUSES: JobStatus[] = ['WAITING', 'READY', 'RUNNING', 'QA_PENDING', 'COMPLETED', 'FAILED', 'RETRY_SCHEDULED', 'AI_QUOTA_BLOCKED', 'RESOURCE_BLOCKED', 'OWNER_APPROVAL_REQUIRED'];

export function jobStatus(job: Pick<JobRow, 'state' | 'reason' | 'next_run_at'>, now: Date): JobStatus {
  const r = job.reason ?? '';
  switch (job.state) {
    case 'RUNNING': return 'RUNNING';
    case 'SUCCEEDED': return 'COMPLETED';
    case 'DEAD_LETTER':
    case 'REJECTED': return 'FAILED';
    case 'HUMAN_REVIEW': return 'OWNER_APPROVAL_REQUIRED';
    case 'BLOCKED_CAPACITY': return 'RESOURCE_BLOCKED';
    case 'FAILED_RETRY': return 'RETRY_SCHEDULED';
    case 'QUEUED':
      if (r === 'AI_QUOTA_EXHAUSTED') return 'AI_QUOTA_BLOCKED';
      if (r === 'FREE_TIER_THROTTLE') return 'RESOURCE_BLOCKED';
      if (r || (job.next_run_at && Date.parse(job.next_run_at) > now.getTime())) return 'WAITING';
      return 'READY';
    default: return 'WAITING';
  }
}

export type AutopilotState = 'AKTIV' | 'EINGESCHRÄNKT' | 'WARTET AUF KI' | 'WARTET AUF FREIGABE' | 'FEHLER' | 'ANGEHALTEN';
export interface AutopilotStatus {
  state: AutopilotState; reasons: string[]; lastTickAt: string | null; tickAgeSeconds: number | null;
  jobs: Record<JobStatus, number>; environments: EnvironmentStatus[]; stops: string[]; deadLetters24h: number;
}

/** Autopilot-Status aus echten Messwerten: letzter Takt, Stopps, Job-Zustände, Umgebungen. */
export function autopilotStatus(ctx: AppContext): AutopilotStatus {
  const now = ctx.clock();
  const last = ctx.db.get<{ created_at: string }>(`SELECT created_at FROM jobs WHERE kind = 'autopilot' ORDER BY created_at DESC LIMIT 1`)?.created_at ?? null;
  const age = last ? Math.round((now.getTime() - Date.parse(last)) / 1000) : null;
  const jobs = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  const rows = ctx.db.all<Pick<JobRow, 'state' | 'reason' | 'next_run_at'>>(`SELECT state, reason, next_run_at FROM jobs WHERE kind NOT IN ('autopilot') AND kind NOT LIKE 'acquire:%' AND (state NOT IN ('SUCCEEDED','REJECTED','DEAD_LETTER') OR updated_at >= ?)`, new Date(now.getTime() - 86_400_000).toISOString());
  for (const r of rows) jobs[jobStatus(r, now)]++;
  const stops = [...activeStops(ctx)];
  const dead = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM jobs WHERE state = 'DEAD_LETTER' AND updated_at >= ?`, new Date(now.getTime() - 86_400_000).toISOString())?.n ?? 0;
  const envs = environments(ctx);
  const reasons: string[] = [];
  let state: AutopilotState = 'AKTIV';
  if (stops.includes('STOP_ALL_JOBS')) {
    state = 'ANGEHALTEN';
    reasons.push('Stopp-Schalter „Alle Jobs“ ist aktiv');
  } else if (age === null || age > 300) {
    state = 'FEHLER';
    reasons.push(age === null ? 'Noch kein Autopilot-Takt aufgezeichnet' : `Letzter Takt vor ${Math.round(age / 60)} Minuten (erwartet: jede Minute)`);
  } else if (dead > 0) {
    state = 'FEHLER';
    reasons.push(`${dead} Job(s) in den letzten 24 Stunden endgültig gescheitert`);
  } else if (jobs.OWNER_APPROVAL_REQUIRED > 0) {
    state = 'WARTET AUF FREIGABE';
    reasons.push(`${jobs.OWNER_APPROVAL_REQUIRED} Job(s) warten auf deine Prüfung`);
  } else if (jobs.AI_QUOTA_BLOCKED > 0) {
    state = 'WARTET AUF KI';
    reasons.push(`${jobs.AI_QUOTA_BLOCKED} Job(s) warten auf einen KI-Ausführungsweg`);
  } else if (stops.length > 0 || jobs.RESOURCE_BLOCKED > 0) {
    state = 'EINGESCHRÄNKT';
    if (stops.length) reasons.push(`Pausiert: ${stops.join(', ')}`);
    if (jobs.RESOURCE_BLOCKED) reasons.push(`${jobs.RESOURCE_BLOCKED} Job(s) ohne verfügbare Ressource`);
  }
  if (state === 'AKTIV') reasons.push('Takt läuft, keine blockierten Jobs');
  return { state, reasons, lastTickAt: last, tickAgeSeconds: age, jobs, environments: envs, stops, deadLetters24h: dead };
}

/** Prüft, ob eine Produktart zu einem Arbeitstyp gehört (für Anzeige und Angebotsprüfung). */
export function workTypeOf(capabilityId: string): WorkType | null {
  if (!getCapability(capabilityId)) return null;
  const hit = (Object.entries(WORK_ROUTES) as [WorkType, (typeof WORK_ROUTES)[WorkType]][]).find(([, r]) => r.capabilities.includes(capabilityId));
  return hit ? hit[0] : null;
}
