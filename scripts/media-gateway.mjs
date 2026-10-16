#!/usr/bin/env node
// Public front door for local MinIO when Studio OS is served through a
// Cloudflare Tunnel. See media-gateway-lib.mjs for what is let through.
//
//   MEDIA_GATEWAY_PORT=9010 R2_BUCKET_NAME=studio-os-media \
//   R2_PRESIGN_ACCESS_KEY_ID=studio-os-media-browser node scripts/media-gateway.mjs
//
// The Host header is forwarded unchanged: presigned URLs are signed for the
// public hostname, and MinIO checks the signature against the Host it receives.

import { createGatewayServer } from './media-gateway-server.mjs';

const port = Number(process.env.MEDIA_GATEWAY_PORT ?? 9010);
const upstream = new URL(process.env.MEDIA_GATEWAY_UPSTREAM ?? 'http://127.0.0.1:9000');
const bucket = process.env.R2_BUCKET_NAME;
const browserAccessKey = process.env.R2_PRESIGN_ACCESS_KEY_ID;

if (!bucket || !browserAccessKey) {
  console.error('media-gateway: R2_BUCKET_NAME and R2_PRESIGN_ACCESS_KEY_ID are required');
  process.exit(1);
}
if (!['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)) {
  console.error('media-gateway: MEDIA_GATEWAY_UPSTREAM must be a local MinIO address');
  process.exit(1);
}

const server = createGatewayServer({
  bucket,
  browserAccessKey,
  upstream,
  log: (line) => console.warn(`media-gateway: ${line}`),
});

server.listen(port, '127.0.0.1', () => {
  console.log(`media-gateway: listening on 127.0.0.1:${port}, forwarding to ${upstream.origin}`);
});
