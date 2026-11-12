import type { AppContext } from '../../core-api/src/context.ts';

/**
 * 108 Produkt-Herkunftsnachweis: Zu jeder gelieferten Datei kann jeder anhand der SHA-256-Prüfsumme nachprüfen,
 * ob sie von INFINITY EARN erzeugt wurde – mit Produktart, Version, Prüfprotokoll, Rechteangaben und eingesetzten
 * Werkzeugen. Enthält KEINE Kunden- oder Auftragsdaten. Unvollständige Nachweise werden klar gekennzeichnet.
 */
export interface ProvenancePassport {
  found: true;
  sha256: string;
  product: string;
  generator: string;
  createdDay: string;
  bytes: number;
  mediaType: string;
  qa: { passed: boolean; checks: { check: string; passed: boolean }[] } | null;
  rights: { origin: string; thirdPartyAssets: string[]; license: string } | null;
  aiTools: string[];
  delivered: boolean;
  revoked: boolean;
  testMode: boolean;
  complete: boolean;
  warnings: string[];
}

export function verifyProvenance(ctx: AppContext, sha: string): ProvenancePassport | { found: false } {
  const hash = sha.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return { found: false };
  const a = ctx.db.get<{ artifact_id: string; capability_id: string; capability_version: number; bytes: number; media_type: string; rights_json: string; created_at: string; quarantined_at: string | null; test_mode: number }>(
    'SELECT artifact_id, capability_id, capability_version, bytes, media_type, rights_json, created_at, quarantined_at, test_mode FROM artifacts WHERE sha256 = ? ORDER BY created_at DESC LIMIT 1', hash,
  );
  if (!a) return { found: false };
  const qaRow = ctx.db.get<{ passed: number; results_json: string }>('SELECT passed, results_json FROM qa_runs WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1', a.artifact_id);
  const del = ctx.db.get<{ revoked_at: string | null }>('SELECT revoked_at FROM deliveries WHERE artifact_id = ?', a.artifact_id);
  let rights: ProvenancePassport['rights'] = null;
  try {
    const r = JSON.parse(a.rights_json) as { origin?: string; third_party_assets?: string[]; customer_license?: string };
    if (r.origin) rights = { origin: r.origin, thirdPartyAssets: r.third_party_assets ?? [], license: r.customer_license ?? '' };
  } catch { /* unvollständig → Warnung */ }
  const warnings: string[] = [];
  if (!qaRow) warnings.push('Kein Prüfprotokoll vorhanden.');
  else if (!qaRow.passed) warnings.push('Qualitätsprüfung nicht bestanden – diese Datei wurde nicht ausgeliefert.');
  if (!rights) warnings.push('Rechteangaben fehlen.');
  if (a.quarantined_at) warnings.push('Datei wurde wegen eines Integritätsproblems gesperrt.');
  if (del?.revoked_at) warnings.push('Die Lieferung wurde zurückgezogen.');
  if (a.test_mode === 1) warnings.push('Im Testbetrieb erstellt – kein verkauftes Produkt.');
  ctx.audit.record({ type: 'provenance.checked', actor: 'anonymous', subjectType: 'artifact', subjectId: a.artifact_id, testMode: ctx.config.testMode });
  return {
    found: true, sha256: hash, product: a.capability_id, generator: `${a.capability_id}@${a.capability_version}`, createdDay: a.created_at.slice(0, 10), bytes: a.bytes, mediaType: a.media_type,
    qa: qaRow ? { passed: qaRow.passed === 1, checks: (JSON.parse(qaRow.results_json) as { check: string; passed: boolean }[]).map((c) => ({ check: c.check, passed: c.passed })) } : null,
    rights, aiTools: [], delivered: !!del, revoked: !!del?.revoked_at, testMode: a.test_mode === 1,
    complete: !!qaRow && qaRow.passed === 1 && !!rights && !a.quarantined_at, warnings,
  };
}
