import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

/** Lokale Vorschau des gebauten Offline-Programms: node scripts/serve-mini-ww.ts → http://127.0.0.1:4321 (nur localhost). */
createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(readFileSync('build/mini-ww/index.html'));
}).listen(4321, '127.0.0.1', () => console.log('Mini-Warenwirtschaft: http://127.0.0.1:4321'));
