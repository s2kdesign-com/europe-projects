import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Miniflare } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'euro-push-runtime-'));
let runtime;
try {
  const main = path.join(root, 'test/fixtures/push-runtime-worker.js').replaceAll('\\', '/');
  const config = path.join(temporary, 'wrangler.json');
  await writeFile(config, JSON.stringify({ name: 'push-runtime-test', main, compatibility_date: '2025-05-05', compatibility_flags: ['nodejs_compat'] }));
  const bundle = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js'), 'deploy', '--dry-run', '--config', config, '--outdir', temporary], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
  });
  assert.equal(bundle.status, 0, 'Local Workers fixture must bundle successfully');
  runtime = new Miniflare({ modules: true, modulesRoot: temporary, scriptPath: path.join(temporary, 'push-runtime-worker.js'), compatibilityDate: '2025-05-05', compatibilityFlags: ['nodejs_compat'] });
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', vapid.privateKey);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', vapid.publicKey)).toString('base64url');
  const device = createECDH('prime256v1'); device.generateKeys();
  for (const privateKey of [JSON.stringify(jwk), jwk.d]) {
    for (const status of [201, 302, 307]) {
      const response = await runtime.dispatchFetch('http://localhost/', { method: 'POST', body: JSON.stringify({
        env: { WEB_PUSH_VAPID_PRIVATE_JWK: privateKey, WEB_PUSH_VAPID_PUBLIC_KEY: publicKey, WEB_PUSH_VAPID_SUBJECT: 'mailto:test@example.invalid' },
        subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/runtime-fixture', keys: { p256dh: device.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } },
        status,
      }) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { state: status === 201 ? 'accepted' : 'failed', requests: 1, encrypted: true });
    }
  }
  console.log('ok - workerd sender accepts 201 and rejects redirects for JWK and scalar configuration (6 cases; no external delivery)');
} finally {
  await runtime?.dispose();
  // Only remove the exact temporary directory created above.
  await rm(temporary, { recursive: true, force: true });
}
