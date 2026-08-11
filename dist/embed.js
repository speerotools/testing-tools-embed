// Speero A/B Testing Tools — hub / directory embed
// Ported from the canonical hub (Speero-AI/ab-testing-tools-hub,
// frontend/speero-testing-tools-hub.html): v2 dot-marker map renderer, the
// Market position / Agent readiness tab switch, and the agentic-readiness map.
// Differences from the canonical, by design: data is fetched from our CDN JSON
// at runtime (not baked inline), and vendor cards link to the real Webflow
// pages at /ab-testing-tools/[slug]. Agentic positions (ax/ay) come straight
// from the payload — Airtable's "Agentic Map X/Y Final" via sync.py — and are
// never re-derived in the browser, matching build_json.py's contract.

(function () {
  const MOUNT_ID = "speero-testing-tools";
  const DATA_URL = (typeof window !== "undefined" && window.SPEERO_TT_DATA_URL) ||
    "https://cdn.jsdelivr.net/gh/speerotools/testing-tools-data@main/testing-tools.json";
  const TOOL_BASE = "/ab-testing-tools";

  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;

  let VENDORS = [];
  let LAST_VERIFIED = "";

  // ---------- normalize production shape -> render shape ----------
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const num = x => (typeof x === "number" ? x : (x != null && x !== "" && !isNaN(+x) ? +x : null));
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
      // agentic positions to plot (Airtable Final); computed + override ride along for drift
      ax: num(v.ax), ay: num(v.ay), axc: num(v.axc), ayc: num(v.ayc),
      axo: num(v.axo), ayo: num(v.ayo), mxo: num(v.mxo), myo: num(v.myo)
    };
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function bySlug(s) { return VENDORS.find(v => v.s === s); }
  function fmtDate(d) { if (!d) return ""; const [y, m] = d.split("-"); const mo = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m]; return mo ? mo + " " + y : d; }

  // ---------- canonical market scoring (JS-side; agentic is baked in payload) ----------
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
  // Agentic positions are Airtable's Final, carried in the payload; never re-derived here.
  function agenticX(v) { if (typeof v.ax === "number") return v.ax; console.warn("[map] no agenticX for " + v.n + " — payload needs a rescore"); return 50; }
  function agenticY(v) { if (typeof v.ay === "number") return v.ay; console.warn("[map] no agenticY for " + v.n + " — payload needs a rescore"); return 50; }

  // ---------- v2 quadrant map SVG (dot marker + ring-search label placement) ----------
  function measure(s, fs) {
    let w = 0;
    for (const ch of s) {
      if ("iljtfrI.,:;'!|".includes(ch)) w += 0.30;
      else if ("mwMW".includes(ch)) w += 0.88;
      else if (ch === " ") w += 0.28;
      else if (ch >= "A" && ch <= "Z") w += 0.66;
      else w += 0.55;
    }
    return w * fs;
  }
  const LABEL_SLOTS = (() => {
    const out = [];
    for (const r of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const gap = 7 + r * 9, rise = r * 11;
      out.push({ dx: gap, dy: 3.8 + rise, anc: "start" });
      out.push({ dx: -gap, dy: 3.8 + rise, anc: "end" });
      if (r > 0) {
        out.push({ dx: gap, dy: 3.8 - rise, anc: "start" });
        out.push({ dx: -gap, dy: 3.8 - rise, anc: "end" });
      }
      out.push({ dx: 0, dy: -(8 + rise), anc: "middle" });
      out.push({ dx: 0, dy: 14 + rise, anc: "middle" });
    }
    return out;
  })();
  function renderMap(opts) {
    const W = opts.w || 1000, H = opts.h || 640;
    const pad = { t: 54, r: 30, b: 58, l: 36 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const px = x => pad.l + (x / 100) * iw;
    const py = y => pad.t + ih - (y / 100) * ih;
    const pts = opts.vendors.map(v => ({ v, x: px(opts.fx(v)), y: py(opts.fy(v)), focal: !!(opts.focal && v.s === opts.focal) }));
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    pts.forEach(p => { p.density = pts.reduce((n, q) => n + (q !== p && near(p, q) < 70 ? 1 : 0), 0); });
    const order = pts.slice().sort((a, b) => (b.focal - a.focal) || (b.density - a.density) || (a.y - b.y) || (a.x - b.x));
    const boxes = [];
    const hits = b => boxes.some(o => b.x1 < o.x2 + 7 && b.x2 > o.x1 - 7 && b.y1 < o.y2 + 1.5 && b.y2 > o.y1 - 1.5);
    const dotBox = p => { const r = (p.focal ? 7 : 3.4) + 1.6; return { p, x1: p.x - r, x2: p.x + r, y1: p.y - r, y2: p.y + r }; };
    const dots_ = pts.map(dotBox);
    const hitsDot = (b, self) => dots_.some(d => d.p !== self && b.x1 < d.x2 && b.x2 > d.x1 && b.y1 < d.y2 && b.y2 > d.y1);
    for (const p of order) {
      const fs = p.focal ? 14 : 11.5;
      const w = measure(p.v.n, fs), h = fs * 1.06;
      let best = null;
      for (const s of LABEL_SLOTS) {
        const ax = p.x + s.dx, ay = p.y + s.dy;
        const x1 = s.anc === "start" ? ax : s.anc === "end" ? ax - w : ax - w / 2;
        const box = { x1, x2: x1 + w, y1: ay - h * 0.78, y2: ay + h * 0.24 };
        if (box.x1 < pad.l + 3 || box.x2 > pad.l + iw - 3) continue;
        if (box.y1 < pad.t + 3 || box.y2 > pad.t + ih - 3) continue;
        if (hits(box) || hitsDot(box, p)) continue;
        best = { ax, ay, anc: s.anc, box }; break;
      }
      if (!best) { const ax = p.x + 7, ay = p.y + 3.8; best = { ax, ay, anc: "start", box: { x1: ax, x2: ax + w, y1: ay - h * 0.78, y2: ay + h * 0.24 } }; }
      p.tx = best.ax; p.ty = best.ay; p.anc = best.anc; p.fs = fs;
      const cx = Math.max(best.box.x1, Math.min(p.x, best.box.x2));
      const cy = Math.max(best.box.y1, Math.min(p.y, best.box.y2));
      p.lead = Math.hypot(p.x - cx, p.y - cy) > 11;
      boxes.push(best.box);
    }
    const leaders = pts.filter(p => p.lead).map(p => {
      const tx = p.anc === "start" ? p.tx - 2.5 : p.anc === "end" ? p.tx + 2.5 : p.tx;
      return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(p.ty - 3.4).toFixed(1)}" stroke="${p.focal ? "rgba(255,0,73,.55)" : "rgba(0,22,65,.22)"}" stroke-width="1"/>`;
    }).join("");
    const dots = pts.map(p => p.focal
      ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6.5" fill="none" stroke="#FF0049" stroke-width="1.4" opacity=".5"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="#FF0049"/>`
      : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="#001641" opacity=".62"/>`).join("");
    const labels = pts.map(p => {
      const cls = (p.focal ? "fill:#FF0049;font-weight:900" : "fill:#001641;font-weight:300") + ";paint-order:stroke;stroke:#FAFAF7;stroke-width:3.2px;stroke-linejoin:round";
      return `<g class="mlabel" data-slug="${p.v.s}" style="cursor:pointer"><title>${esc(p.v.n)}</title><text x="${p.tx.toFixed(1)}" y="${p.ty.toFixed(1)}" text-anchor="${p.anc}" style="${cls};font-size:${p.fs}px;font-family:Poppins,Arial,sans-serif">${esc(p.v.n)}</text></g>`;
    }).join("");
    const q = opts.quads || [];
    const quadLabels = q.map((t, i) => {
      const qx = i % 2 === 0 ? pad.l + 9 : pad.l + iw - 9;
      const qy = i < 2 ? pad.t + 17 : pad.t + ih - 9;
      const anc = i % 2 === 0 ? "start" : "end";
      return `<text x="${qx}" y="${qy}" text-anchor="${anc}" style="fill:rgba(255,0,73,.75);font-weight:900;font-style:italic;font-size:10px;letter-spacing:.12em;font-family:Poppins,Arial,sans-serif">${t.toUpperCase()}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}">
      <defs><pattern id="gp${opts.id}" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M 23 0 L 0 0 0 23" fill="none" stroke="rgba(0,22,65,0.06)" stroke-width="1"/></pattern></defs>
      <rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="url(#gp${opts.id})" stroke="rgba(0,22,65,0.2)"/>
      <line x1="${pad.l + iw / 2}" y1="${pad.t}" x2="${pad.l + iw / 2}" y2="${pad.t + ih}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
      <line x1="${pad.l}" y1="${pad.t + ih / 2}" x2="${pad.l + iw}" y2="${pad.t + ih / 2}" stroke="rgba(0,22,65,0.2)" stroke-dasharray="4 4"/>
      ${quadLabels}${leaders}${dots}${labels}
      <text x="${pad.l}" y="${H - 18}" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">&#8592; ${esc(opts.xlab[0]).toUpperCase()}</text>
      <text x="${pad.l + iw}" y="${H - 18}" text-anchor="end" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">${esc(opts.xlab[1]).toUpperCase()} &#8594;</text>
      <text x="${pad.l - 10}" y="${pad.t + ih}" transform="rotate(-90 ${pad.l - 10} ${pad.t + ih})" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">&#8592; ${esc(opts.ylab[0]).toUpperCase()}</text>
      <text x="${pad.l - 10}" y="${pad.t + 10}" transform="rotate(-90 ${pad.l - 10} ${pad.t + 10})" text-anchor="end" style="fill:rgba(0,22,65,.6);font-size:10.5px;letter-spacing:.1em;font-family:Poppins,Arial,sans-serif">${esc(opts.ylab[1]).toUpperCase()} &#8594;</text>
    </svg>`;
  }
  function marketMap(focal, id) {
    return renderMap({
      id, title: "Market position map", focal,
      vendors: VENDORS.filter(v => v.status !== "Discontinued"),
      fx: v => (v.mxo != null ? clamp(v.mxo) : marketX(v)),
      fy: v => (v.myo != null ? clamp(v.myo) : marketY(v)),
      xlab: ["Marketing and CRO teams", "Engineering and product teams"],
      ylab: ["SMB and self-serve", "Enterprise and governance"], quads: []
    });
  }
  function agenticMap(focal, id) {
    return renderMap({
      id, title: "Agentic readiness map", focal,
      vendors: VENDORS.filter(v => v.status !== "Discontinued"),
      fx: agenticX, fy: agenticY,
      xlab: ["Closed to agents", "Open: MCP server plus SDK breadth"],
      ylab: ["Fewer native AI features", "More native AI features"],
      quads: ["Smart but manual", "Agentic-native", "Pre-AI / manual", "Programmable, low AI"]
    });
  }
  const MAP_METHOD = 'How to read this: positions are computed from verified capability tags in our vendor database, not vendor claims or opinion scores. Weights are directional. If you think a position is wrong, <a class="redlink" href="https://speero.com/#main-form">tell us</a> and we will re-verify the underlying tags.';
  function mapTabs(focal, idp) {
    const mid = idp + "-m", aid = idp + "-a";
    return `<div class="mapgroup" data-mapgroup>
      <div class="maptabs" role="tablist" aria-label="Quadrant maps">
        <button class="maptab" role="tab" data-maptab="market" aria-selected="true" aria-controls="${mid}">Market position</button>
        <button class="maptab" role="tab" data-maptab="agentic" aria-selected="false" aria-controls="${aid}">Agent readiness</button>
      </div>
      <div class="mappanel" data-mappanel="market" id="${mid}" role="tabpanel">
        <p class="map-axis">Horizontal: <b>marketing and CRO buyers</b> to <b>engineering and product buyers</b>. Vertical: <b>SMB self-serve</b> to <b>enterprise governance</b>.</p>
        <div class="mapframe">${marketMap(focal, mid)}</div>
      </div>
      <div class="mappanel" data-mappanel="agentic" id="${aid}" role="tabpanel" hidden>
        <p class="map-axis">Horizontal: <b>closed to agents</b> to <b>open MCP server plus SDK breadth</b>. Vertical: <b>fewer</b> to <b>more native AI features</b>.</p>
        <div class="mapframe">${agenticMap(focal, aid)}</div>
      </div>
      <p class="map-caption">${MAP_METHOD}</p>
    </div>`;
  }

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
          <div><b><span class="red">${mcpCount}</span></b><span>Ship a product MCP server</span></div>
          <div><b>100%</b><span>First-party sourced</span></div>
          <div><b>${esc(LAST_VERIFIED)}</b><span>Last verified</span></div>
        </div>
      </div>

      <section id="map">
        <div class="sec-head"><h2>The two maps</h2></div>
        <p class="sec-sub">Where each tool sits in the market, and how ready it is for AI agents. Switch between the two views. Click any name to open its profile.</p>
        ${mapTabs(null, "hub")}
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

  // ---------- map tab switch (toggle panels, never re-plot) ----------
  function switchTab(group, which) {
    group.querySelectorAll(".maptab").forEach(t => t.setAttribute("aria-selected", String(t.getAttribute("data-maptab") === which)));
    group.querySelectorAll(".mappanel").forEach(p => { p.hidden = p.getAttribute("data-mappanel") !== which; });
  }

  // ---------- events (delegated on mount) ----------
  mount.addEventListener("click", e => {
    const maptab = e.target.closest(".maptab");
    if (maptab) { switchTab(maptab.closest("[data-mapgroup]"), maptab.getAttribute("data-maptab")); return; }
    const mlabel = e.target.closest(".mlabel[data-slug]");
    if (mlabel) { location.href = TOOL_BASE + "/" + mlabel.getAttribute("data-slug"); return; }
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

  // ---------- hub ItemList JSON-LD (Phase E) — declares the 34 children ----------
  function injectItemList() {
    document.head.querySelectorAll('script[data-seo-ld="itemlist"]').forEach(s => s.remove());
    const items = VENDORS.map((v, i) => ({
      "@type": "ListItem", position: i + 1, name: v.n,
      url: "https://speero.com" + TOOL_BASE + "/" + v.s
    }));
    const obj = { "@context": "https://schema.org", "@type": "ItemList",
      name: "A/B testing and experimentation tools", numberOfItems: items.length, itemListElement: items };
    const s = document.createElement("script");
    s.type = "application/ld+json"; s.setAttribute("data-seo-ld", "itemlist");
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

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
      injectItemList();
      render();
    })
    .catch(() => showError());
})();
