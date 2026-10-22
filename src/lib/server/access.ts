/**
 * Application-layer access decisions. This is defence in depth: even when it says "allowed", the
 * caller only receives ciphertext plus a key wrap that opens solely with the recipient's own Tide
 * identity. The withdrawal verification probe calls the SAME function the API uses.
 */
import type { Contribution, Db, Grant, KeyWrapRecord } from "./store";

export type AccessDecision =
  | { allowed: true; contribution: Contribution; grant: Grant }
  | { allowed: false; reason: "not_found" | "no_active_grant" | "withdrawal_pending" | "stale_wrap" };

export function researcherAccess(db: Db, contributionId: string, recipientSub: string): AccessDecision {
  const contribution = db.contributions.find((c) => c.id === contributionId);
  if (!contribution) return { allowed: false, reason: "not_found" };
  const grants = db.grants.filter((g) => g.contributionId === contributionId && g.recipientSub === recipientSub);
  const active = grants.find((g) => g.state === "active");
  if (!active) {
    if (grants.some((g) => g.state === "withdrawal_pending")) return { allowed: false, reason: "withdrawal_pending" };
    return { allowed: false, reason: "no_active_grant" };
  }
  if (!active.wrap || active.wrapKeyVersion !== contribution.keyVersion) return { allowed: false, reason: "stale_wrap" };
  return { allowed: true, contribution, grant: active };
}

export function isWrap(v: unknown): v is KeyWrapRecord {
  if (!v || typeof v !== "object") return false;
  const w = v as Record<string, unknown>;
  const epk = w.epk as Record<string, unknown> | undefined;
  const b = (x: unknown, max: number) => typeof x === "string" && x.length > 0 && x.length <= max && /^[A-Za-z0-9+/=_-]+$/.test(x);
  return (
    w.alg === "ECDH-ES+HKDF-SHA256+A256GCM" &&
    !!epk && epk.kty === "EC" && epk.crv === "P-256" && b(epk.x, 64) && b(epk.y, 64) &&
    b(w.salt, 64) && b(w.iv, 64) && b(w.ct, 128)
  );
}

/** Public, non-sensitive view of a grant for the owner's screen. */
export function grantView(g: Grant) {
  return {
    id: g.id,
    contributionId: g.contributionId,
    recipientSub: g.recipientSub,
    recipientName: g.recipientName,
    recipientFingerprint: g.recipientFingerprint,
    purposeId: g.purposeId,
    permissionVersion: g.permissionVersion,
    state: g.state,
    wrapKeyVersion: g.wrapKeyVersion,
    history: g.history,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}
