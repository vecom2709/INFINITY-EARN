/**
 * FatturaPA (Fattura elettronica ordinaria, Formato FPR12, Spezifikation 1.2.2) für den Sitz in Italien (LA-01: Italien).
 *
 * Grenzen (verbindlich):
 *  - Keine Platzhalter: Fehlen Pflichtdaten (Partita IVA, CAP, Comune …), wird KEINE Datei erzeugt, sondern gemeldet, was fehlt.
 *  - Steuer: Satz/Natura werden explizit übergeben. `proposeItalianTax` liefert nur einen VORSCHLAG, der von der
 *    Steuerberatung freigegeben werden muss (LA-06). Es wird nichts automatisch an das SdI übermittelt.
 *  - Testbetrieb: Causale „TESTBELEG – NICHT AN DAS SDI ÜBERMITTELN“.
 */
export type Regime = 'RF01' | 'RF19'; // RF01 ordinario, RF19 forfettario
export type Natura = 'N1' | 'N2.1' | 'N2.2' | 'N3.1' | 'N3.2' | 'N4' | 'N6.9' | 'N7';
export const ALLOWED_RATES = [0, 4, 5, 10, 22] as const;

export interface FpParty {
  country: string;
  vatId: string | null; // ohne Länderpräfix
  fiscalCode: string | null;
  name: string;
  address: string;
  cap: string;
  city: string;
  province: string | null;
}

export interface FpTax { rate: number; nature: Natura | null; law: string | null }

export interface FpInput {
  progressivo: string;
  seller: FpParty & { regime: Regime };
  buyer: FpParty;
  codiceDestinatario: string;
  pec: string | null;
  docType: 'TD01' | 'TD04';
  number: string;
  date: string; // YYYY-MM-DD
  lines: { description: string; quantity: number; unitMinor: number }[];
  tax: FpTax;
  causale: string[];
  relatedInvoice?: { number: string; date: string } | null;
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const amt = (minor: number): string => (minor / 100).toFixed(2);
const latin = (s: string, max: number): string => s.normalize('NFC').replace(/[^\x20-\x7E\u00A0-ÿ]/g, ' ').slice(0, max);

export function totals(i: FpInput): { taxable: number; tax: number; total: number; bollo: boolean } {
  const taxable = i.lines.reduce((s, l) => s + l.quantity * l.unitMinor, 0);
  const tax = Math.round((taxable * i.tax.rate) / 100);
  const total = taxable + tax;
  // Imposta di bollo (2 €) bei steuerfreien Beträgen über 77,47 € – typischerweise im Regime forfettario.
  const bollo = i.tax.rate === 0 && taxable > 7747;
  return { taxable, tax, total, bollo };
}

/** Prüft Pflichtfelder und Formate. Leere Liste = gültig. */
export function validateFatturaPA(i: FpInput): string[] {
  const e: string[] = [];
  const party = (p: FpParty, who: string): void => {
    if (!/^[A-Z]{2}$/.test(p.country)) e.push(`${who}: Ländercode ungültig`);
    if (!p.vatId && !p.fiscalCode) e.push(`${who}: Partita IVA oder Codice Fiscale fehlt`);
    if (p.country === 'IT' && p.vatId && !/^\d{11}$/.test(p.vatId)) e.push(`${who}: Partita IVA muss 11 Ziffern haben`);
    if (p.country === 'IT' && p.fiscalCode && !/^([A-Z0-9]{16}|\d{11})$/.test(p.fiscalCode)) e.push(`${who}: Codice Fiscale ungültig`);
    if (!p.name.trim()) e.push(`${who}: Name fehlt`);
    if (!p.address.trim()) e.push(`${who}: Adresse fehlt`);
    if (!p.city.trim()) e.push(`${who}: Comune/Ort fehlt`);
    if (p.country === 'IT' && !/^\d{5}$/.test(p.cap)) e.push(`${who}: CAP muss 5 Ziffern haben`);
    if (p.country !== 'IT' && !p.cap.trim()) e.push(`${who}: Postleitzahl fehlt`);
    if (p.country === 'IT' && p.province !== null && !/^[A-Z]{2}$/.test(p.province)) e.push(`${who}: Provinz ungültig`);
  };
  party(i.seller, 'Verkäufer');
  party(i.buyer, 'Käufer');
  if (i.seller.country !== 'IT') e.push('Verkäufer: FatturaPA nur für Sitz in Italien');
  if (!i.seller.vatId) e.push('Verkäufer: Partita IVA fehlt');
  if (!/^[A-Z0-9]{7}$/.test(i.codiceDestinatario)) e.push('Codice Destinatario muss 7 Zeichen haben');
  if (i.buyer.country !== 'IT' && i.codiceDestinatario !== 'XXXXXXX') e.push('Ausländische Käufer: Codice Destinatario „XXXXXXX“');
  if (!/^[A-Za-z0-9]{1,5}$/.test(i.progressivo)) e.push('ProgressivoInvio: 1–5 alphanumerische Zeichen');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) e.push('Datum ungültig');
  if (!i.number.trim() || i.number.length > 20) e.push('Rechnungsnummer fehlt oder zu lang');
  if (i.lines.length === 0) e.push('Mindestens eine Position');
  for (const [n, l] of i.lines.entries()) if (!l.description.trim() || l.quantity <= 0 || !Number.isInteger(l.unitMinor)) e.push(`Position ${n + 1} ungültig`);
  if (!(ALLOWED_RATES as readonly number[]).includes(i.tax.rate)) e.push(`Steuersatz ${i.tax.rate} % nicht zulässig`);
  if (i.tax.rate === 0 && !i.tax.nature) e.push('Bei 0 % ist eine Natura (Befreiungsgrund) Pflicht');
  if (i.tax.rate > 0 && i.tax.nature) e.push('Natura nur bei 0 %');
  if (i.seller.regime === 'RF19' && i.tax.rate !== 0) e.push('Regime forfettario: keine Umsatzsteuer');
  if (i.docType === 'TD04' && !i.relatedInvoice) e.push('Gutschrift (TD04) braucht die Bezugsrechnung');
  return e;
}

function partyXml(p: FpParty, tag: 'CedentePrestatore' | 'CessionarioCommittente', regime?: Regime): string {
  const id = p.vatId ? `<IdFiscaleIVA><IdPaese>${p.country}</IdPaese><IdCodice>${xml(p.vatId)}</IdCodice></IdFiscaleIVA>` : '';
  const cf = p.fiscalCode ? `<CodiceFiscale>${xml(p.fiscalCode)}</CodiceFiscale>` : '';
  return `<${tag}><DatiAnagrafici>${id}${cf}<Anagrafica><Denominazione>${xml(latin(p.name, 80))}</Denominazione></Anagrafica>${regime ? `<RegimeFiscale>${regime}</RegimeFiscale>` : ''}</DatiAnagrafici>`
    + `<Sede><Indirizzo>${xml(latin(p.address, 60))}</Indirizzo><CAP>${xml(p.country === 'IT' ? p.cap : '00000')}</CAP><Comune>${xml(latin(p.city, 60))}</Comune>${p.province ? `<Provincia>${p.province}</Provincia>` : ''}<Nazione>${p.country}</Nazione></Sede></${tag}>`;
}

/** Erzeugt das FatturaPA-XML. Wirft bei Validierungsfehlern (keine ungültigen Dateien, keine Platzhalter). */
export function buildFatturaPA(i: FpInput): string {
  const errors = validateFatturaPA(i);
  if (errors.length) throw new Error(`FATTURAPA_INVALID: ${errors.join('; ')}`);
  const t = totals(i);
  const lines = i.lines.map((l, n) => `<DettaglioLinee><NumeroLinea>${n + 1}</NumeroLinea><Descrizione>${xml(latin(l.description, 1000))}</Descrizione><Quantita>${l.quantity.toFixed(2)}</Quantita><PrezzoUnitario>${amt(l.unitMinor)}</PrezzoUnitario><PrezzoTotale>${amt(l.quantity * l.unitMinor)}</PrezzoTotale><AliquotaIVA>${i.tax.rate.toFixed(2)}</AliquotaIVA>${i.tax.nature ? `<Natura>${i.tax.nature}</Natura>` : ''}</DettaglioLinee>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${xml(i.seller.fiscalCode ?? i.seller.vatId ?? '')}</IdCodice></IdTrasmittente><ProgressivoInvio>${xml(i.progressivo)}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>${i.codiceDestinatario}</CodiceDestinatario>${i.pec ? `<PECDestinatario>${xml(i.pec)}</PECDestinatario>` : ''}</DatiTrasmissione>
${partyXml(i.seller, 'CedentePrestatore', i.seller.regime)}
${partyXml(i.buyer, 'CessionarioCommittente')}</FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${i.docType}</TipoDocumento><Divisa>EUR</Divisa><Data>${i.date}</Data><Numero>${xml(i.number)}</Numero>${t.bollo ? '<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>' : ''}<ImportoTotaleDocumento>${amt(t.total)}</ImportoTotaleDocumento>${i.causale.map((c) => `<Causale>${xml(latin(c, 200))}</Causale>`).join('')}</DatiGeneraliDocumento>${i.relatedInvoice ? `<DatiFattureCollegate><IdDocumento>${xml(i.relatedInvoice.number)}</IdDocumento><Data>${i.relatedInvoice.date}</Data></DatiFattureCollegate>` : ''}</DatiGenerali>
<DatiBeniServizi>${lines}<DatiRiepilogo><AliquotaIVA>${i.tax.rate.toFixed(2)}</AliquotaIVA>${i.tax.nature ? `<Natura>${i.tax.nature}</Natura>` : ''}<ImponibileImporto>${amt(t.taxable)}</ImponibileImporto><Imposta>${amt(t.tax)}</Imposta>${i.tax.rate > 0 ? '<EsigibilitaIVA>I</EsigibilitaIVA>' : ''}${i.tax.law ? `<RiferimentoNormativo>${xml(latin(i.tax.law, 100))}</RiferimentoNormativo>` : ''}</DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}

export interface TaxProposal extends FpTax { proposal: true; requiresAdvisorApproval: true; explanation: string }

/**
 * VORSCHLAG für Satz/Natura nach Regime und Käufer – NICHT freigegeben (LA-06). Digitale Dienstleistung.
 *  - forfettario: keine USt, N2.2, Hinweis auf L. 190/2014
 *  - ordinario, Käufer Italien: 22 %
 *  - ordinario, EU-Unternehmen mit USt-IdNr.: nicht steuerbar in IT (Art. 7-ter), N2.1, Reverse Charge beim Käufer
 *  - ordinario, EU-Verbraucher außerhalb Italiens: OSS-Fall – Steuer des Kundenlandes, gesondert zu prüfen
 */
export function proposeItalianTax(regime: Regime, buyer: { country: string; type: 'B2B' | 'B2C'; vatId: string | null }): TaxProposal | { proposal: false; reason: string } {
  const base = { proposal: true as const, requiresAdvisorApproval: true as const };
  if (regime === 'RF19') return { ...base, rate: 0, nature: 'N2.2', law: 'Operazione senza applicazione IVA ai sensi art. 1 commi 54-89 L. 190/2014', explanation: 'Regime forfettario: Rechnungen ohne Umsatzsteuer; ab 77,47 € Stempelsteuer 2 €.' };
  if (buyer.country === 'IT') return { ...base, rate: 22, nature: null, law: null, explanation: 'Inländische Leistung: Regelsteuersatz 22 %.' };
  if (buyer.type === 'B2B' && buyer.vatId) return { ...base, rate: 0, nature: 'N2.1', law: 'Operazione non soggetta – art. 7-ter DPR 633/72 (reverse charge)', explanation: 'EU-Unternehmen: in Italien nicht steuerbar, Steuerschuld beim Käufer.' };
  return { proposal: false, reason: 'EU-Verbraucher außerhalb Italiens: OSS-Fall – maßgeblich ist der Steuersatz des Kundenlandes. Kein Vorschlag ohne geprüfte OSS-Regeln (LA-06).' };
}

export interface SellerIt { name: string | null; vatId: string | null; fiscalCode: string | null; address: string | null; cap: string | null; city: string | null; province: string | null; regime: Regime | null }

/** Zerlegt eine einzeilige Adresse („Straße 1, 20121 Milano“) – nur wenn eindeutig, sonst null (kein Raten). */
export function splitAddress(raw: string | null): { street: string; cap: string; city: string } | null {
  const m = /^(.+?),\s*(?:[A-Z]{1,2}-)?(\d{4,5})\s+([^,]+?)\s*$/.exec((raw ?? '').trim());
  return m ? { street: m[1] ?? '', cap: m[2] ?? '', city: m[3] ?? '' } : null;
}

/**
 * Baut die FatturaPA-Eingabe aus einem gespeicherten Beleg. Liefert die Liste fehlender Angaben statt einer
 * ungültigen Datei. Steuer nur, wenn ein Vorschlag existiert – er bleibt als „von der Steuerberatung zu prüfen“ markiert.
 */
export function fatturaInputFromInvoice(inv: { invoice_number: string; kind: string; created_at: string; buyer_json: string; lines_json: string; test_mode: number }, seller: SellerIt, progressivo: string): { ok: true; input: FpInput; proposal: TaxProposal } | { ok: false; missing: string[] } {
  const buyer = JSON.parse(inv.buyer_json) as { name?: string | null; address?: string | null; country?: string | null; type?: 'B2B' | 'B2C' | null; vatId?: string | null };
  const missing: string[] = [];
  if (!seller.name) missing.push('Verkäufer: Name (SELLER_NAME)');
  if (!seller.vatId) missing.push('Verkäufer: Partita IVA (SELLER_TAX_ID)');
  if (!seller.address || !seller.cap || !seller.city) missing.push('Verkäufer: Adresse, CAP und Comune (SELLER_ADDRESS, SELLER_POSTCODE, SELLER_CITY)');
  if (!seller.regime) missing.push('Verkäufer: Steuerregime RF01 ordinario oder RF19 forfettario (SELLER_REGIME) – mit Steuerberatung festlegen');
  const addr = splitAddress(buyer.address ?? null);
  if (!buyer.name) missing.push('Käufer: Name');
  if (!addr) missing.push('Käufer: Adresse nicht eindeutig (erwartet „Straße Nr., PLZ Ort“)');
  if (!buyer.country || !buyer.type) missing.push('Käufer: Land/Kundentyp');
  if (buyer.country === 'IT' && buyer.type === 'B2C') missing.push('Käufer: Codice Fiscale (für italienische Verbraucher Pflicht, wird noch nicht erfasst)');
  if (buyer.country === 'IT' && buyer.type === 'B2B' && !buyer.vatId) missing.push('Käufer: Partita IVA');
  if (buyer.country && buyer.country !== 'IT' && buyer.type === 'B2B' && !buyer.vatId) missing.push('Käufer: USt-IdNr. des ausländischen Unternehmens');
  if (inv.kind === 'CREDIT_NOTE') missing.push('Gutschriften (TD04) werden erst nach Prüfung des Bezugs unterstützt');
  const prop = seller.regime && buyer.country && buyer.type ? proposeItalianTax(seller.regime, { country: buyer.country, type: buyer.type, vatId: buyer.vatId ?? null }) : null;
  if (prop && !prop.proposal) missing.push(prop.reason);
  if (missing.length || !prop || !prop.proposal || !addr) return { ok: false, missing };
  const lines = JSON.parse(inv.lines_json) as { description: string; quantity: number; net_minor: number }[];
  const vat = (buyer.vatId ?? '').replace(/^[A-Z]{2}/, '') || null;
  return {
    ok: true, proposal: prop,
    input: {
      progressivo,
      seller: { country: 'IT', vatId: seller.vatId, fiscalCode: seller.fiscalCode, name: seller.name ?? '', address: seller.address ?? '', cap: seller.cap ?? '', city: seller.city ?? '', province: seller.province, regime: seller.regime ?? 'RF01' },
      buyer: { country: buyer.country ?? '', vatId: vat, fiscalCode: null, name: buyer.name ?? '', address: addr.street, cap: addr.cap, city: addr.city, province: null },
      codiceDestinatario: buyer.country === 'IT' ? '0000000' : 'XXXXXXX', pec: null, docType: 'TD01',
      number: inv.invoice_number, date: inv.created_at.slice(0, 10),
      lines: lines.map((l) => ({ description: l.description.replace(/b2b-calc-(csv|pdf|bundle)/g, 'Kalkulation'), quantity: l.quantity, unitMinor: l.net_minor })),
      tax: { rate: prop.rate, nature: prop.nature, law: prop.law },
      causale: [...(inv.test_mode ? ['TESTBELEG - NICHT AN DAS SDI UEBERMITTELN'] : []), 'Steuerbehandlung: Vorschlag, von der Steuerberatung zu pruefen (LA-06)'],
    },
  };
}
