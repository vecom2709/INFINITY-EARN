import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize } from 'node:path';

/** Statische Auslieferung der UI-Vorschau (docs/screenshots/m0) auf 127.0.0.1:8790 – nur lokal, nur .html/.png. */
const root = join(process.cwd(), 'docs/screenshots/m0');
createServer((req, res) => {
  const name = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')).replace(/^[\\/]+/, '') || 'index.html';
  if (!/^[a-z0-9-]+\.(html|png)$/.test(name)) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }).end(readFileSync(join(root, name)));
  } catch {
    res.writeHead(404).end();
  }
}).listen(8790, '127.0.0.1', () => console.log('UI-Vorschau: http://127.0.0.1:8790/uebersicht-test.html'));
