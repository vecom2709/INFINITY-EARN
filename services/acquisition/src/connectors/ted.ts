import { newId, sha256Hex } from '../../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../../core-api/src/context.ts';
import { activeStops } from '../../../core-api/src/policy-store.ts';
import { ingestSourceItem } from '../leads.ts';
import { scoreItem, type Score, type ScoringTarget, B2B_CALC_TARGET } from '../scoring.ts';
import { checkSourceCompliance, getSource } from '../sources.ts';

/**
 * Lesender Connector für die öffentliche TED-Search-API v3 (anonym, frei wiederverwendbar).
 * - Läuft nur, wenn der Eigentümer die Quelle freigegeben hat (PERSIST) – sonst BLOCKED.
 * - Keine personenbezogenen Daten in Anfragen, generischer User-Agent.
 * - Seitenbegrenzung + Pause zwischen Seiten (weit unter der Fair-Use-Grenze von 700 Anfragen/Minute).
 * - Leads aus TED haben KEINEN Kontaktkanal: Einreichung nur manuell über das Vergabeverfahren.
 */
export const TED_SOURCE_ID = 'src_ted_eu';
export const TED_DEFAULT_URL = 'https://api.ted.europa.eu/v3/notices/search';
export const TED_FIELDS = [
  'publication-number', 'notice-title', 'buyer-name', 'buyer-country', 'classification-cpv',
  'publication-date', 'deadline-receipt-tender-date-lot', 'notice-type',
] as const;
const LANG_PREFERENCE = ['deu', 'eng', 'ita', 'fra'];
const MAX_RAW_BYTES = 20_000;

export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface TedNotice {
  publicationNumber: string;
  title: string;
  buyer: string | null;
  country: string | null;
  cpv: string[];
  noticeType: string | null;
  publishedAt: string | null;
  deadline: string | null;
  url: string;
  raw: unknown;
}

export const tedDate = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, '');

export function buildTedQuery(cpv: readonly string[], since: Date): string {
  const codes = cpv.filter((c) => /^\d{8}$/.test(c));
  if (codes.length === 0) throw new Error('NO_VALID_CPV');
  return `classification-cpv IN (${codes.join(' ')}) AND publication-date>=${tedDate(since)}`;
}

function pickLang(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(' / ') || null;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const l of [...LANG_PREFERENCE, ...Object.keys(o)]) {
      const s = pickLang(o[l]);
      if (s) return s;
    }
  }
  return null;
}

const firstString = (v: unknown): string | null => (Array.isArray(v) ? (v.find((x) => typeof x === 'string') as string | undefined) ?? null : typeof v === 'string' ? v : null);

/** Antwort validieren; fehlerhafte Einträge werden übersprungen statt geraten. */
export function parseTedResponse(json: unknown): { notices: TedNotice[]; total: number | null; skipped: number } {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (!Array.isArray(r.notices)) throw new Error('TED_RESPONSE_SHAPE');
  const notices: TedNotice[] = [];
  let skipped = 0;
  for (const n of r.notices as Record<string, unknown>[]) {
    const pn = typeof n['publication-number'] === 'string' ? n['publication-number'] : '';
    const title = pickLang(n['notice-title']);
    if (!/^\d{1,9}-\d{4}$/.test(pn) || !title) {
      skipped++;
      continue;
    }
    const cpv = Array.isArray(n['classification-cpv']) ? [...new Set((n['classification-cpv'] as unknown[]).filter((c): c is string => typeof c === 'string' && /^\d{8}$/.test(c)))] : [];
    notices.push({
      publicationNumber: pn,
      title: title.replace(/\s+/g, ' ').trim().slice(0, 500),
      buyer: pickLang(n['buyer-name'])?.slice(0, 300) ?? null,
      country: firstString(n['buyer-country']),
      cpv,
      noticeType: typeof n['notice-type'] === 'string' ? n['notice-type'] : null,
      publishedAt: firstString(n['publication-date']),
      deadline: firstString(n['deadline-receipt-tender-date-lot']),
      url: `https://ted.europa.eu/de/notice/-/detail/${pn}`,
      raw: n,
    });
  }
  return { notices, total: typeof r.totalNoticeCount === 'number' ? r.totalNoticeCount : null, skipped };
}

export interface AcquireOptions {
  mode: 'PERSIST' | 'PREVIEW';
  actor: 'owner' | 'system';
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  url?: string;
  cpv?: readonly string[];
  target?: ScoringTarget;
  sinceDays?: number;
  limit?: number;
  maxPages?: number;
}

export interface ScoredNotice extends TedNotice {
  score: Score;
}

export interface AcquireResult {
  runId: string;
  mode: 'PERSIST' | 'PREVIEW';
  status: 'OK' | 'BLOCKED' | 'ERROR';
  reason?: string;
  seen: number;
  newItems: number;
  relevant: number;
  leadsCreated: number;
  totalAvailable: number | null;
  items: ScoredNotice[];
}

function recordRun(ctx: AppContext, r: AcquireResult, request: unknown, actor: string, startedAt: string): void {
  ctx.db.run(
    `INSERT INTO source_fetch_runs (run_id, source_id, mode, status, request_json, items_seen, items_new, items_relevant, leads_created, total_available, error, actor, test_mode, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.runId, TED_SOURCE_ID, r.mode, r.status, JSON.stringify(request), r.seen, r.newItems, r.relevant, r.leadsCreated, r.totalAvailable,
    r.reason ?? null, actor, ctx.config.testMode ? 1 : 0, startedAt, ctx.clock().toISOString(),
  );
  ctx.audit.record({
    type: r.status === 'OK' ? 'source.fetched' : r.status === 'BLOCKED' ? 'source.blocked' : 'source.fetch_failed',
    actor,
    subjectType: 'source',
    subjectId: TED_SOURCE_ID,
    data: { run_id: r.runId, mode: r.mode, seen: r.seen, new: r.newItems, relevant: r.relevant, leads: r.leadsCreated, reason: r.reason },
    testMode: ctx.config.testMode,
  });
}

export async function acquireFromTed(ctx: AppContext, opts: AcquireOptions): Promise<AcquireResult> {
  const startedAt = ctx.clock().toISOString();
  const now = ctx.clock();
  const cpv = opts.cpv ?? B2B_CALC_TARGET.cpv;
  const since = new Date(now.getTime() - (opts.sinceDays ?? 14) * 86_400_000);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 2, 1), 5);
  const query = buildTedQuery(cpv, since);
  const request = { url: opts.url ?? TED_DEFAULT_URL, query, fields: TED_FIELDS, limit, maxPages };
  const result: AcquireResult = { runId: newId('run'), mode: opts.mode, status: 'OK', seen: 0, newItems: 0, relevant: 0, leadsCreated: 0, totalAvailable: null, items: [] };

  // Compliance-Gate VOR jedem Netzwerkzugriff.
  const src = getSource(ctx, TED_SOURCE_ID);
  const stops = activeStops(ctx);
  let blocked: string | null = null;
  if (stops.has('PAUSE_ACQUISITION') || stops.has('STOP_ALL_JOBS')) blocked = 'ACQUISITION_PAUSED';
  else if (opts.mode === 'PERSIST') {
    const c = checkSourceCompliance(src, now);
    if (!c.ok) blocked = c.reason;
  } else if (opts.actor !== 'owner' || src.status === 'BLOCKED' || src.status === 'PAUSED_TOS_CHANGED') {
    blocked = opts.actor !== 'owner' ? 'PREVIEW_REQUIRES_OWNER' : `SOURCE_${src.status}`;
  }
  if (blocked) {
    result.status = 'BLOCKED';
    result.reason = blocked;
    recordRun(ctx, result, request, opts.actor, startedAt);
    return result;
  }

  const fetchFn: FetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const collected: TedNotice[] = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await sleep(1100);
      const res = await fetchFn(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'infinity-earn-connector/0.2 (read-only)' },
        body: JSON.stringify({ query, fields: TED_FIELDS, limit, page }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`TED_HTTP_${res.status}`);
      const parsed = parseTedResponse(await res.json());
      result.totalAvailable = parsed.total;
      collected.push(...parsed.notices);
      if (parsed.notices.length + parsed.skipped < limit) break;
    }
  } catch (e) {
    result.status = 'ERROR';
    result.reason = (e as Error).message.slice(0, 200);
    recordRun(ctx, result, request, opts.actor, startedAt);
    return result;
  }

  const unique = [...new Map(collected.map((n) => [n.publicationNumber, n])).values()];
  result.seen = unique.length;
  result.items = unique.map((n) => ({ ...n, score: scoreItem({ title: n.title, cpv: n.cpv, noticeType: n.noticeType, deadline: n.deadline, now }, opts.target) }));
  result.relevant = result.items.filter((i) => i.score.relevant).length;

  if (opts.mode === 'PERSIST') {
    ctx.db.tx(() => {
      // Lauf zuerst anlegen (Fremdschlüssel der Nachweise); Zähler am Ende aktualisieren wäre ein UPDATE – daher Zähler vorab berechnen.
      for (const item of result.items) {
        const exists = ctx.db.get<{ item_id: string }>('SELECT item_id FROM source_items WHERE source_id = ? AND external_id = ?', TED_SOURCE_ID, item.publicationNumber);
        if (!exists) result.newItems++;
      }
      recordRun(ctx, result, request, opts.actor, startedAt);
      for (const item of result.items) {
        const raw = JSON.stringify(item.raw).slice(0, MAX_RAW_BYTES);
        const r = ctx.db.run(
          `INSERT OR IGNORE INTO source_items (item_id, source_id, external_id, url, title, buyer, country, cpv_json, notice_type, published_at, deadline_at, raw_sha256, raw_json,
             fetched_run_id, fit_score, evidence_score, risk_score, total_score, relevant, score_reasons_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          newId('itm'), TED_SOURCE_ID, item.publicationNumber, item.url, item.title, item.buyer, item.country, JSON.stringify(item.cpv), item.noticeType,
          item.publishedAt, item.deadline, sha256Hex(JSON.stringify(item.raw)), raw, result.runId, item.score.fit, item.score.evidence, item.score.risk,
          item.score.total, item.score.relevant ? 1 : 0, JSON.stringify(item.score.reasons), ctx.clock().toISOString(),
        );
        if (r.changes === 0 || !item.score.relevant) continue;
        const lead = ingestSourceItem(ctx, TED_SOURCE_ID, {
          url: item.url,
          title: item.title,
          text: [`Auftraggeber: ${item.buyer ?? 'unbekannt'}`, `CPV: ${item.cpv.join(', ')}`, `Frist: ${item.deadline ?? 'keine'}`, `Bekanntmachung: ${item.publicationNumber}`].join('\n'),
          structuredIntent: { kind: 'public_tender', reference: item.publicationNumber },
          expiresAt: item.deadline ? new Date(Date.parse(`${item.deadline.slice(0, 10)}T23:59:59Z`)).toISOString() : null,
          request: null,
        });
        ctx.db.run('UPDATE source_items SET lead_id = ? WHERE source_id = ? AND external_id = ?', lead.leadId, TED_SOURCE_ID, item.publicationNumber);
        result.leadsCreated++;
      }
      if (result.leadsCreated > 0) ctx.db.run('UPDATE source_fetch_runs SET leads_created = ? WHERE run_id = ?', result.leadsCreated, result.runId);
    });
  } else {
    recordRun(ctx, result, request, opts.actor, startedAt);
  }
  return result;
}
