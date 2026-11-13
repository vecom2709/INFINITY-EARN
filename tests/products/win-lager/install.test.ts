import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildWinLager, signatureStatus, validateOptions } from '../../../scripts/build-win-lager.ts';

/**
 * Funktion 157/158 – echter Windows-Test (PR-157-01/02/03/04/07/08, PR-158-01/04/07): bauen, installieren, starten,
 * Daten über Neustart, Update mit Daten, laufendes Programm, fehlende Voraussetzung, Deinstallation ohne fremde Dateien.
 * Läuft nur auf Windows; auf anderen Systemen ehrlich übersprungen (kein „bestanden“ ohne Windows).
 */
const WIN = process.platform === 'win32';
const ID = 'win-lager-selftest';
const KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\InfinityEarn.${ID}`;
const LOCAL = process.env.LOCALAPPDATA ?? '';
const DIR = join(LOCAL, 'Programs', 'InfinityEarn', ID);
const LNK = join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Lager & Rechnung.lnk');

const regValue = (name: string): string | null => {
  const r = spawnSync('reg', ['query', KEY, '/v', name], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return /REG_\w+\s+(.*)$/m.exec(r.stdout)?.[1]?.trim() ?? null;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(250); }
  return cond();
}
function cleanup(): void {
  spawnSync('reg', ['delete', KEY, '/f'], { encoding: 'utf8' });
  rmSync(DIR, { recursive: true, force: true });
  rmSync(LNK, { force: true });
}

test('Build-Optionen werden geprüft (keine Code-Injektion über Firmenname oder Farbe)', () => {
  assert.deepEqual(validateOptions({ company: 'Ferramenta Rossi', color: '#C8A2C8', lang: 'it', country: 'IT', productId: 'win-lager', version: '1.0.0' }), []);
  assert.ok(validateOptions({ company: 'X"; System.Diagnostics.Process.Start("calc"); //\n', color: 'red', lang: 'fr' as 'de', country: 'US' as 'DE', productId: 'A B', version: '1' }).length >= 5);
});

test('Windows: Installer installiert, Programm startet und speichert, Update erhält Daten, Deinstallation sauber', { skip: WIN ? false : 'PLATFORM_TEST_BLOCKED: nur auf Windows prüfbar', timeout: 240_000 }, async () => {
  cleanup();
  const work = mkdtempSync(join(tmpdir(), 'iewt-'));
  const data = join(work, 'kundendaten');
  const env = { ...process.env, INFINITY_DATA_DIR: data };
  try {
    const v1 = buildWinLager({ company: 'Testfirma Müller & Söhne', color: '#0F766E', lang: 'de', country: 'DE', productId: ID, version: '1.0.0', outDir: join(work, 'v1') });
    const v2 = buildWinLager({ company: 'Testfirma Müller & Söhne', color: '#0F766E', lang: 'de', country: 'DE', productId: ID, version: '1.1.0', outDir: join(work, 'v2') });
    assert.equal(v1.manifest.unitTests.failed, 0);
    assert.ok(v1.manifest.unitTests.passed >= 12);
    assert.equal(v1.manifest.signed, false, 'nie als signiert ausgegeben');
    assert.equal(v1.manifest.signature, 'NotSigned', 'Windows bestätigt: nicht signiert');
    assert.deepEqual([...readFileSync(v1.app).subarray(0, 2)], [0x4d, 0x5a], 'echte Windows-Programmdatei (PE), keine HTML-Ansicht');

    // PR-157-07: fehlende Voraussetzung → klare Meldung, nichts verändert
    const noFx = spawnSync(v1.setup, ['/S'], { encoding: 'utf8', env: { ...env, INFINITY_SIMULATE_NO_NETFX: '1' } });
    assert.equal(noFx.status, 3);
    assert.equal(existsSync(DIR), false, 'nichts installiert');
    assert.equal(regValue('DisplayVersion'), null);

    // PR-157-01 / PR-158-01: echte Installation auf diesem Windows
    assert.equal(spawnSync(v1.setup, ['/S'], { env }).status, 0);
    const exe = join(DIR, `${ID}.exe`);
    assert.ok(existsSync(exe) && existsSync(join(DIR, 'uninstall.exe')) && existsSync(join(DIR, 'install.json')));
    assert.equal(regValue('DisplayVersion'), '1.0.0');
    assert.equal(regValue('Publisher'), 'Testfirma Müller & Söhne');
    assert.match(regValue('UninstallString') ?? '', /uninstall\.exe" \/uninstall$/);
    assert.ok(existsSync(LNK), 'Startmenü-Verknüpfung');
    assert.equal(signatureStatus(exe), 'NotSigned');

    // PR-157-03: Daten überleben den Neustart (zwei getrennte Prozesse)
    assert.equal(spawnSync(exe, ['--add-article', 'A-100', 'Schraube M6', '0,15', '250'], { env }).status, 0);
    const report = join(work, 'check.json');
    const shot = join(work, 'programm.png');
    assert.equal(spawnSync(exe, ['--check', report, shot], { env, timeout: 60_000 }).status, 0);
    const r1 = JSON.parse(readFileSync(report, 'utf8')) as { ok: boolean; version: string; articles: { sku: string; stock: number }[]; tabs: number; controls: number; exe: string };
    assert.equal(r1.ok, true);
    assert.equal(r1.version, '1.0.0');
    assert.deepEqual(r1.articles, [{ sku: 'A-100', stock: 250 }]);
    assert.equal(r1.tabs, 3, 'Artikel, Lager, Rechnungen');
    assert.ok(r1.controls > 40, 'echte Oberfläche aufgebaut');
    assert.equal(r1.exe.toLowerCase(), exe.toLowerCase(), 'die installierte Datei lief');
    assert.ok(statSync(shot).size > 10_000, 'Bildschirmfoto des laufenden Programms');
    assert.equal(spawnSync(exe, ['--add-article', 'A-100', 'doppelt', '1', '1'], { env }).status, 1, 'Fachregel greift auch im installierten Programm');
    // Gleichzeitige Zugriffe verlieren keine Daten (gefundener Fehler: parallele Speicherungen)
    const parallel = ['P-1', 'P-2', 'P-3'].map((sku) => new Promise<number>((res) => spawn(exe, ['--add-article', sku, `Parallel ${sku}`, '1,00', '1'], { env, stdio: 'ignore' }).on('exit', (c) => res(c ?? -1))));
    assert.deepEqual(await Promise.all(parallel), [0, 0, 0]);
    assert.equal(spawnSync(exe, ['--check', report], { env, timeout: 60_000 }).status, 0);
    const rp = JSON.parse(readFileSync(report, 'utf8')) as { articles: { sku: string }[]; os: string };
    assert.deepEqual(rp.articles.map((a) => a.sku).sort(), ['A-100', 'P-1', 'P-2', 'P-3'], 'kein Datenverlust bei gleichzeitigen Zugriffen');
    assert.match(rp.os, /^Windows 1[01] /, 'echte Windows-Version im Prüfbericht');

    // Laufendes Programm blockiert das Update sauber (Exit 4, nichts verändert)
    const running = spawn(exe, [], { env, detached: false, stdio: 'ignore' });
    await sleep(2500);
    try {
      const blocked = spawnSync(v2.setup, ['/S'], { env, encoding: 'utf8' });
      assert.equal(blocked.status, 4);
      assert.equal(regValue('DisplayVersion'), '1.0.0', 'Version unverändert');
      assert.equal(spawnSync(join(DIR, 'uninstall.exe'), ['/uninstall', '/S'], { env }).status, 4, 'auch Deinstallation wartet, bis das Programm geschlossen ist');
      assert.ok(existsSync(exe), 'nichts entfernt');
    } finally {
      running.kill();
      await until(() => running.exitCode !== null || running.signalCode !== null, 5000);
      await sleep(500);
    }

    // PR-158-04: Update auf 1.1.0 erhält die Kundendaten
    assert.equal(spawnSync(v2.setup, ['/S'], { env }).status, 0);
    assert.equal(regValue('DisplayVersion'), '1.1.0');
    assert.equal(spawnSync(exe, ['--check', report], { env, timeout: 60_000 }).status, 0);
    const r2 = JSON.parse(readFileSync(report, 'utf8')) as { version: string; articles: { sku: string; stock: number }[] };
    assert.equal(r2.version, '1.1.0');
    assert.deepEqual(r2.articles.map((x) => x.sku).sort(), ['A-100', 'P-1', 'P-2', 'P-3'], 'Daten nach Update erhalten');
    assert.equal(r2.articles.find((x) => x.sku === 'A-100')?.stock, 250);

    // PR-157-02: Deinstallation entfernt nur eigene Dateien; fremde Datei und Kundendaten bleiben
    writeFileSync(join(DIR, 'notiz-des-kunden.txt'), 'nicht löschen');
    assert.equal(spawnSync(join(DIR, 'uninstall.exe'), ['/uninstall', '/S'], { env }).status, 0);
    assert.ok(await until(() => !existsSync(join(DIR, 'uninstall.exe'))), 'Deinstallationsprogramm entfernt sich');
    assert.equal(existsSync(exe), false);
    assert.equal(regValue('DisplayVersion'), null, 'Eintrag in „Apps & Features“ entfernt');
    assert.equal(existsSync(LNK), false, 'Verknüpfung entfernt');
    assert.deepEqual(readdirSync(DIR), ['notiz-des-kunden.txt'], 'fremde Datei unangetastet');
    assert.ok(existsSync(join(data, 'daten.xml')), 'Kundendaten bleiben erhalten');
    assert.ok(existsSync(join(data, 'daten.xml.bak')) || existsSync(join(data, 'daten.xml')));

    // Ohne fremde Dateien verschwindet der Ordner vollständig
    rmSync(join(DIR, 'notiz-des-kunden.txt'));
    assert.equal(spawnSync(v2.setup, ['/S'], { env }).status, 0);
    assert.equal(spawnSync(join(DIR, 'uninstall.exe'), ['/uninstall', '/S'], { env }).status, 0);
    assert.ok(await until(() => !existsSync(DIR)), 'Programmordner vollständig entfernt');
  } finally {
    cleanup();
    rmSync(work, { recursive: true, force: true });
  }
});
