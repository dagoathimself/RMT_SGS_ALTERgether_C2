import { jwtVerify, createLocalJWKSet } from "jose";
import type { JWTPayload } from "jose";
import { loadTideConfig } from "./tidecloakConfig";

// Lazy initialization - do NOT load config at module level.
// Next.js 16 evaluates module-level code during `next build` for static
// page generation. If tidecloak.json doesn't exist yet (placeholder or
// pre-bootstrap), eager loading throws at build time.
let _jwks: ReturnType<typeof createLocalJWKSet> | null = null;
let _config: ReturnType<typeof loadTideConfig> | null = null;

function getConfig() {
  if (!_config) {
    _config = loadTideConfig();
    if (!_config.jwk) {
      throw new Error(
        "Adapter JSON missing jwk field. Re-export with IGA enabled."
      );
    }
    _jwks = createLocalJWKSet(_config.jwk);
  }
  return { config: _config, JWKS: _jwks! };
}

export async function verifyTideJWT(token: string): Promise<JWTPayload> {
  const { config, JWKS } = getConfig();
  // Signature (realm JWK embedded in the adapter, no remote fetch), issuer, audience,
  // expiry (jose checks exp/nbf with 30s tolerance), plus azp below.
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${config["auth-server-url"].replace(/\/+$/, "")}/realms/${config.realm}`,
    audience: config.resource,
    algorithms: ["EdDSA"], // the tidified realm signs with Ed25519; refuse anything else (incl. alg:none)
    clockTolerance: 30,
    requiredClaims: ["exp", "iat", "sub", "azp"],
  });

  if (payload.azp !== config.resource) {
    throw new Error("Token azp does not match client");
  }
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 200) {
    throw new Error("Token has no valid subject");
  }

  // exp/nbf are enforced by jwtVerify above; also refuse tokens issued in the future.
  const now = Math.floor(Date.now() / 1000);
  if (payload.iat && payload.iat > now + 60) {
    throw new Error("Token issued in future");
  }

  return payload;
}

/** Realm role, or a role on THIS app's client. Roles on other clients never count here. */
export function hasRole(payload: JWTPayload, role: string): boolean {
  return rolesFor(payload).includes(role);
}

export function rolesFor(payload: JWTPayload): string[] {
  const realm = (payload.realm_access as { roles?: unknown })?.roles;
  const own = (payload.resource_access as Record<string, { roles?: unknown }> | undefined)?.[getConfig().config.resource]?.roles;
  return [...new Set([...(Array.isArray(realm) ? realm : []), ...(Array.isArray(own) ? own : [])]
    .filter((r): r is string => typeof r === "string"))];
}

export function extractToken(authHeader: string | null): string {
  if (!authHeader) throw new Error("Missing Authorization header");
  const match = /^(?:Bearer|DPoP) ([^\s]+)$/i.exec(authHeader);
  if (match) return match[1];
  throw new Error("Invalid Authorization header format");
}
