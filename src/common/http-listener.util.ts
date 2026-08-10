import type { RequestListener, Server } from 'node:http';

export function createPathGate(
  handler: RequestListener,
  allowedPrefixes: readonly string[],
): RequestListener {
  return (req, res) => {
    const url = req.url ?? '';
    const allowed = allowedPrefixes.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
    );
    if (!allowed) {
      res.statusCode = 404;
      res.end();
      return;
    }
    handler(req, res);
  };
}

export function closeServerWithin(server: Server, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections();
  });
}
