// Build-time data access. Only Posts with a Summary are ever exposed to pages
// (docs/adr/0001 — no publisher-text fallback).
import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_PATH = process.env.DB_PATH ?? join(root, "data", "posts.db");

export const taxonomy = JSON.parse(readFileSync(join(root, "taxonomy.json"), "utf8"));
export const sources = JSON.parse(readFileSync(join(root, "sources.json"), "utf8"));

const sourceName = Object.fromEntries(sources.map((s) => [s.slug, s.name]));
const categoryName = Object.fromEntries(taxonomy.map((c) => [c.slug, c.name]));

function loadPosts() {
  if (!existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const rows = db
    .prepare(
      `SELECT id, source_slug, title, url, published_at, categories, summary
       FROM posts WHERE summary IS NOT NULL
       ORDER BY published_at DESC`
    )
    .all();
  db.close();
  return rows.map((r) => ({
    ...r,
    source_name: sourceName[r.source_slug] ?? r.source_slug,
    categories: JSON.parse(r.categories ?? "[]").map((slug) => ({
      slug,
      name: categoryName[slug] ?? slug,
    })),
  }));
}

export const posts = loadPosts();

export const postsByCategory = (slug) =>
  posts.filter((p) => p.categories.some((c) => c.slug === slug));

export const postsBySource = (slug) => posts.filter((p) => p.source_slug === slug);
