// Speero A/B Testing Tools — per-vendor page island
// Hydrates a Webflow CMS template page at /ab-testing-tools/[slug].
// Renders the nine-section vendor profile plus the two computed quadrant maps
// (market position + agentic readiness). Ported from the hub prototype; the
// only changes are: real path routing instead of hash routes, data fetched from
// the CDN JSON, and a normalize() layer that maps the production vendor shape
// onto the fields the detail view and scorer expect.
//
// Mount: <div id="speero-tool-page" data-slug="{{slug}}"></div>
// The slug is read from data-slug first (bind it to the CMS Slug field in
// Webflow), then falls back to the last segment of location.pathname.

(function () {
  const MOUNT_ID = "speero-tool-page";
  const DATA_URL = (typeof window !== "undefined" && window.SPEERO_TT_DATA_URL) ||
    "https://cdn.jsdelivr.net/gh/speerotools/testing-tools-data@main/testing-tools.json";

  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;

  let VENDORS = [];
  let LAST_VERIFIED = "";

  // ---------- slug resolution ----------
  function currentSlug() {
    const attr = (mount.getAttribute("data-slug") || "").trim();
    if (attr) return attr;
    const parts = location.pathname.replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || "";
  }

  // ---------- normalize production shape -> detail shape ----------
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function normalize(v) {
    const d = v.mcpDetail || {};
    return {
      n:      v.name || "",
      s:      v.slug || "",
      h1:     v.h1 || "",
      h2:     v.h2 || "",
      take:   v.summary || "",
      url:    v.url || "",
      mcp:    { type: cap(v.mcp || "none"), url: d.url || "", hosted: d.hosted || "", docs: d.docs || "", auth: d.auth || "" },
      ai:     v.ai || [],
      caps:   v.caps || [],           // MCP capabilities — not yet in production JSON
      ucf:    v.ucf || [],
      price:  v.pricing || [],
      comp:   v.compliance || [],
      sdk:    v.sdk || [],
      types:  v.types || [],          // campaign types — not yet in production JSON
      status: cap(v.status || "active"),
      scraped: v.scraped || "",       // last vendor scrape date (Last Vendor Scrape)
      sources: v.sources || [],       // [{type,url,fetched,updated?}] from Vendor URLs registry
      swept: v.swept || "",           // last URL fetch date (sweep), distinct from scraped
      enrichment: v.enrichment || "", // Enrichment Status pill
      acq:    v.acquiredBy || "",
      seoTitle: v.seoTitle || "",     // Phase E: reviewed Meta Title (falls back below)
      seoDesc:  v.seoDesc || "",      // Phase E: reviewed Meta Description
      seoH1:    v.seoH1 || "",        // Phase E: reviewed SEO H1
      ogImage:  v.ogImage || "",      // Phase E: OG/Twitter card image
      // agentic positions from the payload (Airtable's Agentic Map X/Y Final);
      // computed + override ride along for drift. Market overrides win JS-side.
      ax: v.ax != null ? +v.ax : null, ay: v.ay != null ? +v.ay : null,
      axc: v.axc != null ? +v.axc : null, ayc: v.ayc != null ? +v.ayc : null,
      axo: v.axo != null ? +v.axo : null, ayo: v.ayo != null ? +v.ayo : null,
      mxo: v.mxo != null ? +v.mxo : null, myo: v.myo != null ? +v.myo : null
    };
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function bySlug(s) { return VENDORS.find(v => v.s === s); }
  function fmtDate(d) { if (!d) return ""; const [y, m] = d.split("-"); const mo = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m]; return mo ? mo + " " + y : d; }
  function shortUrl(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, ""); } catch (e) { return u; } }

  // ---------- canonical scoring (start 50, clamp 4-96) ----------
  const clamp = v => Math.max(4, Math.min(96, Math.round(v)));
  function has(arr, needle) { return (arr || []).some(x => x.toLowerCase().includes(needle)); }

  function marketX(v) { // marketing/CRO left, engineering/product right
    let s = 50;
    if (has(v.ucf, "server-side")) s += 16;
    if (has(v.ucf, "warehouse-native")) s += 12;
    if (has(v.ucf, "client-side marketing")) s -= 16;
    if (has(v.ucf, "shopify")) s -= 12;
    if (has(v.ucf, "dtc")) s -= 6;
    if (has(v.ucf, "b2b saas")) s += 6;
    if (has(v.ucf, "mobile app")) s += 6;
    const sdkAdj = Math.max(-14, Math.min(14, ((v.sdk || []).length - 6) * 1.2));
    return clamp(s + sdkAdj);
  }
  function marketY(v) { // SMB bottom, enterprise top
    let s = 50;
    const entOnly = (v.price || []).length === 1 && has(v.price, "enterprise");
    if (entOnly) s += 12;
    else if (has(v.price, "enterprise")) s += 4;
    if (has(v.price, "free")) s -= 8;
    s += ((v.comp || []).length - 3) * 4;
    if (has(v.ucf, "enterprise")) s += 8;
    if (has(v.ucf, "agency-friendly")) s -= 6;
    if (has(v.ucf, "shopify")) s -= 8;
    return clamp(s);
  }
  // Agentic positions are Airtable's Agentic Map X/Y Final (v2 scorer, override
  // precedence already applied), carried in the payload. Plot them directly;
  // never re-derive in the browser. A vendor with no Final plots at centre.
  function agenticX(v) { if (typeof v.ax === "number") return v.ax; console.warn("[map] no agenticX for " + v.n + " — payload needs a rescore"); return 50; }
  function agenticY(v) { if (typeof v.ay === "number") return v.ay; console.warn("[map] no agenticY for " + v.n + " — payload needs a rescore"); return 50; }

  // ---------- quadrant map SVG (name-as-marker, collision dodge) ----------
  function renderMap(opts) {
    const W = 920, H = 560, pad = { t: 46, r: 26, b: 52, l: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const px = x => pad.l + (x / 100) * iw;
    const py = y => pad.t + ih - (y / 100) * ih;
    const pts = opts.vendors.map(v => ({
      v, x: px(opts.fx(v)), y: py(opts.fy(v)),
      focal: opts.focal && v.s === opts.focal
    }));
    pts.sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    const charW = 6.1, lh = 15;
    for (const p of pts) {
      const w = p.v.n.length * charW + 8;
      let ty = p.y, tries = 0, dir = 1;
      const collides = () => placed.some(q => Math.abs(q.ty - ty) < lh && (p.x - w / 2) < (q.x + q.w / 2) && (p.x + w / 2) > (q.x - q.w / 2));
      while (collides() && tries < 40) { tries++; dir = -dir; ty = p.y + Math.ceil(tries / 2) * lh * dir; }
      ty = Math.max(pad.t + 24, Math.min(pad.t + ih - 8, ty));
      p.ty = ty; p.w = w; placed.push(p);
    }
    const labels = placed.map(p => {
      const cls = p.focal ? "fill:#FF0049;font-weight:900" : "fill:#001641;font-weight:300";
      const fs = p.focal ? 13.5 : 11.5;
      return `<text x="${p.x.toFixed(1)}" y="${p.ty.toFixed(1)}" text-anchor="middle" style="${cls};font-size:${fs}px;font-family:Poppins,Arial,sans-serif;cursor:pointer" data-slug="${p.v.s}">${esc(p.v.n)}</text>`;
    }).join("");
    const q = opts.quads || [];
    const quadLabels = q.map((t, i) => {
      const qx = i % 2 === 0 ? pad.l + 8 : pad.l + iw - 8;
      const qy = i < 2 ? pad.t + 16 : pad.t + ih - 8;
      const anc = i % 2 === 0 ? "start" : "end";
      return `<text x="${qx}" y="${qy}" text-anchor="${anc}" style="fill:#FF0049;font-weight:900;font-style:italic;font-size:10px;letter-spacing:.12em;font-family:Poppins,Arial,sans-serif">${t.toUpperCase()}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}">
      <defs><pattern id="gp${opts.id}" width="23" height="23" patternUnits="userSpaceOnUse">
        <path d="M 23 0 L 0 0 0 23" fill="none" stroke="rgba(0,22,65,0.06)" stroke-width="1"/>
      </pattern></defs>
      <rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="url(#gp${opts.id})" stroke="rgba(0,22,65,0.2)"/>
      <line x1="${pad.l + iw / 2}" y1="${pad.t}" x2="${pad.l + iw / 2}" y2="${pad.t + ih}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
      <line x1="${pad.l}" y1="${pad.t + ih / 2}" x2="${pad.l + iw}" y2="${pad.t + ih / 2}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
      ${quadLabels}
      ${labels}
      <text x="${pad.l}" y="${H - 16}" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">&#8592; ${esc(opts.xlab[0]).toUpperCase()}</text>
      <text x="${pad.l + iw}" y="${H - 16}" text-anchor="end" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">${esc(opts.xlab[1]).toUpperCase()} &#8594;</text>
      <text x="${pad.l - 8}" y="${pad.t + ih}" transform="rotate(-90 ${pad.l - 8} ${pad.t + ih})" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">&#8592; ${esc(opts.ylab[0]).toUpperCase()}</text>
      <text x="${pad.l - 8}" y="${pad.t + 10}" transform="rotate(-90 ${pad.l - 8} ${pad.t + 10})" text-anchor="end" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">${esc(opts.ylab[1]).toUpperCase()} &#8594;</text>
    </svg>`;
  }
  function marketMap(focal, id) {
    return renderMap({
      id, title: "Market position map", focal,
      vendors: VENDORS.filter(v => v.status !== "Discontinued"),
      fx: v => (v.mxo != null ? clamp(v.mxo) : marketX(v)),
      fy: v => (v.myo != null ? clamp(v.myo) : marketY(v)),
      xlab: ["Marketing and CRO teams", "Engineering and product teams"],
      ylab: ["SMB and self-serve", "Enterprise and governance"],
      quads: []
    });
  }
  function agenticMap(focal, id) {
    return renderMap({
      id, title: "Agentic readiness map", focal,
      vendors: VENDORS.filter(v => v.status !== "Discontinued"),
      fx: v => (v.axo != null ? clamp(v.axo) : agenticX(v)),
      fy: v => (v.ayo != null ? clamp(v.ayo) : agenticY(v)),
      xlab: ["Closed to agents", "Open: MCP server plus SDK breadth"],
      ylab: ["Fewer native AI features", "More native AI features"],
      quads: ["Smart but manual", "Agentic-native", "Pre-AI / manual", "Programmable, low AI"]
    });
  }
  const MAP_METHOD = '<p><b>A caveat, upfront.</b> Every 2&times;2 like this compresses a multi-dimensional stack &mdash; pricing model, compliance depth, SDK breadth, buyer type &mdash; into a single dot, which makes it look more authoritative than it is. A tool built for two audiences gets averaged into serving neither, and position can read as ranking even when it isn&rsquo;t one.</p><p><b>How to read it.</b> Nothing here is hand-placed. Every dot is computed from the verified capability tags in the vendor database, the same data driving the filters on the hub. When a vendor ships a new SDK or drops a pricing tier, it moves on the next monthly sweep. But computed isn&rsquo;t the same as correct: the weights behind each axis are judgment calls, the tags are only as good as our verification, and a 2D view of a many-dimension database loses information by definition.</p><p>If a position looks wrong to you, <a class="redlink" href="https://speero.com/#main-form">tell us</a> and we&rsquo;ll re-verify the underlying tags.</p>';

  // ---------- SEO: computed fallbacks + head injection (Phase E) ----------
  const SITE = "https://speero.com";
  const HUB_URL = SITE + "/ab-testing-tools";
  function pageUrl(v) { return HUB_URL + "/" + v.s; }

  function seoTitle(v) {
    if (v.seoTitle) return v.seoTitle;                       // reviewed copy wins
    if (v.acq) return `${v.n} Review 2026: Now Part of ${v.acq}`;
    const full = `${v.n} Review 2026: Features, Pricing & Alternatives`;
    if (full.length <= 60) return full;
    const mid = `${v.n} Review 2026: Pricing & Alternatives`;
    if (mid.length <= 60) return mid;
    return `${v.n} Review 2026`;
  }
  function seoDesc(v) {
    if (v.seoDesc) return v.seoDesc;
    let lead = (v.take || "").trim();
    if (lead) {                                              // first sentence of the Speero blurb
      const dot = lead.indexOf(". ");
      if (dot > 0) lead = lead.slice(0, dot + 1);
    } else {
      lead = `${v.n} is an A/B testing and experimentation platform.`;
    }
    for (const cta of ["Compare pricing, AI and MCP capability, and alternatives.",
                       "Compare pricing, AI capability, and alternatives.",
                       "Compare pricing and alternatives."]) {
      const d = (lead.replace(/[\s.]+$/, "") + ". " + cta).trim();
      if (d.length <= 158) return d;
    }
    // still long: trim the lead at a word boundary and use the shortest CTA
    const short = "Compare pricing and alternatives.";
    const base = lead.replace(/[\s.]+$/, "").slice(0, 158 - short.length - 2).replace(/\s+\S*$/, "");
    return (base + ". " + short).trim();
  }
  function seoH1(v) { return v.seoH1 || `${v.n} review: features, pricing, and alternatives`; }

  function upsertMeta(sel, attrs) {
    let el = document.head.querySelector(sel);
    if (!el) { el = document.createElement("meta"); el.setAttribute("data-seo", "1"); document.head.appendChild(el); }
    Object.entries(attrs).forEach(([k, val]) => el.setAttribute(k, val));
  }
  function injectHead(v) {
    const title = seoTitle(v), desc = seoDesc(v), url = pageUrl(v), img = v.ogImage || "";
    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: desc });
    // canonical
    let can = document.head.querySelector('link[rel="canonical"]');
    if (!can) { can = document.createElement("link"); can.rel = "canonical"; can.setAttribute("data-seo", "1"); document.head.appendChild(can); }
    can.href = url;
    // Open Graph + Twitter
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "article" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: desc });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "Speero" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: desc });
    if (img) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: img });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: img });
    }
    // JSON-LD: SoftwareApplication + BreadcrumbList
    document.head.querySelectorAll('script[data-seo-ld]').forEach(s => s.remove());
    const soft = {
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      name: v.n, applicationCategory: "BusinessApplication",
      applicationSubCategory: "A/B Testing and Experimentation",
      url: v.url || url, sameAs: v.url || undefined, description: desc, operatingSystem: "Web"
    };
    // offers omitted on purpose: Price range is a 1-5 proxy, not dollars.
    if (v.take) {
      soft.review = {
        "@type": "Review",
        author: { "@type": "Organization", name: "Speero", url: SITE },
        publisher: { "@type": "Organization", name: "Speero", url: SITE },
        datePublished: v.scraped || undefined, reviewBody: v.take
      };
    }
    const crumbs = {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "A/B Testing Tools", item: HUB_URL },
        { "@type": "ListItem", position: 3, name: v.n, item: url }
      ]
    };
    [soft, crumbs].forEach(obj => {
      const s = document.createElement("script");
      s.type = "application/ld+json"; s.setAttribute("data-seo-ld", "1");
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
    });
  }

  // ---------- nine-section detail view ----------
  function detailView(v) {
    const alts = VENDORS.filter(o => o.s !== v.s && (o.ucf || []).some(u => (v.ucf || []).includes(u))).slice(0, 5);
    const mcp = v.mcp || {};
    const HUB = "/ab-testing-tools";
    return `
    <div class="wrap">
      <nav class="breadcrumb"><a href="/">Home</a> / <a href="${HUB}">A/B testing tools</a> / ${esc(v.n)}</nav>
      <div class="dhero">
        <div>
          <span class="eyebrow">${esc((v.ucf && v.ucf[0]) || "Experimentation platform")}</span>
          <h1>${esc(seoH1(v))}</h1>
          <p class="h2q">&ldquo;${esc(v.h1 || "")}&rdquo; ${v.h2 ? "&mdash; " + esc(v.h2) : ""}</p>
          <a class="visit" href="${esc(v.url)}" target="_blank" rel="noopener">Visit ${esc(v.n.split(" ")[0])} &#8599;</a>
        </div>
        <aside class="glance">
          <h3>At a glance</h3>
          <dl>
            <dt>MCP server</dt><dd>${mcp.type === "Product" ? '<b class="red">Yes, product</b>' : mcp.type === "Platform" ? "<b>Platform-level</b>" : "None"}</dd>
            ${(v.caps || []).length ? `<dt>MCP capabilities</dt><dd><b>${v.caps.length}</b> verified</dd>` : ""}
            <dt>Native AI features</dt><dd><b>${(v.ai || []).length}</b> verified</dd>
            <dt>Pricing model</dt><dd>${esc((v.price || []).join(", ") || "Not published")}</dd>
            <dt>Compliance</dt><dd>${esc((v.comp || []).join(", ") || "None verified first-party")}</dd>
            <dt>SDK coverage</dt><dd><b>${(v.sdk || []).length}</b> languages / surfaces</dd>
            ${v.acq ? `<dt>Acquired by</dt><dd>${esc(v.acq)}</dd>` : ""}
            ${v.scraped ? `<dt>Last verified</dt><dd>${fmtDate(v.scraped)}</dd>` : ""}
          </dl>
        </aside>
      </div>

      <div class="dsec">
        <h2>The Speero take</h2>
        <p class="take">${esc(v.take || "")}</p>
        <div class="maps2">
          <div>
            <h3 style="font-size:13px;margin-bottom:8px">Where it sits in the market</h3>
            <div class="mapframe">${marketMap(v.s, "dm")}</div>
          </div>
          <div>
            <h3 style="font-size:13px;margin-bottom:8px">How agent-ready it is</h3>
            <div class="mapframe">${agenticMap(v.s, "da")}</div>
          </div>
        </div>
        <div class="map-caption" style="border:none;padding-left:4px">${MAP_METHOD}</div>
      </div>

      <div class="dsec">
        <h2>AI and agent access</h2>
        <p class="lede">Two different questions: what AI the tool ships natively, and whether your own agents can operate it programmatically.</p>
        <div class="kv">
          <div class="cell"><div class="k">MCP type</div><div class="v">${esc(mcp.type || "None")}</div></div>
          ${mcp.url ? `<div class="cell"><div class="k">MCP endpoint</div><div class="v" style="font-weight:300;font-size:12px">${esc(mcp.url)}</div></div>` : ""}
          ${mcp.auth ? `<div class="cell"><div class="k">Auth</div><div class="v">${esc(mcp.auth)}</div></div>` : ""}
          ${mcp.hosted ? `<div class="cell"><div class="k">Hosting</div><div class="v">${esc(mcp.hosted)}</div></div>` : ""}
          ${mcp.docs ? `<div class="cell"><div class="k">MCP docs</div><div class="v"><a href="${esc(mcp.docs)}" target="_blank" rel="noopener">Documentation &#8599;</a></div></div>` : ""}
        </div>
        ${(v.caps || []).length ? `<h4 style="margin-top:22px" class="mono-label">Verified MCP capabilities</h4><div class="tagcloud">${v.caps.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
        ${(v.ai || []).length ? `<h4 style="margin-top:18px" class="mono-label">Native AI features</h4><div class="tagcloud">${v.ai.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
      </div>

      <div class="dsec">
        <h2>Capabilities</h2>
        <div class="capgrid">
          ${(v.types || []).length ? `<div><h4>Campaign types</h4><div class="tagcloud">${v.types.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
          ${(v.sdk || []).length ? `<div><h4>SDKs and surfaces</h4><div class="tagcloud">${v.sdk.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
          ${(v.comp || []).length ? `<div><h4>Compliance and security</h4><div class="tagcloud">${v.comp.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
          ${(v.ucf || []).length ? `<div><h4>Use case fit</h4><div class="tagcloud">${v.ucf.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
        </div>
      </div>

      ${alts.length ? `
      <div class="dsec">
        <h2>Alternatives to ${esc(v.n)}</h2>
        <p class="lede">Tools with overlapping use case fit. Compare capabilities, pricing, and agent readiness side by side.</p>
        <div class="altrow">${alts.map(a => `<a href="${HUB}/${esc(a.s)}">${esc(a.n)} &#8594;</a>`).join("")}</div>
        <p class="srcnote" style="margin-top:12px"><a class="redlink" href="${HUB}">See all A/B testing tools &#8594;</a></p>
      </div>` : ""}

      <div class="dsec" style="border-bottom:none">
        <span class="eyebrow">Method</span>
        <h2>Sources and method</h2>
        <p class="lede">Every field on this page is re-pulled on Speero&rsquo;s monthly sweep from ${esc(v.n)}&rsquo;s own site, docs, and trust pages. The list of pages we watch is shown below verbatim. If a page isn&rsquo;t on this list, nothing on this page came from it. Pages flagged <b>Updated</b> changed since our last sweep and were re-reviewed.</p>

        <div class="srcmethod">
          <div class="item"><b>What counts as a source</b>${esc(v.n)}&rsquo;s own site, product docs, pricing page, and trust or security center. Not aggregators, review sites, or third-party write-ups.</div>
          <div class="item"><b>What we re-check</b>Every field on this page is re-pulled on Speero&rsquo;s monthly sweep, including homepage H1/H2, capability docs, SDKs, compliance, pricing surface, and MCP docs.</div>
          <div class="item"><b>What &ldquo;empty&rdquo; means</b>Empty fields mean we could not verify a claim first-party. We leave those blank rather than guess.</div>
          <div class="item"><b>How the list stays honest</b>URLs are managed in Airtable. New URLs get added when the vendor ships a new surface; dead URLs get flagged and removed. Adding coverage is an Airtable change, not a code change.</div>
        </div>

        <div class="srcmeta">
          <span><span class="k">Vendor</span><span class="v">${esc(v.n)}</span></span>
          <span><span class="k">Active URLs tracked</span><span class="v">${(v.sources || []).length}</span></span>
          ${(v.swept || v.scraped) ? `<span><span class="k">Last swept</span><span class="v">${fmtDate(v.swept || v.scraped)}</span></span>` : ""}
          ${v.enrichment ? `<span><span class="k">Enrichment status</span><span class="v">${esc(v.enrichment)}</span></span>` : ""}
        </div>

        ${(v.sources || []).length ? `
        <div class="srcurls" role="region" aria-label="Sources tracked for ${esc(v.n)}">
          <table>
            <thead><tr><th style="width:170px">URL type</th><th>URL</th><th style="width:110px">Last fetched</th></tr></thead>
            <tbody>
              ${v.sources.map(s => `
                <tr>
                  <td class="type">${esc(s.type || "-")}</td>
                  <td class="url"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>${s.updated ? `<span class="badge updated">Updated</span>` : ""}</td>
                  <td class="fetched">${s.fetched ? fmtDate(s.fetched) : ""}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="srcfoot"><span class="pill">Legend</span><b>Updated</b>: this page changed since our last sweep, so we re-reviewed the fields it feeds. Everything else was re-fetched and found unchanged.</p>
        ` : `<p class="srcnote">No active source URLs are registered for ${esc(v.n)} yet. Coverage is being added in Airtable.</p>`}
      </div>
    </div>`;
  }

  function notFoundView(slug) {
    return `<div class="wrap"><div class="dsec" style="border:none">
      <nav class="breadcrumb"><a href="/ab-testing-tools">A/B testing tools</a> / Not found</nav>
      <h2 style="margin-top:20px">Tool not found</h2>
      <p class="lede">We couldn&rsquo;t find a profile for &ldquo;${esc(slug)}&rdquo;. It may have been renamed or removed.
      <a class="redlink" href="/ab-testing-tools">Back to all tools &#8594;</a></p>
    </div></div>`;
  }

  function errorView() {
    return `<div class="wrap"><div class="dsec" style="border:none">
      <h2 style="margin-top:20px">Profile temporarily unavailable</h2>
      <p class="lede">We couldn&rsquo;t load the vendor data right now. Please refresh in a moment.</p>
    </div></div>`;
  }

  // ---------- click-through on map name markers ----------
  mount.addEventListener("click", e => {
    const svgName = e.target.closest("text[data-slug]");
    if (svgName) location.href = "/ab-testing-tools/" + svgName.getAttribute("data-slug");
  });

  // ---------- boot ----------
  function showLoading() {
    mount.innerHTML = `<div class="wrap"><div class="dsec" style="border:none"><p class="lede">Loading profile&hellip;</p></div></div>`;
  }

  showLoading();
  fetch(DATA_URL, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(data => {
      const list = Array.isArray(data) ? data : (data.vendors || []);
      VENDORS = list.map(normalize);
      LAST_VERIFIED = data.version || "";
      const slug = currentSlug();
      const v = bySlug(slug);
      mount.innerHTML = v ? detailView(v) : notFoundView(slug);
      if (v) injectHead(v);          // Phase E: title, meta, canonical, OG/Twitter, JSON-LD
      else document.title = "Tool not found | A/B testing tools | Speero";
    })
    .catch(() => { mount.innerHTML = errorView(); });
})();
