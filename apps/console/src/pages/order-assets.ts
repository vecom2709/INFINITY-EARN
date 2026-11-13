import { assetGate, requestsForOrder } from '../../../../services/core-api/src/client-assets.ts';
import { e, panel, table, tag } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Auftrag → „Dateien und Zugänge vom Kunden“ (Funktion 161). Der Eigentümer sieht nur Status und Prüfsumme; Inhalte nur über die Produktion. */

const KIND: Record<string, string> = { logo: 'Logo', document: 'Dokument', data: 'Daten', access: 'Zugang (per Einladung)' };

export function renderOrderAssets(pc: PageCtx, orderId: string, back: string): string {
  const views = requestsForOrder(pc.ctx, orderId);
  const gate = assetGate(pc.ctx, orderId);
  const hidden = `<input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}">`;
  const rows = views.map((v) => {
    const r = v.req;
    const state = r.cancelled_at ? tag('zurückgezogen', 'neutral') : v.usable ? tag('freigegeben', 'ok') : tag(r.blocks_production ? 'fehlt – Produktion pausiert' : 'offen', r.blocks_production ? 'bad' : 'pending');
    const files = v.assets.map((a) => `${a.version}: ${e(a.filename)} · ${a.scan_status === 'REJECTED' ? `abgelehnt (${e(a.scan_reason ?? '')})` : !a.rights_confirmed ? 'gesperrt, Rechte fehlen' : a.granted ? 'freigegeben' : 'widerrufen'}${a.sha256 && a.bytes ? ` · SHA ${e(a.sha256.slice(0, 10))}…` : ''}${a.granted ? ` <form method="post" action="/admin/dateien/${e(a.asset_id)}/widerrufen" style="display:inline">${hidden}<button class="btn ghost" type="submit">Widerrufen</button></form>` : ''}`).join('<br>');
    const cancel = !r.cancelled_at && !v.usable ? `<form method="post" action="/admin/dateianfragen/${e(r.request_id)}/abbrechen" style="display:inline">${hidden}<button class="btn ghost" type="submit">Zurückziehen</button></form>` : '';
    return [`<strong>${e(r.label)}</strong><span class="sub">${e(KIND[r.kind] ?? r.kind)} · ${e(r.purpose)}</span>`, state, files || '<span class="muted">noch nichts</span>', cancel];
  });
  const formHtml = `<form class="action" method="post" action="/admin/dateien/anfordern" style="display:grid;gap:8px;max-width:640px">${hidden}<input type="hidden" name="order_id" value="${e(orderId)}">
<label for="ar-kind">Art</label><select id="ar-kind" name="kind"><option value="logo">Logo</option><option value="document">Dokument</option><option value="data">Daten</option><option value="access">Zugang (nur per Einladung, nie Passwörter)</option></select>
<label for="ar-label">Bezeichnung</label><input id="ar-label" type="text" name="label" required minlength="2" maxlength="120" placeholder="z. B. Firmenlogo als PNG">
<label for="ar-purpose">Wofür wird es gebraucht?</label><input id="ar-purpose" type="text" name="purpose" required minlength="2" maxlength="300" placeholder="z. B. Kopfzeile der Rechnungen im Programm">
<label><input type="checkbox" name="rights" value="1" checked style="width:auto;min-height:0"> Kunde muss Nutzungsrechte bestätigen</label>
<label><input type="checkbox" name="blocks" value="1" checked style="width:auto;min-height:0"> Produktion wartet, bis es vorliegt</label>
<p style="margin:4px 0 0"><button class="btn" type="submit">Beim Kunden anfordern</button> <span class="what">Erscheint nur im Portal dieses Kunden. Wir senden keine E-Mail, solange kein Versandkanal verbunden ist.</span></p></form>`;
  return panel({
    id: 'dateien', title: 'Dateien und Zugänge vom Kunden', sub: gate.ready ? 'Nichts Benötigtes fehlt' : `Produktion pausiert – fehlt: ${gate.missing.join(', ')}`,
    body: `${views.length ? table([{ label: 'Anfrage' }, { label: 'Stand' }, { label: 'Versionen' }, { label: '' }], rows, '', 'Datei-Anfragen') : ''}${formHtml}`,
  });
}
