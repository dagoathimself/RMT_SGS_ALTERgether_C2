/** Live API. No simulated identities, master key, or authentication bypass exists here. */
import { createHash } from "crypto";
import type { JsonWebKey } from "crypto";
import { createPublicKey } from "crypto";
import { FIXTURES, STUDY } from "@/lib/fixtures";
import { guard, json, deny, isStr, type Ctx } from "./guard";
import { readDb, mutate, evidence, readEvidence, newId, now, type Db, type Contribution, type Grant } from "./store";
import { grantView, isWrap, researcherAccess } from "./access";
import { serverFingerprint } from "./fingerprint";
import { pathSegment } from "./path";

class Refused extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const refuse = (status = 400, code = "bad_request"): never => { throw new Refused(status, code); };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const normal = (s: string) => s.replace(/\s/g, "").toUpperCase();
const confirmed = (typed: unknown, fp: string) => typeof typed === "string" &&
  /^[0-9A-F]{16}$/i.test(normal(typed)) && normal(fp).startsWith(normal(typed));

function object(body: unknown, keys: string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => !keys.includes(k))) refuse();
  return body as Record<string, unknown>;
}
function ciphertext(v: unknown, min: number, max: number) {
  if (!isStr(v, Math.ceil(max / 3) * 4, 1) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v)) return false;
  const bytes = Buffer.from(v, "base64");
  return bytes.length >= min && bytes.length <= max && bytes.toString("base64") === v;
}
function encryptedFields(b: Record<string, unknown>) {
  if (!ciphertext(b.bodyCt, 16, 16 * 1024) || !ciphertext(b.bodyIv, 12, 12) || !isStr(b.ownerKeyCt, 16000)) refuse();
  return { bodyCt: b.bodyCt as string, bodyIv: b.bodyIv as string, ownerKeyCt: b.ownerKeyCt as string };
}
function ownContribution(db: Db, id: unknown, ctx: Ctx): Contribution {
  const c = db.contributions.find((c) => c.id === id && c.ownerSub === ctx.actor.sub);
  return c ?? refuse(404, "not_found");
}
function ownGrant(db: Db, ctx: Ctx): Grant {
  const id = pathSegment(ctx.req, "grants");
  const g = db.grants.find((g) => g.id === id && g.ownerSub === ctx.actor.sub);
  return g ?? refuse(404, "not_found");
}
function ownerView(db: Db, c: Contribution) {
  return { ...c, grants: db.grants.filter((g) => g.contributionId === c.id).map(grantView) };
}
function portal(action: string, roles: string[], fn: (ctx: Ctx) => Promise<Response>) {
  return guard({ action, roles }, async (ctx) => {
    try { return await fn(ctx); }
    catch (e) { if (e instanceof Refused) return deny(e.status, e.code); throw e; }
  });
}
function log(ctx: Ctx, action: string, contributionId?: string, grantId?: string) {
  evidence({ actorSub: ctx.actor.sub, actorName: ctx.actor.name, action, contributionId, grantId, result: "ok" });
}

export const me = portal("session", ["participant", "researcher"], async ({ actor }) => json({ actor }));

export const listContributions = portal("list_contributions", ["participant"], async (ctx) => {
  const db = readDb();
  return json({ contributions: db.contributions.filter((c) => c.ownerSub === ctx.actor.sub).map((c) => ownerView(db, c)) });
});

export const createContribution = portal("contribute", ["participant"], async (ctx) => {
  const b = object(ctx.body, ["id", "fixtureId", "bodyCt", "bodyIv", "ownerKeyCt"]);
  if (!isStr(b.id, 40) || !/^c_[a-f0-9]{32}$/.test(b.id)) refuse();
  const fixture = FIXTURES.find((f) => f.id === b.fixtureId) ?? refuse();
  const encrypted = encryptedFields(b);
  const contribution = await mutate((db) => {
    if (db.contributions.some((c) => c.id === b.id)) refuse(409, "conflict");
    if (db.contributions.filter((c) => c.ownerSub === ctx.actor.sub).length >= 30) refuse(409, "limit_reached");
    const c: Contribution = { id: b.id as string, fixtureId: fixture.id, label: fixture.label, language: fixture.language,
      synthetic: true, keyVersion: 1, ownerSub: ctx.actor.sub, ownerName: ctx.actor.name,
      ...encrypted, createdAt: now(), updatedAt: now() };
    db.contributions.push(c);
    return ownerView(db, c);
  });
  log(ctx, "contribute", contribution.id);
  return json({ contribution }, 201);
});

export const getContribution = portal("read", ["participant", "researcher"], async (ctx) => {
  const db = readDb();
  const id = pathSegment(ctx.req, "contributions");
  const owned = db.contributions.find((c) => c.id === id && c.ownerSub === ctx.actor.sub);
  if (owned && ctx.actor.roles.includes("participant")) return json({ contribution: ownerView(db, owned) });
  if (!ctx.actor.roles.includes("researcher")) return deny(404, "not_found");
  const access = researcherAccess(db, id, ctx.actor.sub);
  if (!access.allowed) return deny(404, "not_found");
  const { contribution: c, grant: g } = access;
  log(ctx, "read_ciphertext", c.id, g.id);
  return json({ contribution: { id: c.id, label: c.label, language: c.language, synthetic: c.synthetic,
    bodyCt: c.bodyCt, bodyIv: c.bodyIv, keyVersion: c.keyVersion }, grant: { ...grantView(g), wrap: g.wrap, purposeHash: g.purposeHash } });
});

export const researchers = portal("researcher_directory", ["participant", "researcher"], async () => json({
  researchers: readDb().researcherKeys.map(({ sub, name, publicJwk, fingerprint }) => ({ sub, name, publicJwk, fingerprint })),
}));

export const myKey = portal("my_researcher_key", ["researcher"], async (ctx) => json({
  key: readDb().researcherKeys.find((k) => k.sub === ctx.actor.sub) ?? null,
}));

export const registerKey = portal("register_key", ["researcher"], async (ctx) => {
  const b = object(ctx.body, ["publicJwk", "encPrivateKey"]);
  const p = object(b.publicJwk, ["kty", "crv", "x", "y"]);
  if (p.kty !== "EC" || p.crv !== "P-256" || !isStr(p.x, 43, 43) || !isStr(p.y, 43, 43) || !isStr(b.encPrivateKey, 16000)) refuse();
  try { createPublicKey({ key: p as JsonWebKey, format: "jwk" }); } catch { refuse(); }
  const publicJwk = { kty: "EC" as const, crv: "P-256" as const, x: p.x as string, y: p.y as string };
  const key = await mutate((db) => {
    if (db.researcherKeys.some((k) => k.sub === ctx.actor.sub)) refuse(409, "key_exists");
    const k = { sub: ctx.actor.sub, name: ctx.actor.name, publicJwk, encPrivateKey: b.encPrivateKey as string,
      fingerprint: serverFingerprint(publicJwk), createdAt: now() };
    db.researcherKeys.push(k);
    return k;
  });
  log(ctx, "register_key");
  return json({ key }, 201);
});

export const listShared = portal("list_shared", ["researcher"], async (ctx) => {
  const db = readDb();
  return json({ contributions: db.contributions.filter((c) => researcherAccess(db, c.id, ctx.actor.sub).allowed)
    .map((c) => ({ id: c.id, label: c.label, language: c.language, keyVersion: c.keyVersion, synthetic: true })) });
});

export const createGrant = portal("consent", ["participant"], async (ctx) => {
  const b = object(ctx.body, ["contributionId", "recipientSub", "purposeId", "confirmedFingerprint", "expectedKeyVersion"]);
  if (b.purposeId !== STUDY.id || !isStr(b.recipientSub, 200)) refuse();
  const grant = await mutate((db) => {
    const c = ownContribution(db, b.contributionId, ctx);
    if (b.expectedKeyVersion !== c.keyVersion) refuse(409, "stale_version");
    const r = db.researcherKeys.find((r) => r.sub === b.recipientSub) ?? refuse(404, "not_found");
    if (r.sub === ctx.actor.sub || !confirmed(b.confirmedFingerprint, serverFingerprint(r.publicJwk))) refuse(400, "fingerprint_mismatch");
    const all = db.grants.filter((g) => g.contributionId === c.id);
    if (all.some((g) => g.state === "withdrawal_pending") ||
      all.some((g) => g.recipientSub === r.sub && ["pending", "active"].includes(g.state))) refuse(409, "conflict");
    if (all.filter((g) => ["pending", "active"].includes(g.state)).length >= 16) refuse(409, "limit_reached");
    const g: Grant = { id: newId("g"), contributionId: c.id, ownerSub: c.ownerSub, recipientSub: r.sub,
      recipientName: r.name, recipientFingerprint: r.fingerprint, purposeId: STUDY.id, purposeHash: hash(STUDY.purpose),
      permissionVersion: all.filter((g) => g.recipientSub === r.sub).length + 1, state: "pending", wrap: null,
      wrapKeyVersion: null, history: [{ state: "pending", at: now() }], createdAt: now(), updatedAt: now() };
    db.grants.push(g);
    return { ...grantView(g), purposeHash: g.purposeHash, keyVersion: c.keyVersion };
  });
  log(ctx, "consent_pending", grant.contributionId, grant.id);
  return json({ grant }, 201);
});

export const activateGrant = portal("activate_grant", ["participant"], async (ctx) => {
  const b = object(ctx.body, ["wrap", "expectedKeyVersion"]);
  if (!isWrap(b.wrap)) refuse();
  const grant = await mutate((db) => {
    const g = ownGrant(db, ctx);
    const c = ownContribution(db, g.contributionId, ctx);
    if (g.state !== "pending" || b.expectedKeyVersion !== c.keyVersion ||
      db.grants.some((x) => x.contributionId === c.id && x.state === "withdrawal_pending")) refuse(409, "stale_version");
    const key = db.researcherKeys.find((k) => k.sub === g.recipientSub);
    if (!key || serverFingerprint(key.publicJwk) !== g.recipientFingerprint) refuse(409, "fingerprint_mismatch");
    g.wrap = b.wrap as Grant["wrap"]; g.wrapKeyVersion = c.keyVersion;
    g.state = "active"; g.updatedAt = now(); g.history.push({ state: "active", at: g.updatedAt });
    return grantView(g);
  });
  log(ctx, "grant_active", grant.contributionId, grant.id);
  return json({ grant });
});

export const cancelGrant = portal("cancel_grant", ["participant"], async (ctx) => {
  object(ctx.body, []);
  const grant = await mutate((db) => {
    const g = ownGrant(db, ctx);
    if (g.state !== "pending") refuse(409, "conflict");
    g.state = "denied"; g.updatedAt = now(); g.history.push({ state: "denied", at: g.updatedAt });
    return grantView(g);
  });
  log(ctx, "grant_cancelled", grant.contributionId, grant.id);
  return json({ grant });
});

export const beginWithdrawal = portal("withdraw", ["participant"], async (ctx) => {
  object(ctx.body, []);
  const result = await mutate((db) => {
    const g = ownGrant(db, ctx);
    const c = ownContribution(db, g.contributionId, ctx);
    if (!["active", "withdrawal_pending"].includes(g.state) ||
      db.grants.some((x) => x.contributionId === c.id && x.id !== g.id && x.state === "withdrawal_pending")) refuse(409, "conflict");
    if (g.state === "active") {
      g.state = "withdrawal_pending"; g.withdrawalFromKeyVersion = c.keyVersion;
      g.updatedAt = now(); g.history.push({ state: "withdrawal_pending", at: g.updatedAt });
      for (const x of db.grants.filter((x) => x.contributionId === c.id && x.state === "pending")) {
        x.state = "denied"; x.updatedAt = now(); x.history.push({ state: "denied", at: x.updatedAt });
      }
    }
    return { contribution: ownerView(db, c), grant: grantView(g),
      alreadyRekeyed: c.keyVersion > (g.withdrawalFromKeyVersion ?? c.keyVersion) && g.wrap === null };
  });
  log(ctx, "withdrawal_pending", result.contribution.id, result.grant.id);
  return json(result);
});

export const completeWithdrawal = portal("rekey", ["participant"], async (ctx) => {
  const b = object(ctx.body, ["expectedKeyVersion", "bodyCt", "bodyIv", "ownerKeyCt", "remainingWraps"]);
  const encrypted = encryptedFields(b);
  if (!Array.isArray(b.remainingWraps) || b.remainingWraps.length > 16) refuse();
  const wraps = (b.remainingWraps as unknown[]).map((x) => {
    const w = object(x, ["grantId", "wrap", "confirmedFingerprint"]);
    if (!isStr(w.grantId, 40) || !isWrap(w.wrap)) refuse();
    return w;
  });
  if (new Set(wraps.map((w) => w.grantId)).size !== wraps.length) refuse();
  const result = await mutate((db) => {
    const g = ownGrant(db, ctx);
    const c = ownContribution(db, g.contributionId, ctx);
    if (g.state !== "withdrawal_pending" || c.keyVersion !== b.expectedKeyVersion ||
      c.keyVersion !== g.withdrawalFromKeyVersion) refuse(409, "stale_version");
    const active = db.grants.filter((x) => x.contributionId === c.id && x.state === "active");
    if (active.length !== wraps.length) refuse(409, "conflict");
    for (const x of active) {
      const w = wraps.find((w) => w.grantId === x.id) ?? refuse(409, "conflict");
      const r = db.researcherKeys.find((r) => r.sub === x.recipientSub) ?? refuse(409, "conflict");
      if (serverFingerprint(r.publicJwk) !== x.recipientFingerprint || !confirmed(w.confirmedFingerprint, x.recipientFingerprint)) refuse(400, "fingerprint_mismatch");
      x.wrap = w.wrap as Grant["wrap"]; x.wrapKeyVersion = c.keyVersion + 1; x.updatedAt = now();
    }
    Object.assign(c, encrypted, { keyVersion: c.keyVersion + 1, updatedAt: now() });
    g.wrap = null; g.wrapKeyVersion = null; g.updatedAt = now();
    return { contribution: ownerView(db, c), grant: grantView(g) };
  });
  log(ctx, "rekey_complete", result.contribution.id, result.grant.id);
  return json(result);
});

export const verifyWithdrawal = portal("verify_withdrawal", ["participant"], async (ctx) => {
  object(ctx.body, []);
  // mutate reads the saved record again, after the re-key transaction has committed.
  const grant = await mutate((db) => {
    const g = ownGrant(db, ctx);
    const c = ownContribution(db, g.contributionId, ctx);
    if (g.state !== "withdrawal_pending" || g.wrap !== null || g.wrapKeyVersion !== null ||
      c.keyVersion <= (g.withdrawalFromKeyVersion ?? c.keyVersion) || researcherAccess(db, c.id, g.recipientSub).allowed) refuse(409, "withdrawal_unverified");
    g.state = "withdrawn"; g.updatedAt = now(); g.history.push({ state: "withdrawn", at: g.updatedAt });
    return grantView(g);
  });
  log(ctx, "withdrawal_verified", grant.contributionId, grant.id);
  return json({ grant, verified: true });
});

export const getEvidence = portal("activity", ["participant", "researcher"], async (ctx) => {
  const db = readDb();
  const owns = new Set(db.contributions.filter((c) => c.ownerSub === ctx.actor.sub).map((c) => c.id));
  const grants = new Set(db.grants.filter((g) => g.recipientSub === ctx.actor.sub).map((g) => g.id));
  return json({ entries: readEvidence().filter((e) => e.actorSub === ctx.actor.sub ||
    (e.contributionId && owns.has(e.contributionId)) || (e.grantId && grants.has(e.grantId))).slice(-200) });
});
