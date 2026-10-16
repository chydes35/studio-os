#!/usr/bin/env node
// Public front door for local MinIO when Studio OS is served through a
// Cloudflare Tunnel. See media-gateway-lib.mjs for what is let through.
//
//   MEDIA_GATEWAY_PORT=9010 R2_BUCKET_NAME=studio-os-media \
//   R2_PRESIGN_ACCESS_KEY_ID=studio-os-browser node scripts/media-gateway.mjs
//
// The Host header is forwarded unchanged: presigned URLs are signed for the
// public hostname, and MinIO checks the signature against the Host it receives.

import http from 'node:http';
import { checkMediaRequest } from './media-gateway-lib.mjs';

const port = Number(process.env.MEDIA_GATEWAY_PORT ?? 9010);
const upstream = new URL(process.env.MEDIA_GATEWAY_UPSTREAM ?? 'http://127.0.0.1:9000');
const bucket = process.env.R2_BUCKET_NAME;
const browserAccessKey = process.env.R2_PRESIGN_ACCESS_KEY_ID;

if (!bucket || !browserAccessKey) {
  console.error('media-gateway: R2_BUCKET_NAME and R2_PRESIGN_ACCESS_KEY_ID are required');
  process.exit(1);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(upstream.hostname)) {
  console.error('media-gateway: MEDIA_GATEWAY_UPSTREAM must be a local MinIO address');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const verdict = checkMediaRequest(
    { method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers },
    { bucket, browserAccessKey },
  );
  if (!verdict.ok) {
    console.warn(`media-gateway: ${verdict.status} ${req.method} ${req.url?.split('?')[0]} (${verdict.reason})`);
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
      upstreamRes.pipe(res);
    },
  );
  proxied.on('error', (err) => {
    console.error(`media-gateway: upstream error: ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('storage unavailable\n');
  });
  req.pipe(proxied);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`media-gateway: listening on 127.0.0.1:${port}, forwarding to ${upstream.origin}`);
});
