import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { createGatewayServer } from './media-gateway-server.mjs';

const BUCKET = 'studio-os-media';
const KEY = 'studio-os-media-browser';
const reached = [];
let stub;
let gateway;
let base;

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const signed = (key) =>
  `/${BUCKET}/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${KEY}%2F20261016%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261016T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc&X-Amz-SignedHeaders=host`;
const send = (url, options, body) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });

before(async () => {
  stub = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      reached.push({ method: req.method, url: req.url, host: req.headers.host, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { 'content-type': 'text/plain' }).end('from-stub');
    });
  });
  const stubPort = await listen(stub);
  gateway = createGatewayServer({
    bucket: BUCKET,
    browserAccessKey: KEY,
    upstream: new URL(`http://127.0.0.1:${stubPort}`),
  });
  base = `http://127.0.0.1:${await listen(gateway)}`;
});
after(() => {
  gateway.close();
  stub.close();
});

test('refused requests never reach the store', async () => {
  reached.length = 0;
  for (const path of [`/${BUCKET}/originals/g/m.jpg`, `/${BUCKET}/?list-type=2`, '/minio/admin/v3/info']) {
    assert.ok((await send(`${base}${path}`, { method: 'GET' })).status >= 400, path);
  }
  assert.equal((await send(`${base}${signed('originals/g/m.jpg')}`, { method: 'DELETE' })).status, 405);
  assert.equal(reached.length, 0);
});

test('allowed requests are proxied with the public Host header and body intact', async () => {
  reached.length = 0;
  const preview = await send(`${base}/${BUCKET}/previews/g/m.jpg`, { method: 'GET' });
  assert.equal(preview.status, 200);
  assert.equal(preview.text, 'from-stub');

  const put = await send(
    `${base}${signed('originals/g/m-a.jpg')}`,
    { method: 'PUT', headers: { host: 'media.example.test', 'content-type': 'image/jpeg' } },
    'photo-bytes',
  );
  assert.equal(put.status, 200);
  const last = reached.at(-1);
  assert.equal(last.method, 'PUT');
  assert.equal(last.host, 'media.example.test');
  assert.equal(last.body, 'photo-bytes');
});

test('control headers are refused before the store sees them', async () => {
  reached.length = 0;
  const res = await send(
    `${base}${signed('originals/g/m-a.jpg')}`,
    { method: 'PUT', headers: { 'x-amz-meta-snowball-auto-extract': 'true' } },
    'x',
  );
  assert.equal(res.status, 403);
  assert.equal(reached.length, 0);
});

test('large uploads are not cut off by the default five minute request timeout', () => {
  assert.equal(gateway.requestTimeout, 0);
});

test('a missing store gives a clean 502', async () => {
  const dead = createGatewayServer({ bucket: BUCKET, browserAccessKey: KEY, upstream: new URL('http://127.0.0.1:1') });
  const port = await listen(dead);
  const res = await send(`http://127.0.0.1:${port}/${BUCKET}/previews/g/m.jpg`, { method: 'GET' });
  assert.equal(res.status, 502);
  dead.close();
});
