/**
 * Tide self-encryption of key material (browser only).
 *
 * Uses the documented SDK calls `doEncrypt([{ data, tags }])` / `doDecrypt([{ encrypted, tags }])`
 * (docs.tide.org/Admin/e2ee; @tidecloak/js IAMService.d.ts). Self-encryption is identity-bound: only
 * the Tide identity that encrypted a value can decrypt it, and it needs a live session with the
 * `_tide_keys.selfencrypt` / `_tide_keys.selfdecrypt` roles. There is no server-side or admin decrypt.
 */
import { b64, unb64 } from "@/lib/crypto/envelope";

export const KEY_TAG = "keys";

type EncFn = (data: { data: string | Uint8Array; tags: string[] }[]) => Promise<(string | Uint8Array)[]>;
type DecFn = (data: { encrypted: string | Uint8Array; tags: string[] }[]) => Promise<(string | Uint8Array)[]>;

export async function tideSeal(doEncrypt: EncFn, secret: Uint8Array): Promise<string> {
  const [out] = await doEncrypt([{ data: b64(secret), tags: [KEY_TAG] }]);
  if (typeof out === "string") return out;
  return "u8:" + b64(out);
}

export async function tideOpen(doDecrypt: DecFn, sealed: string): Promise<Uint8Array<ArrayBuffer>> {
  const encrypted = sealed.startsWith("u8:") ? unb64(sealed.slice(3)) : sealed;
  const [out] = await doDecrypt([{ encrypted, tags: [KEY_TAG] }]);
  const asText = typeof out === "string" ? out : new TextDecoder().decode(out);
  return unb64(asText);
}

/** Turn a Tide/SDK failure into a short, non-sensitive message for the UI and evidence log. */
export function describeTideError(e: unknown): string {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const cause = e instanceof Error && (e as { cause?: unknown }).cause ? ` | cause: ${String((e as { cause?: unknown }).cause)}` : "";
  // strip anything that looks like a token or long base64 blob
  return (msg + cause).replace(/[A-Za-z0-9_\-+/=]{60,}/g, "[redacted]").slice(0, 400);
}
