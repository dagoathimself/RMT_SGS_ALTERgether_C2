"use client";
import { fingerprint, fingerprintMatches, normFingerprint, type GrantBinding, type PublicJwk, type KeyWrap } from "@/lib/crypto/envelope";
import type { Contribution, Grant, ResearcherKey } from "@/lib/server/store";

export type GrantSummary = Omit<Grant, "wrap" | "ownerSub">;
export type OwnerContribution = Contribution & { grants: GrantSummary[] };
export type DirectoryEntry = Pick<ResearcherKey, "sub" | "name" | "publicJwk" | "fingerprint">;
export type ReadResult = { contribution: Pick<Contribution, "id" | "label" | "language" | "synthetic" | "bodyCt" | "bodyIv" | "keyVersion">;
  grant: GrantSummary & { wrap: KeyWrap } };

export const binding = (g: Pick<Grant, "contributionId" | "recipientSub" | "id" | "permissionVersion" | "purposeHash">, keyVersion: number): GrantBinding => ({
  contributionId: g.contributionId, recipientSub: g.recipientSub, grantId: g.id,
  permissionVersion: g.permissionVersion, purposeHash: g.purposeHash, keyVersion,
});

export async function checkRecipient(publicJwk: PublicJwk, typed: string): Promise<string> {
  const fp = await fingerprint(publicJwk);
  if (normFingerprint(typed).length !== 16 || !fingerprintMatches(typed, fp)) {
    throw new Error("Fingerprint does not match. Ask the researcher for the first 16 characters shown by their own browser.");
  }
  return fp;
}

// Fixed messages only; an upstream SDK exception may contain sensitive material.
export function failure(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = String(e.code);
    return ({ fingerprint_mismatch: "The researcher key changed or the fingerprint did not match.",
      stale_version: "The sample changed. Refresh it and retry.", conflict: "Another action changed this record. Refresh and retry.",
      unauthenticated: "Your session could not be verified. Sign in again.", not_found: "Not found or not shared with you.",
      key_exists: "Your researcher key already exists. Refresh the page.",
    } as Record<string, string>)[code] ?? "The request was refused. No new access was granted.";
  }
  return "The operation could not be verified. No success was recorded. Check your Tide session and fingerprint confirmation, then retry.";
}
