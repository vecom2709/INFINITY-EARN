import { releaseSummary, winReleaseGates, type GateStatus } from '../../../../products/win-lager/release.ts';
import { latestProbe } from '../../../../services/product-factory/src/external-build.ts';
import { e, explain, metric, panel, shell, table, tag } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Admin → Produkte → Windows-Programm: Anleitung ansehen und Freigabe-Akte (Funktion 157/158). */
const TAG: Record<GateStatus, [string, 'ok' | 'bad' | 'pending' | 'neutral']> = {
  PASS: ['Belegt', 'ok'],
  BLOCKED: ['Sperrt den Verkauf', 'bad'],
  OWNER: ['Deine Entscheidung', 'pending'],
  OPEN: ['Offen', 'neutral'],
};

export function renderWinLager(pc: PageCtx): string {
  const probe = latestProbe(pc.ctx) ?? null;
  const gates = winReleaseGates(probe);
  const back = '/dashboard/produkte/win-lager';
  const sum = releaseSummary(gates);
  const repo = 'https://github.com/vecom2709/INFINITY-EARN';
  const body = `<section class="metrics" aria-label="Freigabestand">
${metric({ label: 'Verkauf', value: sum.sellable ? 'Freigabe möglich' : 'Gesperrt', sub: sum.sellable ? 'Alle Pflichtpunkte belegt' : `${sum.blocked} Punkt(e) sperren den Verkauf`, icon: sum.sellable ? 'checkCircle' : 'lock', text: true })}
${metric({ label: 'Deine Entscheidungen', value: String(sum.owner), sub: 'Code-Signatur und Festpreis', icon: 'wallet' })}
${metric({ label: 'Anleitung', value: '3 Sprachen', sub: 'Deutsch, Italienisch, Englisch', icon: 'package' })}
${metric({ label: 'Signatur', value: 'Unsigniert', sub: 'Windows meldet „NotSigned“', icon: 'shield', text: true })}
</section>
${panel({ id: 'anleitung', title: 'Bebilderte Anleitung', sub: 'Mit echten Bildschirmfotos des gebauten Programms (Beispieldaten, Musterfirma)', body: `<p class="row" style="display:flex;gap:10px;flex-wrap:wrap">
<a class="btn" href="/admin/muster/win-lager/anleitung.pdf">Anleitung öffnen (DE)</a><a class="btn ghost" href="/admin/muster/win-lager/anleitung.pdf?lang=it">Italienisch</a><a class="btn ghost" href="/admin/muster/win-lager/anleitung.pdf?lang=en">Englisch</a>
<a class="btn ghost" href="${repo}/tree/main/products/win-lager" target="_blank" rel="noopener">Programmcode</a><a class="btn ghost" href="${repo}/blob/main/CROSS_PLATFORM_BUILD_MATRIX.md" target="_blank" rel="noopener">Plattform-Matrix</a></p>
${explain('Jede Kundenfassung erhält die Anleitung mit ihrem Firmennamen, ihrer Farbe und ihren Steuersätzen. Knöpfe und Meldungen werden wörtlich aus dem Programm übernommen. Das Programm selbst läuft nur unter Windows und kann hier nicht im Browser gezeigt werden.')}` })}
${panel({ id: 'akte', title: 'Freigabe-Akte', sub: 'Was belegt ist und was den Verkauf noch sperrt. „Live geprüft“ wird bei jedem Öffnen dieser Seite neu ausgeführt.', flush: true, body: table(
    [{ label: 'Punkt' }, { label: 'Stand' }, { label: 'Nachweis', full: true }],
    gates.map((g) => [`<strong>${e(g.title)}</strong>${g.live ? '<span class="sub">Live geprüft</span>' : ''}`, tag(...(TAG[g.status])), `${e(g.evidence)}${g.next ? `<span class="sub">Nächster Schritt: ${e(g.next)}</span>` : ''}`]),
    'Keine Punkte', 'Freigabe-Akte') })}
${panel({ id: 'bau', title: 'Bau je Auftrag', sub: 'Probebau mit Musterfirma über den GitHub-Windows-Server – gleiche Prüfung wie bei echten Aufträgen', body: `<p style="margin:4px 0 10px">${probe ? `Letzter Probebau: <strong>${e(probe.state === 'DONE' && probe.qa_passed === 1 ? 'bestanden' : probe.state === 'PENDING' || probe.state === 'CLAIMED' ? 'läuft' : 'nicht bestanden')}</strong> · ${e(probe.updated_at.slice(0, 16).replace('T', ' '))} UTC${probe.result_path ? ' · <a href="/admin/muster/win-lager/probebau.zip">Ergebnis herunterladen</a>' : ''}` : 'Noch kein Probebau.'}</p>
<form class="action" method="post" action="/admin/produkte/win-lager/probebau"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}"><button class="btn" type="submit">Probebau anstoßen</button></form>
${explain('Der Windows-Server bei GitHub schaut alle 15 Minuten nach. Ein Probebau baut das Programm für „Musterfirma“, lädt es hoch und durchläuft dieselbe Abnahmeprüfung wie ein Kundenauftrag.')}` })}
${panel({ id: 'freigabe', title: 'Zum Verkauf freigeben', sub: sum.sellable ? 'Alle Pflichtpunkte sind belegt.' : 'Noch nicht möglich', body: sum.sellable
    ? '<p>Alle Pflichtpunkte sind belegt. Die Freigabe mit Festpreis wird angebunden, sobald der Lieferweg je Auftrag steht.</p>'
    : `<p class="err" style="margin:0">Freigabe gesperrt: ${sum.blocked} Punkt(e) oben sind noch offen. Es gibt deshalb keinen Freigabeknopf – das Windows-Programm ist nicht bestellbar und erscheint nicht im Shop.</p>` })}`;
  return shell({ title: 'Windows-Programm – Freigabe', eyebrow: 'Produkte', heading: 'Lager & Rechnung für Windows', lead: 'Anleitung, Nachweise und was bis zum Verkauf noch fehlt.', active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
