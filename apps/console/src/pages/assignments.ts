import { assignmentHistory, listAssignments, type AssignmentStatus } from '../../../../services/core-api/src/assignments.ts';
import { e, panel, shell, table, tag } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Admin → Aufträge → Anforderungen (Funktion 156): prüfbare Auftragsanforderungen mit Versionen, Rückfragen und Kundenbestätigung. */

const STATUS: Record<AssignmentStatus, { text: string; tone: 'ok' | 'pending' | 'bad' | 'neutral' }> = {
  READY_FOR_QUOTE: { text: 'Angebotsreif', tone: 'ok' },
  ASSIGNMENT_AMBIGUOUS: { text: 'Rückfrage nötig', tone: 'pending' },
  REVIEW: { text: 'Manuelle Prüfung', tone: 'pending' },
  CAPABILITY_PENDING: { text: 'Noch nicht herstellbar', tone: 'neutral' },
  COST_APPROVAL_REQUIRED: { text: 'Kostenfreigabe nötig', tone: 'bad' },
  CAPABILITY_BLOCKED: { text: 'Gesperrt', tone: 'bad' },
};
const DOMAIN: Record<string, string> = {
  'software-native': 'Programm mit Installer', 'software-mobile': 'Mobile App', 'software-web': 'Webanwendung', 'office-excel': 'Excel-Datei', 'office-word': 'Word-Dokument',
  'office-slides': 'Präsentation', 'office-calc': 'Kalkulation', 'media-video': 'Video', 'media-audio': 'Audio', 'media-3d': '3D', 'media-graphics': 'Grafik',
  'api-integration': 'Schnittstelle/Automation', research: 'Recherche', unknown: 'Unklar',
};
const st = (s: AssignmentStatus): string => tag(STATUS[s]?.text ?? s, STATUS[s]?.tone ?? 'neutral');
const fmt = (iso: string): string => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' });
const list = (items: string[], empty = '–'): string => (items.length ? `<ul style="margin:4px 0 0;padding-left:20px">${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : `<span class="muted">${e(empty)}</span>`);
const BASE = '/dashboard/auftraege/anforderungen';

function postForm(pc: PageCtx, action: string, back: string, inner: string, button: string, what: string): string {
  return `<form class="action" method="post" action="${e(action)}" style="display:grid;gap:8px;max-width:720px"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}">${inner}
<p style="margin:4px 0 0"><button class="btn" type="submit">${e(button)}</button> <span class="what">${e(what)}</span></p></form>`;
}

export function renderAssignments(pc: PageCtx): string {
  const rows = listAssignments(pc.ctx, 100);
  const body = `${panel({
    title: 'Neue Anforderung aus einer Kundenanfrage', sub: 'Text einfügen, wie der Kunde ihn geschrieben hat (E-Mail, Telefonnotiz, Plattform). Anfragen über die Website landen automatisch hier.',
    body: postForm(pc, '/admin/anforderungen', BASE, `<label for="asg-text">Kundenwunsch</label><textarea id="asg-text" name="text" required rows="6" maxlength="20000" placeholder="z. B. Wir brauchen ein Windows-Programm für Lager und Rechnungen, drei Mitarbeiter …"></textarea>
<label for="asg-ch">Woher kam die Anfrage?</label><input id="asg-ch" type="text" name="channel" value="owner-entry" maxlength="40">`, 'Anforderung erstellen', 'Erkennt Produktart, Plattform, Lieferumfang und Abnahmekriterien – mit Rückfragen statt Vermutungen. Kein Preis, keine Zusage.'),
  })}
${panel({
    title: 'Alle Anforderungen', sub: 'Neueste Version je Kundenwunsch', flush: true,
    body: table(
      [{ label: 'Anforderung' }, { label: 'Produktart' }, { label: 'Stand' }, { label: 'Bestätigt' }],
      rows.map((r) => [
        `<a href="${e(`${BASE}/${r.scope_id}`)}"><strong>${e(r.source_text.slice(0, 80))}${r.source_text.length > 80 ? '…' : ''}</strong></a><span class="sub">Version ${r.revision} · ${e(r.channel)} · ${e(fmt(r.created_at))}</span>`,
        e(DOMAIN[r.domain] ?? r.domain),
        st(r.status),
        r.confirmed ? tag('vom Kunden bestätigt', 'ok') : tag('offen', 'neutral'),
      ]),
      'Noch keine Anforderungen',
      'Auftragsanforderungen',
    ),
  })}`;
  return shell({ title: 'Anforderungen', eyebrow: 'Aufträge', heading: 'Auftragsanforderungen', lead: 'Aus jedem Kundenwunsch wird eine prüfbare Anforderung: was genau geliefert wird, für welche Plattform und woran die Abnahme gemessen wird.', active: 'auftraege', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}

export function renderAssignmentDetail(pc: PageCtx, scopeId: string): string | null {
  const h = assignmentHistory(pc.ctx, scopeId);
  const latest = h[0];
  if (!latest) return null;
  const s = latest.spec;
  const back = `${BASE}/${scopeId}`;
  const reqs = s.requirements.map((r) => [tag(r.level, r.level === 'MUSS' ? 'ok' : r.level === 'SOLL' ? 'pending' : 'neutral'), e(r.text), r.origin === 'customer' ? 'Kunde' : 'Produktart']);
  const confirmable = latest.row.status !== 'ASSIGNMENT_AMBIGUOUS' && latest.row.status !== 'REVIEW' && !latest.confirmation;
  const body = `${panel({
    title: `Version ${latest.row.revision}: ${DOMAIN[s.domain] ?? s.domain}`, sub: `${STATUS[latest.row.status]?.text ?? latest.row.status} · ${s.capability.reason}`,
    body: `<dl class="kv">
<dt>Stand</dt><dd>${st(latest.row.status)}</dd>
<dt>Plattformen</dt><dd>${e(s.platforms.join(', ') || 'nicht genannt')}${s.architectures.length ? ` · ${e(s.architectures.join(', '))}` : ''}</dd>
<dt>Fachbereiche</dt><dd>${e(s.businessAreas.join(', ') || '–')}</dd>
<dt>Formate</dt><dd>${e(s.formats.join(', ') || '–')}</dd>
<dt>Sprache · Termin</dt><dd>${e(s.language.toUpperCase())} · ${e(s.deadline ?? 'nicht genannt')}</dd>
<dt>Rückfragen an den Kunden</dt><dd>${list(s.questions, 'keine')}</dd>
<dt>Konflikte</dt><dd>${list(s.conflicts, 'keine')}</dd>
<dt>Zur Prüfung markiert</dt><dd>${list(s.reviewFlags, 'nichts')}</dd>
<dt>Lieferumfang</dt><dd>${list(s.deliverables)}</dd>
<dt>Abnahmekriterien</dt><dd>${list(s.acceptanceCriteria)}</dd>
<dt>Abhängigkeiten</dt><dd>${list(s.dependencies, 'keine erkannt')}</dd>
<dt>Lizenzen/Rechte</dt><dd>${list(s.licences, '–')}</dd>
<dt>Anhänge</dt><dd>${s.attachments.length ? list(s.attachments.map((a) => `${a.name} · ${a.bytes} Bytes · ${a.sha256.slice(0, 12)}…${a.injectionHints ? ' · anweisungsähnlicher Text ignoriert' : ''}`)) : '<span class="muted">keine</span>'}</dd>
</dl>`,
  })}
${panel({ title: 'Anforderungen (MUSS / SOLL / OPTIONAL)', sub: 'Aus dem Kundentext und aus dem Liefernachweis der Produktart', flush: true, body: table([{ label: 'Stufe' }, { label: 'Anforderung', full: true }, { label: 'Herkunft' }], reqs, 'Keine Anforderungen erkannt', 'Anforderungen') })}
${panel({
    title: 'Neue Version', sub: 'Nach Antwort des Kunden oder bei Änderungswunsch. Die bisherige Version bleibt unverändert erhalten.',
    body: postForm(pc, `/admin/anforderungen/${scopeId}/version`, back, `<label for="asg-rev">Vollständiger, aktualisierter Kundenwunsch</label><textarea id="asg-rev" name="text" required rows="6" maxlength="20000">${e(latest.row.source_text)}</textarea>`, 'Version speichern', latest.confirmation ? 'Diese Version ist bestätigt – eine Änderung wird als Änderungsauftrag mit neuer Preisprüfung geführt.' : 'Wird erneut geprüft.'),
  })}
${confirmable ? panel({
    title: 'Kundenbestätigung erfassen', sub: 'Nur wenn der Kunde genau diese Version bestätigt hat',
    body: postForm(pc, `/admin/anforderungen/${scopeId}/bestaetigen`, back, `<input type="hidden" name="revision" value="${latest.row.revision}"><label for="asg-ev">Beleg der Bestätigung</label><input id="asg-ev" type="text" name="evidence" required minlength="3" maxlength="500" placeholder="z. B. E-Mail vom 13.11.2026, 10:42">`, 'Bestätigung speichern', 'Verknüpft mit der Prüfsumme des exakten Textes dieser Version.'),
  }) : ''}
${panel({
    title: 'Verlauf', sub: 'Alle Versionen mit Originaltext und Prüfsumme', flush: true,
    body: table(
      [{ label: 'Version' }, { label: 'Originaltext', full: true }, { label: 'Stand' }, { label: 'Bestätigung' }],
      h.map((x) => [`${x.row.revision}<span class="sub">${e(fmt(x.row.created_at))}</span>`, `${e(x.row.source_text)}<span class="sub">SHA-256 ${e(x.row.source_sha256.slice(0, 16))}…</span>`, st(x.row.status), x.confirmation ? `${tag(x.confirmation.confirmed_by === 'customer' ? 'Kunde' : 'erfasst', 'ok')}<span class="sub">${e(x.confirmation.evidence)}</span>` : '–']),
      'Kein Verlauf',
      'Versionen',
    ),
  })}
<p><a href="${e(BASE)}">← Alle Anforderungen</a></p>`;
  return shell({ title: 'Anforderung', eyebrow: 'Aufträge · Anforderungen', heading: s.questions.length ? 'Anforderung mit offenen Fragen' : 'Auftragsanforderung', lead: 'Was genau geliefert wird, für welche Plattform und woran die Abnahme gemessen wird. Preise entstehen erst im Angebot.', active: 'auftraege', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
