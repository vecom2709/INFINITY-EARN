import { log } from '../../../packages/events/src/logger.ts';
import { acquireFromTed } from '../../acquisition/src/connectors/ted.ts';
import { cronTick } from '../../ai-orchestrator/src/queue.ts';
import { runFeeSync } from '../../finance/src/fee-sync.ts';
import { providerFor } from '../../finance/src/providers/index.ts';
import { autopilotTick } from './autopilot.ts';
import { ConfigError, loadConfig } from './config.ts';
import { createContext } from './context-node.ts';
import { startServer } from './server.ts';

const TICK_MS = 30_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`START VERWEIGERT: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
  config.warnings.forEach((w) => log('warn', 'config_warning', { warning: w }));
  const ctx = createContext(config);
  const server = await startServer(ctx);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  log('info', 'server_started', { url: `http://${config.host}:${port}`, mode: 'TEST', environment: config.environment });
  console.log(`\nINFINITY EARN läuft (TESTMODUS): http://localhost:${port}\n  Anfrage:   /anfrage\n  Dashboard: /dashboard\n`);

  // Täglicher TED-Abruf: läuft nur, wenn der Eigentümer die Quelle freigegeben hat (sonst BLOCKED, ohne Netzwerkzugriff).
  const acquireDaily = async (): Promise<void> => {
    const src = ctx.db.get<{ status: string }>(`SELECT status FROM sources WHERE source_id = 'src_ted_eu'`);
    if (src?.status !== 'APPROVED') return;
    const { created } = cronTick(ctx, 'acquire:ted', 86_400_000);
    if (!created) return;
    const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system' });
    log('info', 'ted_acquire', { status: r.status, seen: r.seen, relevant: r.relevant, leads: r.leadsCreated, reason: r.reason });
  };
  const acquireTimer = setInterval(() => void acquireDaily().catch((e: unknown) => log('error', 'ted_acquire_failed', { error: e })), 10 * 60_000);
  void acquireDaily().catch((e: unknown) => log('error', 'ted_acquire_failed', { error: e }));

  const provider = providerFor(ctx);
  log('info', 'payment_provider', { provider: provider.name, mode: 'TEST' });
  const feeTimer = setInterval(() => {
    void runFeeSync(ctx, provider).then((r) => {
      if (r.booked || r.failed) log('info', 'fee_sync', r);
    }).catch((e: unknown) => log('error', 'fee_sync_failed', { error: e }));
  }, 60_000);

  const timer = setInterval(() => {
    try {
      const t = autopilotTick(ctx, TICK_MS);
      if (t.production.processed || t.invoices.length || t.errors.length) log('info', 'autopilot_tick', { production: t.production.processed, invoices: t.invoices.length, errors: t.errors });
    } catch (e) {
      log('error', 'autopilot_tick_failed', { error: e });
    }
  }, TICK_MS);

  const shutdown = (): void => {
    clearInterval(timer);
    clearInterval(acquireTimer);
    clearInterval(feeTimer);
    server.close(() => {
      ctx.db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
