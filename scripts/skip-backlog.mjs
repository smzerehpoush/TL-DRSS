// Park the pending backlog to cap LLM cost: keep only the N newest
// un-summarized posts queued for enrichment; mark the rest skipped.
// Skipped posts stay in the DB (deleting them would let the next feed pull
// re-add them) but are never sent to the LLM and never shown on the site.
//
// Usage: node scripts/skip-backlog.mjs [--keep 20]
//        node scripts/skip-backlog.mjs --restore    # un-park everything
import { openDb } from "./lib/db.mjs";

const db = openDb();
const args = process.argv.slice(2);

if (args[0] === "--restore") {
  const n = db.prepare("UPDATE posts SET skipped = 0 WHERE skipped = 1").run().changes;
  console.log(`${n} posts restored to the enrichment queue`);
} else {
  const keep = Number(args[0] === "--keep" ? args[1] : 20);
  if (!Number.isInteger(keep) || keep < 0) {
    console.log("Usage: skip-backlog [--keep N] | --restore");
    process.exit(1);
  }
  const n = db
    .prepare(
      `UPDATE posts SET skipped = 1
       WHERE summary IS NULL AND id NOT IN (
         SELECT id FROM posts WHERE summary IS NULL ORDER BY published_at DESC LIMIT ?
       )`
    )
    .run(keep).changes;
  const queued = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE summary IS NULL AND skipped = 0").get().n;
  console.log(`${n} posts parked; ${queued} queued for enrichment`);
}
db.close();
