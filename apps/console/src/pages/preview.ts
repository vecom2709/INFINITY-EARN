import { previewDetail, previewGallery, type GalleryItem } from '../../../../services/product-factory/src/preview.ts';
import { getStandard } from '../../../../services/product-factory/src/quality-standard.ts';
import { fmtDate, friendlyTitle } from '../model.ts';
import { action, e, explain, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

/**
 * Admin → Produkte → Live-Vorschauen (Gesamtprompt §5). Echter Stand jedes produzierten Kundenprodukts mit Viewer.
 * Kein Screenshot-Ersatz: Tabelle wird aus der echten Datei gelesen, PDF öffnet im Browser-Viewer, ZIP zeigt den Inhalt.
 */
const PRODUCT: Record<string, string> = { 'b2b-calc-csv': 'Kalkulationstabelle (CSV)', 'b2b-calc-pdf': 'Kalkulation als PDF', 'b2b-calc-bundle': 'Paket (Tabelle + PDF)' };
const VIEWER: Record<GalleryItem['viewer'], string> = { table: 'Tabellenansicht', pdf: 'PDF-Viewer', zip: 'Paketinhalt + Ansicht', none: 'Noch keine Live-Vorschau verfügbar' };

function statusTag(i: GalleryItem): string {
  if (i.quarantined) return tag('Gesperrt', 'bad');
  if (i.qaPassed === false) return tag('Prüfung nicht bestanden', 'bad');
  if (i.delivered?.revoked) return tag('Lieferung zurückgezogen', 'pending');
  if (i.delivered) return tag(i.delivered.downloads ? 'Geliefert · abgerufen' : 'Geliefert', 'ok');
  if (i.qaPassed) return tag('Geprüft', 'ok');
  return tag('In Arbeit', 'pending');
}

export function renderPreviewGallery(pc: PageCtx, search: string): string {
  const items = previewGallery(pc.ctx, pc.mode === 'test', search);
  const base = withMode('/dashboard/produkte/vorschau', pc.mode);
  const body = `<form class="card" method="get" action="/dashboard/produkte/vorschau" style="margin:0 0 18px" role="search">${pc.mode === 'test' ? '<input type="hidden" name="modus" value="test">' : ''}
<div class="inline-form" style="grid-template-columns:minmax(0,1fr) auto"><label class="sr-only" for="vq">Suche</label><input id="vq" type="text" name="q" value="${e(search)}" placeholder="Kunde, Auftrag, Titel oder Prüfsumme"><button class="btn" type="submit">Suchen</button></div></form>
${panel({ title: 'Alle produzierten Kundenprodukte', sub: `${items.length} Datei${items.length === 1 ? '' : 'en'} · echter Stand aus Produktion, Prüfung und Lieferung`, flush: true, body: table(
    [{ label: 'Produkt' }, { label: 'Version' }, { label: 'Prüfung' }, { label: 'Status' }, { label: 'Vorschau', full: true }],
    items.map((i) => [
      `<strong>${e(friendlyTitle(i.title))}</strong><span class="sub">${e(i.customer ?? '—')} · ${e(fmtDate(i.createdAt, true))}</span>`,
      `v${i.version}<span class="sub">${e(PRODUCT[i.capabilityId] ?? i.capabilityId)} · Generator v${i.capabilityVersion}</span><span class="sub mono">${e(i.sha256.slice(0, 12))}…</span>`,
      i.qaPassed === null ? tag('Noch nicht geprüft', 'pending') : i.qaPassed ? tag('Bestanden', 'ok') : `${tag('Nicht bestanden', 'bad')}<span class="sub">${e(i.failedChecks.join(', '))}</span>`,
      statusTag(i),
      i.viewer === 'none' ? `<span class="muted">${VIEWER.none}</span>` : `<a href="${e(withMode(`/dashboard/produkte/vorschau/${i.artifactId}`, pc.mode))}">Öffnen</a><span class="sub">${VIEWER[i.viewer]}</span>`,
    ]),
    pc.mode === 'test' ? 'Noch keine Testprodukte produziert' : 'Noch keine echten Kundenprodukte – sie erscheinen hier automatisch, sobald ein bezahlter Auftrag produziert wird.', 'Live-Vorschauen') })}
${explain('Jede Datei wird direkt aus dem Speicher gelesen und vor der Anzeige mit ihrer Prüfsumme verglichen. Die Vorschau ist nur für dich sichtbar, verändert nichts und löst keine Zahlungen aus.')}`;
  return shell({ title: 'Live-Vorschauen', eyebrow: 'Produkte · Produktfabrik', heading: 'Live-Vorschauen', lead: 'Jedes produzierte Kundenprodukt mit echtem Stand: Version, Prüfprotokoll, Lieferung und eine echte Ansicht der Datei.', active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch(base, pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}

function renderTable(rows: string[][]): string {
  const [head, ...rest] = rows;
  return `<div class="table-wrap rawwrap" style="max-height:520px;overflow:auto;border:1px solid var(--border);border-radius:14px"><table><caption class="sr-only">Inhalt der Tabelle</caption>${head ? `<thead><tr>${head.map((c) => `<th scope="col">${e(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderPreviewDetail(pc: PageCtx, artifactId: string): string | null {
  const d = previewDetail(pc.ctx, artifactId);
  if (!d) return null;
  const file = `/admin/vorschau/${d.artifactId}/datei`;
  const viewer = d.integrity !== 'OK'
    ? `<div class="empty"><div><h3>Keine Vorschau möglich</h3><p>${d.integrity === 'MISSING' ? 'Die Datei fehlt im Speicher.' : 'Die Prüfsumme stimmt nicht – die Datei wird nicht angezeigt.'}</p></div></div>`
    : d.viewer === 'pdf'
      ? `<p style="margin:4px 0 12px">Das PDF öffnet im Viewer deines Browsers – genau die Datei, die der Kunde erhält.</p><p class="actions"><a class="btn" href="${e(file)}" target="_blank" rel="noopener">PDF öffnen</a></p>`
      : d.viewer === 'zip'
        ? `${table([{ label: 'Datei im Paket' }, { label: 'Größe' }, { label: 'CRC32' }, { label: 'Ansicht', full: true }], (d.zipEntries ?? []).map((z) => [`<strong class="mono">${e(z.name)}</strong>`, `${z.bytes} Bytes`, z.crcOk ? tag('In Ordnung', 'ok') : tag('Fehler', 'bad'), z.viewer === 'pdf' ? `<a href="${e(`${file}?datei=${encodeURIComponent(z.name)}`)}" target="_blank" rel="noopener">PDF öffnen</a>` : z.viewer === 'table' ? 'unten als Tabelle' : '—']), 'Leeres Paket', 'Paketinhalt')}${d.table ? `<h3 style="margin:18px 0 8px">Tabelle aus dem Paket</h3>${renderTable(d.table)}` : ''}`
        : d.viewer === 'table' && d.table
          ? renderTable(d.table)
          : '<div class="empty"><div><h3>Noch keine Live-Vorschau verfügbar</h3><p>Für diese Produktart gibt es noch keinen echten Viewer. Prüfsumme, Prüfprotokoll und Lieferstatus siehst du trotzdem.</p></div></div>';
  const std = getStandard(d.capabilityId);
  const body = `<p style="margin:0 0 16px"><a href="${e(withMode('/dashboard/produkte/vorschau', pc.mode))}">← Alle Live-Vorschauen</a> · <a href="${e(withMode(`/dashboard/auftraege/${d.orderId}`, pc.mode))}">Zum Auftrag</a></p>
<div class="grid2">
${panel({ title: 'Live-Vorschau', sub: `${PRODUCT[d.capabilityId] ?? d.capabilityId} · Version ${d.version} · ${d.integrity === 'OK' ? 'Prüfsumme bestätigt' : 'Integritätsproblem'}`, body: viewer })}
${panel({ title: 'Steckbrief', body: `<dl class="kv"><dt>Kunde</dt><dd>${e(d.customer ?? '—')}</dd><dt>Auftrag</dt><dd class="mono">${e(d.orderId)}</dd><dt>Erstellt</dt><dd>${e(fmtDate(d.createdAt, true))}</dd><dt>Generator</dt><dd>${e(d.capabilityId)} v${d.capabilityVersion}</dd><dt>Prüfsumme</dt><dd class="mono">${e(d.sha256)}</dd><dt>Größe</dt><dd>${d.bytes} Bytes</dd>
<dt>Lieferung</dt><dd>${d.delivered ? `${e(fmtDate(d.delivered.at, true))} · ${d.delivered.downloads}× abgerufen${d.delivered.revoked ? ' · zurückgezogen' : ''}` : 'noch nicht geliefert'}</dd><dt>Status</dt><dd>${statusTag(d)}</dd></dl>
<p class="links" style="margin:12px 0 0"><a href="/pruefen/${e(d.sha256)}">Öffentlicher Herkunftsnachweis</a></p>` })}
</div>
${panel({ title: 'Zugesagte Funktionen und ihr Prüfergebnis', sub: std ? `Aus dem Premium-Produktstandard: ${std.purpose}` : 'Keine Standard-Akte', flush: true, body: table(
    [{ label: 'Zusage' }, { label: 'Prüfung' }, { label: 'Ergebnis', full: true }],
    d.promised.map((p) => [e(p.text), `<span class="mono">${e(p.check)}</span>`, p.passed === null ? tag('Nicht ausgeführt', 'bad') : p.passed ? tag('Erfüllt', 'ok') : tag('Nicht erfüllt', 'bad')]),
    'Keine Zusagen hinterlegt', 'Zugesagte Funktionen') })}
<div class="grid2 even">
${panel({ title: 'Prüfprotokoll', flush: true, body: table([{ label: 'Prüfung' }, { label: 'Ergebnis', full: true }], d.checks.map((c) => [`<span class="mono">${e(c.check)}</span>`, `${c.passed ? tag('Bestanden', 'ok') : tag('Nicht bestanden', 'bad')}${c.detail ? `<span class="sub">${e(c.detail)}</span>` : ''}`]), 'Noch nicht geprüft', 'Prüfprotokoll') })}
${panel({ title: 'Versionen dieses Auftrags', flush: true, body: table([{ label: 'Version' }, { label: 'Erstellt' }, { label: 'Prüfung', full: true }], d.versions.map((v) => [v.artifactId === d.artifactId ? `<strong>v${v.version}</strong> (diese)` : `<a href="${e(withMode(`/dashboard/produkte/vorschau/${v.artifactId}`, pc.mode))}">v${v.version}</a>`, `${e(fmtDate(v.createdAt, true))}<span class="sub mono">${e(v.sha256.slice(0, 12))}…</span>`, v.qaPassed === null ? tag('Offen', 'pending') : v.qaPassed ? tag('Bestanden', 'ok') : tag('Nicht bestanden', 'bad')]), 'Keine Versionen', 'Versionen') })}
</div>
${d.quarantined ? '' : panel({ title: 'Fehler gefunden?', sub: 'Nur wenn die Datei nicht ausgeliefert bleiben darf', body: action({ href: `/admin/vorschau/${d.orderId}/sperren`, csrf: pc.csrf, label: 'Datei sperren und Lieferung zurückziehen', variant: 'danger', back: withMode(`/dashboard/produkte/vorschau/${d.artifactId}`, pc.mode), what: 'Der Kunde kann die Datei nicht mehr herunterladen; der Auftrag geht in die Nachbearbeitung. Wird protokolliert.' }) })}`;
  return shell({ title: 'Live-Vorschau', eyebrow: 'Produkte · Live-Vorschau', heading: friendlyTitle(d.title), lead: `${d.customer ?? '—'} · Version ${d.version}`, active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
