// Real route/guard integration with a disposable, locally signed OIDC fixture.
// The test realm is not Tide. Production code has no test switch or auth bypass.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server.js';
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint } from 'jose';
import * as c from '../.test-output/src/lib/crypto/envelope.js';
const store = mkdtempSync(join(tmpdir(), 'altergether-routes-'));
const origin = 'http://localhost:3000';
process.env.CV_STORE_DIR = store;
process.env.APP_ORIGIN = origin;
const realmKeys = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
const realmJwk = { ...await exportJWK(realmKeys.publicKey), kid: 'test-realm', alg: 'EdDSA' };
const issuer = 'http://localhost:8080/realms/test-only';
const resource = 'consent-vault-client';
process.env.CLIENT_ADAPTER = JSON.stringify({ realm: 'test-only', 'auth-server-url': 'http://localhost:8080',
  resource, 'public-client': true, jwk: { keys: [realmJwk] }, credentials: { secret: 'must-not-be-public' } });
const h = await import('../.test-output/src/lib/server/handlers.js');
const s = await import('../.test-output/src/lib/server/store.js');
const cfg = await import('../.test-output/src/lib/auth/tidecloakConfig.js');
const { STUDY } = await import('../.test-output/src/lib/fixtures.js');
after(() => rmSync(store, { force: true, recursive: true }));
const actorKeys = {};
async function auth(sub, roles, path, method, claims = {}) {
  const keys = actorKeys[sub] ??= await generateKeyPair('ES256');
  const jwk = await exportJWK(keys.publicKey);
  const jkt = await calculateJwkThumbprint(jwk);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sub, preferred_username: sub, azp: resource, aud: [resource], realm_access: { roles }, cnf: { jkt },
    iss: issuer, iat: now, exp: now + 300, ...claims }).setProtectedHeader({ alg: 'EdDSA', kid: 'test-realm' }).sign(realmKeys.privateKey);
  const ath = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('base64url');
  const proof = await new SignJWT({ htm: method, htu: origin + path, iat: now, jti: crypto.randomUUID(), ath })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).sign(keys.privateKey);
  return { Authorization: `DPoP ${token}`, DPoP: proof };
}
async function call(fn, path, { sub = 'owner', roles = ['participant'], method = 'GET', body, claims, headers } = {}) {
  const a = await auth(sub, roles, path, method, claims);
  const res = await fn(new NextRequest(origin + path, { method, headers: { ...a, Origin: origin,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: res.status, data: await res.json(), headers: res.headers };
}
const id = 'c_0123456789abcdef0123456789abcdef';
const path = `/api/contributions/${id}`;
const a = await c.generateResearcherKeyPair(), b = await c.generateResearcherKeyPair();
const aFp = await c.fingerprint(a.publicJwk), bFp = await c.fingerprint(b.publicJwk);
const fp16 = (fp) => fp.replaceAll(' ', '').slice(0, 16);
const message = 'Synthetic Vietnamese test: tài khoản bị khóa, urgent OTP.';
const payload = { text: message, language: 'vi', synthetic: true, fixtureId: 'fx-vi-1', sha256: await c.sha256Hex(message) };
const key = c.newContributionKey();
const encrypted = await c.encryptBody(key, payload, id, 1);
const binding = (g, keyVersion) => ({ contributionId: id, recipientSub: g.recipientSub, grantId: g.id,
  permissionVersion: g.permissionVersion, purposeHash: g.purposeHash, keyVersion });
let grantA, grantB;

test('public adapter omits secret-bearing fields, allows extra public signing keys and rejects private adapters', async () => {
  assert.equal('credentials' in cfg.publicTideConfig(), false);
  const good = process.env.CLIENT_ADAPTER;
  try {
    const extra = await generateKeyPair('RS256');
    const mixed = JSON.parse(good);
    mixed.jwk.keys[0].hidden = 'not-for-browser';
    mixed.jwk.keys.push(await exportJWK(extra.publicKey));
    process.env.CLIENT_ADAPTER = JSON.stringify(mixed);
    assert.equal(cfg.publicTideConfig().jwk.keys.length, 2);
    assert.equal('hidden' in cfg.publicTideConfig().jwk.keys[0], false);
    for (const patch of [{ 'public-client': false }, { jwk: { keys: [{ ...realmJwk, d: 'private' }] } }, { jwk: { keys: [] } }]) {
      process.env.CLIENT_ADAPTER = JSON.stringify({ ...JSON.parse(good), ...patch });
      assert.throws(() => cfg.loadTideConfig());
    }
  } finally { process.env.CLIENT_ADAPTER = good; }
});
test('real JWT verification rejects expired, wrong-audience, wrong-azp and empty-sub fixture tokens', async () => {
  for (const claims of [{ exp: Math.floor(Date.now()/1000)-60 }, { aud: ['wrong'] }, { azp: 'wrong' }, { sub: '' }, { iat: Math.floor(Date.now()/1000)+120 }]) {
    assert.equal((await call(h.me, '/api/me', { claims })).status, 401);
  }
});
test('own-client roles accepted; another client and administrator roles do not confer portal access', async () => {
  const own = await call(h.me, '/api/me', { roles: [], claims: { resource_access: { [resource]: { roles: ['researcher'] } } } });
  assert.equal(own.status, 200); assert.deepEqual(own.data.actor.roles, ['researcher']);
  assert.equal((await call(h.me, '/api/me', { roles: [], claims: { resource_access: { 'other-client': { roles: ['participant'] } } } })).status, 403);
  assert.equal((await call(h.me, '/api/me', { sub: 'admin', roles: ['tide-realm-admin'] })).status, 403);
});
test('guard checks origin, consumes DPoP once, refuses copied Bearer and streams within size limit', async () => {
  assert.equal((await call(h.createContribution, '/api/contributions', { method: 'POST', body: {}, headers: { Origin: 'https://other.invalid' } })).status, 403);
  const headers = await auth('owner', ['participant'], '/api/me', 'GET');
  const request = () => new NextRequest(origin + '/api/me', { headers });
  assert.equal((await h.me(request())).status, 200);
  assert.equal((await h.me(request())).status, 401);
  assert.equal((await h.me(new NextRequest(origin + '/api/me', { headers: { Authorization: headers.Authorization.replace('DPoP ', 'Bearer ') } }))).status, 401);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(70 * 1024)); controller.close(); } });
  const large = new NextRequest(origin + '/api/contributions', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
  assert.equal((await h.createContribution(large)).status, 413);
});
test('each researcher registers only their own immutable public key and sealed private blob', async () => {
  for (const [sub, kp] of [['a', a], ['b', b]]) {
    const r = await call(h.registerKey, '/api/researchers/me', { sub, roles: ['researcher'], method: 'POST', body: { publicJwk: kp.publicJwk, encPrivateKey: 'test-only-sealed-private' } });
    assert.equal(r.status, 201); assert.equal(r.data.key.sub, sub);
  }
  assert.equal((await call(h.registerKey, '/api/researchers/me', { sub: 'a', roles: ['researcher'], method: 'POST', body: { publicJwk: b.publicJwk, encPrivateKey: 'different' } })).status, 409);
  const directory = await call(h.researchers, '/api/researchers');
  assert.equal('encPrivateKey' in directory.data.researchers[0], false);
});
test('contribution stores ciphertext; actor/body spoofing and duplicate IDs are rejected', async () => {
  const body = { id, fixtureId: 'fx-vi-1', ...encrypted, ownerKeyCt: 'test-only-owner-seal' };
  assert.equal((await call(h.createContribution, '/api/contributions', { method: 'POST', body: { ...body, ownerSub: 'victim' } })).status, 400);
  assert.equal((await call(h.createContribution, '/api/contributions', { method: 'POST', body })).status, 201);
  assert.equal((await call(h.createContribution, '/api/contributions', { method: 'POST', body })).status, 409);
  assert.equal(s.readDb().contributions[0].ownerSub, 'owner');
  assert.equal(readFileSync(join(store, 'db.json'), 'utf8').includes(message), false);
});
test('unshared reads and cross-owner grant creation refused', async () => {
  assert.equal((await call(h.getContribution, path, { sub: 'a', roles: ['researcher'] })).status, 404);
  assert.equal((await call(h.getContribution, path, { sub: 'b', roles: ['researcher'] })).status, 404);
  assert.equal((await call(h.createGrant, '/api/grants', { sub: 'other-owner', method: 'POST', body: {
    contributionId: id, recipientSub: 'a', purposeId: STUDY.id, confirmedFingerprint: fp16(aFp), expectedKeyVersion: 1 } })).status, 404);
});
test('fingerprint confirmation and owner approval precede pending grant creation', async () => {
  const body = { contributionId: id, recipientSub: 'a', purposeId: STUDY.id, confirmedFingerprint: '0000000000000000', expectedKeyVersion: 1 };
  assert.equal((await call(h.createGrant, '/api/grants', { method: 'POST', body })).status, 400);
  const r = await call(h.createGrant, '/api/grants', { method: 'POST', body: { ...body, confirmedFingerprint: fp16(aFp) } });
  assert.equal(r.status, 201); grantA = r.data.grant;
  assert.equal(grantA.state, 'pending');
  assert.equal((await call(h.getContribution, path, { sub: 'a', roles: ['researcher'] })).status, 404);
});
test('only owner activates current-version wrap; A decrypts and B is refused', async () => {
  const wrap = await c.wrapKey(key, a.publicJwk, binding(grantA, 1));
  const activation = `/api/grants/${grantA.id}/activate`;
  assert.equal((await call(h.activateGrant, activation, { sub: 'other-owner', method: 'POST', body: { wrap, expectedKeyVersion: 1 } })).status, 404);
  assert.equal((await call(h.activateGrant, activation, { method: 'POST', body: { wrap, expectedKeyVersion: 2 } })).status, 409);
  assert.equal((await call(h.activateGrant, activation, { method: 'POST', body: { wrap, expectedKeyVersion: 1 } })).status, 200);
  const r = await call(h.getContribution, path, { sub: 'a', roles: ['researcher'] });
  assert.equal(r.status, 200); assert.equal('ownerKeyCt' in r.data.contribution, false);
  assert.equal(r.headers.get('cache-control'), 'no-store, max-age=0');
  const unwrapped = await c.unwrapKey(r.data.grant.wrap, await c.importPrivateKey(a.pkcs8), binding(r.data.grant, 1));
  assert.equal((await c.decryptBody(unwrapped, r.data.contribution.bodyCt, r.data.contribution.bodyIv, id, 1)).text, message);
  assert.equal((await call(h.getContribution, path, { sub: 'b', roles: ['researcher'] })).status, 404);
  assert.deepEqual((await call(h.listShared, '/api/shared', { sub: 'b', roles: ['researcher'] })).data.contributions, []);
});
test('cancelled pending grant creates no access and can be recreated', async () => {
  const body = { contributionId: id, recipientSub: 'b', purposeId: STUDY.id, confirmedFingerprint: fp16(bFp), expectedKeyVersion: 1 };
  const pending = (await call(h.createGrant, '/api/grants', { method: 'POST', body })).data.grant;
  assert.equal((await call(h.cancelGrant, `/api/grants/${pending.id}/cancel`, { method: 'POST', body: {} })).status, 200);
  const r = await call(h.createGrant, '/api/grants', { method: 'POST', body }); grantB = r.data.grant;
  const wrap = await c.wrapKey(key, b.publicJwk, binding(grantB, 1));
  assert.equal((await call(h.activateGrant, `/api/grants/${grantB.id}/activate`, { method: 'POST', body: { wrap, expectedKeyVersion: 1 } })).status, 200);
});
test('pending withdrawal blocks A immediately and cannot be marked verified early', async () => {
  assert.equal((await call(h.beginWithdrawal, `/api/grants/${grantA.id}/withdraw`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await call(h.getContribution, path, { sub: 'a', roles: ['researcher'] })).status, 404);
  assert.equal((await call(h.verifyWithdrawal, `/api/grants/${grantA.id}/verify-withdrawal`, { method: 'POST', body: {} })).status, 409);
  assert.equal(s.readDb().grants.find((g) => g.id === grantA.id).state, 'withdrawal_pending');
});
test('re-key transaction requires every remaining recipient, version and fingerprint; failed writes are atomic', async () => {
  const next = c.newContributionKey();
  const changed = await c.encryptBody(next, payload, id, 2);
  const wrap = await c.wrapKey(next, b.publicJwk, binding(grantB, 2));
  const body = { ...changed, ownerKeyCt: 'test-only-next-owner-seal', expectedKeyVersion: 1, remainingWraps: [] };
  const endpoint = `/api/grants/${grantA.id}/complete-withdrawal`;
  assert.equal((await call(h.completeWithdrawal, endpoint, { method: 'POST', body })).status, 409);
  assert.equal(s.readDb().contributions[0].keyVersion, 1);
  const remainingWraps = [{ grantId: grantB.id, wrap, confirmedFingerprint: '0000000000000000' }];
  assert.equal((await call(h.completeWithdrawal, endpoint, { method: 'POST', body: { ...body, remainingWraps } })).status, 400);
  remainingWraps[0].confirmedFingerprint = fp16(bFp);
  assert.equal((await call(h.completeWithdrawal, endpoint, { method: 'POST', body: { ...body, remainingWraps } })).status, 200);
  const db = s.readDb();
  assert.equal(db.contributions[0].keyVersion, 2);
  assert.equal(db.grants.find((g) => g.id === grantA.id).wrap, null);
  assert.equal(db.grants.find((g) => g.id === grantA.id).state, 'withdrawal_pending');
  await assert.rejects(c.decryptBody(key, changed.bodyCt, changed.bodyIv, id, 2));
  const r = await call(h.getContribution, path, { sub: 'b', roles: ['researcher'] });
  const unwrapped = await c.unwrapKey(r.data.grant.wrap, await c.importPrivateKey(b.pkcs8), binding(r.data.grant, 2));
  assert.equal((await c.decryptBody(unwrapped, changed.bodyCt, changed.bodyIv, id, 2)).text, message);
});
test('fresh persisted-state denial check marks withdrawal complete; fresh A requests remain denied', async () => {
  const r = await call(h.verifyWithdrawal, `/api/grants/${grantA.id}/verify-withdrawal`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.equal(r.data.verified, true); assert.equal(r.data.grant.state, 'withdrawn');
  assert.equal((await call(h.getContribution, path, { sub: 'a', roles: ['researcher'] })).status, 404);
});
test('activity is scoped to actor/ownership/grant; logs and store contain no message or raw keys', async () => {
  const owner = await call(h.getEvidence, '/api/evidence');
  const other = await call(h.getEvidence, '/api/evidence', { sub: 'other-owner' });
  assert.ok(owner.data.entries.length > 0); assert.equal(other.data.entries.length, 0);
  const text = readFileSync(join(store, 'db.json'), 'utf8') + readFileSync(join(store, 'evidence.jsonl'), 'utf8');
  assert.equal(text.includes(message), false); assert.equal(text.includes(c.b64(key)), false);
  assert.equal(text.includes(c.b64(a.pkcs8)), false); assert.equal(s.verifyEvidenceChain().ok, true);
});
