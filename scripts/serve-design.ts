import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

/** Zeigt die Designentwürfe lokal an: node scripts/serve-design.ts → http://127.0.0.1:4320 (nur localhost). */
const file = 'docs/design/web-v15/entwuerfe.html';
createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(4320, '127.0.0.1', () => console.log('Entwürfe: http://127.0.0.1:4320'));
