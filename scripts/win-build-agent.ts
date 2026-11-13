import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createZip } from '../packages/shared/src/zip.ts';
import { validateWinSpec, WIN_PRODUCT_ID, WIN_VERSION, winPackageNames, winReadme, type WinManifest } from '../products/win-lager/package.ts';
import { buildWinLager } from './build-win-lager.ts';

/**
 * Windows-Bau-Agent (Funktion 157/158). Läuft auf einem Windows-Rechner – im Betrieb auf dem GitHub-Windows-Server
 * (.github/workflows/win-build.yml), lokal für Tests auch auf diesem Rechner.
 *   1. holt einen Bauauftrag beim Worker ab (Bearer-Schlüssel, Lease),
 *   2. baut Programm, Installer und Anleitung mit den 24 Fachtests (scripts/build-win-lager.ts),
 *   3. packt Installer, Anleitung, Bauprotokoll und LIESMICH und lädt das ZIP hoch – oder meldet den Fehler.
 * Datenschutz: Die Protokolle des öffentlichen Repos zeigen nie Kundenangaben. Ausgegeben werden nur Bau-Kennung und
 * Ergebnis; der Firmenname wird zusätzlich maskiert (::add-mask::) und aus Fehlertexten entfernt.
 *
 *   AGENT_URL=https://… BUILD_AGENT_TOKEN=… node scripts/win-build-agent.ts [--probe] [--max 3]
 */
export interface AgentOptions { url: string; token: string; runner: string; maxBuilds?: number; probe?: boolean; commit?: string; log?: (line: string) => void }
export interface AgentResult { build_id: string; outcome: string; passed: boolean; failed: string[] }

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** Netzwerkfehler (z. B. vom Server geschlossene, ruhende Verbindung nach einem langen Bau) bis zu zweimal wiederholen.
 *  Unbedenklich: Ein doppelt angekommenes Ergebnis lehnt der Worker mit 409 ab, statt doppelt zu liefern. */
async function call(o: AgentOptions, path: string, init: { method: string; body?: Uint8Array | string; type?: string }): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${o.url.replace(/\/$/, '')}${path}`, {
        method: init.method,
        headers: { authorization: `Bearer ${o.token}`, 'x-runner-ref': o.runner, ...(init.type ? { 'content-type': init.type } : {}) },
        ...(init.body !== undefined ? { body: init.body } : {}),
      });
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Baut ein Paket für einen Auftrag. Rückgabe: ZIP-Bytes. */
export function buildPackage(rawSpec: unknown, source: { commit: string; run: string }): Uint8Array {
  const spec = validateWinSpec(rawSpec);
  const out = mkdtempSync(join(tmpdir(), 'iewb-'));
  try {
    const r = buildWinLager({ company: spec.company, color: spec.color, lang: spec.lang, country: spec.country, productId: WIN_PRODUCT_ID, version: WIN_VERSION, outDir: out });
    const n = winPackageNames(spec.lang);
    const setup = new Uint8Array(readFileSync(r.setup));
    const manual = new Uint8Array(readFileSync(r.manual));
    const manifest: WinManifest = { ...r.manifest, source };
    const readme = new TextEncoder().encode(winReadme(spec.lang, spec.company, sha(setup), sha(manual)));
    return createZip([
      { name: n.setup, bytes: setup },
      { name: n.manual, bytes: manual },
      { name: n.manifest, bytes: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`) },
      { name: n.readme, bytes: readme },
    ]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** Holt und bearbeitet bis zu maxBuilds Bauaufträge. */
export async function runAgent(o: AgentOptions): Promise<AgentResult[]> {
  const log = o.log ?? ((l: string) => console.log(l));
  const results: AgentResult[] = [];
  for (let i = 0; i < (o.maxBuilds ?? 3); i++) {
    const res = await call(o, `/agent/win-builds/abholen${o.probe && i === 0 ? '?probe=1' : ''}`, { method: 'POST' });
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`ABHOLEN_FEHLGESCHLAGEN: HTTP ${res.status}`);
    const job = (await res.json()) as { build_id: string; kind: string; attempt: number; spec: { company?: unknown } };
    const company = typeof job.spec.company === 'string' ? job.spec.company : '';
    if (process.env.GITHUB_ACTIONS === 'true' && company) console.log(`::add-mask::${company}`);
    log(`Bau ${job.build_id} (${job.kind}, Versuch ${job.attempt}) …`);
    let zip: Uint8Array;
    try {
      zip = buildPackage(job.spec, { commit: o.commit ?? 'lokal', run: o.runner });
    } catch (e) {
      const raw = (e as Error).message ?? String(e);
      const reason = (company ? raw.split(company).join('***') : raw).split(/\r?\n/).filter(Boolean).slice(0, 4).join(' | ').slice(0, 300);
      const f = await call(o, `/agent/win-builds/${job.build_id}/fehler`, { method: 'POST', body: JSON.stringify({ reason }), type: 'application/json' });
      log(`Bau ${job.build_id}: Fehler gemeldet (${f.status})`);
      results.push({ build_id: job.build_id, outcome: 'BUILD_FAILED', passed: false, failed: ['build'] });
      continue;
    }
    const up = await call(o, `/agent/win-builds/${job.build_id}/ergebnis`, { method: 'POST', body: zip, type: 'application/zip' });
    const body = (await up.json().catch(() => ({}))) as { outcome?: string; passed?: boolean; failed?: string[]; error?: string };
    const r: AgentResult = { build_id: job.build_id, outcome: body.outcome ?? body.error ?? `HTTP ${up.status}`, passed: body.passed === true, failed: body.failed ?? [] };
    log(`Bau ${job.build_id}: ${r.outcome}${r.failed.length ? ` (nicht bestanden: ${r.failed.join(', ')})` : ''}`);
    results.push(r);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const url = process.env.AGENT_URL ?? '';
  const token = process.env.BUILD_AGENT_TOKEN ?? '';
  if (!/^https?:\/\//.test(url) || token.length < 32) {
    console.log('Bau-Agent nicht eingerichtet (AGENT_URL/BUILD_AGENT_TOKEN fehlen) – nichts zu tun.');
    process.exit(0);
  }
  const max = Number(process.argv[process.argv.indexOf('--max') + 1]) || 3;
  const runner = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}` : 'lokal';
  runAgent({ url, token, runner, maxBuilds: max, probe: process.argv.includes('--probe'), commit: process.env.GITHUB_SHA ?? 'lokal' })
    .then((r) => {
      console.log(`${r.length} Bau(ten) bearbeitet, ${r.filter((x) => x.passed).length} bestanden.`);
      process.exit(r.some((x) => !x.passed) ? 2 : 0);
    })
    .catch((e: Error) => {
      console.error(e.message.slice(0, 300));
      process.exit(1);
    });
}
