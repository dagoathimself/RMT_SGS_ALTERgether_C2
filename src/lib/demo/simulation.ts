/**
 * PUBLIC SYNTHETIC SIMULATION ONLY. Identity sealing is an in-memory AES test double,
 * not Tide. All three simulated identities live in ONE JS context: no user isolation
 * or quorum protection is claimed. Never imported by live handlers or live pages.
 */
import { FIXTURES } from "@/lib/fixtures";
import { b64, unb64, newContributionKey, encryptBody, decryptBody, sha256Hex,
  generateResearcherKeyPair, fingerprint, publicFromPkcs8, importPrivateKey, wrapKey, unwrapKey, wipe,
  type GrantBinding, type KeyWrap } from "@/lib/crypto/envelope";

async function simulatedIdentity() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return {
    async seal(raw: Uint8Array<ArrayBuffer>) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return `${b64(iv)}.${b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw))}`;
    },
    async open(sealed: string) {
      const [iv, ct] = sealed.split(".");
      return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)));
    },
  };
}
export async function createSimulation(fixtureId: string) {
  const fixture = FIXTURES.find((f) => f.id === fixtureId);
  if (!fixture) throw new Error("Choose a synthetic fixture");
  const [owner, a, b] = await Promise.all([simulatedIdentity(), simulatedIdentity(), simulatedIdentity()]);
  const [ka, kb] = await Promise.all([generateResearcherKeyPair(), generateResearcherKeyPair()]);
  let sealedA: string, sealedB: string;
  try { [sealedA, sealedB] = await Promise.all([a.seal(ka.pkcs8), b.seal(kb.pkcs8)]); }
  finally { wipe(ka.pkcs8); wipe(kb.pkcs8); }
  const raw = newContributionKey();
  const id = "demo-contribution";
  let version = 1;
  let encrypted: { bodyCt: string; bodyIv: string };
  let ownerKeyCt: string;
  try {
    encrypted = await encryptBody(raw, { text: fixture.text, language: fixture.language,
      synthetic: true, fixtureId, sha256: await sha256Hex(fixture.text) }, id, version);
    ownerKeyCt = await owner.seal(raw);
  } finally { wipe(raw); }
  let grant: KeyWrap | null = null;
  let previousGrant: KeyWrap | null = null;
  let state: "private" | "active" | "withdrawn" = "private";
  const purposeHash = await sha256Hex("Synthetic research demo: read one language sample.");
  const bind = (keyVersion: number): GrantBinding => ({ contributionId: id, recipientSub: "demo-a", grantId: "demo-grant-a",
    permissionVersion: 1, purposeHash, keyVersion });
  const fp = await fingerprint(ka.publicJwk);
  const view = () => ({ state, keyVersion: version, bodyCt: encrypted.bodyCt,
    ownerKeyCt, sealedResearcherKey: sealedA, hasRecipientWrap: grant !== null, fixtureLabel: fixture.label, fingerprint: fp });
  async function privateFor(who: "a" | "b") {
    const bytes = await (who === "a" ? a.open(sealedA) : b.open(sealedB));
    try { return await importPrivateKey(bytes); } finally { wipe(bytes); }
  }
  return {
    view,
    async share(typed: string) {
      if (state !== "private" || typed.replace(/\s/g, "").toUpperCase() !== fp.replace(/\s/g, "").slice(0, 16)) throw new Error("Fingerprint mismatch");
      // Like live mode, derive the displayed fingerprint from the sealed private half.
      const bytes = await a.open(sealedA);
      try { if (await fingerprint(await publicFromPkcs8(bytes)) !== fp) throw new Error("Key mismatch"); }
      finally { wipe(bytes); }
      const key = await owner.open(ownerKeyCt);
      try { grant = await wrapKey(key, ka.publicJwk, bind(version)); }
      finally { wipe(key); }
      state = "active";
    },
    async readA() {
      if (state !== "active" || !grant) throw new Error("No active grant");
      const key = await unwrapKey(grant, await privateFor("a"), bind(version));
      try { return (await decryptBody(key, encrypted.bodyCt, encrypted.bodyIv, id, version)).text; }
      finally { wipe(key); }
    },
    async refuseB(tamperRecipient = false) {
      if (!grant) throw new Error("Share first");
      try {
        // Intentionally hand A's full wrap to B, ignoring the simulated permission check.
        const key = await unwrapKey(grant, await privateFor("b"),
          tamperRecipient ? { ...bind(version), recipientSub: "demo-b" } : bind(version));
        wipe(key); return false;
      } catch { return true; }
    },
    async withdraw() {
      if (state !== "active" || !grant) throw new Error("Share first");
      const old = await owner.open(ownerKeyCt);
      const next = newContributionKey();
      try {
        const payload = await decryptBody(old, encrypted.bodyCt, encrypted.bodyIv, id, version);
        encrypted = await encryptBody(next, payload, id, version + 1);
        ownerKeyCt = await owner.seal(next);
        previousGrant = grant; grant = null; version += 1; state = "withdrawn";
      } finally { wipe(old); wipe(next); }
    },
    async refuseWithdrawnKey() {
      if (!previousGrant || state !== "withdrawn") throw new Error("Withdraw first");
      const key = await unwrapKey(previousGrant, await privateFor("a"), bind(version - 1));
      try { await decryptBody(key, encrypted.bodyCt, encrypted.bodyIv, id, version); return false; }
      catch { return true; }
      finally { wipe(key); }
    },
  };
}
export type Simulation = Awaited<ReturnType<typeof createSimulation>>;
