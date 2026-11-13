import { b2bCalcCsv } from './capabilities/b2b-calc-csv.ts';
import { b2bCalcPdf } from './capabilities/b2b-calc-pdf.ts';
import { b2bCalcBundle } from './capabilities/b2b-calc-bundle.ts';
import { miniWw } from './capabilities/mini-ww.ts';
import { winLager } from './capabilities/win-lager.ts';
import { aiTexte } from './capabilities/ai-texte.ts';
import { standardGaps } from './quality-standard.ts';
import type { ProductCapability } from './types.ts';

function disabled(id: string, reason: string): ProductCapability {
  return {
    capability_id: id,
    version: 0,
    inputs_schema: { type: 'object' },
    output_schema: { media_type: 'application/octet-stream', extension: 'bin' },
    licensing_requirements: 'n/a',
    required_tools: [],
    estimated_duration_minutes: 0,
    max_complexity: 0,
    qa_suite: [],
    supported_languages: [],
    data_privacy: 'n/a',
    artifact_storage: 'n/a',
    refund_criteria: 'n/a',
    disabled_reason: reason,
    owner: 'services/product-factory',
    estimatedCostMinor: () => 0,
    complexity: () => Number.POSITIVE_INFINITY,
    generate: () => {
      throw new Error(`CAPABILITY_DISABLED:${id}`);
    },
    runQa: () => [{ check: 'enabled', passed: false, detail: reason }],
  };
}

/** Capability-Matrix: nur was nachweislich kostenlos und zuverlässig herstellbar ist, ist aktiv. */
const REGISTRY: ReadonlyMap<string, ProductCapability> = new Map(
  [
    b2bCalcCsv,
    b2bCalcPdf,
    b2bCalcBundle,
    miniWw, // Pilot-Fachsoftware: gebaut und abgenommen, Verkauf erst nach Eigentümer-Freigabe (P4)
    winLager, // Windows-Programm (157/158): Bau je Auftrag über den Bau-Agenten, Verkauf erst nach Freigabe
    aiTexte, // 16.0: KI-Texte über das Claude-Abo (Claude-Code-Action), Verkauf erst nach Freigabe
    disabled('video-production', 'Kein nachgewiesener kostenloser Compute für Video-Rendering (Free-Worker-Limits).'),
    disabled('3d-assets', 'Rendering/Qualität auf kostenloser Hardware nicht belegt.'),
    disabled('logo-design', 'Keine lizenzierte Bild-Engine verfügbar.'),
    disabled('text-documents-ai', 'Benötigt Claude-Kontingent + QA-Prozess; Aktivierung ab M1 nach Prüfung.'),
  ].map((c) => [c.capability_id, c]),
);

export function getCapability(id: string): ProductCapability | undefined {
  return REGISTRY.get(id);
}

export function routeCapability(id: string): { ok: true; capability: ProductCapability } | { ok: false; reason: string } {
  const c = REGISTRY.get(id);
  if (!c) return { ok: false, reason: 'CAPABILITY_UNKNOWN' };
  if (c.disabled_reason) return { ok: false, reason: `CAPABILITY_DISABLED: ${c.disabled_reason}` };
  // Premium-Produktstandard: ohne vollständige Standard-Akte nicht verkaufbar.
  const gaps = standardGaps(c);
  if (gaps.length) return { ok: false, reason: `STANDARD_INCOMPLETE: ${gaps.join('; ')}` };
  return { ok: true, capability: c };
}

export function listCapabilities(): { id: string; version: number; enabled: boolean; disabled_reason: string | null }[] {
  return [...REGISTRY.values()].map((c) => ({ id: c.capability_id, version: c.version, enabled: !c.disabled_reason, disabled_reason: c.disabled_reason }));
}
