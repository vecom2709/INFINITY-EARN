/**
 * Lokaler Prüfserver für Durchgänge im echten Browser (Tiefenprüfung): frische Test-Datenbank, simulierte Zahlung,
 * alle herstellbaren Produktarten erlaubt, Autopilot-Takt alle 2 Sekunden. Nur 127.0.0.1:8791, nur Testbetrieb.
 * Das Eigentümer-Passwort wird bei jedem Start zufällig erzeugt und in data/deepcheck-owner.txt abgelegt
 * (data/ wird nie eingecheckt).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../packages/shared/src/crypto.ts';
import { autopilotTick } from '../services/core-api/src/autopilot.ts';
import { startServer } from '../services/core-api/src/server.ts';
import { makeCtx } from '../tests/helpers.ts';

const password = randomBytes(18).toString('base64url');
mkdirSync('data', { recursive: true });
writeFileSync('data/deepcheck-owner.txt', password, { mode: 0o600 });
const { ctx, clock } = makeCtx({
  env: {
    OWNER_PASSWORD_HASH: hashPassword(password),
    ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx,b2b-calc-pdf,b2b-calc-bundle,mini-ww',
    OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx,b2b-calc-pdf,b2b-calc-bundle',
    PUBLIC_ORIGIN: 'http://127.0.0.1:8791',
  },
});
await startServer(ctx, 8791, '127.0.0.1');
setInterval(() => {
  clock.advance(2000);
  try {
    autopilotTick(ctx);
  } catch (e) {
    console.error('TICK_ERROR', (e as Error).message);
  }
}, 2000);
console.log('Prüfserver: http://127.0.0.1:8791 (Testbetrieb, simulierte Zahlung)');
