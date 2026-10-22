/**
 * Browser-side envelope crypto for ALTERGETHER (WebCrypto only, runs in the user's browser).
 *
 *  - Contribution text  -> AES-256-GCM under a random 32-byte contribution key K_v.
 *  - K_v                -> Tide self-encryption by the OWNER (see src/lib/tide/selfKeys.ts).
 *  - Grant              -> K_v wrapped to ONE researcher's ECDH P-256 public key
 *                          (ephemeral ECDH + HKDF-SHA-256 + AES-256-GCM). The AAD binds the wrap to
 *                          contribution, recipient, grant id, permission version, purpose and key
 *                          version, so editing any of those in the database makes unwrap fail.
 *  - Researcher private key -> Tide self-encryption by the RESEARCHER.
 *
 * Nothing here is ever sent to the server in plaintext, and nothing is persisted in browser storage.
 */

const te = new TextEncoder();
const td = new TextDecoder("utf-8", { fatal: true });

export const SCHEME = "cv1";

// ---------- encoding helpers ----------
export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", te.encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
function rand(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}
export function wipe(u?: Uint8Array | null) {
  if (u) u.fill(0);
}

// ---------- contribution payload ----------
export interface ContributionPayload {
  text: string; // original text, never normalised or translated
  language: "en" | "vi" | "mixed";
  synthetic: true;
  fixtureId: string | null;
  sha256: string; // digest of `text`, sealed inside the ciphertext for integrity display
}

export function bodyAad(contributionId: string, keyVersion: number): Uint8Array<ArrayBuffer> {
  return te.encode(`${SCHEME}|body|contribution=${contributionId}|kv=${keyVersion}`);
}

export function newContributionKey(): Uint8Array<ArrayBuffer> {
  return rand(32);
}

async function aesKey(raw: Uint8Array<ArrayBuffer>, usages: KeyUsage[]) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

export async function encryptBody(
  key: Uint8Array<ArrayBuffer>,
  payload: ContributionPayload,
  contributionId: string,
  keyVersion: number,
): Promise<{ bodyCt: string; bodyIv: string }> {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bodyAad(contributionId, keyVersion) },
    await aesKey(key, ["encrypt"]),
    te.encode(JSON.stringify(payload)),
  );
  return { bodyCt: b64(ct), bodyIv: b64(iv) };
}

export async function decryptBody(
  key: Uint8Array<ArrayBuffer>,
  bodyCt: string,
  bodyIv: string,
  contributionId: string,
  keyVersion: number,
): Promise<ContributionPayload> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(bodyIv), additionalData: bodyAad(contributionId, keyVersion) },
    await aesKey(key, ["decrypt"]),
    unb64(bodyCt),
  );
  const payload = JSON.parse(td.decode(pt)) as ContributionPayload;
  if (payload.synthetic !== true) throw new Error("Payload is not marked synthetic");
  return payload;
}

// ---------- researcher key pair ----------
export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

function canonicalPub(j: JsonWebKey): PublicJwk {
  if (j.kty !== "EC" || j.crv !== "P-256" || !j.x || !j.y) throw new Error("Not a P-256 public key");
  return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
}

/** Human-comparable fingerprint of a public key (SHA-256 of the canonical JWK, first 20 bytes). */
export async function fingerprint(pub: PublicJwk): Promise<string> {
  const h = await sha256Hex(JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }));
  return h.slice(0, 40).match(/.{4}/g)!.join(" ").toUpperCase();
}

export async function generateResearcherKeyPair(): Promise<{ publicJwk: PublicJwk; pkcs8: Uint8Array<ArrayBuffer> }> {
  // extractable only so the private half can be handed to Tide self-encryption; it is wiped after.
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicJwk = canonicalPub(await crypto.subtle.exportKey("jwk", kp.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { publicJwk, pkcs8 };
}

/**
 * Public half of a private key, derived locally. Lets a researcher compute their fingerprint from the
 * key only their Tide identity can open, instead of trusting the fingerprint the server advertises.
 */
export async function publicFromPkcs8(pkcs8: Uint8Array<ArrayBuffer>): Promise<PublicJwk> {
  const k = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return canonicalPub(await crypto.subtle.exportKey("jwk", k));
}

/** Characters a participant must confirm out-of-band (64 bits: too many to brute-force a lookalike key). */
export const FINGERPRINT_CONFIRM_CHARS = 16;
export const normFingerprint = (s: string) => s.replace(/[^0-9a-f]/gi, "").toUpperCase();
export function fingerprintMatches(typed: string, full: string): boolean {
  const t = normFingerprint(typed);
  return t.length >= FINGERPRINT_CONFIRM_CHARS && normFingerprint(full).startsWith(t);
}

export async function importPrivateKey(pkcs8: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  // non-extractable once re-imported
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function importPublicKey(pub: PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", { ...pub, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

// ---------- grant binding + key wrap ----------
export interface GrantBinding {
  contributionId: string;
  recipientSub: string;
  grantId: string;
  permissionVersion: number;
  purposeHash: string; // sha256 hex of the displayed study purpose text
  keyVersion: number;
}

export function bindingString(b: GrantBinding): string {
  return [
    SCHEME,
    "wrap",
    `contribution=${b.contributionId}`,
    `recipient=${b.recipientSub}`,
    `grant=${b.grantId}`,
    `pv=${b.permissionVersion}`,
    `purpose=${b.purposeHash}`,
    `kv=${b.keyVersion}`,
  ].join("|");
}

export interface KeyWrap {
  alg: "ECDH-ES+HKDF-SHA256+A256GCM";
  epk: PublicJwk; // ephemeral sender public key
  salt: string;
  iv: string;
  ct: string;
}

async function kek(shared: ArrayBuffer, salt: Uint8Array<ArrayBuffer>, info: string, usage: KeyUsage) {
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: te.encode(info) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function wrapKey(contributionKey: Uint8Array<ArrayBuffer>, recipient: PublicJwk, binding: GrantBinding): Promise<KeyWrap> {
  const info = bindingString(binding);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: await importPublicKey(recipient) }, eph.privateKey, 256);
  const salt = rand(16);
  const iv = rand(12);
  const key = await kek(shared, salt, info, "encrypt");
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(info) }, key, contributionKey);
  return {
    alg: "ECDH-ES+HKDF-SHA256+A256GCM",
    epk: canonicalPub(await crypto.subtle.exportKey("jwk", eph.publicKey)),
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
  };
}

export async function unwrapKey(wrap: KeyWrap, privateKey: CryptoKey, binding: GrantBinding): Promise<Uint8Array<ArrayBuffer>> {
  const info = bindingString(binding);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: await importPublicKey(wrap.epk) }, privateKey, 256);
  const key = await kek(shared, unb64(wrap.salt), info, "decrypt");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(wrap.iv), additionalData: te.encode(info) }, key, unb64(wrap.ct));
  return new Uint8Array(pt);
}
