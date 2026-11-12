import { log } from '../../../packages/events/src/logger.ts';
import { DoBlobStore, DoDb, type DoStorage } from '../../../packages/storage/src/do-db.ts';
import { MIGRATIONS } from '../../../packages/storage/src/migrations.generated.ts';
import { acquireFromTed } from '../../../services/acquisition/src/connectors/ted.ts';
import { cronTick } from '../../../services/ai-orchestrator/src/queue.ts';
import { autopilotTick } from '../../../services/core-api/src/autopilot.ts';
import { newBackupState, runDailyBackup, type BackupSink } from '../../../services/core-api/src/backup-offsite.ts';
import { ConfigError, loadConfig } from '../../../services/core-api/src/config.ts';
import { buildContext, type AppContext } from '../../../services/core-api/src/context.ts';
import { createHandler, MAX_BODY, SECURITY_HEADERS, type HttpRequest, type Res } from '../../../services/core-api/src/http-core.ts';
import { runFeeSync } from '../../../services/finance/src/fee-sync.ts';
import { providerFor } from '../../../services/finance/src/providers/index.ts';

/**
 * Cloudflare-Worker für STAGING. Der gesamte Transaktionskern läuft in EINEM SQLite-Durable-Object
 * (synchron, konsistent, Single-Thread). Zeitsteuerung per DO-Alarm statt setInterval.
 * Kein Live-Modus: loadConfig verweigert ENVIRONMENT=live und Live-Schlüssel wie lokal.
 */
interface DoState {
  storage: DoStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface DoStub {
  fetch(request: Request): Promise<Response>;
}
interface DoNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DoStub;
}
/** Minimaler Ausschnitt der Workers-KV-API (Free-Tarif). */
interface KvNamespace {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, opts: { expirationTtl: number; metadata: Record<string, unknown> }): Promise<void>;
}
interface Env {
  CORE: DoNamespace;
  BACKUPS?: KvNamespace;
  [key: string]: unknown;
}

const TICK_MS = 60_000;

function stringVars(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') out[k] = v;
  return out;
}

function toResponse(res: Res): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  return new Response(res.body ?? null, { status: res.status, headers });
}

export class InfinityCore {
  readonly #state: DoState;
  readonly #env: Env;
  #ctx: AppContext | null = null;
  #handle: ((r: HttpRequest) => Promise<Res>) | null = null;
  readonly #backupState = newBackupState();

  constructor(state: DoState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  #init(origin: string | null): AppContext {
    if (this.#ctx) return this.#ctx;
    const vars = stringVars(this.#env);
    const config = loadConfig({
      ...vars,
      ENVIRONMENT: vars.ENVIRONMENT ?? 'staging',
      APP_PUBLIC_ORIGIN: vars.APP_PUBLIC_ORIGIN || origin || '',
      DATABASE_URL: ':memory:', // ungenutzt im Worker (Durable-Object-SQLite)
    });
    const db = new DoDb(this.#state.storage);
    this.#ctx = buildContext(db, new DoBlobStore(db), config, MIGRATIONS);
    this.#handle = createHandler(this.#ctx);
    return this.#ctx;
  }

  async #ensureAlarm(): Promise<void> {
    if ((await this.#state.storage.getAlarm()) === null) await this.#state.storage.setAlarm(Date.now() + TICK_MS);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      this.#init(url.origin);
    } catch (e) {
      const msg = e instanceof ConfigError ? e.message : 'INIT_FAILED';
      log('error', 'worker_init_failed', { error: e });
      return new Response(JSON.stringify({ error: 'START_VERWEIGERT', detail: msg }), { status: 503, headers: { ...SECURITY_HEADERS, 'content-type': 'application/json' } });
    }
    await this.#ensureAlarm();
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_BODY) return new Response('{"error":"PAYLOAD_TOO_LARGE"}', { status: 413, headers: SECURITY_HEADERS });
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => (headers[k] = v));
    const handle = this.#handle;
    if (!handle) return new Response('{"error":"NOT_READY"}', { status: 503, headers: SECURITY_HEADERS });
    const res = await handle({
      method: request.method,
      url: url.pathname + url.search,
      headers,
      body,
      ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
    });
    return toResponse(res);
  }

  /** Always-On-Takt ohne KI: Produktion, Belege, Abgleich, Gebühren; TED einmal täglich (nur wenn freigegeben). */
  async alarm(): Promise<void> {
    try {
      const ctx = this.#init(null);
      const t = autopilotTick(ctx, TICK_MS);
      const fees = await runFeeSync(ctx, providerFor(ctx));
      const ted = ctx.db.get<{ status: string }>(`SELECT status FROM sources WHERE source_id = 'src_ted_eu'`);
      if (ted?.status === 'APPROVED' && cronTick(ctx, 'acquire:ted', 86_400_000).created) {
        const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system' });
        log('info', 'ted_acquire', { status: r.status, seen: r.seen, relevant: r.relevant, leads: r.leadsCreated });
      }
      const kv = this.#env.BACKUPS;
      const backupKey = typeof this.#env.BACKUP_ENCRYPTION_KEY === 'string' ? this.#env.BACKUP_ENCRYPTION_KEY : '';
      if (kv && backupKey) {
        const sink: BackupSink = { get: (k) => kv.get(k, 'text'), put: (k, v, o) => kv.put(k, v, o) };
        const b = await runDailyBackup(ctx, sink, backupKey, this.#backupState);
        if (b.status === 'STORED') log('info', 'backup_stored', { key: b.key, bytes: b.bytes });
        if (b.status === 'FAILED') log('error', 'backup_failed', { key: b.key, error: b.error });
      }
      if (t.production.processed || t.invoices.length || fees.booked || t.errors.length) {
        log('info', 'alarm_tick', { production: t.production.processed, invoices: t.invoices.length, fees: fees.booked, errors: t.errors });
      }
    } catch (e) {
      log('error', 'alarm_failed', { error: e });
    } finally {
      await this.#state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.CORE.get(env.CORE.idFromName('infinity-earn-core')).fetch(request);
  },
};
