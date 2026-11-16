import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRea, judgeExposure } from '../../scripts/rea-audit.ts';

/** Auswertung der REA-Prüfung eigener Programme: bestanden nur ohne Fund und mit mindestens einer bewerteten Prüfung. */
const report = (checks: { id: string; status: string; severity?: string | null }[]): unknown => ({ normalized_result: { checks: checks.map((c) => ({ severity: null, ...c })) } });

test('Ohne Fund bestanden; nicht bewertete Prüfungen werden genannt, nicht als bestanden gezählt', () => {
  const v = judgeExposure(report([{ id: 'native.pdb_path', status: 'not_observed' }, { id: 'native.debug_companions', status: 'not_observed' }, { id: 'native.hardening', status: 'not_assessed' }, { id: 'go.build_paths', status: 'unknown' }, { id: 'electron.run_as_node', status: 'not_applicable' }]));
  assert.equal(v.passed, true);
  assert.equal(v.assessed, 2);
  assert.deepEqual(v.notAssessed, ['native.hardening', 'go.build_paths']);
});

test('Ein Fund lässt die Prüfung scheitern und wird benannt', () => {
  const v = judgeExposure(report([{ id: 'native.pdb_path', status: 'exposed', severity: 'low' }, { id: 'native.debug_companions', status: 'not_observed' }]));
  assert.equal(v.passed, false);
  assert.deepEqual(v.exposed, ['native.pdb_path (low)']);
});

test('Leerer, unlesbarer oder nur „nicht bewertet“-Bericht gilt nie als bestanden', () => {
  assert.equal(judgeExposure({}).passed, false);
  assert.equal(judgeExposure(null).passed, false);
  assert.equal(judgeExposure(report([])).passed, false);
  assert.equal(judgeExposure(report([{ id: 'native.hardening', status: 'not_assessed' }])).passed, false);
});

test('REA wird nur gefunden, wenn Node und Skript wirklich vorhanden sind', () => {
  assert.equal(findRea({ REA_NODE: 'Z:/gibt/es/nicht/node.exe', REA_SCRIPT: 'Z:/gibt/es/nicht/rea.mjs' }), null);
  assert.deepEqual(findRea({ REA_NODE: process.execPath, REA_SCRIPT: process.execPath }), { node: process.execPath, script: process.execPath });
});
