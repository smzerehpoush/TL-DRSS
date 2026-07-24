// Reclassify: clear LLM output so the next enrich run redoes it.
// Usage: node scripts/reclassify.mjs --all
//        node scripts/reclassify.mjs --source netflix
//        node scripts/reclassify.mjs --category ml-ai
import { openDb } from "./lib/db.mjs";

const db = openDb();
const [flag, value] = process.argv.slice(2);
const reset = "UPDATE posts SET categories = NULL, summary = NULL, model = NULL, enriched_at = NULL, fetch_attempts = 0";

let changes;
if (flag === "--all") {
  changes = db.prepare(reset).run().changes;
} else if (flag === "--source" && value) {
  changes = db.prepare(`${reset} WHERE source_slug = ?`).run(value).changes;
} else if (flag === "--category" && value) {
  changes = db.prepare(`${reset} WHERE categories LIKE ?`).run(`%"${value}"%`).changes;
} else {
  console.log("Usage: reclassify --all | --source <slug> | --category <slug>");
  process.exit(1);
}
console.log(`${changes} posts queued for re-enrichment (run: npm run enrich)`);
db.close();
