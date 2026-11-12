/**
 * Opportunity-Scoring (Masterprompt Modul 03). Deterministisch und erklärbar: jede Punktzahl
 * hat einen Grund. Keine erfundenen Erträge – ist ein Wert nicht bestimmbar, wird er nicht geschätzt.
 */
export interface ScoringTarget {
  /** CPV-Codes, die zur aktiven Produktklasse passen. */
  cpv: readonly string[];
  /** Schlüsselwörter (mehrsprachig) im Titel. */
  keywords: readonly string[];
}

/** Ziel für die aktive Produktklasse b2b-calc-csv (Kalkulations-/Tabellenwerkzeuge). */
export const B2B_CALC_TARGET: ScoringTarget = {
  cpv: ['48440000', '48441000', '48442000', '48443000', '48461000', '48463000', '48300000', '72212000', '72212440', '72212441', '72212443'],
  keywords: [
    'kalkulation', 'kalkulator', 'tabellenkalkulation', 'kostenrechnung', 'preiskalkulation', 'kostenkalkulation',
    'calculation', 'calculator', 'spreadsheet', 'costing', 'cost model', 'pricing tool',
    'calcolo', 'foglio di calcolo', 'calcolatore', 'preventivo',
    'excel', 'csv',
  ],
};

export interface ScoreInput {
  title: string;
  cpv: readonly string[];
  noticeType: string | null;
  deadline: string | null;
  now: Date;
}

export interface Score {
  fit: number;
  evidence: number;
  risk: number;
  total: number;
  relevant: boolean;
  reasons: string[];
}

export const RELEVANCE_MIN_FIT = 50;

/** Ende des Fristtages als Zeitstempel ("2026-12-09+02:00" -> 2026-12-09T23:59:59Z). */
export function deadlineMs(deadline: string | null): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) return null;
  const t = Date.parse(`${deadline.slice(0, 10)}T23:59:59Z`);
  return Number.isFinite(t) ? t : null;
}

export function scoreItem(i: ScoreInput, target: ScoringTarget = B2B_CALC_TARGET): Score {
  const reasons: string[] = [];
  let fit = 0;
  const exact = i.cpv.filter((c) => target.cpv.includes(c));
  if (exact.length) {
    fit += 50;
    reasons.push(`CPV passt exakt: ${[...new Set(exact)].join(', ')}`);
  } else if (i.cpv.some((c) => target.cpv.some((t) => t.slice(0, 4) === c.slice(0, 4)))) {
    fit += 20;
    reasons.push('CPV aus verwandter Gruppe');
  } else reasons.push('CPV passt nicht zur aktiven Produktklasse');
  const title = i.title.toLowerCase();
  const kw = target.keywords.filter((k) => title.includes(k));
  if (kw.length) {
    fit += 50;
    reasons.push(`Titel enthält: ${kw.join(', ')}`);
  }
  fit = Math.min(fit, 100);

  let evidence = 0;
  const type = i.noticeType ?? '';
  const dl = deadlineMs(i.deadline);
  if (type.startsWith('cn-')) {
    evidence = 60;
    reasons.push('Offene Ausschreibung (Auftragsbekanntmachung)');
    if (dl !== null && dl > i.now.getTime()) {
      evidence = 100;
      reasons.push(`Angebotsfrist offen bis ${i.deadline?.slice(0, 10)}`);
    } else if (dl !== null) reasons.push('Angebotsfrist abgelaufen');
    else reasons.push('Keine Frist angegeben');
  } else if (type.startsWith('pin-')) {
    evidence = 30;
    reasons.push('Vorinformation – noch kein Auftrag');
  } else reasons.push(`Kein offener Bedarf (Typ ${type || 'unbekannt'}, z. B. Vergabebekanntmachung)`);

  // Öffentliche Vergaben verlangen formelle Teilnahme: immer menschliche Prüfung.
  let risk = 50;
  reasons.push('Formelles Vergabeverfahren – nur manuelle Einreichung');
  if (dl !== null && dl > i.now.getTime() && dl - i.now.getTime() < 7 * 86_400_000) {
    risk += 30;
    reasons.push('Frist kürzer als 7 Tage');
  }
  const total = Math.max(0, Math.round(fit * 0.5 + evidence * 0.4 - risk * 0.1));
  // Ein CPV-Treffer allein reicht nicht: CPV-Gruppen wie "Anwendersoftware" decken auch Großprojekte ab
  // (Live-Befund 12.11.2026: Elektrobusse, SAP-Einführung). Relevant nur mit produktspezifischem Titelbegriff.
  const relevant = evidence === 100 && fit >= RELEVANCE_MIN_FIT && kw.length > 0;
  if (evidence === 100 && kw.length === 0) reasons.push('Kein produktspezifischer Begriff im Titel – nicht lieferbar mit aktiver Produktklasse');
  return { fit, evidence, risk: Math.min(risk, 100), total, relevant, reasons };
}
