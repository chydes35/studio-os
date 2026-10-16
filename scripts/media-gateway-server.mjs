// The proxy itself, separate from the script that binds a port so tests can
// drive it against a stub upstream. Rules live in media-gateway-lib.mjs.

import http from 'node:http';
import { pipeline } from 'node:stream';
import { checkMediaRequest } from './media-gateway-lib.mjs';

/**
 * @param {{ bucket: string, browserAccessKey: string, upstream: URL, log?: (line: string) => void }} options
 */
export function createGatewayServer({ bucket, browserAccessKey, upstream, log = () => {} }) {
  const server = http.createServer((req, res) => {
    const verdict = checkMediaRequest(
      { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers },
      { bucket, browserAccessKey },
    );
    if (!verdict.ok) {
      log(`${verdict.status} ${req.method} ${req.url?.split('?')[0]} (${verdict.reason})`);
      res.writeHead(verdict.status, { 'content-type': 'text/plain' }).end(`${verdict.reason}\n`);
      return;
    }

    const proxied = http.request(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        // pipeline tears down both sides if either ends early (browsers abort
        // range requests constantly), so no upstream socket is left open.
        pipeline(upstreamRes, res, () => {});
      },
    );
    proxied.on('error', (err) => {
      log(`upstream error: ${err.message}`);
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'content-type': 'text/plain' }).end('storage unavailable\n');
    });
    pipeline(req, proxied, () => {});
    res.on('close', () => proxied.destroy());
  });

  // Node's default gives a client five minutes to deliver the whole request
  // body, which cuts off a large original on a slow uplink with a 408. Header
  // and idle timeouts still apply, so a stalled connection is not held forever.
  server.requestTimeout = 0;
  server.timeout = 120_000;
  return server;
}
