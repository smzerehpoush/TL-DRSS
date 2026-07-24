// Ingest: pull every Source's feed and record new Posts (metadata only —
// no publisher content is persisted, see docs/adr/0001).
import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { openDb } from "./lib/db.mjs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Some feeds expose their full archive (hundreds of items); cap intake so no
// single Source swamps the corpus or the LLM quota.
const MAX_ITEMS_PER_SOURCE = Number(process.env.MAX_ITEMS_PER_SOURCE ?? 50);

const sources = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8"));
const parser = new Parser({
  timeout: 30_000,
  headers: { "User-Agent": UA, Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*" },
});

const db = openDb();
const insert = db.prepare(`
  INSERT OR IGNORE INTO posts (id, source_slug, title, url, published_at, first_seen_at)
  VALUES (@id, @source_slug, @title, @url, @published_at, @first_seen_at)
`);

function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    // strip tracking params so the same article never appears twice
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

let totalNew = 0;
const failures = [];

for (const source of sources) {
  try {
    const feed = await parser.parseURL(source.feed_url);
    let added = 0;
    const exclude = source.exclude ? new RegExp(source.exclude) : null;
    const items = (feed.items ?? [])
      .filter((item) => !(exclude && item.link && exclude.test(item.link)))
      .sort((a, b) => new Date(b.isoDate ?? b.pubDate ?? 0) - new Date(a.isoDate ?? a.pubDate ?? 0))
      .slice(0, MAX_ITEMS_PER_SOURCE);
    for (const item of items) {
      const link = item.link && canonicalUrl(item.link.trim());
      const title = item.title?.trim();
      if (!link || !title) continue;
      const published = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null);
      const result = insert.run({
        id: createHash("sha1").update(link).digest("hex"),
        source_slug: source.slug,
        title,
        url: link,
        published_at: published,
        first_seen_at: new Date().toISOString(),
      });
      added += result.changes;
    }
    totalNew += added;
    console.log(`ok   ${source.slug}: ${feed.items?.length ?? 0} items, ${added} new`);
  } catch (err) {
    failures.push(source.slug);
    console.error(`FAIL ${source.slug}: ${err.message}`);
  }
}

const pending = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE summary IS NULL").get().n;
console.log(`\ningest done: ${totalNew} new posts, ${pending} awaiting enrichment`);
if (failures.length) console.log(`failed feeds: ${failures.join(", ")}`);
db.close();
