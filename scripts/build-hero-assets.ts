import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Bettet die Hero-Bilder der Startseite (apps/customer-portal/assets/hero-*.jpg) als Base64-Modul ein, damit der
 * Worker sie ohne Dateisystem unter /bilder/… ausliefern kann (CSP img-src 'self').
 *   node scripts/build-hero-assets.ts
 * Quelle: docs/design/hero/kie-hero-original.jpg (kie.ai, Flux-2 Pro, 13.11.2026, vom Eigentümer beauftragt).
 */
const files = ['hero-1920.jpg', 'hero-960.jpg'];
const entries = files.map((f) => {
  const bytes = readFileSync(`apps/customer-portal/assets/${f}`);
  return { name: f, sha: createHash('sha256').update(bytes).digest('hex'), b64: bytes.toString('base64') };
});
const out = `// Automatisch erzeugt von scripts/build-hero-assets.ts – nicht von Hand bearbeiten.
export const HERO_IMAGES: Readonly<Record<string, { sha256: string; base64: string }>> = {
${entries.map((e) => `  ${JSON.stringify(e.name)}: { sha256: ${JSON.stringify(e.sha)}, base64: ${JSON.stringify(e.b64)} },`).join('\n')}
};
`;
writeFileSync('apps/customer-portal/src/hero-images.generated.ts', out);
console.log(entries.map((e) => `${e.name} ${e.sha.slice(0, 12)} ${Math.round(e.b64.length / 1024)} KB b64`).join('\n'));
