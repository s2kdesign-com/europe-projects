import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../media-worker.js';

const path = '/2026-09-20/BG-0123456789abcdef0123456789abcdef.png';
const url = 'https://images.example' + path;

test('media endpoint rejects writes and malformed paths before KV access', async () => {
  const env = { IMAGES: { get() { throw new Error('must not access KV'); } } };
  assert.equal((await worker.fetch(new Request(url, { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://images.example/.env'), env)).status, 404);
});

test('public PNG response streams bytes with safe immutable headers', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const env = { IMAGES: { async get(key, options) {
    assert.equal(key, path.slice(1));
    assert.equal(options.type, 'stream');
    return new Blob([bytes]).stream();
  } } };
  const response = await worker.fetch(new Request(url), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('HEAD cancels body and missing keys are not negatively cached by HTTP', async () => {
  let canceled = false;
  const env = { IMAGES: { async get() { return new ReadableStream({ cancel() { canceled = true; } }); } } };
  const response = await worker.fetch(new Request(url, { method: 'HEAD' }), env);
  assert.equal(response.body, null);
  assert.equal(canceled, true);
  const missing = await worker.fetch(new Request(url), { IMAGES: { async get() { return null; } } });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
});

test('KV failure returns a retryable response without exposing exception details', async () => {
  const original = console.error;
  const logs = [];
  console.error = value => logs.push(value);
  try {
    const response = await worker.fetch(new Request(url), { IMAGES: { async get() { throw new Error('private details'); } } });
    assert.equal(response.status, 503);
    assert.ok(!logs.join('').includes('private details'));
    assert.ok(!(await response.text()).includes('private details'));
  } finally { console.error = original; }
});
