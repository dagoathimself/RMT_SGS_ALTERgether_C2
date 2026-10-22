import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../.test-output/src/lib/crypto/envelope.js';
import { createSimulation } from '../.test-output/src/lib/demo/simulation.js';
const text = 'Tôi nhận được tin nhắn lạ — urgent invoice, mã OTP. <img src=x onerror=alert(1)>';
const payload = { text, language: 'mixed', synthetic: true, fixtureId: null, sha256: await c.sha256Hex(text) };
const binding = { contributionId: 'c-test', recipientSub: 'a', grantId: 'g-test', permissionVersion: 1, purposeHash: 'purpose', keyVersion: 1 };
const a = await c.generateResearcherKeyPair();
const b = await c.generateResearcherKeyPair();
const key = c.newContributionKey();
const wrap = await c.wrapKey(key, a.publicJwk, binding);
const ciphertext = await c.encryptBody(key, payload, 'c-test', 1);

test('Unicode and inert markup survive encryption without translation', async () => {
  assert.deepEqual(await c.decryptBody(key, ciphertext.bodyCt, ciphertext.bodyIv, 'c-test', 1), payload);
});
test('A can unwrap; a different researcher cannot unwrap even with full ciphertext', async () => {
  assert.deepEqual(await c.unwrapKey(wrap, await c.importPrivateKey(a.pkcs8), binding), key);
  await assert.rejects(c.unwrapKey(wrap, await c.importPrivateKey(b.pkcs8), binding));
});
test('changing any grant-binding field invalidates the key copy', async () => {
  for (const [name, value] of Object.entries(binding)) {
    const changed = { ...binding, [name]: typeof value === 'number' ? value + 1 : value + '-changed' };
    await assert.rejects(c.unwrapKey(wrap, await c.importPrivateKey(a.pkcs8), changed), name);
  }
});
test('body authentication binds contribution ID and key version', async () => {
  await assert.rejects(c.decryptBody(key, ciphertext.bodyCt, ciphertext.bodyIv, 'different', 1));
  await assert.rejects(c.decryptBody(key, ciphertext.bodyCt, ciphertext.bodyIv, 'c-test', 2));
  const bytes = c.unb64(ciphertext.bodyCt); bytes[0] ^= 1;
  await assert.rejects(c.decryptBody(key, c.b64(bytes), ciphertext.bodyIv, 'c-test', 1));
});
test('the encrypted digest is checked after decryption', async () => {
  const bad = await c.encryptBody(key, { ...payload, sha256: 'wrong' }, 'c-test', 1);
  await assert.rejects(c.decryptBody(key, bad.bodyCt, bad.bodyIv, 'c-test', 1));
});
test('fingerprint is derived from the sealed private key, not server metadata', async () => {
  assert.equal(await c.fingerprint(await c.publicFromPkcs8(a.pkcs8)), await c.fingerprint(a.publicJwk));
  assert.notEqual(await c.fingerprint(a.publicJwk), await c.fingerprint(b.publicJwk));
  assert.equal(c.fingerprintMatches('1234', await c.fingerprint(a.publicJwk)), false);
});
test('re-keying makes the old key fail against the current record', async () => {
  const next = c.newContributionKey();
  const rekeyed = await c.encryptBody(next, payload, 'c-test', 2);
  await assert.rejects(c.decryptBody(key, rekeyed.bodyCt, rekeyed.bodyIv, 'c-test', 2));
  assert.equal((await c.decryptBody(next, rekeyed.bodyCt, rekeyed.bodyIv, 'c-test', 2)).text, text);
});
test('separate synthetic simulation completes its actual crypto workflow', async () => {
  const d = await createSimulation('fx-vi-1');
  await assert.rejects(d.share('0000000000000000'));
  await d.share(d.view().fingerprint.replaceAll(' ', '').slice(0, 16));
  assert.match(await d.readA(), /ngân hàng/);
  assert.equal(await d.refuseB(), true);
  assert.equal(await d.refuseB(true), true);
  await d.withdraw();
  assert.equal(d.view().keyVersion, 2);
  assert.equal(d.view().hasRecipientWrap, false);
  assert.equal(await d.refuseWithdrawnKey(), true);
  await assert.rejects(d.readA());
});
