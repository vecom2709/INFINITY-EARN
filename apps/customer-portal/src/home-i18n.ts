/** Texte der Startseite in Deutsch, Italienisch und Englisch (gleiche Aussagen, keine zusätzlichen Versprechen). */
export type Lang = 'de' | 'it' | 'en';
export const LANGS: readonly Lang[] = ['de', 'it', 'en'];
export const LANG_PATH: Record<Lang, string> = { de: '/', it: '/it', en: '/en' };

export interface HomeText {
  title: string; description: string;
  nav: { start: string; inquiry: string; portal: string; test: string };
  banner: string; footer: string; admin: string; trust: string; verify: string;
  heroH1: [string, string, string]; heroLead: string; ctaPrimary: string; ctaProducts: string;
  sample: { meta: string; checked: string; pos: string; qty: string; sum: string; markup: string; total: string; note: string; aria: string };
  c2: [string, string, string]; c3: [string, string, string, string, string]; c4: [string, string, string]; c5: [string, string, string, string, string];
  c6: [string, string, string]; flow: [string, string][]; c7: [string, string, string, string]; portalTiles: [string, string][]; c8: [string, string];
  guide: string; products: Record<string, { label: string; text: string }>;
}

export const HOME: Record<Lang, HomeText> = {
  de: {
    title: 'INFINITY EARN – Geprüfte digitale Kalkulationen für Unternehmen',
    description: 'Kalkulationen als Tabelle, PDF oder Paket: festes Angebot, sichere Zahlung über Stripe, automatisch geprüfte Lieferung mit Herkunftsnachweis.',
    nav: { start: 'Start', inquiry: 'Anfrage stellen', portal: 'Kundenportal', test: 'Testbetrieb' },
    banner: '<strong>TESTMODUS – Testbetrieb:</strong> keine Live-Verkäufe, keine echten Zahlungen, keine gültigen Rechnungen.',
    footer: 'Geprüfte digitale Kalkulationen für Unternehmen', admin: 'Admin', trust: 'Vertrauen &amp; Fakten', verify: 'Echtheit prüfen',
    heroH1: ['Digitale Arbeit,', 'sauber geliefert.', '<em>Prüfbar</em> bis zur letzten Zeile.'],
    heroLead: 'Sie beschreiben, was Sie brauchen. Sie erhalten ein festes Angebot und nach der Zahlung eine automatisch geprüfte Datei mit Herkunftsnachweis.',
    ctaPrimary: 'Angebot anfragen', ctaProducts: 'Produkte ansehen',
    sample: { meta: 'Beispiel · EUR · Aufschlag 20 %', checked: 'Geprüft', pos: 'Position', qty: 'Menge', sum: 'Summe', markup: 'Aufschlag 20 %', total: 'Gesamt', note: 'Mit echtem Generator erzeugt und nachgerechnet – so sieht Ihre Lieferung aus.', aria: 'Beispiel einer gelieferten Kalkulation' },
    c2: ['Ihr Bedarf', 'Angebote und Kalkulationen kosten Zeit. Ein Rechenfehler kostet Vertrauen.', 'Positionen zusammentragen, Aufschläge rechnen, alles sauber für Kunden oder Buchhaltung aufbereiten: Das ist Routinearbeit, die trotzdem fehlerfrei sein muss.'],
    c3: ['Beratung', 'Einfach beschreiben. Den Rest erledigen wir.', 'Schreiben Sie Ihre Positionen untereinander oder kopieren Sie sie direkt aus Excel. Fehlt etwas, sagt Ihnen das System genau was – ohne Fachbegriffe.', 'So sieht eine Anfrage aus', 'Jetzt eigene Anfrage stellen'],
    c4: ['Produkte', 'Was wir heute liefern.', 'Bestellbar ist nur, was wir nachweislich herstellen und automatisch prüfen können. Weitere Produktarten wie Software, Websites, Grafik oder Medien folgen erst, wenn sie unseren Qualitätsstandard bestehen.'],
    c5: ['Qualität', 'Geliefert wird nur, was jede Prüfung besteht.', 'Jede Zusage ist mit einer automatischen Prüfung belegt. Fällt eine durch, liefern wir nicht – und der Betrag wird erstattet.', 'automatische Prüfungen je Lieferung', 'Echtheit einer Datei prüfen'],
    c6: ['Bezahlung', 'Klarer Preis. Sichere Zahlung über Stripe.', 'Sie sehen Preis, Lieferumfang und Bedingungen, bevor Sie etwas bezahlen. Kartendaten erreichen unsere Server nie.'],
    flow: [['Festes Angebot', 'Preis und Umfang schwarz auf weiß.'], ['Annahme', 'Bedingungen und Widerrufshinweis vollständig.'], ['Stripe Checkout', 'Bezahlen auf der offiziellen Stripe-Seite.'], ['Bestätigung', 'Start erst nach signierter Zahlungsbestätigung.'], ['Erstellung', 'Automatisch, mit Prüfprotokoll.']],
    c7: ['Lieferung', 'Alles an einem Ort: Ihr Kundenportal.', 'Datei, Rechnung, Vertragsbestätigung und Herkunftsnachweis – jederzeit abrufbar. Dort nehmen Sie die Lieferung ab, beantragen Änderungen oder melden sich beim Support.', 'Zum Kundenportal'],
    portalTiles: [['Dateien', 'Geprüfte Dateien zum Herunterladen.'], ['Rechnungen', 'Rechnung und Vertragsbestätigung als PDF.'], ['Support', 'Fragen, Änderungen und Mängel direkt im Portal.']],
    c8: ['Bereit für Ihr Angebot?', 'Unverbindlich, bis Sie annehmen und bezahlen.'],
    guide: 'Anleitung',
    products: {
      'b2b-calc-csv': { label: 'Tabelle (CSV, in Excel bearbeitbar)', text: 'Zum Weiterrechnen in Excel oder LibreOffice.' },
      'b2b-calc-pdf': { label: 'Druckfertiges PDF', text: 'Zum Weitergeben, Drucken oder Ablegen.' },
      'b2b-calc-bundle': { label: 'Paket: Tabelle und PDF (ZIP)', text: 'Beide Dateien; Preis aus dem tatsächlichen Mehraufwand, kein Rabatt-Versprechen.' },
    },
  },
  it: {
    title: 'INFINITY EARN – Calcoli digitali verificati per le aziende',
    description: 'Calcoli come tabella, PDF o pacchetto: offerta a prezzo fisso, pagamento sicuro con Stripe, consegna verificata automaticamente con certificato di origine.',
    nav: { start: 'Home', inquiry: 'Richiedi offerta', portal: 'Area clienti', test: 'Modalità test' },
    banner: '<strong>MODALITÀ TEST:</strong> nessuna vendita reale, nessun pagamento reale, nessuna fattura valida.',
    footer: 'Calcoli digitali verificati per le aziende', admin: 'Admin', trust: 'Fiducia e fatti', verify: 'Verifica autenticità',
    heroH1: ['Lavoro digitale,', 'consegnato con cura.', '<em>Verificabile</em> fino all’ultima riga.'],
    heroLead: 'Descrivete ciò che vi serve. Ricevete un’offerta a prezzo fisso e, dopo il pagamento, un file verificato automaticamente con certificato di origine.',
    ctaPrimary: 'Richiedi un’offerta', ctaProducts: 'Vedi i prodotti',
    sample: { meta: 'Esempio · EUR · Ricarico 20 %', checked: 'Verificato', pos: 'Voce', qty: 'Quantità', sum: 'Totale', markup: 'Ricarico 20 %', total: 'Totale', note: 'Generato e ricalcolato dal vero motore – così appare la vostra consegna.', aria: 'Esempio di un calcolo consegnato' },
    c2: ['La vostra esigenza', 'Offerte e calcoli richiedono tempo. Un errore di calcolo costa fiducia.', 'Raccogliere le voci, calcolare i ricarichi, preparare tutto per clienti o contabilità: è lavoro di routine che deve comunque essere senza errori.'],
    c3: ['Consulenza', 'Descrivete in modo semplice. Al resto pensiamo noi.', 'Scrivete le voci una sotto l’altra o copiatele direttamente da Excel. Se manca qualcosa, il sistema vi dice esattamente cosa – senza termini tecnici.', 'Ecco come appare una richiesta', 'Fai ora la tua richiesta'],
    c4: ['Prodotti', 'Cosa consegniamo oggi.', 'Si può ordinare solo ciò che possiamo produrre e verificare automaticamente in modo dimostrabile. Altri tipi di prodotto come software, siti web, grafica o media arriveranno solo quando supereranno il nostro standard di qualità.'],
    c5: ['Qualità', 'Consegniamo solo ciò che supera ogni controllo.', 'Ogni promessa è coperta da un controllo automatico. Se uno fallisce, non consegniamo – e l’importo viene rimborsato.', 'controlli automatici per ogni consegna', 'Verifica l’autenticità di un file'],
    c6: ['Pagamento', 'Prezzo chiaro. Pagamento sicuro con Stripe.', 'Vedete prezzo, contenuto della consegna e condizioni prima di pagare. I dati della carta non raggiungono mai i nostri server.'],
    flow: [['Offerta fissa', 'Prezzo e contenuto nero su bianco.'], ['Accettazione', 'Condizioni e informativa sul recesso complete.'], ['Stripe Checkout', 'Pagamento sulla pagina ufficiale di Stripe.'], ['Conferma', 'Avvio solo dopo la conferma firmata del pagamento.'], ['Produzione', 'Automatica, con protocollo di verifica.']],
    c7: ['Consegna', 'Tutto in un unico posto: la vostra area clienti.', 'File, fattura, conferma del contratto e certificato di origine – sempre disponibili. Lì accettate la consegna, chiedete modifiche o contattate l’assistenza.', 'Vai all’area clienti'],
    portalTiles: [['File', 'File verificati da scaricare.'], ['Fatture', 'Fattura e conferma del contratto in PDF.'], ['Assistenza', 'Domande, modifiche e difetti direttamente nell’area clienti.']],
    c8: ['Pronti per la vostra offerta?', 'Senza impegno finché non accettate e pagate.'],
    guide: 'Istruzioni',
    products: {
      'b2b-calc-csv': { label: 'Tabella (CSV, modificabile in Excel)', text: 'Per continuare a calcolare in Excel o LibreOffice.' },
      'b2b-calc-pdf': { label: 'PDF pronto per la stampa', text: 'Da inoltrare, stampare o archiviare.' },
      'b2b-calc-bundle': { label: 'Pacchetto: tabella e PDF (ZIP)', text: 'Entrambi i file; prezzo dal lavoro aggiuntivo effettivo, nessuna promessa di sconto.' },
    },
  },
  en: {
    title: 'INFINITY EARN – Verified digital calculations for businesses',
    description: 'Calculations as spreadsheet, PDF or bundle: fixed-price quote, secure payment via Stripe, automatically verified delivery with proof of origin.',
    nav: { start: 'Home', inquiry: 'Request a quote', portal: 'Customer portal', test: 'Test mode' },
    banner: '<strong>TEST MODE:</strong> no live sales, no real payments, no valid invoices.',
    footer: 'Verified digital calculations for businesses', admin: 'Admin', trust: 'Trust &amp; facts', verify: 'Verify authenticity',
    heroH1: ['Digital work,', 'delivered cleanly.', '<em>Verifiable</em> down to the last line.'],
    heroLead: 'Describe what you need. You receive a fixed quote and, after payment, an automatically verified file with proof of origin.',
    ctaPrimary: 'Request a quote', ctaProducts: 'View products',
    sample: { meta: 'Example · EUR · 20 % markup', checked: 'Verified', pos: 'Item', qty: 'Qty', sum: 'Amount', markup: 'Markup 20 %', total: 'Total', note: 'Generated and recalculated by the real engine – this is what your delivery looks like.', aria: 'Example of a delivered calculation' },
    c2: ['Your need', 'Quotes and calculations take time. A calculation error costs trust.', 'Collecting items, calculating markups, preparing everything for customers or accounting: routine work that still has to be error-free.'],
    c3: ['Guidance', 'Simply describe it. We handle the rest.', 'Write your items one below the other or copy them straight from Excel. If something is missing, the system tells you exactly what – without jargon.', 'This is what a request looks like', 'Make your own request now'],
    c4: ['Products', 'What we deliver today.', 'You can only order what we can demonstrably produce and verify automatically. Other product types such as software, websites, graphics or media will follow only once they pass our quality standard.'],
    c5: ['Quality', 'We only deliver what passes every check.', 'Every promise is backed by an automatic check. If one fails, we do not deliver – and the amount is refunded.', 'automatic checks per delivery', 'Verify a file’s authenticity'],
    c6: ['Payment', 'Clear price. Secure payment via Stripe.', 'You see price, scope and terms before you pay anything. Card details never reach our servers.'],
    flow: [['Fixed quote', 'Price and scope in black and white.'], ['Acceptance', 'Terms and withdrawal notice in full.'], ['Stripe Checkout', 'Pay on the official Stripe page.'], ['Confirmation', 'Work starts only after signed payment confirmation.'], ['Production', 'Automatic, with a test protocol.']],
    c7: ['Delivery', 'Everything in one place: your customer portal.', 'File, invoice, contract confirmation and proof of origin – available any time. There you accept the delivery, request changes or contact support.', 'Go to the customer portal'],
    portalTiles: [['Files', 'Verified files to download.'], ['Invoices', 'Invoice and contract confirmation as PDF.'], ['Support', 'Questions, changes and defects right in the portal.']],
    c8: ['Ready for your quote?', 'Non-binding until you accept and pay.'],
    guide: 'Guide',
    products: {
      'b2b-calc-csv': { label: 'Spreadsheet (CSV, editable in Excel)', text: 'For further calculation in Excel or LibreOffice.' },
      'b2b-calc-pdf': { label: 'Print-ready PDF', text: 'For sharing, printing or filing.' },
      'b2b-calc-bundle': { label: 'Bundle: spreadsheet and PDF (ZIP)', text: 'Both files; price from the actual extra effort, no discount promise.' },
    },
  },
};
