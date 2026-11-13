import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Erzeugt GENAU EIN Hero-Bild über kie.ai (kostenpflichtig, Freigabe durch den Eigentümer am 13.11.2026: 1 Bild).
 * Der Schlüssel wird nur aus der Umgebung gelesen (.env: KIE_API_KEY) und nie ausgegeben.
 *   node --env-file=.env scripts/kie-hero.ts
 */
const key = process.env.KIE_API_KEY;
if (!key) {
  console.error('KIE_API_KEY fehlt in .env');
  process.exit(1);
}
const API = 'https://api.kie.ai/api/v1/jobs';
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

const prompt = [
  'Photorealistic wide 16:9 website hero photograph, shot on a full-frame camera, shallow depth of field.',
  'Dark, premium modern corporate office at dusk: floor-to-ceiling glass windows with a blurred city skyline, soft ceiling light strips, a blurred black leather office chair and a green plant in the background, all deep teal and petrol tones.',
  'On the RIGHT half: a silver modern laptop on a dark glossy desk, angled towards the left, its screen showing an abstract dark dashboard with soft turquoise glowing shapes and charts, absolutely no readable text, no letters, no logos.',
  'In front of the laptop a black notebook with a black pen with a turquoise ring.',
  'The LEFT half is calm dark negative space (dark teal gradient) reserved for headline text.',
  'Elegant glowing turquoise (#19D3C5) flowing light ribbons / waves sweep across the top edge and along the bottom-left, luminous, smooth, cinematic.',
  'Color palette: near-black teal #03161B, petrol #0A2B31, turquoise glow #19D3C5. High-end, clean, realistic reflections.',
  'No text, no typography, no watermark, no brand names, no people.',
].join(' ');

async function call(url: string, init?: RequestInit): Promise<{ code: number; msg: string; data: Record<string, unknown> | null }> {
  const r = await fetch(url, { ...init, headers });
  return (await r.json()) as { code: number; msg: string; data: Record<string, unknown> | null };
}

const created = await call(`${API}/createTask`, { method: 'POST', body: JSON.stringify({ model: 'flux-2/pro-text-to-image', input: { prompt, aspect_ratio: '16:9', resolution: '2K' } }) });
if (created.code !== 200 || !created.data?.taskId) {
  console.error(`createTask fehlgeschlagen: code ${created.code} – ${created.msg}`);
  process.exit(1);
}
const taskId = String(created.data.taskId);
console.log(`Auftrag angelegt: ${taskId}`);

let wait = 3000;
const until = Date.now() + 10 * 60_000;
for (;;) {
  await new Promise((r) => setTimeout(r, wait));
  wait = Math.min(wait * 1.5, 15000);
  const s = await call(`${API}/recordInfo?taskId=${encodeURIComponent(taskId)}`);
  if (s.code !== 200 || !s.data) {
    console.error(`recordInfo: code ${s.code} – ${s.msg}`);
    if (Date.now() > until) process.exit(1);
    continue;
  }
  const state = String(s.data.state);
  console.log(`Status: ${state}`);
  if (state === 'fail') {
    console.error(`Erzeugung fehlgeschlagen: ${String(s.data.failCode)} ${String(s.data.failMsg)}`);
    process.exit(1);
  }
  if (state === 'success') {
    const url = (JSON.parse(String(s.data.resultJson)) as { resultUrls: string[] }).resultUrls[0];
    if (!url) throw new Error('keine Ergebnis-URL');
    const img = new Uint8Array(await (await fetch(url)).arrayBuffer());
    mkdirSync('docs/design/hero', { recursive: true });
    const ext = img[0] === 0x89 ? 'png' : 'jpg';
    writeFileSync(`docs/design/hero/kie-hero-original.${ext}`, img);
    console.log(`Gespeichert: docs/design/hero/kie-hero-original.${ext} (${Math.round(img.length / 1024)} KB), Credits: ${String(s.data.creditsConsumed)}, Zeit: ${String(s.data.costTime)} s`);
    break;
  }
  if (Date.now() > until) {
    console.error('Zeitüberschreitung nach 10 Minuten');
    process.exit(1);
  }
}
