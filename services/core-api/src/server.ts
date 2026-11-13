import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppContext } from './context.ts';
import { createHandler, isUploadRequest, MAX_BODY, MAX_UPLOAD_BODY, SECURITY_HEADERS } from './http-core.ts';

export { parseItemsText } from './http-core.ts';

/** Node-Adapter für den plattformneutralen HTTP-Kern. */
export function createApp(ctx: AppContext): (req: IncomingMessage, res: ServerResponse) => void {
  const handle = createHandler(ctx);
  return (rawReq, rawRes) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    const upload = isUploadRequest(rawReq.method ?? 'GET', rawReq.url ?? '/', rawReq.headers['content-type']);
    const limit = upload ? MAX_UPLOAD_BODY : MAX_BODY;
    rawReq.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit && !aborted) {
        aborted = true;
        rawRes.writeHead(413, SECURITY_HEADERS).end();
        rawReq.destroy();
        return;
      }
      chunks.push(c);
    });
    rawReq.on('end', () => {
      if (aborted) return;
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(rawReq.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v;
      void handle({
        method: rawReq.method ?? 'GET',
        url: rawReq.url ?? '/',
        headers,
        body: upload ? '' : Buffer.concat(chunks).toString('utf8'),
        ...(upload ? { bodyBytes: new Uint8Array(Buffer.concat(chunks)) } : {}),
        ip: rawReq.socket.remoteAddress ?? 'unknown',
      }).then((res) => {
        rawRes.writeHead(res.status, res.headers);
        rawRes.end(res.body);
      });
    });
  };
}

export function startServer(ctx: AppContext, port = ctx.config.port, host = ctx.config.host): Promise<Server> {
  const server = createServer(createApp(ctx));
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
