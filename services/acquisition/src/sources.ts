import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';

export interface SourceRow {
  source_id: string;
  name: string;
  base_url: string;
  source_license: string;
  automation_allowed: number;
  terms_url: string | null;
  terms_hash: string | null;
  terms_checked_at: string | null;
  status: 'APPROVED' | 'PENDING_REVIEW' | 'PAUSED_TOS_CHANGED' | 'BLOCKED';
  created_at: string;
}

export const TERMS_RECHECK_DAYS = 90;

export function getSource(ctx: AppContext, sourceId: string): SourceRow {
  const s = ctx.db.get<SourceRow>('SELECT * FROM sources WHERE source_id = ?', sourceId);
  if (!s) throw new WorkflowError('SOURCE_NOT_FOUND');
  return s;
}

/**
 * Quelle registrieren. Freigabe (APPROVED) nur durch den Eigentümer und nur mit dokumentierter
 * Lizenz, ToS-Hash und erlaubter Automatisierung. Sonst PENDING_REVIEW bzw. BLOCKED (IE-012).
 */
export function registerSource(
  ctx: AppContext,
  s: { name: string; baseUrl: string; license: string; automationAllowed: boolean; termsUrl: string; termsHash: string },
  actor: 'owner' | 'ai' | 'system',
): SourceRow {
  const now = ctx.clock().toISOString();
  let status: SourceRow['status'] = 'PENDING_REVIEW';
  if (!s.automationAllowed) status = 'BLOCKED';
  else if (actor === 'owner' && s.license && s.termsHash) status = 'APPROVED';
  const row: SourceRow = {
    source_id: newId('src'),
    name: s.name,
    base_url: s.baseUrl,
    source_license: s.license,
    automation_allowed: s.automationAllowed ? 1 : 0,
    terms_url: s.termsUrl,
    terms_hash: s.termsHash,
    terms_checked_at: now,
    status,
    created_at: now,
  };
  ctx.db.run(
    `INSERT INTO sources (source_id, name, base_url, source_license, automation_allowed, terms_url, terms_hash, terms_checked_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.source_id, row.name, row.base_url, row.source_license, row.automation_allowed, row.terms_url, row.terms_hash, row.terms_checked_at, row.status, row.created_at,
  );
  ctx.audit.record({ type: 'source.registered', actor, subjectType: 'source', subjectId: row.source_id, data: { name: s.name, status, license: s.license }, testMode: ctx.config.testMode });
  return row;
}

export function checkSourceCompliance(src: SourceRow, now: Date): { ok: true } | { ok: false; reason: string } {
  if (src.status !== 'APPROVED') return { ok: false, reason: `SOURCE_${src.status}` };
  if (src.automation_allowed !== 1) return { ok: false, reason: 'AUTOMATION_NOT_PERMITTED' };
  if (!src.terms_checked_at) return { ok: false, reason: 'TERMS_NEVER_CHECKED' };
  const ageDays = (now.getTime() - new Date(src.terms_checked_at).getTime()) / 86_400_000;
  if (src.source_id !== 'src_inbound_form' && ageDays > TERMS_RECHECK_DAYS) return { ok: false, reason: 'TERMS_RECHECK_REQUIRED' };
  return { ok: true };
}

export interface SourceListRow extends SourceRow {
  connector: string | null;
  approved_by: string | null;
  approval_evidence: string | null;
}

export function listSources(ctx: AppContext): SourceListRow[] {
  return ctx.db.all<SourceListRow>('SELECT * FROM sources ORDER BY created_at, source_id');
}

/**
 * Freigabe einer Quelle – ausschließlich durch den Eigentümer. `termsLabel` dokumentiert, welche
 * Fassung der Nutzungsbedingungen geprüft wurde (z. B. "TED legal notice geprüft 2026-11-12").
 * Startet die 90-Tage-Frist für die erneute ToS-Prüfung.
 */
export function approveSource(ctx: AppContext, sourceId: string, termsLabel: string, actor: 'owner' | 'ai' | 'system'): void {
  if (actor !== 'owner') {
    ctx.audit.record({ type: 'source.approval_denied', actor, subjectType: 'source', subjectId: sourceId, testMode: ctx.config.testMode });
    throw new WorkflowError('OWNER_REQUIRED', 'Nur der Eigentümer kann eine Quelle freigeben.');
  }
  const src = getSource(ctx, sourceId);
  if (src.automation_allowed !== 1) throw new WorkflowError('AUTOMATION_NOT_PERMITTED', 'Quelle erlaubt keine Automatisierung.');
  const label = termsLabel.trim().slice(0, 200);
  if (label.length < 5) throw new WorkflowError('TERMS_LABEL_REQUIRED', 'Bitte angeben, welche Fassung der Nutzungsbedingungen geprüft wurde.');
  ctx.db.run(`UPDATE sources SET status = 'APPROVED', terms_hash = ?, terms_checked_at = ?, approved_by = ? WHERE source_id = ?`, label, ctx.clock().toISOString(), actor, sourceId);
  ctx.audit.record({ type: 'source.approved', actor, subjectType: 'source', subjectId: sourceId, data: { terms: label }, testMode: ctx.config.testMode });
}

export function pauseSource(ctx: AppContext, sourceId: string, actor: 'owner' | 'system', reason: string): void {
  getSource(ctx, sourceId);
  ctx.db.run(`UPDATE sources SET status = 'PENDING_REVIEW' WHERE source_id = ? AND source_id <> 'src_inbound_form'`, sourceId);
  ctx.audit.record({ type: 'source.paused', actor, subjectType: 'source', subjectId: sourceId, data: { reason }, testMode: ctx.config.testMode });
}

/** ToS-Überwachung: geänderter Hash pausiert die Integration bis zur Prüfung (IE-019). */
export function recordTermsCheck(ctx: AppContext, sourceId: string, currentHash: string): SourceRow['status'] {
  const src = getSource(ctx, sourceId);
  const now = ctx.clock().toISOString();
  if (src.terms_hash !== currentHash) {
    ctx.db.run(`UPDATE sources SET status = 'PAUSED_TOS_CHANGED', terms_checked_at = ? WHERE source_id = ?`, now, sourceId);
    ctx.audit.record({ type: 'source.paused_tos_changed', actor: 'system', subjectType: 'source', subjectId: sourceId, data: { previous: src.terms_hash, current: currentHash }, testMode: ctx.config.testMode });
    return 'PAUSED_TOS_CHANGED';
  }
  ctx.db.run('UPDATE sources SET terms_checked_at = ? WHERE source_id = ?', now, sourceId);
  return src.status;
}
