import { formatMinor } from '../../../packages/contracts/src/money.ts';
import { createTextPdf, type PdfLine } from '../../../packages/shared/src/pdf.ts';
import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { getCapability } from '../../product-factory/src/registry.ts';
import type { AppContext } from './context.ts';
import { customerByKey } from './customers.ts';
import { WorkflowError } from './errors.ts';
import { getOrder } from './orders.ts';
import { CONSUMER_WAIVER_VERSION, getQuote } from './workflow.ts';

/**
 * Vertragsbestätigung auf dauerhaftem Datenträger (PDF) – erzeugt bei Angebotsannahme, unveränderlich gespeichert.
 * Für Verbraucher Voraussetzung, damit das Widerrufsrecht bei digitalen Inhalten erlöschen kann
 * (Zustimmung + Kenntnis + Bestätigung). Rechtliche Endprüfung der Texte: LA-07. Anbieterangaben bis LA-02 Platzhalter.
 */
export const CONFIRMATION_TEMPLATE_VERSION = 'v1-entwurf-2026-11-12';

export interface ConfirmationRow {
  confirmation_id: string;
  order_id: string;
  template_version: string;
  blob_locator: string;
  sha256: string;
  bytes: number;
  buyer_type: 'B2B' | 'B2C';
  consumer_waiver_ref: string | null;
  first_downloaded_at: string | null;
  download_count: number;
  test_mode: number;
  created_at: string;
}

export function getConfirmation(ctx: AppContext, orderId: string): ConfirmationRow | undefined {
  return ctx.db.get<ConfirmationRow>('SELECT * FROM contract_confirmations WHERE order_id = ?', orderId);
}

interface QuoteExtra {
  consumer_waiver_ref: string | null;
}

export function buildConfirmationLines(ctx: AppContext, orderId: string): { lines: PdfLine[]; buyerType: 'B2B' | 'B2C'; waiverRef: string | null } {
  const order = getOrder(ctx, orderId);
  const quote = getQuote(ctx, order.quote_id);
  const waiverRef = (quote as unknown as QuoteExtra).consumer_waiver_ref ?? null;
  const customer = ctx.db.get<{ name: string | null; address: string | null; country: string | null; buyer_type: 'B2B' | 'B2C' | null; vat_id: string | null; email: string | null }>(
    'SELECT name, address, country, buyer_type, vat_id, email FROM customers WHERE customer_id = ?', order.customer_id,
  );
  const buyerType = customer?.buyer_type ?? 'B2B';
  const terms = JSON.parse(quote.terms_json) as Record<string, unknown>;
  const scope = JSON.parse(quote.scope) as { title?: string; items?: { name: string; quantity: number; unit_cost_minor: number }[]; margin_bps?: number; currency?: string } | null;
  const cap = getCapability(String(terms.capability ?? '').split('@')[0] ?? '');
  const s = ctx.config.seller;
  const money = (m: number): string => `${formatMinor(m, order.currency).replace('.', ',')} ${order.currency}`;
  const L: PdfLine[] = [];
  const h = (t: string): void => void L.push({ text: t, size: 12, bold: true, gap: 10 });
  const p = (t: string): void => void L.push({ text: t });

  if (ctx.config.testMode) L.push({ text: 'TESTMODUS – kein verbindlicher Vertrag, keine echte Zahlung, kein Steuerbeleg', bold: true, size: 10 });
  L.push({ text: 'Vertragsbestätigung', size: 18, bold: true, gap: 6 });
  p(`Auftrag ${order.order_id} · Angebot ${quote.quote_id}`);
  p(`Vertragsschluss (Annahme): ${quote.accepted_at ?? '–'} · Nachweis: ${quote.customer_acceptance_ref ?? '–'}`);

  h('Anbieter');
  p(s.name ? `${s.name}, ${s.address ?? ''}${s.taxId ? ` · Steuer-ID ${s.taxId}` : ''}` : 'INFINITY EARN – Anbieterangaben folgen nach Unternehmensregistrierung (LA-02). Dieses Dokument ist ein Testdokument.');

  h('Kunde');
  p(`${customer?.name ?? '–'} · ${customer?.address ?? '–'} · ${customer?.country ?? '–'}`);
  p(`Kundentyp: ${buyerType === 'B2C' ? 'Verbraucher (B2C)' : 'Unternehmen (B2B)'}${customer?.vat_id ? ` · USt-IdNr. ${customer.vat_id}` : ''}`);

  h('Leistung');
  p(`${cap ? 'Erstellung einer B2B-Kalkulationstabelle (CSV) aus den übermittelten Positionsdaten' : quote.description} – „${scope?.title ?? ''}“`);
  for (const it of scope?.items ?? []) p(`• ${it.name}: ${it.quantity} × ${money(it.unit_cost_minor)}`);
  if (scope?.margin_bps !== undefined) p(`Gewünschter Aufschlag in der Tabelle: ${(scope.margin_bps / 100).toFixed(2).replace('.', ',')} %`);
  p(`Lieferkriterien (automatisch geprüft): ${((terms.delivery_criteria as string[] | undefined) ?? []).join(', ')}`);
  p(`Bereitstellung: Download im Kundenportal, in der Regel innerhalb von ${String(terms.delivery_deadline_days ?? 2)} Tagen nach Zahlungseingang.`);

  h('Preis und Zahlung');
  p(`Gesamtpreis: ${money(order.amount_minor)}. Umsatzsteuer: noch nicht berechnet – steuerliche Einordnung erst nach fachlicher Freigabe (LA-06).`);
  p('Zahlung vorab über den Zahlungsdienstleister Stripe. Die Bereitstellung beginnt erst nach bestätigtem Zahlungseingang.');

  h('Nutzungsrechte, Mängel, Rückerstattung');
  p(String(terms.rights ?? ''));
  p(String(terms.refund_criteria ?? ''));
  p('Es gelten die Allgemeinen Geschäftsbedingungen in der zum Vertragsschluss gültigen Fassung (Entwurf, Prüfung LA-07).');

  h('Widerrufsrecht');
  if (buyerType === 'B2C') {
    p('Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Frist beginnt mit dem Vertragsschluss. Zur Ausübung genügt eine eindeutige Erklärung (z. B. über das Kundenportal, Art „Widerruf“, oder per E-Mail). Im Fall des Widerrufs erstatten wir alle Zahlungen unverzüglich, spätestens binnen vierzehn Tagen, über dasselbe Zahlungsmittel.');
    p('Vorzeitiges Erlöschen: Sie haben bei der Bestellung ausdrücklich verlangt, dass wir vor Ablauf der Widerrufsfrist mit der Bereitstellung der digitalen Inhalte beginnen, und bestätigt, dass Ihnen bekannt ist, dass Sie mit Beginn der Bereitstellung Ihr Widerrufsrecht verlieren:');
    p('[x] „Ich verlange ausdrücklich, dass mit der Bereitstellung der digitalen Inhalte vor Ablauf der Widerrufsfrist begonnen wird.“');
    p('[x] „Mir ist bekannt, dass ich mit Beginn der Bereitstellung mein Widerrufsrecht verliere.“');
    p(`Nachweis der Zustimmung: ${waiverRef ?? '–'} (Textfassung ${CONSUMER_WAIVER_VERSION}).`);
    L.push({ text: 'Muster-Widerrufsformular', bold: true, gap: 6 });
    p('An INFINITY EARN [Anschrift/E-Mail nach Registrierung]: Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Bereitstellung der folgenden digitalen Inhalte (*) – Bestellt am (*) – Auftragsnummer – Name – Anschrift – Datum. (*) Unzutreffendes streichen.');
  } else {
    p('Für Unternehmer (B2B) besteht kein gesetzliches Verbraucher-Widerrufsrecht. Ansprüche bei Mängeln nach Ziffer „Nutzungsrechte, Mängel, Rückerstattung“.');
  }

  h('Datenschutz');
  p(String(terms.privacy_notice ?? 'Datenverarbeitung ausschließlich zur Auftragsabwicklung.'));
  L.push({ text: `Dokumentfassung ${CONFIRMATION_TEMPLATE_VERSION} · erstellt ${ctx.clock().toISOString()}`, size: 8, gap: 14 });
  return { lines: L, buyerType, waiverRef };
}

/** Erzeugt die Bestätigung genau einmal je Auftrag (idempotent). */
export function createConfirmation(ctx: AppContext, orderId: string): ConfirmationRow {
  const existing = getConfirmation(ctx, orderId);
  if (existing) return existing;
  const order = getOrder(ctx, orderId);
  const { lines, buyerType, waiverRef } = buildConfirmationLines(ctx, orderId);
  if (buyerType === 'B2C' && !waiverRef) throw new WorkflowError('CONSUMER_WAIVER_MISSING');
  const bytes = createTextPdf({ title: `Vertragsbestätigung ${orderId}`, footer: `INFINITY EARN · Vertragsbestätigung ${orderId}${ctx.config.testMode ? ' · TESTMODUS' : ''}`, lines, created: ctx.clock() });
  const locator = ctx.blobs.put(`${ctx.config.testMode ? 'test' : 'live'}/${orderId}/vertragsbestaetigung-${CONFIRMATION_TEMPLATE_VERSION}.pdf`, bytes);
  const row: ConfirmationRow = {
    confirmation_id: newId('vbs'), order_id: orderId, template_version: CONFIRMATION_TEMPLATE_VERSION, blob_locator: locator, sha256: sha256Hex(bytes),
    bytes: bytes.byteLength, buyer_type: buyerType, consumer_waiver_ref: waiverRef, first_downloaded_at: null, download_count: 0, test_mode: order.test_mode,
    created_at: ctx.clock().toISOString(),
  };
  ctx.db.run(
    `INSERT INTO contract_confirmations (confirmation_id, order_id, template_version, blob_locator, sha256, bytes, buyer_type, consumer_waiver_ref, test_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.confirmation_id, row.order_id, row.template_version, row.blob_locator, row.sha256, row.bytes, row.buyer_type, row.consumer_waiver_ref, row.test_mode, row.created_at,
  );
  ctx.audit.record({ type: 'contract.confirmation_created', actor: 'system', subjectType: 'order', subjectId: orderId, data: { confirmation_id: row.confirmation_id, sha256: row.sha256, buyer_type: buyerType }, testMode: ctx.config.testMode });
  return row;
}

/** Abruf nur durch den bestellenden Kunden; Prüfsumme wird bei jedem Abruf kontrolliert, Abrufe protokolliert. */
export function downloadConfirmation(ctx: AppContext, customerKey: string | undefined, orderId: string): { ok: true; bytes: Uint8Array; filename: string } | { ok: false; status: 403 | 404 | 500; reason: string } {
  const customer = customerByKey(ctx, customerKey);
  const order = ctx.db.get<{ customer_id: string }>('SELECT customer_id FROM orders WHERE order_id = ?', orderId);
  if (!customer || !order || order.customer_id !== customer.customer_id) {
    ctx.audit.record({ type: 'security.confirmation_denied', actor: 'customer', subjectType: 'order', subjectId: orderId, testMode: ctx.config.testMode });
    return { ok: false, status: 403, reason: 'FORBIDDEN' };
  }
  const row = getConfirmation(ctx, orderId);
  if (!row) return { ok: false, status: 404, reason: 'NOT_FOUND' };
  const bytes = ctx.blobs.get(row.blob_locator);
  if (!bytes || sha256Hex(bytes) !== row.sha256) {
    ctx.audit.record({ type: 'alert.confirmation_integrity', actor: 'system', subjectType: 'order', subjectId: orderId, testMode: ctx.config.testMode });
    return { ok: false, status: 500, reason: 'INTEGRITY' };
  }
  ctx.db.run('UPDATE contract_confirmations SET download_count = download_count + 1, first_downloaded_at = COALESCE(first_downloaded_at, ?) WHERE order_id = ?', ctx.clock().toISOString(), orderId);
  ctx.audit.record({ type: 'contract.confirmation_downloaded', actor: 'customer', subjectType: 'order', subjectId: orderId, testMode: ctx.config.testMode });
  return { ok: true, bytes, filename: `Vertragsbestaetigung-${orderId}.pdf` };
}
