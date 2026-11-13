import { sha256Hex } from '../../../../packages/shared/src/crypto.ts';
import { pdfString } from '../../../../packages/shared/src/pdf.ts';
import { readZip } from '../../../../packages/shared/src/zip.ts';
import { containsBytes, utf16le, validateWinSpec, WIN_MIN_UNIT_TESTS, WIN_PRODUCT_ID, WIN_VERSION, winPackageNames, winReadme, type WinManifest, type WinSpec } from '../../../../products/win-lager/package.ts';
import type { ProductCapability, QaCheckResult } from '../types.ts';

/**
 * Funktion 157/158: „Lager & Rechnung für Windows“ – echtes Windows-Programm mit Installer je Kunde.
 * Der Worker kann keine Windows-Programme übersetzen: Gebaut wird extern (GitHub-Windows-Server, scripts/win-build-agent.ts).
 * Diese Produktart prüft das hochgeladene Paket unabhängig vom Bau-Agenten: passt es zum Auftrag, stimmen Prüfsummen,
 * wurden alle Fachtests bestanden, ist es ein echtes Windows-Programm mit dem Firmennamen des Kunden.
 * Nicht bestellbar, solange die Freigabe-Akte sperrt (products/win-lager/release.ts) – Verkauf nur nach Eigentümer-Freigabe.
 */
export const WIN_LAGER_VERSION = 1;

const u32 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16)) + (b[o + 3] ?? 0) * 0x1000000;

/** Echtes Windows-Programm: MZ-Kopf, PE-Signatur, plausible Größe. */
export function isWindowsExe(b: Uint8Array): boolean {
  if (b.length < 4096 || b.length > 8 * 1024 * 1024 || b[0] !== 0x4d || b[1] !== 0x5a) return false;
  const pe = u32(b, 0x3c);
  return pe > 0 && pe < b.length - 4 && b[pe] === 0x50 && b[pe + 1] === 0x45 && b[pe + 2] === 0 && b[pe + 3] === 0;
}

function runQa(bytes: Uint8Array, raw: unknown): QaCheckResult[] {
  let spec: WinSpec;
  try {
    spec = validateWinSpec(raw);
  } catch (e) {
    return [{ check: 'input', passed: false, detail: (e as Error).message }];
  }
  const n = winPackageNames(spec.lang);
  let entries: ReturnType<typeof readZip>;
  try {
    entries = readZip(bytes);
  } catch (e) {
    return [{ check: 'zip_structure', passed: false, detail: (e as Error).message }];
  }
  const names = entries.map((x) => x.name).sort();
  const expected = Object.values(n).sort();
  const structureOk = names.join('|') === expected.join('|') && entries.every((x) => x.crcOk);
  const results: QaCheckResult[] = [{ check: 'zip_structure', passed: structureOk, detail: structureOk ? '4 Dateien (Installer, Anleitung, Bauprotokoll, LIESMICH), CRC32 geprüft' : `Inhalt: ${names.join(', ').slice(0, 200)}` }];
  const file = (name: string): Uint8Array | undefined => entries.find((x) => x.name === name)?.bytes;
  const setup = file(n.setup);
  const manual = file(n.manual);

  // Bauprotokoll passt zum Auftrag und zu den Dateien
  let m: WinManifest | null;
  try {
    m = JSON.parse(new TextDecoder().decode(file(n.manifest) ?? new Uint8Array())) as WinManifest;
  } catch {
    m = null;
  }
  const mp: string[] = [];
  if (!m) mp.push('nicht lesbar');
  else {
    if (m.product !== WIN_PRODUCT_ID || m.version !== WIN_VERSION) mp.push('Produkt/Version');
    if (m.company !== spec.company) mp.push('Firmenname');
    if (m.language !== spec.lang) mp.push('Sprache');
    if (m.signed !== false) mp.push('Signaturangabe');
    for (const [name, b] of [[n.setup, setup], [n.manual, manual]] as const) {
      const f = m.files?.find((x) => x.name === name);
      if (!f || !b || f.sha256 !== sha256Hex(b) || f.bytes !== b.length) mp.push(`Prüfsumme ${name}`);
    }
  }
  results.push({ check: 'build_manifest', passed: mp.length === 0, detail: mp.length ? mp.join('; ') : `passt zum Auftrag, ehrlich unsigniert${m?.source ? `, Quelle ${m.source.commit.slice(0, 7)}` : ''}` });

  const ut = m?.unitTests;
  const utOk = !!ut && ut.failed === 0 && ut.passed >= WIN_MIN_UNIT_TESTS;
  results.push({ check: 'unit_tests', passed: utOk, detail: ut ? `${ut.passed} bestanden, ${ut.failed} fehlgeschlagen (mindestens ${WIN_MIN_UNIT_TESTS})` : 'kein Testergebnis' });

  results.push({ check: 'installer', passed: !!setup && isWindowsExe(setup), detail: setup ? `${Math.round(setup.length / 1024)} KB, ${isWindowsExe(setup) ? 'Windows-Programm (PE)' : 'kein Windows-Programm'}` : 'fehlt' });

  // Kundenangaben stehen im Programm (C#-Zeichenketten, UTF-16)
  const bp: string[] = [];
  if (!setup || !containsBytes(setup, utf16le(spec.company))) bp.push('Firmenname');
  if (!setup || !containsBytes(setup, utf16le(spec.color))) bp.push('Farbe');
  if (!setup || !containsBytes(setup, utf16le({ de: 'de-DE', it: 'it-IT', en: 'en-GB' }[spec.lang]))) bp.push('Sprache');
  results.push({ check: 'branding', passed: bp.length === 0, detail: bp.length ? `fehlt im Programm: ${bp.join(', ')}` : `${spec.company}, ${spec.color}, ${spec.lang}/${spec.country}` });

  // Bebilderte Anleitung in der Kundensprache
  const pp: string[] = [];
  const s = manual ? new TextDecoder('latin1').decode(manual) : '';
  if (!s.startsWith('%PDF-1.') || !s.trimEnd().endsWith('%%EOF')) pp.push('Kopf/Ende');
  const pages = (s.match(/\/Type \/Page /g) ?? []).length;
  const images = (s.match(/\/Subtype \/Image/g) ?? []).length;
  if (pages < 8) pp.push(`${pages} Seiten`);
  if (images < 5) pp.push(`${images} Bilder`);
  if (!s.includes(`/Lang (${spec.lang})`)) pp.push('Sprache');
  if (!s.includes(pdfString(spec.company))) pp.push('Firmenname');
  if (/\/JavaScript|\/JS |\/Launch|\/OpenAction|\/EmbeddedFile/.test(s)) pp.push('aktive Inhalte');
  results.push({ check: 'manual_pdf', passed: pp.length === 0, detail: pp.length ? pp.join('; ') : `${pages} Seiten, ${images} Bilder (${spec.lang})` });

  const readme = new TextDecoder('utf-8', { ignoreBOM: true }).decode(file(n.readme) ?? new Uint8Array());
  const readmeOk = !!setup && !!manual && readme === winReadme(spec.lang, spec.company, sha256Hex(setup), sha256Hex(manual));
  results.push({ check: 'readme', passed: readmeOk, detail: readmeOk ? 'Start, Signaturhinweis und Prüfsummen stimmen' : 'LIESMICH fehlt oder weicht ab' });
  return results;
}

export const winLager: ProductCapability = {
  capability_id: WIN_PRODUCT_ID,
  version: WIN_LAGER_VERSION,
  inputs_schema: {
    type: 'object',
    required: ['company', 'color', 'lang', 'country'],
    properties: { company: { type: 'string', minLength: 1, maxLength: 80 }, color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, lang: { enum: ['de', 'it', 'en'] }, country: { enum: ['DE', 'AT', 'IT'] } },
  },
  output_schema: { media_type: 'application/zip', extension: 'zip' },
  licensing_requirements: 'Eigenentwicklung, gebaut mit dem in Windows enthaltenen .NET-Framework-Compiler; amtliches FatturaPA-Schema unverändert eingebettet.',
  required_tools: ['windows-build-agent'],
  estimated_duration_minutes: 30,
  max_complexity: 1,
  qa_suite: ['zip_structure', 'build_manifest', 'unit_tests', 'installer', 'branding', 'manual_pdf', 'readme', 'checksum'],
  supported_languages: ['de', 'it', 'en'],
  data_privacy: 'Der Bau-Agent erhält nur Firmenname, Farbe, Sprache und Land – nie über öffentliche Protokolle. Geschäftsdaten bleiben später auf dem Rechner des Kunden.',
  artifact_storage: 'Blob-Speicher pro Auftrag, SHA-256 geprüft.',
  refund_criteria: 'Rückerstattung, wenn kein Bau die Abnahmeprüfungen nach der Wiederholung besteht oder das Programm die zugesagten Abläufe nicht ausführt.',
  disabled_reason: null,
  owner: 'services/product-factory',
  estimatedCostMinor: () => 0,
  complexity: () => 1,
  generate: () => {
    throw new Error('EXTERNAL_BUILD_REQUIRED: Windows-Programme baut der Bau-Agent');
  },
  runQa,
  externalBuild: { platform: 'windows', spec: (input) => validateWinSpec(input) },
};
