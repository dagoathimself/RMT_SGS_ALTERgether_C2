import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, calculateJwkThumbprint } from 'jose';
import { verifyDpop, MemoryJtiStore, requestHtu } from '../.test-output/src/lib/auth/verifyDpop.js';
const token = 'unit-test-token-only';
const keys = await generateKeyPair('ES256', { extractable: true });
const jwk = await exportJWK(keys.publicKey);
const jkt = await calculateJwkThumbprint(jwk);
const ath = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('base64url');
const url = 'http://localhost:3000/api/me';
async function proof(overrides = {}, header = {}, privateKey = keys.privateKey) {
  return new SignJWT({ htm: 'GET', htu: url, ath, iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID(), ...overrides })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk, ...header }).sign(privateKey);
}
function request(p, method = 'GET', auth = `DPoP ${token}`, extra = {}) {
  return { url, method, headers: new Headers({ authorization: auth, ...(p ? { dpop: p } : {}), ...extra }) };
}
const opts = () => ({ jtiStore: new MemoryJtiStore() });
test('valid bound proof accepted once and immediate reuse rejected', async () => {
  const p = await proof(), o = opts();
  await verifyDpop(request(p), token, { cnf: { jkt } }, o);
  await assert.rejects(verifyDpop(request(p), token, { cnf: { jkt } }, o), /replay/);
});
test('regression: future-dated proof remains consumed after 301 seconds and at final boundary', async (t) => {
  const start = 1800000000000;
  t.mock.method(Date, 'now', () => start);
  const p = await proof({ iat: start / 1000 + 299 }), o = opts();
  await verifyDpop(request(p), token, { cnf: { jkt } }, o);
  t.mock.method(Date, 'now', () => start + 301000);
  await assert.rejects(verifyDpop(request(p), token, { cnf: { jkt } }, o), /replay/);
  t.mock.method(Date, 'now', () => start + 599000);
  await assert.rejects(verifyDpop(request(p), token, { cnf: { jkt } }, o), /replay/);
});
test('expired proofs and excessively future proofs rejected', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const iat of [now - 301, now + 301]) await assert.rejects(verifyDpop(request(await proof({ iat })), token, { cnf: { jkt } }, opts()));
});
test('Bearer, missing proof and unbound tokens rejected', async () => {
  const p = await proof();
  await assert.rejects(verifyDpop(request(p, 'GET', `Bearer ${token}`), token, { cnf: { jkt } }, opts()));
  await assert.rejects(verifyDpop(request(null), token, { cnf: { jkt } }, opts()));
  await assert.rejects(verifyDpop(request(p), token, {}, opts()));
});
test('wrong URL, wrong method, wrong access-token hash and wrong key rejected', async () => {
  for (const change of [{ htu: url + '/other' }, { htm: 'POST' }, { htm: 'get' }, { ath: 'wrong' }]) {
    await assert.rejects(verifyDpop(request(await proof(change)), token, { cnf: { jkt } }, opts()));
  }
  await assert.rejects(verifyDpop(request(await proof()), token, { cnf: { jkt: 'wrong' } }, opts()));
});
test('private proof JWK, symmetric algorithm and oversized identifiers rejected', async () => {
  await assert.rejects(verifyDpop(request(await proof({}, { jwk: await exportJWK(keys.privateKey) })), token, { cnf: { jkt } }, opts()));
  const symmetric = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'dpop+jwt', jwk: { kty: 'oct', k: 'test' } }).sign(new Uint8Array(32));
  await assert.rejects(verifyDpop(request(symmetric), token, { cnf: { jkt } }, opts()));
  await assert.rejects(verifyDpop(request(await proof({ jti: 'x'.repeat(201) })), token, { cnf: { jkt } }, opts()));
});
test('forwarded host ignored by default; URI comparison excludes query', () => {
  const r = { url: url + '?q=x', headers: new Headers({ 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https' }) };
  assert.equal(requestHtu(r), url);
});
