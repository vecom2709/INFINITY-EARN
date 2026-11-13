import { EXTENSION_IDS, NOT_APPROVED_IDS, REGISTRY, REGISTRY_SHA256, REJECTED_IDS, fmtId } from './registry.ts';
import { modulesWithStatus, type ImplStatus } from './status.ts';

/**
 * Export für den Gesamtprompt (§12/§13): FEATURE_REGISTRY_147.json mit dem dort verlangten Status-Vokabular.
 *  UMGESETZT → TESTED (Testnachweis Pflicht) · TEILWEISE → TESTED mit scope "partial" (Umgesetztes getestet, Rest offen)
 *  GEPLANT → SPECIFIED · GESPERRT → BLOCKED. LIVE_VERIFIED vergibt nur ein echter Live-Nachweis – derzeit keiner.
 */
export type ExportStatus = 'SPECIFIED' | 'IMPLEMENTED' | 'TESTED' | 'LIVE_VERIFIED' | 'BLOCKED';

const MAP: Record<ImplStatus, { status: ExportStatus; scope: 'full' | 'partial' | 'none' }> = {
  UMGESETZT: { status: 'TESTED', scope: 'full' },
  TEILWEISE: { status: 'TESTED', scope: 'partial' },
  GEPLANT: { status: 'SPECIFIED', scope: 'none' },
  GESPERRT: { status: 'BLOCKED', scope: 'none' },
};

export function featureRegistryExport(): unknown {
  const features = modulesWithStatus().map((m) => ({
    id: fmtId(m.n),
    approved: true,
    title: m.title,
    title_de: m.titleDe,
    status: MAP[m.status].status,
    scope: MAP[m.status].scope,
    internal_status: m.status,
    milestone: m.milestone,
    implemented: m.umgesetzt ?? null,
    open: m.offen ?? null,
    evidence: m.evidence,
    test_command: m.evidence.length ? `node --test ${m.evidence.join(' ')}` : null,
    live_verified: false,
  }));
  const count = (s: ExportStatus, scope?: string): number => features.filter((f) => f.status === s && (!scope || f.scope === scope)).length;
  return {
    schema: 'infinity-earn-feature-registry/1',
    version: REGISTRY.version,
    source_sha256: REGISTRY_SHA256,
    approved_count: features.length,
    rejected: REJECTED_IDS.map((n) => ({ id: fmtId(n), approved: false, note: 'NEIN – darf nicht als Zusatzmodul eingeführt werden' })),
    not_approved: NOT_APPROVED_IDS.map((n) => ({ id: fmtId(n), approved: false, note: 'nicht freigegeben (früherer Vorschlag)' })),
    extension: { ids: EXTENSION_IDS.map(fmtId), source: 'docs/spec/v15-147 (Eigentümer, 13.11.2026)', note: 'beauftragt, nicht automatisch umgesetzt' },
    summary: { TESTED_full: count('TESTED', 'full'), TESTED_partial: count('TESTED', 'partial'), SPECIFIED: count('SPECIFIED'), BLOCKED: count('BLOCKED'), LIVE_VERIFIED: count('LIVE_VERIFIED') },
    note: 'Erzeugt aus packages/registry (node scripts/export-registry.ts); 127 ursprüngliche + 20 beauftragte Funktionen. LIVE_VERIFIED erst nach echter, autorisierter Live-Transaktion mit Bankbestätigung.',
    features,
  };
}
