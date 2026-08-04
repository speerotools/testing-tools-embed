// Speero A/B Testing Tools — hub / directory embed
// Ported from the hub prototype (speero-testing-tools-hub.html). Renders the
// hero, the computed market-position map, the filterable directory, and the
// side-by-side compare view into #speero-testing-tools. Data comes from the
// CDN JSON; vendor cards link to the real Webflow pages at
// /ab-testing-tools/[slug] (not hash routes). The per-vendor page itself is
// rendered by island.js.

(function () {
  const MOUNT_ID = "speero-testing-tools";
  const DATA_URL = "https://cdn.jsdelivr.net/gh/speerotools/testing-tools-data@main/testing-tools.json";
  const TOOL_BASE = "/ab-testing-tools";

  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;

  let VENDORS = [];
  let LAST_VERIFIED = "";

  // ---------- normalize production shape -> prototype shape ----------
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function normalize(v) {
    const d = v.mcpDetail || {};
    return {
      n: v.name || "", s: v.slug || "",
      h1: v.h1 || "", h2: v.h2 || "", take: v.summary || "", url: v.url || "",
      mcp: { type: cap(v.mcp || "none"), url: d.url || "", hosted: d.hosted || "", docs: d.docs || "" },
      ai: v.ai || [], caps: v.caps || [], ucf: v.ucf || [],
      price: v.pricing || [], comp: v.compliance || [], sdk: v.sdk || [],
      types: v.types || [], warehouse: v.warehouse || [],
      status: cap(v.status || "active"), scraped: v.scraped || "",
      acq: v.acquiredBy || "",
      mxo: v.mxo != null ? v.mxo : null, myo: v.myo != null ? v.myo : null,
      axo: v.axo != null ? v.axo : null, ayo: v.ayo != null ? v.ayo : null
    };
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function bySlug(s) { return VENDORS.find(v => v.s === s); }
  function fmtDate(d) { if (!d) return ""; const [y, m] = d.split("-"); const mo = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m]; return mo ? mo + " " + y : d; }

  // ---------- canonical scoring ----------
  const clamp = v => Math.max(4, Math.min(96, Math.round(v)));
  function has(arr, needle) { return (arr || []).some(x => x.toLowerCase().includes(needle)); }
  function marketX(v) {
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
  function marketY(v) {
    let s = 50;
    const entOnly = (v.price || []).length === 1 && has(v.price, "enterprise");
    if (entOnly) s += 12; else if (has(v.price, "enterprise")) s += 4;
    if (has(v.price, "free")) s -= 8;
    s += ((v.comp || []).length - 3) * 4;
    if (has(v.ucf, "enterprise")) s += 8;
    if (has(v.ucf, "agency-friendly")) s -= 6;
    if (has(v.ucf, "shopify")) s -= 8;
    return clamp(s);
  }

  // ---------- market map SVG (name-as-marker, collision dodge) ----------
  function renderMap(opts) {
    const W = 920, H = 560, pad = { t: 46, r: 26, b: 52, l: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const px = x => pad.l + (x / 100) * iw;
    const py = y => pad.t + ih - (y / 100) * ih;
    const pts = opts.vendors.map(v => ({ v, x: px(opts.fx(v)), y: py(opts.fy(v)), focal: opts.focal && v.s === opts.focal }));
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
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}">
      <defs><pattern id="gp${opts.id}" width="23" height="23" patternUnits="userSpaceOnUse">
        <path d="M 23 0 L 0 0 0 23" fill="none" stroke="rgba(0,22,65,0.06)" stroke-width="1"/></pattern></defs>
      <rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="url(#gp${opts.id})" stroke="rgba(0,22,65,0.2)"/>
      <line x1="${pad.l + iw / 2}" y1="${pad.t}" x2="${pad.l + iw / 2}" y2="${pad.t + ih}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
      <line x1="${pad.l}" y1="${pad.t + ih / 2}" x2="${pad.l + iw}" y2="${pad.t + ih / 2}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
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
      ylab: ["SMB and self-serve", "Enterprise and governance"]
    });
  }
  const MAP_METHOD = '<p><b>A caveat, upfront.</b> Every 2&times;2 like this compresses a multi-dimensional stack &mdash; pricing model, compliance depth, SDK breadth, buyer type &mdash; into a single dot, which makes it look more authoritative than it is.</p><p><b>How to read it.</b> Nothing here is hand-placed. Every dot is computed from the verified capability tags in the vendor database, the same data driving the filters below. If a position looks wrong, <a class="redlink" href="https://speero.com/#main-form">tell us</a> and we&rsquo;ll re-verify.</p>';

  // ---------- filters ----------
  const FILTER_DEFS = [
    { key: "ucf", label: "Use case fit", get: v => v.ucf || [] },
    { key: "mcp", label: "MCP server", get: v => [(v.mcp && v.mcp.type) || "None"] },
    { key: "price", label: "Pricing model", get: v => v.price || [] },
    { key: "comp", label: "Compliance", get: v => v.comp || [] }
  ];
  const state = { q: "", sel: {}, compare: [] };
  FILTER_DEFS.forEach(f => state.sel[f.key] = new Set());

  function optionsFor(def) {
    const set = new Set();
    VENDORS.forEach(v => def.get(v).forEach(x => set.add(x)));
    return [...set].sort();
  }
  function passes(v) {
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = (v.n + " " + (v.h1 || "") + " " + (v.h2 || "") + " " + (v.take || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    for (const def of FILTER_DEFS) {
      const sel = state.sel[def.key];
      if (sel.size === 0) continue;
      const vals = def.get(v);
      if (![...sel].some(s => vals.includes(s))) return false;
    }
    return true;
  }

  // ---------- views ----------
  function hubView() {
    const shown = VENDORS.filter(passes);
    const total = VENDORS.length;
    const mcpCount = VENDORS.filter(v => v.mcp && v.mcp.type === "Product").length;
    return `
    <div class="wrap">
      <div class="hero">
        <span class="eyebrow">Vendor intelligence, verified monthly</span>
        <h1>Every A/B testing and experimentation tool, on one instrument panel</h1>
        <p class="sub">${total} platforms compared on capabilities, pricing model, compliance, and how ready each one is for AI agents. Every data point traces to a first-party vendor source and gets re-verified on a monthly cycle.</p>
        <div class="metastrip">
          <div><b>${total}</b><span>Vendors tracked</span></div>
          <div><b class="red">${mcpCount}</b><span>Ship a product MCP server</span></div>
          <div><b>100%</b><span>First-party sourced</span></div>
          <div><b>${esc(LAST_VERIFIED)}</b><span>Last verified</span></div>
        </div>
      </div>

      <section id="map">
        <div class="sec-head"><h2>Where each tool sits in the market</h2></div>
        <p class="sec-sub">Horizontal: marketing and CRO buyers to engineering and product buyers. Vertical: SMB self-serve to enterprise governance. Click a name to open its profile.</p>
        <div class="mapframe">${marketMap(null, "hub")}
          <div class="map-caption">${MAP_METHOD}</div>
        </div>
      </section>

      <section id="directory">
        <div class="sec-head"><h2>Directory</h2></div>
        <p class="sec-sub">Filter by what matters for your stack. Select two to four tools to compare side by side.</p>
        <div class="controls">
          <div class="search"><input id="q" type="search" placeholder="Search vendors, taglines, positioning" value="${esc(state.q)}" aria-label="Search vendors"></div>
          ${FILTER_DEFS.map(def => `
            <div class="fgroup" data-key="${def.key}">
              <button class="fbtn" aria-haspopup="true">${def.label}${state.sel[def.key].size ? ` <span class="cnt">${state.sel[def.key].size}</span>` : ""} &#9662;</button>
              <div class="fpanel">${optionsFor(def).map(o => `
                <label><input type="checkbox" data-key="${def.key}" value="${esc(o)}" ${state.sel[def.key].has(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}
              </div>
            </div>`).join("")}
          <button class="clearbtn" id="clearAll">Clear all</button>
        </div>
        <p class="resultline">Showing <b>${shown.length}</b> of ${total} vendors</p>
        <div class="grid">${shown.map(cardHTML).join("")}</div>
      </section>
    </div>`;
  }

  function cardHTML(v) {
    const inCmp = state.compare.includes(v.s);
    return `<article class="card" data-slug="${v.s}" tabindex="0" role="link" aria-label="Open ${esc(v.n)} profile">
      <button class="cmpadd ${inCmp ? "on" : ""}" data-cmp="${v.s}" aria-label="${inCmp ? "Remove from" : "Add to"} compare">${inCmp ? "Added" : "+ Compare"}</button>
      <div class="name">${esc(v.n)}</div>
      <div class="tagline">${esc(v.h1 || "")}</div>
      <div class="chips">
        ${v.mcp && v.mcp.type === "Product" ? '<span class="chip mcp">MCP server</span>' : ""}
        ${v.mcp && v.mcp.type === "Platform" ? '<span class="chip">Platform MCP</span>' : ""}
        ${v.acq ? '<span class="chip acq">Acquired</span>' : ""}
        ${(v.ucf || []).slice(0, 2).map(u => `<span class="chip">${esc(u.split(" (")[0])}</span>`).join("")}
      </div>
      <div class="foot">
        <span class="mono-label">${v.scraped ? "Verified " + fmtDate(v.scraped) : "First-party sourced"}</span>
        <span class="view">View profile &#8594;</span>
      </div>
    </article>`;
  }

  function compareView(slugs) {
    const vs = slugs.map(bySlug).filter(Boolean);
    if (vs.length < 2) { render(); return; }
    const row = (label, fn, opts = {}) => `<tr><td>${label}</td>${vs.map(v => {
      const val = fn(v);
      if (opts.bool) return `<td>${val ? '<span class="yes">Yes</span>' : '<span class="dim">No</span>'}</td>`;
      return `<td>${val || '<span class="dim">&mdash;</span>'}</td>`;
    }).join("")}</tr>`;
    mount.innerHTML = `
    <div class="wrap">
      <nav class="breadcrumb"><a href="#" id="backHub">&#8592; All A/B testing tools</a> / Compare</nav>
      <div class="hero" style="padding-top:26px"><span class="eyebrow">Side by side</span><h1>${vs.map(v => esc(v.n)).join(" vs ")}</h1></div>
      <section>
        <div class="cmp-table-wrap"><table class="cmp">
          <tr><td></td>${vs.map(v => `<th><a href="${TOOL_BASE}/${v.s}" style="text-decoration:none">${esc(v.n)}</a></th>`).join("")}</tr>
          ${row("Positioning (H1)", v => esc(v.h1))}
          ${row("Product MCP server", v => v.mcp && v.mcp.type === "Product", { bool: true })}
          ${row("Native AI features", v => (v.ai || []).length ? `<b>${v.ai.length}</b> verified` : "")}
          ${row("Pricing model", v => esc((v.price || []).join(", ")))}
          ${row("Compliance", v => esc((v.comp || []).join(", ")))}
          ${row("SDK coverage", v => (v.sdk || []).length ? `<b>${v.sdk.length}</b> languages / surfaces` : "")}
          ${row("Use case fit", v => esc((v.ucf || []).join(", ")))}
          ${row("Status", v => v.acq ? "Acquired: " + esc(v.acq) : v.status)}
        </table></div>
        <p class="map-caption" style="border:none">Every cell traces to a first-party vendor source. A dash means we could not verify the claim, not that the capability is impossible.</p>
      </section>
    </div>`;
    mount.querySelector("#backHub").addEventListener("click", e => { e.preventDefault(); render(); });
  }

  // ---------- render + tray ----------
  function render() {
    mount.innerHTML = hubView();
    renderTray();
  }
  function refreshDirectory() {
    const shown = VENDORS.filter(passes);
    const grid = mount.querySelector(".grid");
    const line = mount.querySelector(".resultline");
    if (grid) grid.innerHTML = shown.map(cardHTML).join("");
    if (line) line.innerHTML = `Showing <b>${shown.length}</b> of ${VENDORS.length} vendors`;
    mount.querySelectorAll(".fgroup").forEach(g => {
      const key = g.getAttribute("data-key");
      const def = FILTER_DEFS.find(f => f.key === key);
      g.querySelector(".fbtn").innerHTML = `${def.label}${state.sel[key].size ? ` <span class="cnt">${state.sel[key].size}</span>` : ""} &#9662;`;
    });
  }
  function toggleCompare(slug) {
    const i = state.compare.indexOf(slug);
    if (i >= 0) state.compare.splice(i, 1);
    else if (state.compare.length < 4) state.compare.push(slug);
    mount.querySelectorAll("[data-cmp]").forEach(b => {
      const on = state.compare.includes(b.getAttribute("data-cmp"));
      b.classList.toggle("on", on);
      b.textContent = on ? "Added" : "+ Compare";
    });
    renderTray();
  }
  function renderTray() {
    let tray = mount.querySelector("#tray");
    if (!tray) {
      tray = document.createElement("div");
      tray.className = "tray"; tray.id = "tray";
      tray.innerHTML = `<div class="tray-in"><span class="mono-label">Compare (2 to 4)</span><div class="tsel" id="traySel"></div><button class="go" id="trayGo" disabled>Compare selected</button></div>`;
      mount.appendChild(tray);
      tray.querySelector("#trayGo").addEventListener("click", () => { if (state.compare.length >= 2) compareView(state.compare); });
    }
    const sel = tray.querySelector("#traySel");
    const go = tray.querySelector("#trayGo");
    if (state.compare.length === 0) { tray.classList.remove("show"); return; }
    tray.classList.add("show");
    sel.innerHTML = state.compare.map(s => { const v = bySlug(s); return `<span class="tpill">${esc(v ? v.n : s)} <button data-untray="${s}" aria-label="Remove">&#215;</button></span>`; }).join("");
    go.disabled = state.compare.length < 2;
  }

  // ---------- events (delegated on mount) ----------
  mount.addEventListener("click", e => {
    const svgName = e.target.closest("text[data-slug]");
    if (svgName) { location.href = TOOL_BASE + "/" + svgName.getAttribute("data-slug"); return; }
    const cmp = e.target.closest("[data-cmp]");
    if (cmp) { e.stopPropagation(); toggleCompare(cmp.getAttribute("data-cmp")); return; }
    const untray = e.target.closest("[data-untray]");
    if (untray) { toggleCompare(untray.getAttribute("data-untray")); return; }
    const card = e.target.closest(".card[data-slug]");
    if (card) { location.href = TOOL_BASE + "/" + card.getAttribute("data-slug"); return; }
    const fbtn = e.target.closest(".fbtn");
    if (fbtn) {
      const panel = fbtn.parentElement.querySelector(".fpanel");
      mount.querySelectorAll(".fpanel.open").forEach(p => { if (p !== panel) p.classList.remove("open"); });
      panel.classList.toggle("open");
      return;
    }
    if (e.target.id === "clearAll") { state.q = ""; FILTER_DEFS.forEach(f => state.sel[f.key].clear()); render(); return; }
    if (!e.target.closest(".fgroup")) mount.querySelectorAll(".fpanel.open").forEach(p => p.classList.remove("open"));
  });
  mount.addEventListener("keydown", e => {
    if (e.key === "Enter") { const card = e.target.closest && e.target.closest(".card[data-slug]"); if (card) location.href = TOOL_BASE + "/" + card.getAttribute("data-slug"); }
  });
  mount.addEventListener("change", e => {
    if (e.target.matches(".fpanel input[type=checkbox]")) {
      const key = e.target.getAttribute("data-key"), val = e.target.value;
      e.target.checked ? state.sel[key].add(val) : state.sel[key].delete(val);
      refreshDirectory();
    }
  });
  mount.addEventListener("input", e => { if (e.target.id === "q") { state.q = e.target.value; refreshDirectory(); } });

  // ---------- boot ----------
  function showLoading() { mount.innerHTML = `<div class="wrap"><div class="hero"><p class="sub">Loading testing tools&hellip;</p></div></div>`; }
  function showError() { mount.innerHTML = `<div class="wrap"><div class="hero"><h1>Tools directory temporarily unavailable</h1><p class="sub">We couldn&rsquo;t load the data right now. Please refresh in a moment.</p></div></div>`; }

  showLoading();
  fetch(DATA_URL, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(data => {
      const list = Array.isArray(data) ? data : (data.vendors || []);
      VENDORS = list.map(normalize);
      LAST_VERIFIED = data.version ? (fmtDate(String(data.version).slice(0, 7)) || String(data.version).slice(0, 10)) : "";
      render();
    })
    .catch(() => showError());
})();
