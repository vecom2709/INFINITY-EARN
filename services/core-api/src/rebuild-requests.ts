import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from './context.ts';

/**
 * Auftragsart „Programm nach Vorlage“: Ein Kunde möchte ein vorhandenes Programm untersuchen und neu bauen lassen.
 * Regeln (bewusst streng):
 *  - Annahme der Anfrage nur mit ausdrücklicher Rechte-Erklärung (eigene Software oder Lizenz erlaubt die Analyse).
 *  - Jede Anfrage wartet auf die Entscheidung des Eigentümers – nichts wird automatisch zugesagt oder hergestellt.
 *  - Herstellung findet auf dem PC des Eigentümers statt (Analysewerkzeug REA), nicht rund um die Uhr.
 *  - Es wird keine Programmdatei angenommen oder gespeichert; die Vorlage wird erst nach der Annahme übergeben.
 */
export const RIGHTS_TEXT_VERSION = '2026-11-16';
export const RIGHTS_TEXT =
  'Ich versichere, dass mein Unternehmen berechtigt ist, das genannte Programm untersuchen und neu bauen zu lassen: Es ist unsere eigene Software, oder die Lizenz des Herstellers erlaubt die Analyse ausdrücklich. Mir ist bekannt, dass INFINITY EARN keine Programme Dritter ohne diese Berechtigung untersucht oder nachbaut und dass ich für die Richtigkeit dieser Erklärung einstehe.';

export const PROGRAM_KINDS = ['dotnet', 'javascript', 'web', 'native', 'unknown'] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];
export const RIGHTS_BASES = ['OWN_SOFTWARE', 'LICENSE_PERMITS'] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];
export type RebuildState = 'OWNER_APPROVAL_REQUIRED' | 'ACCEPTED' | 'DECLINED';

export interface RebuildRequestRow {
  request_id: string; status_token_hash: string; company: string; contact_email: string; program_name: string; program_kind: ProgramKind;
  description: string; rights_basis: RightsBasis; rights_detail: string; rights_text_version: string; rights_confirmed_at: string;
  state: RebuildState; owner_note: string | null; decided_at: string | null; test_mode: number; created_at: string; updated_at: string;
}

export interface RebuildInput {
  company?: string | null; email?: string | null; programName?: string | null; programKind?: string | null; description?: string | null;
  rightsBasis?: string | null; rightsDetail?: string | null; rightsConfirmed?: boolean; privacyAccepted?: boolean;
}

/** Ob die Analyse auf dem PC des Eigentümers derzeit technisch möglich ist (ohne zusätzliche Programme). */
export const KIND_INFO: Record<ProgramKind, { label: string; analysable: boolean; note: string }> = {
  dotnet: { label: '.NET-Programm (C#, VB.NET)', analysable: true, note: 'Aufbau und Schnittstellen sind auslesbar.' },
  javascript: { label: 'Electron- oder JavaScript-Programm', analysable: true, note: 'Aufbau, Module und Oberfläche sind auslesbar.' },
  web: { label: 'Web-Anwendung im Browser', analysable: true, note: 'Seiten, Abläufe und Schnittstellen sind beobachtbar.' },
  native: { label: 'Natives Programm (C, C++, Delphi u. a.)', analysable: false, note: 'Derzeit nicht analysierbar – dafür ist kein Analyseprogramm eingerichtet. Ein Neubau nach Ihrer Beschreibung bleibt möglich.' },
  unknown: { label: 'Weiß ich nicht', analysable: false, note: 'Wird bei der Prüfung geklärt.' },
};

/** Entfernt Steuerzeichen (außer Tabulator, Zeilenumbruch) und begrenzt die Länge. */
const clean = (s: string | null | undefined, max: number): string =>
  [...(s ?? '')].filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13; }).join('').trim().slice(0, max);

export function validateRebuild(input: RebuildInput): { errors: string[]; value: { company: string; email: string; programName: string; programKind: ProgramKind; description: string; rightsBasis: RightsBasis; rightsDetail: string } } {
  const errors: string[] = [];
  const company = clean(input.company, 200);
  const email = clean(input.email, 200).toLowerCase();
  const programName = clean(input.programName, 200);
  const description = clean(input.description, 4000);
  const rightsDetail = clean(input.rightsDetail, 1000);
  const programKind = (PROGRAM_KINDS as readonly string[]).includes(input.programKind ?? '') ? (input.programKind as ProgramKind) : null;
  const rightsBasis = (RIGHTS_BASES as readonly string[]).includes(input.rightsBasis ?? '') ? (input.rightsBasis as RightsBasis) : null;
  if (company.length < 2) errors.push('Bitte den Namen Ihres Unternehmens angeben.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Bitte eine gültige geschäftliche E-Mail-Adresse angeben.');
  if (programName.length < 2) errors.push('Bitte den Namen des Programms angeben.');
  if (!programKind) errors.push('Bitte die Art des Programms auswählen.');
  if (description.length < 30) errors.push('Bitte beschreiben Sie in mindestens 30 Zeichen, was das neue Programm können soll.');
  if (!rightsBasis) errors.push('Bitte angeben, worauf Ihre Berechtigung beruht.');
  if (rightsDetail.length < 10) errors.push('Bitte die Berechtigung kurz belegen (zum Beispiel „von uns 2015 entwickelt“ oder die Lizenzstelle).');
  if (input.rightsConfirmed !== true) errors.push('Ohne die Rechte-Erklärung können wir die Anfrage nicht annehmen.');
  if (input.privacyAccepted !== true) errors.push('Bitte die Datenschutzhinweise bestätigen.');
  return { errors, value: { company, email, programName, programKind: programKind ?? 'unknown', description, rightsBasis: rightsBasis ?? 'OWN_SOFTWARE', rightsDetail } };
}

/** Speichert eine geprüfte Anfrage. Der Statuslink wird nur einmal zurückgegeben und nur als Hash gespeichert. */
export function createRebuildRequest(ctx: AppContext, input: RebuildInput): { ok: true; requestId: string; statusToken: string } | { ok: false; errors: string[] } {
  const { errors, value } = validateRebuild(input);
  if (errors.length) return { ok: false, errors };
  const now = ctx.clock().toISOString();
  const requestId = newId('rbr');
  const statusToken = `${newId('st')}${newId('k')}`;
  ctx.db.run(
    `INSERT INTO rebuild_requests (request_id, status_token_hash, company, contact_email, program_name, program_kind, description, rights_basis, rights_detail, rights_text_version, rights_confirmed_at, state, test_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OWNER_APPROVAL_REQUIRED', ?, ?, ?)`,
    requestId, sha256Hex(statusToken), value.company, value.email, value.programName, value.programKind, value.description, value.rightsBasis, value.rightsDetail, RIGHTS_TEXT_VERSION, now, ctx.config.testMode ? 1 : 0, now, now,
  );
  ctx.audit.record({ type: 'rebuild.requested', actor: 'customer', subjectType: 'rebuild_request', subjectId: requestId, data: { programKind: value.programKind, rightsBasis: value.rightsBasis, rightsTextVersion: RIGHTS_TEXT_VERSION }, testMode: ctx.config.testMode });
  return { ok: true, requestId, statusToken };
}

export function rebuildByToken(ctx: AppContext, token: string): RebuildRequestRow | undefined {
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) return undefined;
  return ctx.db.get<RebuildRequestRow>('SELECT * FROM rebuild_requests WHERE status_token_hash = ?', sha256Hex(token));
}

export function listRebuildRequests(ctx: AppContext, testMode: boolean): RebuildRequestRow[] {
  return ctx.db.all<RebuildRequestRow>('SELECT * FROM rebuild_requests WHERE test_mode = ? ORDER BY created_at DESC LIMIT 100', testMode ? 1 : 0);
}

/** Entscheidung des Eigentümers – genau einmal je Anfrage. Annahme ist keine Preiszusage und startet keine Herstellung. */
export function decideRebuildRequest(ctx: AppContext, requestId: string, decision: 'ACCEPTED' | 'DECLINED', note: string): { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_DECIDED' | 'NOTE_REQUIRED' } {
  const row = ctx.db.get<RebuildRequestRow>('SELECT * FROM rebuild_requests WHERE request_id = ?', requestId);
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.state !== 'OWNER_APPROVAL_REQUIRED') return { ok: false, reason: 'ALREADY_DECIDED' };
  const ownerNote = clean(note, 1000);
  if (decision === 'DECLINED' && ownerNote.length < 5) return { ok: false, reason: 'NOTE_REQUIRED' };
  const now = ctx.clock().toISOString();
  ctx.db.run('UPDATE rebuild_requests SET state = ?, owner_note = ?, decided_at = ?, updated_at = ? WHERE request_id = ? AND state = ?', decision, ownerNote || null, now, now, requestId, 'OWNER_APPROVAL_REQUIRED');
  ctx.audit.record({ type: decision === 'ACCEPTED' ? 'rebuild.accepted' : 'rebuild.declined', actor: 'owner', subjectType: 'rebuild_request', subjectId: requestId, data: { programKind: row.program_kind }, testMode: ctx.config.testMode });
  return { ok: true };
}

export function openRebuildCount(ctx: AppContext): number {
  return ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM rebuild_requests WHERE state = 'OWNER_APPROVAL_REQUIRED' AND test_mode = ?`, ctx.config.testMode ? 1 : 0)?.n ?? 0;
}
