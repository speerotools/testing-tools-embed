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
