# TL;DRSS

A public, read-only website that aggregates engineering blog posts from top tech companies via RSS/Atom feeds and organizes them by category. All engineering topics are treated equally; no topic is privileged.

## Language

**Source**:
An engineering blog's RSS/Atom feed that Posts are ingested from, carrying the publishing company's name as a display label. The company is not a concept of its own — the Source is the only unit. A blog without a feed cannot be a Source.
_Avoid_: Feed, blog, site, company

**Category**:
One of a fixed, curated set of engineering topics maintained by the site owner. Every Post holds one to three Categories. The set is shared across all Sources — it is the site's vocabulary, not the publishers'.
_Avoid_: Tag, topic, label

**Post**:
A single article ingested from a Source. The site links to the original; the canonical copy always lives with the publisher.
_Avoid_: Article, entry, item

**Summary**:
A short digest of a Post written by an LLM at ingestion — the site's own words, and the centerpiece of what a visitor reads. The site displays the Summary, never the publisher's full text.
_Avoid_: Excerpt, description, abstract
