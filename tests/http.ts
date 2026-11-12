import type { Server } from 'node:http';
import type { AppContext } from '../services/core-api/src/context.ts';
import { startServer } from '../services/core-api/src/server.ts';

/** Kleiner HTTP-Client mit Cookie-Speicher für Tests gegen den echten Server. */
export class Client {
  readonly base: string;
  readonly cookies = new Map<string, string>();
  constructor(base: string) {
    this.base = base;
  }
  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  }
  async req(method: string, path: string, body?: Record<string, string> | string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; location: string | null; headers: Headers }> {
    const h: Record<string, string> = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    let payload: string | undefined;
    if (typeof body === 'string') payload = body;
    else if (body) {
      payload = new URLSearchParams(body).toString();
      h['content-type'] = 'application/x-www-form-urlencoded';
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = (pair ?? '').indexOf('=');
      const k = (pair ?? '').slice(0, i);
      const v = decodeURIComponent((pair ?? '').slice(i + 1));
      if (/Max-Age=0/.test(c) || v === '') this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    return { status: res.status, text: await res.text(), location: res.headers.get('location'), headers: res.headers };
  }
  get(path: string) {
    return this.req('GET', path);
  }
  post(path: string, body?: Record<string, string> | string, headers?: Record<string, string>) {
    return this.req('POST', path, body, headers);
  }
}

export async function serve(ctx: AppContext): Promise<{ server: Server; base: string }> {
  const server = await startServer(ctx, 0, '127.0.0.1');
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server, base: `http://127.0.0.1:${port}` };
}

export const csrfFrom = (html: string): string => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
