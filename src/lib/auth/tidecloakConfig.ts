import { readFileSync } from "fs";
import { join } from "path";
import type { JWK } from "jose";

export interface TidecloakConfig {
  realm: string;
  "auth-server-url": string;
  "ssl-required": string;
  resource: string;
  "public-client": boolean;
  "confidential-port": number;
  jwk: { keys: JWK[] };
  vendorId?: string;
  homeOrkUrl?: string;
}

export function loadTideConfig(): TidecloakConfig {
  const configPath = join(process.cwd(), "data", "tidecloak.json");
  const config = JSON.parse(process.env.CLIENT_ADAPTER || readFileSync(configPath, "utf-8"));
  if (!config || typeof config.realm !== "string" || !config.realm ||
      typeof config.resource !== "string" || !config.resource ||
      typeof config["auth-server-url"] !== "string" || config["public-client"] !== true ||
      !Array.isArray(config.jwk?.keys) ||
      !config.jwk.keys.some((k: JWK) => k?.kty === "OKP" && k.crv === "Ed25519" && k.x) ||
      config.jwk.keys.some((k: JWK) => !k || !["OKP", "EC", "RSA"].includes(k.kty ?? "") ||
        ["d", "k", "p", "q", "dp", "dq", "qi", "oth"].some((field) => field in k))) {
    throw new Error(
      "A public-client Tide adapter with public Ed25519 realm keys is required. Run npm run init."
    );
  }
  new URL(config["auth-server-url"]);
  return config;
}

/** Browser adapter allowlist: never expose credentials or arbitrary server configuration. */
export function publicTideConfig() {
  const config = loadTideConfig();
  const allowed = new Set(["realm", "auth-server-url", "ssl-required", "resource", "public-client",
    "confidential-port", "jwk", "vendorId", "homeOrkUrl"]);
  const browser = Object.fromEntries(Object.entries(config).filter(([key, value]) =>
    allowed.has(key) || (key.startsWith("client-origin-auth") && typeof value === "string")));
  browser.jwk = { keys: config.jwk.keys.map((jwk) => Object.fromEntries(Object.entries(jwk)
    .filter(([key]) => ["kty", "crv", "x", "y", "n", "e", "alg", "kid", "use", "key_ops"].includes(key)))) };
  return browser;
}
