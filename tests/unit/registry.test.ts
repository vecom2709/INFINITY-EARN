import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expectedApprovedIds, EXTENSION_IDS, EXTENSION_IDS_147, EXTENSION_IDS_157, NOT_APPROVED_IDS, REGISTRY, REGISTRY_127, REGISTRY_147, REGISTRY_SHA256, REJECTED_IDS, RegistryError, validateExtension, validateRegistry } from '../../packages/registry/src/registry.ts';
import { MODULE_STATUS, modulesWithStatus, statusCounts } from '../../packages/registry/src/status.ts';

const rawText = readFileSync('packages/registry/src/registry-127.json', 'utf8');
const raw = JSON.parse(rawText) as { modules: { n: number }[]; approved_ids: number[] };

test('Registry: Datei unverändert gegenüber Paket-Manifest (SHA-256), Spiegel in docs identisch', () => {
  assert.equal(createHash('sha256').update(readFileSync('packages/registry/src/registry-127.json')).digest('hex'), REGISTRY_SHA256);
  assert.equal(createHash('sha256').update(readFileSync('docs/spec/v15/REGISTRY_127.json')).digest('hex'), REGISTRY_SHA256);
  assert.match(readFileSync('docs/spec/v15/MANIFEST_SHA256.txt', 'utf8'), new RegExp(`${REGISTRY_SHA256}\\s+01_SPEC/REGISTRY_127.json`));
});

/** Stand Gesamtprompt 147 = 1–47, 50–109, 111–140, 146–155; seit Gesamtprompt 157 zusätzlich 156–165. */
const APPROVED_147 = [...expectedApprovedIds(), ...EXTENSION_IDS_147].sort((a, b) => a - b);
const APPROVED_157 = [...expectedApprovedIds(), ...EXTENSION_IDS].sort((a, b) => a - b);

test('Registry: ursprüngliche 127 unverändert (001–047, 050–109, 111–130); 048/049/110 fehlen', () => {
  assert.equal(REGISTRY_127.modules.length, 127);
  assert.deepEqual(REGISTRY_127.modules.map((m) => m.n), expectedApprovedIds());
  for (const id of REJECTED_IDS) assert.equal(REGISTRY.modules.some((m) => m.n === id), false, `abgelehnt: ${id}`);
  assert.deepEqual(REGISTRY.policy, { monthly_additional_software_budget_eur: 0, default_paid_external_services: false, live_enabled: false, demo_and_live_separated: true, owner_rules_required: true });
});

test('Registry 147: genau 1–47, 50–109, 111–140, 146–155; 141–145 nie aufgenommen; Quelle mit Prüfsummen', () => {
  assert.equal(REGISTRY_147.modules.length, 147);
  assert.deepEqual(REGISTRY_147.modules.map((m) => m.n), APPROVED_147);
  for (const id of NOT_APPROVED_IDS) assert.equal(REGISTRY.modules.some((m) => m.n === id), false, `nicht freigegeben: ${id}`);
  const owner = JSON.parse(readFileSync('docs/spec/v15-147/FEATURE_REGISTRY_147.json', 'utf8')) as { approved_ids: number[]; rejected_ids: number[]; not_approved_ids: number[]; approved_count: number };
  assert.deepEqual([...owner.approved_ids].sort((a, b) => a - b), APPROVED_147, 'deckungsgleich mit der Freigabeliste des Eigentümers');
  assert.deepEqual(owner.not_approved_ids, [...NOT_APPROVED_IDS]);
  assert.equal(owner.approved_count, 147);
  const manifest = readFileSync('docs/spec/v15-147/MANIFEST_SHA256.txt', 'utf8');
  for (const f of ['GESAMTPROMPT_147.md', 'FEATURE_REGISTRY_147.json', 'LANDINGPAGE_146_155.md', 'START_HIER.md']) {
    const sha = createHash('sha256').update(readFileSync(`docs/spec/v15-147/${f}`)).digest('hex');
    assert.match(manifest, new RegExp(`${sha}\\s+${f.replace('.', '\\.')}`), `${f}: Prüfsumme`);
  }
  const ext = JSON.parse(readFileSync('packages/registry/src/registry-extension-147.json', 'utf8'));
  const with141 = { ...ext, approved_extension_ids: [...ext.approved_extension_ids, 141], modules: [...ext.modules, { n: 141, title: 'x', goal: 'x', gate: 'x' }] };
  assert.throws(() => validateExtension(with141, REGISTRY_127), /nicht freigegeben|exakt 131/);
  assert.throws(() => validateExtension({ ...ext, modules: [...ext.modules.slice(1), { n: 48, title: 'x', goal: 'x', gate: 'x' }] }, REGISTRY_127), RegistryError);
});

test('Registry 157: genau 1–47, 50–109, 111–140, 146–165; 141–145 und 48/49/110 nie aufgenommen; Quelle mit Prüfsummen', () => {
  assert.equal(REGISTRY.modules.length, 157);
  assert.deepEqual(REGISTRY.modules.map((m) => m.n), APPROVED_157);
  assert.deepEqual([...EXTENSION_IDS_157], [156, 157, 158, 159, 160, 161, 162, 163, 164, 165]);
  for (const id of [...NOT_APPROVED_IDS, ...REJECTED_IDS]) assert.equal(REGISTRY.modules.some((m) => m.n === id), false, `nicht freigegeben: ${id}`);
  const owner = JSON.parse(readFileSync('docs/spec/v15-157/FEATURE_REGISTRY_157.json', 'utf8')) as { approved_ids: number[]; rejected_ids: number[]; unconfirmed_ids: number[]; approved_count: number; new_modules: { id: number; name: string }[] };
  assert.deepEqual([...owner.approved_ids].sort((a, b) => a - b), APPROVED_157, 'deckungsgleich mit der Freigabeliste des Eigentümers');
  assert.deepEqual(owner.rejected_ids, [...REJECTED_IDS]);
  assert.deepEqual(owner.unconfirmed_ids, [...NOT_APPROVED_IDS]);
  assert.equal(owner.approved_count, 157);
  for (const m of owner.new_modules) assert.equal(REGISTRY.modules.find((r) => r.n === m.id)?.title, m.name, `${m.id}: Titel wie beauftragt`);
  const manifest = readFileSync('docs/spec/v15-157/MANIFEST_SHA256.txt', 'utf8');
  const original = JSON.parse(readFileSync('docs/spec/v15-157/MANIFEST_ORIGINAL.json', 'utf8')) as { files: Record<string, { sha256: string }> };
  for (const f of ['GESAMTPROMPT_157.md', 'FEATURE_REGISTRY_157.json', 'MODULE_156_165.md', 'START_HIER.md', 'MANIFEST_ORIGINAL.json']) {
    const sha = createHash('sha256').update(readFileSync(`docs/spec/v15-157/${f}`)).digest('hex');
    assert.match(manifest, new RegExp(`${sha}\\s+${f.replace('.', '\\.')}`), `${f}: Prüfsumme`);
    if (f !== 'MANIFEST_ORIGINAL.json') assert.ok(Object.values(original.files).some((o) => o.sha256 === sha), `${f}: Prüfsumme laut Original-Manifest des Eigentümers`);
  }
  const ext = JSON.parse(readFileSync('packages/registry/src/registry-extension-157.json', 'utf8'));
  assert.throws(() => validateExtension({ ...ext, approved_extension_ids: [...ext.approved_extension_ids, 141], modules: [...ext.modules, { n: 141, title: 'x', goal: 'x', gate: 'x' }] }, REGISTRY_147, EXTENSION_IDS_157), /nicht freigegeben|exakt/);
  assert.throws(() => validateExtension({ ...ext, modules: [...ext.modules.slice(1), { n: 110, title: 'x', goal: 'x', gate: 'x' }] }, REGISTRY_147, EXTENSION_IDS_157), RegistryError);
  assert.throws(() => validateExtension(ext, REGISTRY, EXTENSION_IDS_157), /doppelt/, 'keine doppelte Aufnahme');
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

test('Funktionsstand: jede der 157 Funktionen hat genau einen ehrlichen Status und einen der sechs Bereiche', () => {
  assert.equal(MODULE_STATUS.length, 157);
  assert.deepEqual([...MODULE_STATUS].map((s) => s.n).sort((a, b) => a - b), APPROVED_157);
  const areas = new Set(['uebersicht', 'kunden', 'auftraege', 'produkte', 'finanzen', 'berichte']);
  for (const s of MODULE_STATUS) assert.ok(areas.has(s.area), `${s.n}: Bereich`);
  const c = statusCounts();
  assert.equal(c.UMGESETZT + c.TEILWEISE + c.GEPLANT + c.GESPERRT, 157);
  assert.equal(modulesWithStatus().length, 157);
  for (const n of EXTENSION_IDS) assert.notEqual(MODULE_STATUS.find((s) => s.n === n)?.status, 'UMGESETZT', `${n}: neue Funktion nicht als vollständig umgesetzt behaupten`);
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
