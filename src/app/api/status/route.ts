import { loadTideConfig } from "@/lib/auth/tidecloakConfig";
import { json } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

type Probe = { ok: boolean; ms: number; detail: string };
async function probe(url: string, expectedIssuer?: string): Promise<Probe> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store", redirect: "error" });
    const ok = res.ok && (!expectedIssuer || (await res.json()).issuer === expectedIssuer);
    return { ok, ms: Date.now() - start, detail: ok ? "reachable" : "unavailable" };
  } catch { return { ok: false, ms: Date.now() - start, detail: "unreachable" }; }
}
let cached: { until: number; value: Promise<unknown> } | null = null;
export async function GET() {
  if (!cached || cached.until < Date.now()) cached = { until: Date.now() + 30000, value: status() };
  return json(await cached.value);
}
async function status() {
  const offline = { ok: false, ms: 0, detail: "not configured" };
  try {
    const config = loadTideConfig();
    const issuer = `${config["auth-server-url"].replace(/\/+$/, "")}/realms/${config.realm}`;
    const [tidecloak, tideNetwork] = await Promise.all([
      probe(`${issuer}/.well-known/openid-configuration`, issuer),
      config.homeOrkUrl ? probe(config.homeOrkUrl) : Promise.resolve(offline),
    ]);
    return { realm: config.realm, tidecloak, tideNetwork, checkedAt: new Date().toISOString() };
  } catch { return { realm: null, tidecloak: offline, tideNetwork: offline, checkedAt: new Date().toISOString() }; }
}
