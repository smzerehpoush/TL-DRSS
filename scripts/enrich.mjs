// Enrich: for each Post without a Summary, fetch the article text transiently,
// then ask the LLM for 1-3 Categories and a Summary in one structured call.
// Article text is never persisted or displayed (docs/adr/0001).
//
// Provider is picked from the environment: ANTHROPIC_API_KEY → Claude,
// GEMINI_API_KEY → Gemini (LLM_PROVIDER=anthropic|gemini overrides).
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import Anthropic from "@anthropic-ai/sdk";
import { openDb } from "./lib/db.mjs";

const PROVIDER =
  process.env.LLM_PROVIDER ??
  (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GEMINI_API_KEY ? "gemini" : null);
if (!PROVIDER) {
  console.log("No LLM key set (ANTHROPIC_API_KEY or GEMINI_API_KEY) — skipping enrichment.");
  process.exit(0);
}
// Gemini free-tier quotas are per model, so rotate through the family when one
// model's daily quota runs dry. Order: newest/best first.
// `||` not `??`: CI passes unset repo variables through as empty strings.
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.0-flash"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (PROVIDER === "gemini" && GEMINI_MODELS.length === 0) {
  console.error("GEMINI_MODELS resolved to an empty list");
  process.exit(1);
}
let geminiIdx = 0;
const currentModel = () =>
  PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8"
    : GEMINI_MODELS[geminiIdx];

const LIMIT = Number(process.env.ENRICH_LIMIT ?? 60);
const MAX_FETCH_ATTEMPTS = 5;
const MAX_ARTICLE_CHARS = 24_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const taxonomy = JSON.parse(readFileSync(new URL("../taxonomy.json", import.meta.url), "utf8"));
const slugs = taxonomy.map((c) => c.slug);
const taxonomyPrompt = taxonomy.map((c) => `- ${c.slug}: ${c.name} — ${c.description}`).join("\n");

const db = openDb();
const pending = db
  .prepare(
    `SELECT id, source_slug, title, url, fetch_attempts FROM posts
     WHERE summary IS NULL AND skipped = 0 ORDER BY published_at DESC LIMIT ?`
  )
  .all(LIMIT);
const save = db.prepare(
  `UPDATE posts SET categories = ?, summary = ?, model = ?, enriched_at = ? WHERE id = ?`
);
const bumpAttempts = db.prepare(`UPDATE posts SET fetch_attempts = fetch_attempts + 1 WHERE id = ?`);

async function fetchArticleText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const virtualConsole = new VirtualConsole(); // silence CSS parse noise
  const dom = new JSDOM(html, { url, virtualConsole });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim();
  if (!text || text.length < 200) throw new Error("no extractable text");
  return text.slice(0, MAX_ARTICLE_CHARS);
}

function buildPrompt(post, articleText) {
  const context = articleText
    ? `Full article text:\n${articleText}`
    : `The article text could not be fetched. Base your answer on the title and company alone, and keep the summary appropriately general.`;
  return `You are the editor of a website that aggregates engineering blog posts from tech companies.

Categorize the post below into 1 to 3 of these categories (use the slug):
${taxonomyPrompt}

Then write a summary of 3-5 sentences in your own words. The summary is the main thing visitors read, so make it concrete and informative: what problem the post tackles, what approach or system it describes, and any notable results. No marketing fluff, no "this post discusses" framing — go straight to the substance.

Company: ${post.sourceName}
Title: ${post.title}
${context}`;
}

const resultJsonSchema = {
  type: "object",
  properties: {
    categories: { type: "array", items: { type: "string", enum: slugs } },
    summary: { type: "string" },
  },
  required: ["categories", "summary"],
  additionalProperties: false,
};

const anthropic = PROVIDER === "anthropic" ? new Anthropic() : null;

async function callAnthropic(prompt) {
  const msg = await anthropic.messages.create({
    model: currentModel(),
    max_tokens: 2048,
    output_config: { format: { type: "json_schema", schema: resultJsonSchema } },
    messages: [{ role: "user", content: prompt }],
  });
  if (msg.stop_reason === "refusal") throw new Error("model refused");
  const text = msg.content.find((b) => b.type === "text")?.text;
  return JSON.parse(text ?? "{}");
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${currentModel()}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              categories: { type: "ARRAY", items: { type: "STRING", enum: slugs } },
              summary: { type: "STRING" },
            },
            required: ["categories", "summary"],
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    }
  );
  if (res.status === 429) throw Object.assign(new Error("rate limited"), { rateLimited: true });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
}

async function classifyAndSummarize(post, articleText) {
  const prompt = buildPrompt(post, articleText);
  const out = PROVIDER === "anthropic" ? await callAnthropic(prompt) : await callGemini(prompt);
  const categories = (out.categories ?? []).filter((s) => slugs.includes(s)).slice(0, 3);
  if (!categories.length || !out.summary?.trim()) throw new Error("invalid LLM output");
  return { categories, summary: out.summary.trim() };
}

const isRateLimit = (err) =>
  err.rateLimited || (PROVIDER === "anthropic" && err instanceof Anthropic.RateLimitError);

const sources = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8"));
const sourceNames = Object.fromEntries(sources.map((s) => [s.slug, s.name]));

// Gemini's free tier has a tight per-minute limit that resets quickly — wait
// it out instead of ending the run. Only give up after several consecutive
// waits do nothing (i.e. the daily quota is exhausted).
const RATE_LIMIT_WAIT_MS = 65_000;
const MAX_RATE_LIMIT_WAITS = Number(process.env.MAX_RATE_LIMIT_WAITS ?? 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`enriching with ${PROVIDER} (${currentModel()}), up to ${LIMIT} posts`);
let done = 0;
let rateWaits = 0;
let quotaExhausted = false;
for (const post of pending) {
  if (quotaExhausted) break;
  post.sourceName = sourceNames[post.source_slug] ?? post.source_slug;

  let articleText = null;
  try {
    articleText = await fetchArticleText(post.url);
  } catch (err) {
    bumpAttempts.run(post.id);
    if (post.fetch_attempts + 1 < MAX_FETCH_ATTEMPTS) {
      console.log(`defer ${post.source_slug}/${post.title.slice(0, 50)}: fetch failed (${err.message})`);
      continue; // retry on a later run
    }
    console.log(`title-only ${post.source_slug}/${post.title.slice(0, 50)} after ${MAX_FETCH_ATTEMPTS} failed fetches`);
  }

  while (true) {
    try {
      const { categories, summary } = await classifyAndSummarize(post, articleText);
      save.run(JSON.stringify(categories), summary, currentModel(), new Date().toISOString(), post.id);
      done += 1;
      rateWaits = 0;
      console.log(`ok    ${post.source_slug}: ${post.title.slice(0, 60)} → [${categories.join(", ")}]`);
    } catch (err) {
      const deadModel = PROVIDER === "gemini" && /Gemini HTTP 404/.test(err.message);
      const quotaDry = isRateLimit(err) && rateWaits >= MAX_RATE_LIMIT_WAITS;
      if (deadModel || quotaDry) {
        // this model is unusable (missing, or daily quota gone) — rotate
        if (PROVIDER === "gemini" && geminiIdx < GEMINI_MODELS.length - 1) {
          console.log(`${currentModel()} ${deadModel ? "unavailable" : "daily quota exhausted"} — switching to ${GEMINI_MODELS[geminiIdx + 1]}`);
          geminiIdx += 1;
          rateWaits = 0;
          continue; // retry the same post on the next model
        }
        console.log("All models exhausted — stopping; remaining posts continue next run.");
        quotaExhausted = true;
        break;
      }
      if (isRateLimit(err)) {
        rateWaits += 1;
        console.log(`rate limited — waiting ${RATE_LIMIT_WAIT_MS / 1000}s (${rateWaits}/${MAX_RATE_LIMIT_WAITS})`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue; // retry the same post
      }
      console.error(`FAIL  ${post.source_slug}/${post.title.slice(0, 50)}: ${err.message}`);
    }
    break;
  }
}

const remaining = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE summary IS NULL AND skipped = 0").get().n;
const parked = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE summary IS NULL AND skipped = 1").get().n;
console.log(`\nenrich done: ${done} posts enriched, ${remaining} still pending${parked ? `, ${parked} parked (scripts/skip-backlog.mjs --restore)` : ""}`);
db.close();
