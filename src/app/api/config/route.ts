import { publicTideConfig } from "@/lib/auth/tidecloakConfig";
import { json } from "@/lib/server/guard";
export const dynamic = "force-dynamic";
export function GET() {
  try { return json({ config: publicTideConfig() }); }
  catch { return json({ error: "not_configured", message: "Configure your TideCloak realm with npm run init." }, 503); }
}
