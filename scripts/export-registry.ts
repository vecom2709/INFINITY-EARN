import { writeFileSync } from 'node:fs';
import { featureRegistryExport } from '../packages/registry/src/export.ts';

/** Schreibt FEATURE_REGISTRY_127.json (127 JA, 3 NEIN) aus der Registry. Ein Test prüft, dass die Datei aktuell ist. */
writeFileSync('FEATURE_REGISTRY_127.json', `${JSON.stringify(featureRegistryExport(), null, 2)}\n`);
const s = (featureRegistryExport() as { summary: Record<string, number> }).summary;
console.log(`FEATURE_REGISTRY_127.json geschrieben: ${JSON.stringify(s)}`);
