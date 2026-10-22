/**
 * Operational store (server). JSON file + append-only evidence log under data/store/ (gitignored).
 *
 * Holds metadata and CIPHERTEXT only. There is deliberately no field that can hold contribution
 * plaintext or a usable key: `bodyCt` is AES-GCM ciphertext, `ownerKeyCt`/`encPrivateKey` are Tide
 * self-encrypted blobs, `wrap` is a key wrap to one researcher's public key.
 * Single-process prototype: a promise-chain mutex serialises writes; writes are atomic (tmp+rename).
 */
import { createHash, randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync, existsSync, statSync } from "fs";
import { join } from "path";

export const STORE_DIR = process.env.CV_STORE_DIR || join(process.cwd(), "data", "store");
const DB_FILE = join(STORE_DIR, "db.json");
const EVIDENCE_FILE = join(STORE_DIR, "evidence.jsonl");

export type Language = "en" | "vi" | "mixed";
export type GrantState = "pending" | "active" | "denied" | "withdrawal_pending" | "withdrawn";

export interface KeyWrapRecord {
  alg: string;
  epk: { kty: string; crv: string; x: string; y: string };
  salt: string;
  iv: string;
  ct: string;
}

export interface Contribution {
  id: string;
  ownerSub: string;
  ownerName: string;
  fixtureId: string | null;
  label: string;
  language: Language;
  synthetic: true;
  keyVersion: number;
  bodyCt: string;
  bodyIv: string;
  ownerKeyCt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Grant {
  id: string;
  contributionId: string;
  ownerSub: string;
  recipientSub: string;
  recipientName: string;
  recipientFingerprint: string;
  purposeId: string;
  purposeHash: string;
  permissionVersion: number;
  state: GrantState;
  wrap: KeyWrapRecord | null;
  wrapKeyVersion: number | null;
  history: { state: GrantState; at: string; note?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearcherKey {
  sub: string;
  name: string;
  publicJwk: { kty: "EC"; crv: "P-256"; x: string; y: string };
  fingerprint: string;
  encPrivateKey: string;
  createdAt: string;
}

export interface Db {
  contributions: Contribution[];
  grants: Grant[];
  researcherKeys: ResearcherKey[];
}

function emptyDb(): Db {
  return { contributions: [], grants: [], researcherKeys: [] };
}

function ensureDir() {
  mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
}

export function readDb(): Db {
  ensureDir();
  if (!existsSync(DB_FILE)) return emptyDb();
  return JSON.parse(readFileSync(DB_FILE, "utf-8")) as Db;
}

function writeDb(db: Db) {
  ensureDir();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  renameSync(tmp, DB_FILE);
}

let chain: Promise<unknown> = Promise.resolve();
/** Serialised read-modify-write. The callback may throw to abort without writing. */
export function mutate<T>(fn: (db: Db) => T): Promise<T> {
  const run = chain.then(() => {
    const db = readDb();
    const result = fn(db);
    writeDb(db);
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}


// ---------- evidence log ----------
export interface EvidenceEntry {
  seq: number;
  ts: string;
  source: "app-server" | "client-reported";
  actorSub: string | null;
  actorName: string | null;
  action: string;
  contributionId?: string;
  grantId?: string;
  result: "allowed" | "denied" | "ok" | "failed" | "pending" | "info";
  detail?: string;
  prevHash: string;
  hash: string;
}

// Single-process prototype: keep the tail in memory instead of re-reading the file per append. The
// cached file size detects an outside change (e.g. `npm run reset` while the server runs).
let tail: { seq: number; hash: string; size: number } | null = null;
const evidenceSize = () => (existsSync(EVIDENCE_FILE) ? statSync(EVIDENCE_FILE).size : 0);
function lastEvidence(): { seq: number; hash: string } {
  if (tail && tail.size === evidenceSize()) return tail;
  const lines = existsSync(EVIDENCE_FILE) ? readFileSync(EVIDENCE_FILE, "utf-8").trim().split("\n").filter(Boolean) : [];
  const last = lines.length ? (JSON.parse(lines[lines.length - 1]) as EvidenceEntry) : null;
  tail = { seq: last?.seq ?? 0, hash: last?.hash ?? "GENESIS", size: evidenceSize() };
  return tail;
}

const SECRETISH = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|[A-Za-z0-9+/=_-]{80,})/g;

/**
 * Append an evidence entry. Hash-chained (each entry commits to the previous one), which makes casual
 * edits detectable. It is NOT an immutable audit trail: whoever controls the file can rewrite it.
 */
export function evidence(e: Omit<EvidenceEntry, "seq" | "ts" | "prevHash" | "hash" | "source"> & { source?: EvidenceEntry["source"] }) {
  ensureDir();
  const prev = lastEvidence();
  const detail = e.detail ? e.detail.replace(SECRETISH, "[redacted]").slice(0, 500) : undefined;
  const body = {
    seq: prev.seq + 1,
    ts: new Date().toISOString(),
    source: e.source ?? "app-server",
    actorSub: e.actorSub,
    actorName: e.actorName,
    action: e.action,
    contributionId: e.contributionId,
    grantId: e.grantId,
    result: e.result,
    detail,
    prevHash: prev.hash,
  };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  appendFileSync(EVIDENCE_FILE, JSON.stringify({ ...body, hash }) + "\n", { mode: 0o600 });
  tail = { seq: body.seq, hash, size: evidenceSize() };
}

export function readEvidence(): EvidenceEntry[] {
  if (!existsSync(EVIDENCE_FILE)) return [];
  return readFileSync(EVIDENCE_FILE, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function verifyEvidenceChain(): { ok: boolean; brokenAt?: number; count: number } {
  const all = readEvidence();
  let prev = "GENESIS";
  for (const e of all) {
    const { hash, ...body } = e;
    const recomputed = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    if (e.prevHash !== prev || recomputed !== hash) return { ok: false, brokenAt: e.seq, count: all.length };
    prev = hash;
  }
  return { ok: true, count: all.length };
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const now = () => new Date().toISOString();
