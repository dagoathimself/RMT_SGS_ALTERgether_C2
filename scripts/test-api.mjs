// Server-side negative tests against the RUNNING app (npm run dev). No real tokens are used or needed:
// every request here must be refused. Writes evidence/api-negative-tests.md.
import { SignJWT, generateKeyPair, exportJWK, calculateJwkThumbprint } from "jose";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const APP = process.env.APP_ORIGIN || "http://localhost:3000";
const configured = !!process.env.CLIENT_ADAPTER || existsSync("data/tidecloak.json");
const cfg = configured ? JSON.parse(process.env.CLIENT_ADAPTER || readFileSync("data/tidecloak.json", "utf8")) : {
  "auth-server-url": "http://localhost:8080", realm: "not-configured", resource: "consent-vault-client",
};
const iss = `${cfg["auth-server-url"].replace(/\/+$/, "")}/realms/${cfg.realm}`;
const rows = [];
const check = (name, expected, observed, extra = "") => rows.push({ name, expected, observed: String(observed), pass: String(expected).split("|").includes(String(observed)), extra });

async function req(path, init = {}) {
  const r = await fetch(APP + path, { ...init, redirect: "manual" });
  const text = await r.text();
  return { status: r.status, headers: r.headers, text };
}

// 1. no token
let r = await req("/api/me");
check("No token → 401", 401, r.status);
check("401 response is no-store", "no-store, max-age=0", r.headers.get("cache-control"));
// 2. garbage token
r = await req("/api/me", { headers: { Authorization: "Bearer not.a.jwt" } });
check("Garbage token → 401", 401, r.status);
// 3. forged token: right issuer/audience/claims, signed with an attacker key (EdDSA)
const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const now = Math.floor(Date.now() / 1000);
const claims = { sub: "forged-user", azp: cfg.resource, aud: [cfg.resource], preferred_username: "researcher_b", realm_access: { roles: ["participant", "researcher"] } };
const forged = await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: cfg.jwk?.keys?.[0]?.kid }).setIssuer(iss).setIssuedAt(now).setExpirationTime(now + 300).sign(privateKey);
r = await req("/api/contributions", { headers: { Authorization: `Bearer ${forged}` } });
check("Forged token (attacker-signed, correct claims) → 401", 401, r.status);
// 3b. forged + DPoP-bound with attacker's own proof key
const dk = await generateKeyPair("ES256"); const djwk = await exportJWK(dk.publicKey);
const jkt = await calculateJwkThumbprint(djwk);
const forgedBound = await new SignJWT({ ...claims, cnf: { jkt } }).setProtectedHeader({ alg: "EdDSA" }).setIssuer(iss).setIssuedAt(now).setExpirationTime(now + 300).sign(privateKey);
const ath = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forgedBound))).toString("base64url");
const proof = await new SignJWT({ htm: "GET", htu: `${APP}/api/contributions`, jti: crypto.randomUUID(), ath }).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: djwk }).setIssuedAt(now).sign(dk.privateKey);
r = await req("/api/contributions", { headers: { Authorization: `DPoP ${forgedBound}`, DPoP: proof } });
check("Forged token with a matching attacker DPoP proof → 401", 401, r.status);
// 4. alg:none
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const none = `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ ...claims, iss, iat: now, exp: now + 300 })}.`;
r = await req("/api/me", { headers: { Authorization: `Bearer ${none}` } });
check("alg:none token → 401", 401, r.status);
// 5. expired-looking token signed with attacker key
const expired = await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA" }).setIssuer(iss).setIssuedAt(now - 4000).setExpirationTime(now - 3600).sign(privateKey);
r = await req("/api/me", { headers: { Authorization: `Bearer ${expired}` } });
check("Attacker-signed expired-looking token → 401 (not proof of expiry validation)", 401, r.status);
// 6. CSRF: state-changing request from a foreign origin / no origin
r = await req("/api/contributions", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
check("POST from foreign Origin → 403", 403, r.status);
r = await req("/api/grants/g_0000000000000000/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("POST without Origin → 403", 403, r.status);
// 7. request-size limit enforced before auth/parsing
r = await req("/api/contributions", { method: "POST", headers: { Origin: APP, "Content-Type": "application/json" }, body: JSON.stringify({ pad: "x".repeat(70 * 1024) }) });
check("70 KB body → 413 (limit 64 KB)", 413, r.status);
// 8. error bodies do not echo tokens
r = await req("/api/me", { headers: { Authorization: `Bearer ${forged}` } });
check("Error body does not echo the token", "true", String(!r.text.includes(forged.slice(20, 60))), r.text.slice(0, 120));
// 9. attack simulator is off by default (or requires auth)
r = await req("/api/attack-sim/c_0000000000000000");
check("Attack simulator without auth → 401/404", "401|404", r.status);
// 10. unknown route under /api does not leak
r = await req("/api/admin/export-all");
check("Non-existent bulk export route → 404", 404, r.status);
// 11. rate limit: burst past the shared bucket (300) — run last
const burst = []; let idx = 0;
await Promise.all(Array.from({ length: 25 }, async () => {
  while (idx < 400) { idx++; burst.push(await req("/api/me").then((x) => x.status, () => "conn_error")); }
}));
const limited = burst.filter((s) => s === 429).length;
check("400-request burst → some 429 (shared limit 300 burst, 10/s)", "true", String(limited > 0), `${limited} of 400 limited; ${burst.filter((s) => s === "conn_error").length} connection errors`);

const pass = rows.filter((x) => x.pass).length;
const md = ["# API negative tests (server-side, no real tokens)", "", `Run at ${new Date().toISOString()} against ${APP}. ${pass}/${rows.length} as expected.`, "",
  configured ? "Adapter present. These forged-token checks still do not establish live Tide session behaviour." : "No Tide adapter is configured: this HTTP run verifies fail-closed responses only. npm test separately verifies real signature, claim, DPoP and workflow checks against an ephemeral local test realm.", "",
  "| Check | Expected | Observed | Result | Note |", "|---|---|---|---|---|",
  ...rows.map((x) => `| ${x.name} | ${String(x.expected).replace(/\|/g, " or ")} | ${x.observed} | ${x.pass ? "PASS" : "FAIL"} | ${x.extra.replace(/\|/g, "/")} |`), ""].join("\n");
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/api-negative-tests.md", md);
console.log(md);
process.exit(pass === rows.length ? 0 : 1);
