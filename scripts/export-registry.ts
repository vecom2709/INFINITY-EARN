import { writeFileSync } from 'node:fs';
import { featureRegistryExport } from '../packages/registry/src/export.ts';

/** Schreibt FEATURE_REGISTRY_157.json (157 JA, 3 NEIN, 141–145 nicht freigegeben) aus der Registry. Ein Test prüft, dass die Datei aktuell ist. */
writeFileSync('FEATURE_REGISTRY_157.json', `${JSON.stringify(featureRegistryExport(), null, 2)}\n`);
const s = (featureRegistryExport() as { summary: Record<string, number> }).summary;
console.log(`FEATURE_REGISTRY_157.json geschrieben: ${JSON.stringify(s)}`);
