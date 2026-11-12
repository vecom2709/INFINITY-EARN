import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expectedApprovedIds, REGISTRY, REGISTRY_SHA256, REJECTED_IDS, RegistryError, validateRegistry } from '../../packages/registry/src/registry.ts';
import { MODULE_STATUS, modulesWithStatus, statusCounts } from '../../packages/registry/src/status.ts';

const rawText = readFileSync('packages/registry/src/registry-127.json', 'utf8');
const raw = JSON.parse(rawText) as { modules: { n: number }[]; approved_ids: number[] };

test('Registry: Datei unverändert gegenüber Paket-Manifest (SHA-256), Spiegel in docs identisch', () => {
  assert.equal(createHash('sha256').update(readFileSync('packages/registry/src/registry-127.json')).digest('hex'), REGISTRY_SHA256);
  assert.equal(createHash('sha256').update(readFileSync('docs/spec/v15/REGISTRY_127.json')).digest('hex'), REGISTRY_SHA256);
  assert.match(readFileSync('docs/spec/v15/MANIFEST_SHA256.txt', 'utf8'), new RegExp(`${REGISTRY_SHA256}\\s+01_SPEC/REGISTRY_127.json`));
});

test('Registry: exakt 127 Funktionen 001–047, 050–109, 111–130; 048/049/110 fehlen', () => {
  assert.equal(REGISTRY.modules.length, 127);
  assert.deepEqual(REGISTRY.modules.map((m) => m.n), expectedApprovedIds());
  for (const id of REJECTED_IDS) assert.equal(REGISTRY.modules.some((m) => m.n === id), false, `abgelehnt: ${id}`);
  assert.deepEqual(REGISTRY.policy, { monthly_additional_software_budget_eur: 0, default_paid_external_services: false, live_enabled: false, demo_and_live_separated: true, owner_rules_required: true });
});

test('Registry ist schreibgeschützt (eingefroren)', () => {
  assert.ok(Object.isFrozen(REGISTRY) && Object.isFrozen(REGISTRY.modules) && Object.isFrozen(REGISTRY.modules[0]));
  assert.throws(() => (REGISTRY.modules as unknown as { n: number }[]).push({ n: 48 }), TypeError);
  assert.throws(() => { (REGISTRY.modules[0] as { title: string }).title = 'x'; }, TypeError);
});

test('Registry-Validierung lehnt abgelehnte IDs, fehlende/doppelte Funktionen und Kostenfreigabe ab', () => {
  const clone = (): ReturnType<typeof JSON.parse> => JSON.parse(rawText);
  const withRejected = clone();
  withRejected.modules.push({ n: 48, title: 'x', goal: 'x', gate: 'x' });
  assert.throws(() => validateRegistry(withRejected), (e: Error) => e instanceof RegistryError && /abgelehnte Funktion 48/.test(e.message));
  const missing = clone();
  missing.modules = missing.modules.filter((m: { n: number }) => m.n !== 77);
  assert.throws(() => validateRegistry(missing), /Funktion 77 fehlt/);
  const dup = clone();
  dup.modules[1] = { ...dup.modules[0] };
  assert.throws(() => validateRegistry(dup), /doppelt/);
  const paid = clone();
  paid.policy.monthly_additional_software_budget_eur = 10;
  assert.throws(() => validateRegistry(paid), /0 €/);
  const live = clone();
  live.policy.live_enabled = true;
  assert.throws(() => validateRegistry(live), /live_enabled/);
  assert.equal(raw.approved_ids.length, 127);
});

test('Funktionsstand: jede der 127 Funktionen hat genau einen ehrlichen Status und einen der sechs Bereiche', () => {
  assert.equal(MODULE_STATUS.length, 127);
  assert.deepEqual([...MODULE_STATUS].map((s) => s.n).sort((a, b) => a - b), expectedApprovedIds());
  const areas = new Set(['uebersicht', 'kunden', 'auftraege', 'produkte', 'finanzen', 'berichte']);
  for (const s of MODULE_STATUS) assert.ok(areas.has(s.area), `${s.n}: Bereich`);
  const c = statusCounts();
  assert.equal(c.UMGESETZT + c.TEILWEISE + c.GEPLANT + c.GESPERRT, 127);
  assert.equal(modulesWithStatus().length, 127);
  for (const m of modulesWithStatus()) assert.ok(m.titleDe && m.titleDe !== m.title && !/\bAI\b|CEO|Godmode/.test(m.titleDe), `${m.n}: deutscher Anzeigename`);
});

test('Funktionsstand: „umgesetzt/teilweise“ nur mit existierendem Testnachweis, „geplant/gesperrt“ ohne Erfolgsbehauptung', () => {
  for (const s of MODULE_STATUS) {
    if (s.status === 'UMGESETZT' || s.status === 'TEILWEISE') {
      assert.ok(s.evidence.length > 0, `${s.n}: Nachweis fehlt`);
      assert.ok(s.umgesetzt, `${s.n}: Beschreibung fehlt`);
      for (const f of s.evidence) assert.ok(existsSync(f), `${s.n}: Nachweisdatei ${f} existiert nicht`);
    } else {
      assert.equal(s.evidence.length, 0, `${s.n}: geplante Funktion darf keinen Nachweis vortäuschen`);
      assert.equal(s.umgesetzt, undefined, `${s.n}`);
      assert.ok(s.offen, `${s.n}: Grund/Inhalt fehlt`);
    }
    if (s.status === 'TEILWEISE') assert.ok(s.offen, `${s.n}: Offener Teil muss benannt sein`);
  }
});
