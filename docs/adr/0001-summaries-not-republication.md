# Display LLM summaries and link out — never republish full article text

The site is a public aggregator of company engineering blog posts, and publicly republishing full articles is copyright infringement (feeds are published for personal readers and link-back syndication, not mirroring). We decided that every Post displays an LLM-written Summary — the site's own words — plus a link to the original, and the publisher's full text is never rendered anywhere on the site. Full article text is fetched **transiently** at ingestion solely as LLM input and is not persisted, so the public repo never contains publisher content beyond feed metadata.

## Considered Options

- Full-text republication (with or without links) — rejected as clear infringement and a takedown magnet; the no-link variant was additionally rejected outright.
- Feed-provided excerpts as the card body — legally safer than full text but low quality (truncated mid-sentence) and still publisher text; superseded by generated Summaries.

## Consequences

- Re-classifying or re-summarizing a Post requires re-fetching the article from its URL (text is not stored).
- Posts without a Summary yet (LLM pending/rate-limited) are not displayed at all — there is no publisher-text fallback.
