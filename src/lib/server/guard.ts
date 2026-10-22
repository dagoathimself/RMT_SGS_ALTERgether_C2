/**
 * Guard for every protected API route.
 *
 * Order: cheap per-IP rate limit -> request-size limit -> Origin check on writes -> JWT verification
 * (signature, issuer, audience, azp, expiry) -> DPoP proof verification -> role check -> per-actor
 * rate limit -> handler. The actor is derived ONLY from the verified token's `sub`; any user id in a
 * request body or URL is treated as data to be authorised, never as identity.
 * Every failure is a generic error code (no token material, no stack traces) and denies the operation.
 * Requests that fail before a verified identity exists are counted, not written to the evidence log,
 * so anonymous traffic cannot flood it.
 */
import { NextRequest } from "next/server";
import type { JWTPayload } from "jose";
import { verifyTideJWT, hasRole, extractToken, rolesFor } from "@/lib/auth/tideJWT";
import { verifyDpop } from "@/lib/auth/verifyDpop";
import { evidence } from "./store";

export const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
export const MAX_BODY_BYTES = 64 * 1024; // contributions are <= 10 KB of text; ciphertext + base64 + wrap fit easily

export interface Actor {
  sub: string;
  name: string;
  roles: string[];
}

export interface Ctx {
  req: NextRequest;
  jwt: JWTPayload;
  actor: Actor;
  body: unknown;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS },
  });
}

export function deny(status: number, code: string, message?: string): Response {
  return json({ error: code, message: message ?? DEFAULT_MESSAGES[code] ?? "The request was refused." }, status);
}

const DEFAULT_MESSAGES: Record<string, string> = {
  unauthenticated: "Sign-in could not be verified. No protected content was returned.",
  forbidden: "You do not have permission for this action.",
  rate_limited: "Too many requests. Please wait a moment.",
  too_large: "Request too large.",
  bad_origin: "Request origin not allowed.",
  bad_request: "Malformed request.",
  not_found: "Not found or not shared with you.",
  server_error: "The server could not complete this request. Access was not granted.",
};

// ---------- rate limiting (in-memory token bucket; single-process prototype) ----------
const buckets = new Map<string, { tokens: number; at: number }>();
function take(key: string, capacity: number, refillPerSec: number): boolean {
  const t = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, at: t };
  b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec);
  b.at = t;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}
export const RATE_LIMITS = {
  perIp: { capacity: 300, refillPerSec: 10 }, // 300 burst, 10/s sustained, shared by all clients (see clientKey)
  perActor: { capacity: 100, refillPerSec: 5 }, // 100 burst, 5/s sustained per verified user
};

function clientKey(): string {
  // Loopback-only dev server with no trusted proxy: Next.js does not expose the socket peer, and
  // client-sent headers such as X-Real-IP / X-Forwarded-For can be forged to get a fresh bucket.
  // So every unauthenticated caller shares ONE bucket. Behind a real proxy, key on the proxy-set address.
  return "all";
}

/** Pre-identity denials (bad origin, invalid token or proof), counted in memory instead of logged. */
export const anonymousDenials: Record<string, number> = {};
const countAnon = (reason: string) => { anonymousDenials[reason] = (anonymousDenials[reason] ?? 0) + 1; };

async function readBody(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  if (req.method === "GET" || req.method === "HEAD") return { ok: true, body: undefined };
  const len = Number(req.headers.get("content-length") || "0");
  if (len > MAX_BODY_BYTES) return { ok: false, res: deny(413, "too_large") };
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return { ok: false, res: deny(413, "too_large") };
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  if (!size) return { ok: true, body: {} };
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, res: deny(400, "bad_request") };
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { buf.set(chunk, at); at += chunk.byteLength; }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buf)) };
  } catch {
    return { ok: false, res: deny(400, "bad_request") };
  }
}

export interface GuardOptions {
  roles?: string[]; // any-of
  action: string; // evidence label
}

export function guard(opts: GuardOptions, handler: (ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      if (!take(`ip:${clientKey()}`, RATE_LIMITS.perIp.capacity, RATE_LIMITS.perIp.refillPerSec)) {
        return deny(429, "rate_limited");
      }
      const bodyRes = await readBody(req);
      if (!bodyRes.ok) return bodyRes.res;

      if (req.method !== "GET" && req.method !== "HEAD") {
        // CSRF defence in depth: the API takes the token from the Authorization header (never a
        // cookie) and also requires the exact app Origin on state-changing requests.
        if (req.headers.get("origin") !== APP_ORIGIN) {
          countAnon("bad_origin");
          return deny(403, "bad_origin");
        }
      }

      let jwt: JWTPayload;
      let token: string;
      try {
        token = extractToken(req.headers.get("authorization"));
        jwt = await verifyTideJWT(token);
      } catch {
        countAnon("token_invalid");
        return deny(401, "unauthenticated");
      }
      try {
        await verifyDpop(req, token, jwt as { cnf?: { jkt?: string } }, { trustForwardedHeaders: false });
      } catch {
        countAnon("dpop_invalid");
        return deny(401, "unauthenticated");
      }

      const actor: Actor = { sub: String(jwt.sub), name: name(jwt), roles: rolesFor(jwt) };
      if (opts.roles && !opts.roles.some((r) => hasRole(jwt, r))) {
        evidence({ actorSub: actor.sub, actorName: actor.name, action: opts.action, result: "denied", detail: `missing role (${opts.roles.join("|")})` });
        return deny(403, "forbidden");
      }
      if (!take(`sub:${actor.sub}`, RATE_LIMITS.perActor.capacity, RATE_LIMITS.perActor.refillPerSec)) {
        return deny(429, "rate_limited");
      }
      return await handler({ req, jwt, actor, body: bodyRes.body });
    } catch {
      // Do not echo exception messages: SDK errors can contain request material.
      console.error(`[guard] ${opts.action} failed`);
      return deny(500, "server_error");
    }
  };
}

function name(jwt: JWTPayload): string {
  return String((jwt as Record<string, unknown>).preferred_username ?? jwt.sub ?? "unknown");
}

export function shortReason(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/[A-Za-z0-9_\-+/=.]{60,}/g, "[redacted]").slice(0, 160);
}

// ---------- small validators ----------
export const isStr = (v: unknown, max: number, min = 1): v is string => typeof v === "string" && v.length >= min && v.length <= max;
export const isB64 = (v: unknown, max: number): v is string => isStr(v, max) && /^[A-Za-z0-9+/=_:.-]+$/.test(v);
