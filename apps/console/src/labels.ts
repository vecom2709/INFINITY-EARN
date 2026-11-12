import type { Tone } from './ui.ts';

/**
 * Übersetzung technischer Zustände in verständliches Deutsch (Design-System §3).
 * Jeder Zustand hat einen Text, einen Ton (nie nur Farbe) und eine Ein-Satz-Erklärung „Was bedeutet das?“.
 */
export interface Label {
  text: string;
  tone: Tone;
  explain: string;
}

export const PIPELINE_LABELS: Record<string, Label> = {
  DISCOVERED: { text: 'Neue Anfrage', tone: 'neutral', explain: 'Eine Anfrage ist eingegangen und wird gerade geprüft.' },
  SOURCE_COMPLIANT: { text: 'Quelle geprüft', tone: 'neutral', explain: 'Die Herkunft der Anfrage ist erlaubt und dokumentiert.' },
  QUALIFIED: { text: 'Passt zum Angebot', tone: 'neutral', explain: 'Die Anfrage passt zu einem Produkt, das wir herstellen können.' },
  FEASIBILITY_APPROVED: { text: 'Machbar', tone: 'neutral', explain: 'Wir können die Leistung nachweislich automatisch erstellen.' },
  QUOTED: { text: 'Angebot verschickt', tone: 'pending', explain: 'Der Kunde hat ein Angebot erhalten und kann es annehmen.' },
  CUSTOMER_ACCEPTED: { text: 'Angenommen – Zahlung offen', tone: 'pending', explain: 'Der Kunde hat angenommen. Gearbeitet wird erst, wenn der Zahlungsanbieter die Zahlung bestätigt.' },
  PAYMENT_CONFIRMED: { text: 'Bezahlt', tone: 'ok', explain: 'Der Zahlungsanbieter hat die Zahlung signiert bestätigt.' },
  PRODUCTION_QUEUED: { text: 'In Arbeit (wartet)', tone: 'pending', explain: 'Der Auftrag steht in der Warteschlange und wird automatisch erstellt.' },
  IN_PRODUCTION: { text: 'In Arbeit', tone: 'pending', explain: 'Das Produkt wird gerade erstellt.' },
  QA_PASSED: { text: 'Geprüft', tone: 'ok', explain: 'Alle Qualitätsprüfungen sind bestanden.' },
  DELIVERED: { text: 'Geliefert', tone: 'ok', explain: 'Der Kunde kann sein Produkt im Kundenportal herunterladen.' },
  INVOICE_RECORDED: { text: 'Beleg erstellt', tone: 'ok', explain: 'Ein Beleg wurde erstellt. Im Testbetrieb ist er keine gültige Rechnung.' },
  LEDGER_RECONCILED: { text: 'Zahlungen abgeglichen', tone: 'ok', explain: 'Zahlung, Gebühren und Buchungen stimmen überein.' },
  PAYOUT_RECORDED: { text: 'Auszahlung unterwegs', tone: 'pending', explain: 'Der Zahlungsanbieter hat eine Auszahlung gemeldet. Auf dem Bankkonto zählt sie erst nach Bankbestätigung.' },
  CLOSED: { text: 'Abgeschlossen', tone: 'ok', explain: 'Der Auftrag ist vollständig erledigt.' },
  UNAUTHORIZED_SOURCE: { text: 'Quelle nicht erlaubt', tone: 'bad', explain: 'Die Herkunft ist nicht freigegeben. Es wird nichts unternommen.' },
  CONSENT_MISSING: { text: 'Keine Kontakterlaubnis', tone: 'bad', explain: 'Ohne Einwilligung schreiben wir niemanden an.' },
  OUT_OF_SCOPE: { text: 'Passt nicht zum Angebot', tone: 'neutral', explain: 'Diese Leistung bieten wir nicht an.' },
  LICENCE_RISK: { text: 'Rechte unklar', tone: 'bad', explain: 'Nutzungsrechte sind nicht geklärt. Lieferung gesperrt.' },
  NO_CAPACITY: { text: 'Vorübergehend pausiert', tone: 'pending', explain: 'Kein kostenloses Kontingent frei. Es wird nichts kostenpflichtig hinzugebucht.' },
  COST_LIMIT: { text: 'Kostengrenze', tone: 'bad', explain: 'Die Leistung würde Kosten verursachen, die du nicht freigegeben hast.' },
  PAYMENT_FAILED: { text: 'Zahlung fehlgeschlagen', tone: 'bad', explain: 'Die Zahlung kam nicht zustande. Es wird nichts geliefert.' },
  CANCELLED: { text: 'Storniert', tone: 'neutral', explain: 'Der Vorgang wurde beendet.' },
  QA_FAILED: { text: 'Prüfung nicht bestanden', tone: 'bad', explain: 'Das Produkt hat die Qualitätsprüfung nicht bestanden und wird nicht ausgeliefert.' },
  REFUND_PENDING: { text: 'Erstattung offen', tone: 'pending', explain: 'Eine Erstattung ist beantragt und wartet auf Entscheidung oder Bestätigung.' },
  DISPUTE: { text: 'Zahlung angefochten', tone: 'bad', explain: 'Der Kunde hat die Zahlung bei seiner Bank angefochten.' },
  TAX_REVIEW: { text: 'Steuerprüfung nötig', tone: 'pending', explain: 'Für den Beleg fehlen geprüfte Steuerangaben. Es wird nichts automatisch versendet.' },
  MANUAL_REVIEW: { text: 'Deine Entscheidung nötig', tone: 'pending', explain: 'Hier wird deine Entscheidung benötigt, bevor es weitergeht.' },
};

export function pipelineLabel(state: string): Label {
  return PIPELINE_LABELS[state] ?? { text: 'Unbekannter Zustand', tone: 'bad', explain: `Interner Zustand ${state} – bitte in der Detailansicht prüfen.` };
}

export const PAYMENT_LABELS: Record<string, Label> = {
  UNPAID: { text: 'Noch nicht bezahlt', tone: 'neutral', explain: 'Es liegt keine bestätigte Zahlung vor.' },
  PENDING: { text: 'Zahlung in Prüfung', tone: 'pending', explain: 'Der Zahlungsanbieter verarbeitet die Zahlung noch.' },
  CONFIRMED: { text: 'Bezahlt', tone: 'ok', explain: 'Signiert vom Zahlungsanbieter bestätigt.' },
  FAILED: { text: 'Fehlgeschlagen', tone: 'bad', explain: 'Die Zahlung ist nicht zustande gekommen.' },
  REFUNDED: { text: 'Erstattet', tone: 'neutral', explain: 'Der Betrag wurde dem Kunden erstattet.' },
  DISPUTED: { text: 'Angefochten', tone: 'bad', explain: 'Der Kunde hat die Zahlung angefochten.' },
};

export function paymentLabel(state: string): Label {
  return PAYMENT_LABELS[state] ?? { text: state, tone: 'neutral', explain: '' };
}

/** Sieben sachliche Phasen für den Kunden-/Eigentümerblick (Design-System §6). */
export const PHASES = ['Anfrage', 'Angebot', 'Bezahlt', 'Erstellung', 'Geprüft', 'Geliefert', 'Auszahlung'] as const;

const PHASE_OF: Record<string, number> = {
  DISCOVERED: 0, SOURCE_COMPLIANT: 0, QUALIFIED: 0, FEASIBILITY_APPROVED: 0,
  QUOTED: 1, CUSTOMER_ACCEPTED: 1,
  PAYMENT_CONFIRMED: 2,
  PRODUCTION_QUEUED: 3, IN_PRODUCTION: 3,
  QA_PASSED: 4,
  DELIVERED: 5, INVOICE_RECORDED: 5, LEDGER_RECONCILED: 5, TAX_REVIEW: 5,
  PAYOUT_RECORDED: 6, CLOSED: 6,
};

/** Liefert Phase und ob die aktuelle Phase noch auf eine Bestätigung wartet. */
export function phaseOf(state: string, bankConfirmed: boolean): { index: number; waiting: boolean } {
  const index = PHASE_OF[state] ?? -1;
  if (state === 'CUSTOMER_ACCEPTED') return { index: 1, waiting: true };
  if (state === 'PAYOUT_RECORDED') return { index: 6, waiting: !bankConfirmed };
  if (state === 'CLOSED') return { index: 6, waiting: !bankConfirmed };
  return { index, waiting: false };
}

/** Audit-Ereignisse, die für den Eigentümer verständlich in „Was gerade passiert“ erscheinen. */
export const ACTIVITY: Record<string, { title: string; text: string; icon: 'check' | 'inbox' | 'package' | 'bank' | 'receipt' | 'alert' | 'doc' | 'send' | 'shield' | 'refresh'; tone?: 'warn' | 'bad' }> = {
  'lead.received': { title: 'Neue Kundenanfrage', text: 'Über das Anfrageformular eingegangen.', icon: 'inbox' },
  'lead.ingested': { title: 'Ausschreibung gefunden', text: 'Aus einer freigegebenen öffentlichen Quelle übernommen.', icon: 'inbox' },
  'quote.issued': { title: 'Angebot erstellt', text: 'Automatisch kalkuliert und dem Kunden bereitgestellt.', icon: 'doc' },
  'quote.accepted': { title: 'Angebot angenommen', text: 'Der Kunde hat verbindlich angenommen.', icon: 'check' },
  'contract.confirmation_created': { title: 'Vertragsbestätigung erstellt', text: 'PDF für den Kunden abrufbar.', icon: 'doc' },
  'checkout.created': { title: 'Zahlung angefordert', text: 'Der Kunde wurde zum Zahlungsanbieter geleitet.', icon: 'send' },
  'payment.confirmed': { title: 'Zahlung bestätigt', text: 'Signierte Bestätigung des Zahlungsanbieters.', icon: 'check' },
  'payment.failed': { title: 'Zahlung fehlgeschlagen', text: 'Es wird nichts geliefert.', icon: 'alert', tone: 'bad' },
  'qa.passed': { title: 'Qualitätsprüfung bestanden', text: 'Alle automatischen Prüfungen erfüllt.', icon: 'check' },
  'qa.failed': { title: 'Qualitätsprüfung nicht bestanden', text: 'Lieferung gesperrt, neuer Versuch geplant.', icon: 'alert', tone: 'warn' },
  'delivery.completed': { title: 'Produkt geliefert', text: 'Im Kundenportal zum Download bereit.', icon: 'package' },
  'delivery.blocked': { title: 'Lieferung angehalten', text: 'Wartet auf deine Prüfung.', icon: 'alert', tone: 'warn' },
  'delivery.downloaded': { title: 'Kunde hat heruntergeladen', text: 'Die Datei wurde abgerufen.', icon: 'package' },
  'fee.synced': { title: 'Gebühren übernommen', text: 'Tatsächliche Anbietergebühr verbucht.', icon: 'receipt' },
  'refund.requested': { title: 'Erstattung beantragt', text: 'Wartet auf deine Entscheidung.', icon: 'refresh', tone: 'warn' },
  'refund.completed': { title: 'Erstattung bestätigt', text: 'Vom Zahlungsanbieter bestätigt und verbucht.', icon: 'refresh' },
  'dispute.opened': { title: 'Zahlung angefochten', text: 'Bitte prüfen.', icon: 'alert', tone: 'bad' },
  'payout.confirmed': { title: 'Auszahlung gemeldet', text: 'Vom Anbieter gemeldet – noch nicht als Bankeingang bestätigt.', icon: 'bank' },
  'support.ticket_created': { title: 'Kundennachricht', text: 'Neue Frage, Reklamation oder Widerruf im Portal.', icon: 'inbox' },
  'backup.offsite_stored': { title: 'Tägliche Sicherung gespeichert', text: 'Verschlüsselt, 30 Tage aufbewahrt.', icon: 'shield' },
  'backup.offsite_failed': { title: 'Sicherung fehlgeschlagen', text: 'Neuer Versuch in einer Stunde.', icon: 'alert', tone: 'warn' },
  'alert.dead_letter': { title: 'Aufgabe angehalten', text: 'Mehrfach fehlgeschlagen – deine Prüfung nötig.', icon: 'alert', tone: 'warn' },
};
