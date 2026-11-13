import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * KI-Agent (16.0) für .github/workflows/ai-job.yml – Claude arbeitet über das Claude-Abo des Eigentümers
 * (offizielle Claude-Code-Action). Ablauf in drei getrennten Schritten:
 *   1. claim  – holt einen KI-Auftrag (Agent-Schlüssel) und legt nur die Aufgabe in work/AUFGABE.md ab.
 *   2. Claude – liest work/AUFGABE.md, schreibt work/ergebnis.json. Dieser Schritt kennt KEINEN Agent-Schlüssel,
 *               keine Datenbank- oder Zahlungsschlüssel und darf nur Dateien lesen/schreiben.
 *   3. submit – lädt work/ergebnis.json hoch (Agent-Schlüssel) oder meldet den Fehler.
 * Datenschutz: Protokolle zeigen nur die Auftragskennung; Firmenname wird maskiert. Ohne Abhängigkeiten.
 *
 *   node scripts/ai-agent.ts claim [--probe]     node scripts/ai-agent.ts submit <build_id>
 */
const WORK = 'work';
const url = (process.env.AGENT_URL ?? '').replace(/\/$/, '');
const token = process.env.BUILD_AGENT_TOKEN ?? '';
const runner = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}` : 'lokal';

async function call(path: string, method: string, body?: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${url}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'x-runner-ref': runner, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { body } : {}) });
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function output(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export async function claim(probe: boolean): Promise<string | null> {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK);
  const res = await call(`/agent/ai-jobs/abholen${probe ? '?probe=1' : ''}`, 'POST');
  if (res.status === 204) {
    console.log('Kein KI-Auftrag offen (oder Tageslimit erreicht).');
    output('build_id', '');
    return null;
  }
  if (!res.ok) throw new Error(`ABHOLEN_FEHLGESCHLAGEN: HTTP ${res.status}`);
  const job = (await res.json()) as { build_id: string; kind: string; attempt: number; brief: string | null; spec: { company?: unknown } };
  if (!/^bld_[a-f0-9]{32}$/.test(job.build_id) || !job.brief) throw new Error('AUFTRAG_UNGUELTIG');
  if (process.env.GITHUB_ACTIONS === 'true' && typeof job.spec.company === 'string') console.log(`::add-mask::${job.spec.company}`);
  writeFileSync(`${WORK}/AUFGABE.md`, job.brief);
  console.log(`KI-Auftrag ${job.build_id} (${job.kind}, Versuch ${job.attempt}) abgeholt.`);
  output('build_id', job.build_id);
  return job.build_id;
}

export async function submit(buildId: string): Promise<{ outcome: string; passed: boolean }> {
  if (!/^bld_[a-f0-9]{32}$/.test(buildId)) throw new Error('KENNUNG_UNGUELTIG');
  const file = `${WORK}/ergebnis.json`;
  let body: string;
  try {
    body = existsSync(file) ? readFileSync(file, 'utf8') : '';
    JSON.parse(body);
  } catch {
    body = '';
  }
  if (!body || body.length > 60_000) {
    const f = await call(`/agent/ai-jobs/${buildId}/fehler`, 'POST', JSON.stringify({ reason: body ? 'Ergebnis zu groß' : 'Claude hat kein lesbares work/ergebnis.json geschrieben (Abo-Limit, Token oder Fehler im Lauf)' }));
    console.log(`KI-Auftrag ${buildId}: Fehler gemeldet (${f.status}).`);
    return { outcome: 'NO_RESULT', passed: false };
  }
  const up = await call(`/agent/ai-jobs/${buildId}/ergebnis`, 'POST', body);
  const r = (await up.json().catch(() => ({}))) as { outcome?: string; passed?: boolean; failed?: string[]; error?: string };
  console.log(`KI-Auftrag ${buildId}: ${r.outcome ?? r.error ?? `HTTP ${up.status}`}${r.failed?.length ? ` (nicht bestanden: ${r.failed.join(', ')})` : ''}`);
  return { outcome: r.outcome ?? r.error ?? `HTTP ${up.status}`, passed: r.passed === true };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (!/^https?:\/\//.test(url) || token.length < 32) {
    console.log('KI-Agent nicht eingerichtet (AGENT_URL/BUILD_AGENT_TOKEN fehlen) – nichts zu tun.');
    output('build_id', '');
    process.exit(0);
  }
  const [cmd, arg] = process.argv.slice(2);
  const run = cmd === 'claim' ? claim(process.argv.includes('--probe')).then(() => 0) : cmd === 'submit' ? submit(arg ?? '').then((r) => (r.passed ? 0 : 2)) : Promise.reject(new Error('claim oder submit'));
  run.then((code) => process.exit(code)).catch((e: Error) => {
    console.error(e.message.slice(0, 200));
    process.exit(1);
  });
}
