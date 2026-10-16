import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkMediaRequest } from './media-gateway-lib.mjs';

const options = { bucket: 'studio-os-media', browserAccessKey: 'studio-os-browser' };
const check = (method, url, headers = {}) => checkMediaRequest({ method, url, headers }, options);
const signed = (key, accessKey = 'studio-os-browser') =>
  `/studio-os-media/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${accessKey}%2F20261016%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261016T000000Z&X-Amz-Expires=3600&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Signature=abc&X-Amz-SignedHeaders=host&x-id=PutObject`;

test('lets anonymous reads of public previews through', () => {
  assert.equal(check('GET', '/studio-os-media/previews/g/m.jpg').ok, true);
  assert.equal(check('HEAD', '/studio-os-media/previews/g/m.jpg').ok, true);
});

test('lets URLs presigned with the browser key through', () => {
  assert.equal(check('GET', signed('originals/g/m-a.jpg')).ok, true);
  assert.equal(check('PUT', signed('originals/g/m-a.jpg')).ok, true);
  assert.equal(
    check('GET', `${signed('originals/g/m-a.jpg')}&response-content-disposition=attachment`).ok,
    true,
  );
  assert.equal(check('OPTIONS', '/studio-os-media/originals/g/m-a.jpg').ok, true);
});

test('refuses the admin key and header auth', () => {
  assert.equal(check('GET', signed('originals/g/m-a.jpg', 'studio_os')).ok, false);
  assert.equal(
    check('GET', '/studio-os-media/previews/g/m.jpg', { authorization: 'AWS4-HMAC-SHA256 ...' }).ok,
    false,
  );
});

test('refuses unsigned access to private objects', () => {
  assert.equal(check('GET', '/studio-os-media/originals/g/m-a.jpg').ok, false);
  assert.equal(check('GET', '/studio-os-media/contracts/c.pdf').ok, false);
  assert.equal(check('PUT', '/studio-os-media/previews/g/m.jpg').ok, false);
});

test('refuses deletes, listings, sub-resources, copies and other buckets', () => {
  assert.equal(check('DELETE', signed('originals/g/m-a.jpg')).ok, false);
  assert.equal(check('POST', signed('originals/g/m-a.jpg')).ok, false);
  assert.equal(check('GET', '/studio-os-media/').ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/').ok, false);
  assert.equal(check('GET', '/studio-os-media/?list-type=2').ok, false);
  assert.equal(check('GET', '/').ok, false);
  assert.equal(check('GET', '/minio/admin/v3/info').ok, false);
  assert.equal(check('PUT', `${signed('previews/g/m.jpg')}&policy`).ok, false);
  assert.equal(check('PUT', signed('originals/g/x.jpg'), { 'x-amz-copy-source': 'a/b' }).ok, false);
  assert.equal(check('GET', '/other-bucket/previews/g/m.jpg').ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/../contracts/c.pdf').ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/%2e%2e/contracts/c.pdf').ok, false);
});

test('decides on the raw path MinIO will see, not a normalized copy', () => {
  assert.equal(check('GET', '/studio-os-media/contracts/%2e%2e/previews/g/m.jpg').ok, false);
  assert.equal(check('GET', '/studio-os-media/previews\\g\\m.jpg').ok, false);
  assert.equal(check('GET', signed('previews/%2e%2e/contracts/c.pdf')).ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/%252e%252e/x.jpg').ok, true); // stays a literal key
  assert.equal(check('GET', '/studio-os-media/previews/./g/m.jpg').ok, false);
  assert.equal(check('GET', '/studio-os-media//previews/g/m.jpg').ok, false);
  assert.equal(check('get', '/studio-os-media/previews/g/m.jpg').ok, true);
});

test('accepts only exact, single SigV4 query names', () => {
  const base = '/studio-os-media/originals/g/m-a.jpg';
  const cred = 'X-Amz-Credential=studio_os%2F20261016%2Fauto%2Fs3%2Faws4_request';
  assert.equal(check('GET', `${base}?x-amz-credential=studio_os%2Fx&X-Amz-Signature=abc`).ok, false);
  assert.equal(check('GET', `${base}?${cred}&X-Amz-Credential=studio-os-browser%2Fx`).ok, false);
  assert.equal(check('GET', `${base}?%58-Amz-Credential=studio-os-browser%2Fx`).ok, false);
  assert.equal(check('GET', `${signed('originals/g/m-a.jpg')}&x-amz-copy-source=a%2Fb`).ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/g/m.jpg?response-content-type=text/html').ok, false);
  assert.equal(check('GET', '/studio-os-media/previews/g/m.jpg?x-id=GetObject').ok, false);
});

test('signed uploads are limited to originals/ and locations/', () => {
  assert.equal(check('PUT', signed('locations/l/p-a.jpg')).ok, true);
  assert.equal(check('PUT', signed('previews/g/m.jpg')).ok, false);
  assert.equal(check('PUT', signed('contracts/c.pdf')).ok, false);
  assert.equal(check('PUT', signed('drafts/g/m.jpg')).ok, false);
  assert.equal(check('GET', signed('contracts/c.pdf')).ok, true); // presigned reads are how contracts are served
});

test('refuses form bodies on uploads', () => {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  assert.equal(check('PUT', signed('originals/g/m-a.jpg'), headers).ok, false);
  assert.equal(check('PUT', signed('originals/g/m-a.jpg'), { 'content-type': 'multipart/form-data; boundary=x' }).ok, false);
  assert.equal(check('PUT', signed('originals/g/m-a.jpg'), { 'content-type': 'image/jpeg' }).ok, true);
});

test('allows legitimate file names that contain dots', () => {
  assert.equal(check('PUT', signed('originals/g/m-IMG_0042..jpg')).ok, true);
  assert.equal(
    check('GET', `${signed('originals/g/m-Smith...jpg')}&response-content-disposition=attachment%3B%20filename%3D%22Smith...jpg%22`).ok,
    true,
  );
});
