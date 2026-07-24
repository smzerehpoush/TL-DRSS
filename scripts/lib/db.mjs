import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DB_PATH = process.env.DB_PATH ?? join(root, "data", "posts.db");

export function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id             TEXT PRIMARY KEY,
      source_slug    TEXT NOT NULL,
      title          TEXT NOT NULL,
      url            TEXT NOT NULL UNIQUE,
      published_at   TEXT,
      first_seen_at  TEXT NOT NULL,
      fetch_attempts INTEGER NOT NULL DEFAULT 0,
      categories     TEXT,
      summary        TEXT,
      model          TEXT,
      enriched_at    TEXT,
      skipped        INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_source ON posts (source_slug);
    CREATE INDEX IF NOT EXISTS idx_posts_pending ON posts (enriched_at) WHERE enriched_at IS NULL;
  `);
  // migration for databases created before the skipped column existed
  const cols = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
  if (!cols.includes("skipped")) {
    db.exec("ALTER TABLE posts ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0");
  }
  return db;
}
