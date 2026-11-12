import raw from './registry-127.json' with { type: 'json' };

/**
 * Read-only-Registry der 127 vom Eigentümer bestätigten Funktionen (INFINITY EARN 15.0).
 * Quelle: docs/spec/v15/REGISTRY_127.json (SHA-256 laut Paket-Manifest unten fest verankert).
 * Beim Laden wird geprüft: exakt 127, IDs = 001–047, 050–109, 111–130, abgelehnte 048/049/110 fehlen.
 * Alle Objekte sind eingefroren – zur Laufzeit nicht veränderbar.
 */
export const REGISTRY_SHA256 = '152264ef05f781e343f75fbb28dd3a78c8d527fc4fcb357769c0eb043186aa41';
export const REJECTED_IDS: readonly number[] = Object.freeze([48, 49, 110]);

export interface RegistryModule {
  readonly n: number;
  readonly title: string;
  readonly goal: string;
  readonly gate: string;
}

export interface Registry {
  readonly version: string;
  readonly approvedIds: readonly number[];
  readonly rejectedIds: readonly number[];
  readonly modules: readonly RegistryModule[];
  readonly policy: Readonly<Record<string, unknown>>;
}

export class RegistryError extends Error {}

export function expectedApprovedIds(): number[] {
  const ids: number[] = [];
  for (let i = 1; i <= 130; i++) if (!REJECTED_IDS.includes(i)) ids.push(i);
  return ids;
}

/** Validiert eine Registry-Struktur. Wirft RegistryError mit allen Abweichungen. */
export function validateRegistry(data: unknown): Registry {
  const d = data as { version?: unknown; approved_ids?: unknown; rejected_ids?: unknown; modules?: unknown; policy?: unknown };
  const issues: string[] = [];
  const approved = Array.isArray(d.approved_ids) ? (d.approved_ids as number[]) : [];
  const rejected = Array.isArray(d.rejected_ids) ? (d.rejected_ids as number[]) : [];
  const modules = Array.isArray(d.modules) ? (d.modules as RegistryModule[]) : [];
  const expected = expectedApprovedIds();
  if (approved.length !== 127) issues.push(`approved_ids: ${approved.length} statt 127`);
  if (JSON.stringify([...approved].sort((a, b) => a - b)) !== JSON.stringify(expected)) issues.push('approved_ids weichen von 001–047, 050–109, 111–130 ab');
  if (JSON.stringify([...rejected].sort((a, b) => a - b)) !== JSON.stringify(REJECTED_IDS)) issues.push('rejected_ids müssen exakt 48, 49, 110 sein');
  if (modules.length !== 127) issues.push(`modules: ${modules.length} statt 127`);
  const seen = new Set<number>();
  for (const m of modules) {
    if (REJECTED_IDS.includes(m.n)) issues.push(`abgelehnte Funktion ${m.n} als Modul vorhanden`);
    if (seen.has(m.n)) issues.push(`Funktion ${m.n} doppelt`);
    seen.add(m.n);
    if (!m.title || !m.goal || !m.gate) issues.push(`Funktion ${m.n}: Titel/Ziel/Gate fehlt`);
  }
  for (const id of expected) if (!seen.has(id)) issues.push(`Funktion ${id} fehlt`);
  const policy = (d.policy ?? {}) as Record<string, unknown>;
  if (policy.monthly_additional_software_budget_eur !== 0) issues.push('Policy: Software-Budget muss 0 € sein');
  if (policy.live_enabled !== false) issues.push('Policy: live_enabled muss false sein');
  if (policy.default_paid_external_services !== false) issues.push('Policy: bezahlte Dienste müssen standardmäßig aus sein');
  if (issues.length) throw new RegistryError(`REGISTRY_UNGUELTIG: ${issues.join('; ')}`);
  const frozen = modules.map((m) => Object.freeze({ n: m.n, title: m.title, goal: m.goal, gate: m.gate })).sort((a, b) => a.n - b.n);
  return Object.freeze({
    version: String(d.version),
    approvedIds: Object.freeze([...approved].sort((a, b) => a - b)),
    rejectedIds: REJECTED_IDS,
    modules: Object.freeze(frozen),
    policy: Object.freeze({ ...policy }),
  });
}

export const REGISTRY: Registry = validateRegistry(raw);

export function moduleById(n: number): RegistryModule | undefined {
  return REGISTRY.modules.find((m) => m.n === n);
}

export function fmtId(n: number): string {
  return String(n).padStart(3, '0');
}
