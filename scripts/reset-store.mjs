// Reset the operational store and evidence log (fixtures are re-contributed from the participant's
// browser, because only the participant's Tide identity can seal their contribution keys).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.env.CV_STORE_DIR || join(process.cwd(), "data", "store");
mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(join(dir, "db.json"), JSON.stringify({ contributions: [], grants: [], researcherKeys: [] }, null, 2), { mode: 0o600 });
writeFileSync(join(dir, "evidence.jsonl"), "", { mode: 0o600 });
console.log(`Reset ${dir}. Researcher keys were cleared too: each researcher re-creates their key on next visit.`);
