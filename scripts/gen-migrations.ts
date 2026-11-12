import { writeFileSync } from 'node:fs';
import { readMigrations } from '../packages/storage/src/migrate.ts';

/** Erzeugt packages/storage/src/migrations.generated.ts aus db/migrations (für den Cloudflare-Worker ohne Dateisystem). */
const list = readMigrations('db/migrations');
const body = `// AUTOMATISCH ERZEUGT von scripts/gen-migrations.ts – nicht von Hand ändern.
import type { Migration } from './types.ts';

export const MIGRATIONS: readonly Migration[] = ${JSON.stringify(list, null, 2)};
`;
writeFileSync('packages/storage/src/migrations.generated.ts', body);
console.log(`${list.length} Migrationen eingebettet: ${list.map((m) => m.name).join(', ')}`);
