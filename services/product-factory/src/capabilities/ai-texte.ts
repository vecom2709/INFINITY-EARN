import { createZip, readZip } from '../../../../packages/shared/src/zip.ts';
import { checkTexts, renderTexts, TEXT_FILES, validateTextSpec, type TextResult, type TextSpec } from '../../../../products/ai-texte/texte.ts';
import type { ProductCapability, QaCheckResult } from '../types.ts';

/**
 * 16.0: KI-Texte – geschrieben von Claude über das Claude-Abo (offizielle Claude-Code-Action, GitHub Actions).
 * Der Worker formt aus Claudes Rohergebnis (JSON) selbst das Lieferpaket und prüft es unabhängig.
 * Nicht bestellbar ohne Eigentümer-Freigabe; ohne eingerichtetes Abo-Token warten Aufträge sicher.
 */
export const AI_TEXTE_VERSION = 1;

function parseResult(raw: Uint8Array): TextResult {
  if (raw.length > 60_000) throw new Error('RESULT_TOO_LARGE');
  const j = JSON.parse(new TextDecoder().decode(raw)) as TextResult;
  if (!j || !Array.isArray(j.texts)) throw new Error('RESULT_INVALID: texts fehlt');
  return { texts: j.texts.map((t) => ({ kind: t.kind, title: String(t.title ?? ''), body: String(t.body ?? '') })) };
}

/** Rohergebnis von Claude → Lieferpaket (ZIP). Wirft bei unlesbarem Ergebnis. */
export function assembleTexts(raw: Uint8Array, input: unknown): Uint8Array {
  const spec = validateTextSpec(input);
  const res = parseResult(raw);
  const r = renderTexts(spec, res);
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  // inhalt.json enthält das vollständige Rohergebnis, damit die Prüfung auch zusätzliche/fehlende Textarten erkennt.
  return createZip([{ name: TEXT_FILES.md, bytes: enc(r.md) }, { name: TEXT_FILES.html, bytes: enc(r.html) }, { name: TEXT_FILES.json, bytes: enc(`${JSON.stringify(res, null, 2)}\n`) }, { name: TEXT_FILES.readme, bytes: enc(r.readme) }]);
}

function runQa(bytes: Uint8Array, raw: unknown): QaCheckResult[] {
  let spec: TextSpec;
  try {
    spec = validateTextSpec(raw);
  } catch (e) {
    return [{ check: 'input', passed: false, detail: (e as Error).message }];
  }
  let entries: ReturnType<typeof readZip>;
  try {
    entries = readZip(bytes);
  } catch (e) {
    return [{ check: 'zip_structure', passed: false, detail: (e as Error).message }];
  }
  const names = entries.map((x) => x.name).sort().join('|');
  const ok = names === Object.values(TEXT_FILES).sort().join('|') && entries.every((x) => x.crcOk);
  const results: QaCheckResult[] = [{ check: 'zip_structure', passed: ok, detail: ok ? 'Markdown, HTML, JSON, LIESMICH; CRC32 geprüft' : `Inhalt: ${names.slice(0, 120)}` }];
  const file = (n: string): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(entries.find((x) => x.name === n)?.bytes ?? new Uint8Array());
  let res: TextResult;
  try {
    res = JSON.parse(file(TEXT_FILES.json)) as TextResult;
  } catch {
    return [...results, { check: 'text_structure', passed: false, detail: 'inhalt.json nicht lesbar' }];
  }
  results.push(...checkTexts(spec, res));
  // Ausgelieferte Darstellungen entsprechen genau den geprüften Texten (keine nachträglichen Änderungen)
  const ordered: TextResult = { texts: spec.texts.map((s) => res.texts.find((t) => t.kind === s.kind)).filter((t): t is TextResult['texts'][number] => !!t) };
  const r = renderTexts(spec, ordered);
  const same = file(TEXT_FILES.md) === r.md && file(TEXT_FILES.html) === r.html && file(TEXT_FILES.readme) === r.readme && !/<script|<iframe|on\w+=|javascript:/i.test(file(TEXT_FILES.html));
  results.push({ check: 'text_render', passed: same, detail: same ? 'Markdown und HTML entsprechen den geprüften Texten, ohne Skripte' : 'Darstellung weicht ab oder enthält aktive Inhalte' });
  return results;
}

export const aiTexte: ProductCapability = {
  capability_id: 'ai-texte',
  version: AI_TEXTE_VERSION,
  inputs_schema: { type: 'object', required: ['company', 'offer', 'audience', 'language', 'texts'] },
  output_schema: { media_type: 'application/zip', extension: 'zip' },
  licensing_requirements: 'Texte entstehen neu nach dem Briefing; der Kunde erhält die Nutzungsrechte. Keine fremden Texte, keine erfundenen Fakten.',
  required_tools: ['claude-code-action (Claude-Abo des Eigentümers)'],
  estimated_duration_minutes: 30,
  max_complexity: 1,
  qa_suite: ['zip_structure', 'text_structure', 'text_length', 'text_language', 'text_brief', 'text_claims', 'text_safety', 'text_render', 'checksum'],
  supported_languages: ['de', 'it', 'en'],
  data_privacy: 'Claude erhält nur das Briefing (Firma, Angebot, Zielgruppe, Fakten, Stichworte). Keine Kundenkontakte, keine Zugangsdaten. Inhalte erscheinen nicht in öffentlichen Protokollen.',
  artifact_storage: 'Blob-Speicher pro Auftrag, SHA-256 geprüft.',
  refund_criteria: 'Rückerstattung, wenn nach drei Versuchen kein Ergebnis die Abnahmeprüfung besteht.',
  disabled_reason: null,
  owner: 'services/product-factory',
  estimatedCostMinor: () => 0,
  complexity: () => 1,
  generate: () => {
    throw new Error('EXTERNAL_BUILD_REQUIRED: Texte schreibt Claude über den KI-Agenten');
  },
  runQa,
  externalBuild: { platform: 'ai-claude', spec: (input) => validateTextSpec(input), assemble: assembleTexts },
};
