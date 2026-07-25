# CLAUDE.md

TL;DRSS — public read-only static site aggregating engineering blog posts from
~39 hand-curated companies: fixed 13-category taxonomy, LLM summary + link per
post. GitHub: `smzerehpoush/TL-DRSS`. Mirrors: https://smzerehpoush.github.io/TL-DRSS/
and https://mahdiyar.me/tldrss/.

## Ground rules (settled decisions — don't re-litigate)

- Read `CONTEXT.md` (domain glossary) before naming anything. Company is NOT a
  first-class concept; a blog without a working feed cannot be a Source.
- `docs/adr/0001-summaries-not-republication.md` is firm: display the LLM
  Summary + link only; never render publisher text; never persist article text
  (fetched transiently as LLM input only). Posts without a Summary stay hidden.
- No topic filter: all engineering topics equal (the early "backend focus" was
  explicitly dropped).
- Taxonomy lives in `taxonomy.json`; classification is re-runnable by design
  (`scripts/reclassify.mjs` clears LLM output; next enrich redoes it).

## Architecture

`.github/workflows/pipeline.yml`, cron every 6h:
ingest feeds → enrich via LLM → commit `data/posts.db` (the DB is the archive —
feeds forget old items, so it MUST stay committed) → build+deploy GitHub Pages
(base `/TL-DRSS/`) → second build (base `/tldrss/`) force-pushed to the
`server-dist` branch. The server pulls that branch every 20 min
(`/opt/tldrss/server-pull.sh` cron on `ubuntu@37.32.27.201` → `/srv/tldrss`,
served by the `padelyar-caddy` Docker container via a `handle_path /tldrss/*`
route in `/opt/padelyar/deploy/Caddyfile`).

- **Push-based deploy to the server is impossible**: GitHub runners cannot
  reach it over SSH (inbound foreign-datacenter traffic is filtered). Keep the
  pull model.
- Manual instant deploy: `bash scripts/deploy-server.sh` — but a pipeline run's
  `server-dist` force-push + server cron will revert it within ~20 min unless
  `main` already contains your change (push main first, or also push the built
  `dist/` to `server-dist`).
- Site base path is computed from env (`SITE_URL`, `BASE_PATH`); all internal
  links must go through `src/lib/url.js`.

## LLM enrichment (`scripts/enrich.mjs`)

- Provider auto-detected: `ANTHROPIC_API_KEY` → Claude, `GEMINI_API_KEY` →
  Gemini (`LLM_PROVIDER` forces). Models via `ANTHROPIC_MODEL` /
  `GEMINI_MODEL` (GitHub repo variables in CI).
- Currently on Gemini free tier. Free quotas are per-model and old models are
  starved (`gemini-2.5-flash` ≈ 25 req/day observed; `2.5-flash-lite` 404s on
  generateContent). Use a current-generation flash model; the
  `list-models.yml` workflow (manual dispatch) prints what the key can access.
- Per-minute 429s are waited out (65s, up to 8 consecutive) then the run stops
  and the next one resumes. `ENRICH_LIMIT` (repo variable) caps posts per run.
- The user prefers $0; ask before switching to a paid key.

## Commands

```sh
npm run ingest      # pull feeds into data/posts.db (parallel, hard 60s/feed cap)
npm run enrich      # classify+summarize pending posts (needs an LLM key)
npm run dev         # local preview at localhost:4321
bash scripts/deploy-server.sh          # manual deploy to mahdiyar.me/tldrss
node scripts/skip-backlog.mjs --keep N # park pending backlog / --restore
node scripts/reclassify.mjs --all      # redo classification after taxonomy/prompt changes
```

## Gotchas

- `sources.json`: per-source `exclude` regex filters junk (Vercel's feed mixes
  changelog entries). Meta/Discord feeds are blocked from this local network
  but work from Actions — a local ingest "FAIL" for them is not a bug.
- Design is the "Duality" style (Archivo/Inter/JetBrains Mono via Fontsource,
  electric blue accent, hairline rules). The user iterates on design: preview
  locally and get approval before publishing.
- `public/og.png` (link previews) hardcodes stats ("39 SOURCES …") — regenerate
  if those change (SVG → `qlmanage -t` → `sips` crop; see git history).
- Telegram caches link previews; `@WebpageBot` forces a re-scrape.
