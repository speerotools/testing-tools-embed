# Speero Testing Tools — Embed

Vanilla JS/CSS embed for the A/B testing tools directory on speero.com/ab-testing-tools.

Served via jsDelivr and loaded by a Webflow Code Embed:

```html
<div id="speero-testing-tools"></div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/speerotools/testing-tools-embed@v1.0.0/dist/embed.css">
<script src="https://cdn.jsdelivr.net/gh/speerotools/testing-tools-embed@v1.0.0/dist/embed.js" defer></script>
```

The embed fetches its data at runtime from `speerotools/testing-tools-data`.

## Releasing a new version

1. Commit changes to `dist/embed.js` / `dist/embed.css` on `main`.
2. Tag the commit (e.g. `v1.1.0`) and push the tag.
3. Update the version number in the Webflow embed snippet and republish.

Do not edit served versions in place — always cut a new tag so rollbacks are clean.

## Native content (v1.8.0)

Both surfaces now progressively enhance server-rendered Webflow content.

**Vendor pages (`island.js`).** The template renders, inside
`#speero-tool-page`, an H1 marked `data-tt-native-h1` (bound to the CMS
`seo-h1` field) and a rich-text block marked `data-tt-native-body` (bound to
`profile-body`, the factual platform overview). The data sync fills both.
The island moves those exact nodes into its layout instead of rendering its
own H1 and overview, shows no loading state over them, and leaves them in
place if the data fetch fails or the slug is not in the data yet.

**Landing page (`embed.js`).** The page carries a native H1 and intro marked
`data-tt-native-head` and a Collection List directory marked
`data-tt-native-dir` with real links to every published vendor page. The
embed skips its own hero H1 when the native one exists (compare view uses an
H2), hides the native directory only after its own directory renders, and
its cards now carry a real `<a href>` on the vendor name.

## Dates and provenance (v1.8.0)

Each date means one thing, and none stands in for another:

| Field | Label | Source |
|---|---|---|
| `scraped` | Last enrichment | Last Vendor Scrape (enrichment apply step) |
| `swept` | Sources last fetched | newest successful URL fetch |
| `factVerifiedAt` | Selected facts checked (specific claims only) | Airtable Fact Verified At, set by a person |
| `editorialReviewedAt` | Editorial review, or "No approval date recorded" | Airtable Editorial Reviewed At, set by a person |

The Review JSON-LD `datePublished` uses `editorialReviewedAt` only and is
omitted without it. Counts and headings say "listed", not "verified".
