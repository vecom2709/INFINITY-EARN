import { createZip, readZip } from '../../../../packages/shared/src/zip.ts';
import type { ProductCapability, QaCheckResult } from '../types.ts';
import { asCalcInput, b2bCalcCsv, calcInputSchema, MAX_ITEMS, type CalcInput } from './b2b-calc-csv.ts';
import { b2bCalcPdf } from './b2b-calc-pdf.ts';

/**
 * 093 Produktpaket: Kalkulation als bearbeitbare Tabelle (CSV) UND druckfertiges PDF in einem ZIP.
 * Preis = Herstellungsaufwand + Marge (gleiche Angebotslogik wie Einzelprodukte) – kein vorgetäuschter Rabatt.
 * Die QA prüft das ZIP selbst und jede enthaltene Datei mit der QA ihrer eigenen Produktart.
 */
export const BUNDLE_FILES = { csv: 'kalkulation.csv', pdf: 'kalkulation.pdf' } as const;

function generate(raw: unknown): Uint8Array {
  const input = asCalcInput(raw);
  return createZip([
    { name: BUNDLE_FILES.csv, bytes: b2bCalcCsv.generate(input) },
    { name: BUNDLE_FILES.pdf, bytes: b2bCalcPdf.generate(input) },
  ]);
}

function runQa(bytes: Uint8Array, raw: unknown): QaCheckResult[] {
  let input: CalcInput;
  try {
    input = asCalcInput(raw);
  } catch (e) {
    return [{ check: 'input', passed: false, detail: (e as Error).message }];
  }
  let entries: ReturnType<typeof readZip>;
  try {
    entries = readZip(bytes);
  } catch (e) {
    return [{ check: 'zip_structure', passed: false, detail: (e as Error).message }];
  }
  const names = entries.map((x) => x.name).sort();
  const structureOk = names.join('|') === [BUNDLE_FILES.csv, BUNDLE_FILES.pdf].sort().join('|') && entries.every((x) => x.crcOk);
  const results: QaCheckResult[] = [{ check: 'zip_structure', passed: structureOk, detail: structureOk ? '2 Dateien, CRC32 geprüft' : `Inhalt: ${names.join(', ')}` }];
  const csv = entries.find((x) => x.name === BUNDLE_FILES.csv);
  const pdf = entries.find((x) => x.name === BUNDLE_FILES.pdf);
  const csvQa = csv ? b2bCalcCsv.runQa(csv.bytes, input) : [];
  const pdfQa = pdf ? b2bCalcPdf.runQa(pdf.bytes, input) : [];
  const csvOk = csvQa.length > 0 && csvQa.every((c) => c.passed);
  const pdfOk = pdfQa.length > 0 && pdfQa.every((c) => c.passed);
  results.push({ check: 'csv_qa', passed: csvOk, detail: csvOk ? csvQa.map((c) => c.check).join(',') : csvQa.filter((c) => !c.passed).map((c) => c.check).join(',') || 'fehlt' });
  results.push({ check: 'pdf_qa', passed: pdfOk, detail: pdfOk ? pdfQa.map((c) => c.check).join(',') : pdfQa.filter((c) => !c.passed).map((c) => c.check).join(',') || 'fehlt' });
  return results;
}

export const b2bCalcBundle: ProductCapability = {
  capability_id: 'b2b-calc-bundle',
  version: 1,
  inputs_schema: calcInputSchema,
  output_schema: { media_type: 'application/zip', extension: 'zip' },
  licensing_requirements: 'Wie Einzelprodukte: nur kundeneigene Positionsdaten, Eigenarbeit, keine Fremd-Assets.',
  required_tools: ['node'],
  estimated_duration_minutes: 1,
  max_complexity: MAX_ITEMS,
  qa_suite: ['zip_structure', 'csv_qa', 'pdf_qa', 'checksum'],
  supported_languages: ['de', 'en', 'it'],
  data_privacy: 'Enthält nur vom Kunden gelieferte Positionsnamen/Beträge.',
  artifact_storage: 'Blob-Speicher pro Auftrag, SHA-256 geprüft.',
  refund_criteria: 'Rückerstattung, wenn eine der beiden Dateien die QA nach Korrekturschleife nicht besteht.',
  disabled_reason: null,
  owner: 'services/product-factory',
  estimatedCostMinor(input: unknown): number {
    // Aufwand beider Einzelprodukte abzüglich der nur einmal nötigen Prüfung (transparent, kein Rabatt-Versprechen)
    return Math.max(b2bCalcCsv.estimatedCostMinor(input), b2bCalcPdf.estimatedCostMinor(input)) + 1500;
  },
  complexity(input: unknown): number {
    return (input as Partial<CalcInput>)?.items?.length ?? 0;
  },
  generate,
  runQa,
};
