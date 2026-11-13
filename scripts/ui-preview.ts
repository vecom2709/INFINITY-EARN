import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderConsole } from '../apps/console/src/index.ts';
import { renderCheckoutReturn, renderHome, renderInquiryForm, renderPortal, renderQuote } from '../apps/customer-portal/src/pages.ts';
import { autopilotTick } from '../services/core-api/src/autopilot.ts';
import { customerByKey } from '../services/core-api/src/customers.ts';
import { getOrder } from '../services/core-api/src/orders.ts';
import { getQuote } from '../services/core-api/src/workflow.ts';
import { importBankStatement } from '../services/finance/src/bank-statement.ts';
import { mockPayout } from '../services/finance/src/mock-provider.ts';
import { createRefundRequest } from '../services/finance/src/refunds.ts';
import { FakeClock, makeCtx, toDelivered, toOrder, toQuote } from '../tests/helpers.ts';

/**
 * Visuelle Abnahme (UI-12): rendert die echten Konsolenseiten mit einem echten Test-Datenbestand
 * (Bestellungen über den regulären Ablauf mit Testzahlung – keine erfundenen Werte) als statische HTML-Dateien
 * und erstellt mit dem lokal installierten Microsoft Edge (headless, kostenlos) Screenshots Desktop/Mobil.
 *   node scripts/ui-preview.ts            → HTML + Screenshots nach docs/screenshots/m0/
 */
const out = resolve('docs/screenshots/m0');
mkdirSync(out, { recursive: true });

const { ctx } = makeCtx({ clock: new FakeClock(new Date().toISOString()) });
const delivered = [toDelivered(ctx), toDelivered(ctx), toDelivered(ctx)];
const pending = toOrder(ctx); // angenommen, Zahlung offen
const openQuote = toQuote(ctx); // Angebot offen
autopilotTick(ctx); // Belege + Abgleich
for (const d of delivered.slice(0, 2)) {
  const net = ctx.db.get<{ n: number }>(`SELECT SUM(amount_minor) AS n FROM ledger_entries WHERE order_id = ? AND account IN ('customer_payments','provider_fees')`, d.orderId)?.n ?? 0;
  mockPayout(ctx, [d.orderId], net, 'EUR');
}
// Nur die erste Auszahlung bekommt einen Bank-Testbeleg – die zweite bleibt ehrlich „unterwegs“.
const firstPayout = ctx.db.get<{ provider_payout_id: string; amount_minor: number; created_at: string }>('SELECT provider_payout_id, amount_minor, created_at FROM payouts ORDER BY created_at LIMIT 1');
if (firstPayout) {
  const day = new Date(Date.parse(firstPayout.created_at) + 86_400_000).toISOString().slice(0, 10).split('-').reverse().join('.');
  importBankStatement(ctx, `Kontoauszug TESTAUSZUG;;;\nBuchungstag;Betrag;Währung;Verwendungszweck\n${day};${(firstPayout.amount_minor / 100).toFixed(2).replace('.', ',')};EUR;Auszahlung ${firstPayout.provider_payout_id}\n`, 'system');
}
createRefundRequest(ctx, delivered[2]?.orderId ?? '', 'owner', 'Beispiel: Kunde meldet Tippfehler in der Positionsliste (Testbetrieb)');
const customer = customerByKey(ctx, delivered[0]?.customerAccessKey ?? undefined);

const pages: [string, string, string][] = [
  ['uebersicht-echt', '/dashboard', ''],
  ['uebersicht-test', '/dashboard', 'modus=test'],
  ['kunden-test', '/dashboard/kunden', 'modus=test'],
  ['auftraege-test', '/dashboard/auftraege', 'modus=test'],
  ['auftrag-detail-test', `/dashboard/auftraege/${delivered[1]?.orderId ?? ''}`, ''],
  ['produkte-test', '/dashboard/produkte', 'modus=test'],
  ['finanzen-test', '/dashboard/finanzen', 'modus=test'],
  ['berichte', '/dashboard/berichte', ''],
  ['einstellungen', '/dashboard/einstellungen', ''],
  ['vorschau-galerie', '/dashboard/produkte/vorschau', 'modus=test'],
  ['vorschau-detail', `/dashboard/produkte/vorschau/${ctx.db.get<{ id: string }>('SELECT artifact_id AS id FROM artifacts ORDER BY created_at LIMIT 1')?.id ?? ''}`, 'modus=test'],
];
for (const [name, path, q] of pages) {
  const html = renderConsole(ctx, path, new URLSearchParams(q), 'vorschau-ohne-funktion');
  if (!html) throw new Error(`Seite fehlt: ${path}`);
  writeFileSync(join(out, `${name}.html`), html);
}
const customerPages: [string, string][] = [
  ['kunde-start', renderHome()],
  ['kunde-anfrage', renderInquiryForm()],
  ['kunde-angebot', renderQuote(getQuote(ctx, openQuote.quote.quoteId), 'vorschau')],
  ['kunde-zahlung', renderCheckoutReturn(getOrder(ctx, pending.orderId))],
  ['kunde-portal', renderPortal(ctx, customer)],
];
for (const [name, html] of customerPages) writeFileSync(join(out, `${name}.html`), html);
console.log(`${pages.length + customerPages.length} Seiten gerendert → ${out}`);

const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
if (!edge || process.argv.includes('--no-shots')) {
  console.log(edge ? 'Screenshots übersprungen.' : 'Microsoft Edge nicht gefunden – nur HTML erzeugt.');
  process.exit(0);
}
const shots: [string, number, number][] = [
  ['uebersicht-echt', 1440, 1500], ['uebersicht-test', 1440, 1700], ['finanzen-test', 1440, 1700], ['auftrag-detail-test', 1440, 1400], ['berichte', 1440, 1600],
  ['uebersicht-test', 390, 3200], ['uebersicht-echt', 390, 2600], ['finanzen-test', 390, 3600], ['uebersicht-test', 320, 3400],
  ['vorschau-galerie', 1440, 1100], ['vorschau-detail', 1440, 1900], ['vorschau-detail', 390, 3400],
  ['kunde-start', 1440, 1100], ['kunde-angebot', 1440, 1700], ['kunde-portal', 1440, 1500], ['kunde-portal', 390, 2600], ['kunde-anfrage', 390, 2600],
];
for (const [name, w, h] of shots) {
  const file = join(out, `${name}-${w}.png`);
  // Edge erzwingt eine Mindestfensterbreite (~500 px). Für exakte Handybreiten wird die Seite in einen Rahmen mit genau w px gesetzt.
  let target = join(out, `${name}.html`);
  let winW = w;
  if (w < 520) {
    target = join(out, `_rahmen-${name}-${w}.html`);
    writeFileSync(target, `<!doctype html><html><body style="margin:0;background:#E9ECE8"><iframe src="${name}.html" title="Vorschau ${w}px" style="display:block;width:${w}px;height:${h}px;border:0;background:#F7F8F5"></iframe></body></html>`);
    winW = 520;
  }
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', `--window-size=${winW},${h}`, `--screenshot=${file}`, `file:///${target.replace(/\\/g, '/')}`], { stdio: 'ignore', timeout: 60_000 });
  console.log(`✓ ${file}`);
}
