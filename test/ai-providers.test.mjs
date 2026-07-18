// Тестове за AI credentials криптиране, redaction и fallback правила.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) { globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64"); globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary"); }

const { encryptSecret, decryptSecret, fingerprintSecret, redactSecrets, isCryptoConfigured } = await import("../worker/ai/crypto.js");
const { shouldFallback } = await import("../worker/ai/providers.js");

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log("ok -", name); };

const ENV = { AI_CREDENTIALS_MASTER_KEY: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64") };
const WRONG = { AI_CREDENTIALS_MASTER_KEY: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64") };

await t("crypto configured проверка", async () => {
  assert.ok(isCryptoConfigured(ENV));
  assert.ok(!isCryptoConfigured({}));
});
await t("encrypt → decrypt roundtrip", async () => {
  const secret = "sk-test-ABCdef1234567890XYZ";
  const enc = await encryptSecret(ENV, secret);
  assert.ok(enc.ciphertext && enc.iv);
  assert.ok(!enc.ciphertext.includes("sk-test")); // не е plain text
  const dec = await decryptSecret(ENV, enc.ciphertext, enc.iv);
  assert.equal(dec, secret);
});
await t("различен IV при всяко криптиране", async () => {
  const a = await encryptSecret(ENV, "same-secret-value-123456");
  const b = await encryptSecret(ENV, "same-secret-value-123456");
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});
await t("грешен master key → decrypt fail (без изтичане)", async () => {
  const enc = await encryptSecret(ENV, "sk-secret-99887766554433");
  await assert.rejects(() => decryptSecret(WRONG, enc.ciphertext, enc.iv));
});
await t("fingerprint е стабилен и не разкрива ключа", async () => {
  const f1 = await fingerprintSecret("sk-abc-123456789012345678");
  const f2 = await fingerprintSecret("sk-abc-123456789012345678");
  assert.equal(f1, f2);
  assert.equal(f1.length, 16);
  assert.ok(!f1.includes("sk-"));
});
await t("redaction маскира ключове и заглавки", async () => {
  const dirty = "err sk-proj-abcdef123456789 Authorization: Bearer xoxb-123456789abc x-api-key: sk-ant-9988776655";
  const clean = redactSecrets(dirty);
  assert.ok(!clean.includes("sk-proj-abcdef123456789"));
  assert.ok(!clean.includes("xoxb-123456789abc"));
  assert.ok(!clean.includes("sk-ant-9988776655"));
});
await t("fallback само при временни provider проблеми", async () => {
  for (const c of ["provider_unavailable", "timeout", "rate_limited", "model_not_available"]) assert.ok(shouldFallback(c), c);
  for (const c of ["invalid_key", "configuration_error", "blocked_configuration", "safety_refusal", undefined]) assert.ok(!shouldFallback(c), String(c));
});

console.log(`\n${passed} проверки минаха.`);
