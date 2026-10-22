import { createHash } from "crypto";
/** Same canonicalisation as the browser's fingerprint() in src/lib/crypto/envelope.ts. */
export function serverFingerprint(pub: { kty: string; crv: string; x: string; y: string }): string {
  const h = createHash("sha256").update(JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y })).digest("hex");
  return h.slice(0, 40).match(/.{4}/g)!.join(" ").toUpperCase();
}
