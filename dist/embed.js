// Speero A/B Testing Tools embed
// Mirrors testing-tools-mockup.html exactly. The only change from the mockup is
// that VENDORS comes from the CDN-hosted JSON (built by the Phase C Airtable sync)
// instead of an inline array, and the modal profile prose reads v.summary from
// that data instead of a local SUMMARIES map.

(function () {
  const MOUNT_ID = "speero-testing-tools";
  const DATA_URL = "https://cdn.jsdelivr.net/gh/speerotools/testing-tools-data@main/testing-tools.json";

  const mount = document.getElementById(MOUNT_ID);
  if (!mount) return;

  let VENDORS = [];

  const MARKUP = `
<div class="container">
  <section class="hero">
    <div class="hero-eyebrow">A/B Testing &amp; Experimentation Tools</div>
    <h1>The tools that actually move the experimentation market in 2026.</h1>
    <p>An opinionated reference to every meaningful platform for A/B testing, personalization, and feature management. Every record is enriched directly from vendor docs, trust pages, and pricing pages through paid Tavily research agents, because aggregator content overstates capabilities and misses recent acquisitions. Refreshed quarterly. Filter by your stack, buyer profile, and the capabilities that matter for AI-era experimentation.</p>
    <div class="hero-stats">
      <div class="stat-item">
        <div class="stat-num" id="toolCount">0</div>
        <div class="stat-label">Tools tracked</div>
      </div>
      <div class="stat-item">
        <div class="stat-num accent" id="mcpCount">0</div>
        <div class="stat-label">With MCP server</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" id="enterpriseCount">0</div>
        <div class="stat-label">SOC 2 Type II certified</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" id="acquiredCount">0</div>
        <div class="stat-label">Recently acquired</div>
      </div>
    </div>
  </section>

  <div class="toolbar">
    <div class="toolbar-inner">
      <div class="search-wrap">
        <input type="text" id="search" placeholder="Search by name, positioning, or AI capability...">
      </div>
      <div class="sort-wrap">
        <select id="sort">
          <option value="alpha">Alphabetical</option>
          <option value="mcp">MCP-enabled first</option>
          <option value="ai">Most AI capabilities</option>
          <option value="compliance">Most compliance certs</option>
        </select>
      </div>
    </div>
  </div>

  <section class="filters">
    <div class="filter-row">
      <div class="filter-row-label">Use Case Fit</div>
      <div class="filter-chips" data-filter-group="ucf"></div>
    </div>

    <div class="filter-row">
      <div class="filter-row-label">MCP Server</div>
      <div class="filter-chips" data-filter-group="mcp">
        <button class="chip" data-filter-value="product">Product-level MCP</button>
        <button class="chip" data-filter-value="platform">Platform-level MCP</button>
        <button class="chip" data-filter-value="none">No MCP</button>
      </div>
    </div>

    <div class="filter-row">
      <div class="filter-row-label">Pricing Model</div>
      <div class="filter-chips" data-filter-group="pricing"></div>
    </div>

    <div class="filter-row">
      <div class="filter-row-label">Compliance &amp; Security</div>
      <div class="filter-chips" data-filter-group="compliance"></div>
    </div>

    <button class="more-filters-btn" id="moreFiltersBtn">More filters: AI capabilities, SDKs, integrations, warehouses</button>

    <div class="more-filters" id="moreFilters">
      <div class="filter-row">
        <div class="filter-row-label">AI / Agentic Capabilities</div>
        <div class="filter-chips" data-filter-group="ai"></div>
      </div>
      <div class="filter-row">
        <div class="filter-row-label">Data Warehouse Support</div>
        <div class="filter-chips" data-filter-group="warehouse"></div>
      </div>
      <div class="filter-row" style="margin-bottom: 0;">
        <div class="filter-row-label">Status</div>
        <div class="filter-chips" data-filter-group="status">
          <button class="chip active" data-filter-value="active">Active</button>
          <button class="chip" data-filter-value="acquired">Acquired</button>
          <button class="chip" data-filter-value="discontinued">Discontinued</button>
        </div>
      </div>
    </div>

    <div class="result-bar">
      <div class="result-count"><strong id="resultCount">0</strong> tools match your filters</div>
      <button class="clear-all" id="clearAll">Clear all filters</button>
    </div>
  </section>

  <section class="grid" id="grid"></section>
</div>

<div class="modal-backdrop" id="modalBackdrop">
  <div class="modal" id="modal">
    <button class="modal-close" id="modalClose">&times;</button>
    <div class="modal-header" id="modalHeader"></div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
`;

  // ============ STATE ============
  const state = {
    search: "",
    sort: "alpha",
    filters: {
      ucf: new Set(),
      mcp: new Set(),
      pricing: new Set(),
      compliance: new Set(),
      ai: new Set(),
      warehouse: new Set(),
      status: new Set(["active"])
    }
  };

  // ============ TAXONOMY ============
  function buildTaxonomy() {
    const tax = { ucf: new Map(), pricing: new Map(), compliance: new Map(), ai: new Map(), warehouse: new Map() };
    VENDORS.forEach(v => {
      if (v.status !== "active") return;
      v.ucf.forEach(t => tax.ucf.set(t, (tax.ucf.get(t) || 0) + 1));
      v.pricing.forEach(t => tax.pricing.set(t, (tax.pricing.get(t) || 0) + 1));
      v.compliance.forEach(t => tax.compliance.set(t, (tax.compliance.get(t) || 0) + 1));
      v.ai.forEach(t => tax.ai.set(t, (tax.ai.get(t) || 0) + 1));
      v.warehouse.forEach(t => tax.warehouse.set(t, (tax.warehouse.get(t) || 0) + 1));
    });
    return tax;
  }

  function renderFilterChips() {
    const tax = buildTaxonomy();
    const renderGroup = (group, sortByCount = true) => {
      const container = mount.querySelector(`[data-filter-group="${group}"]`);
      if (!container || container.children.length > 0) {
        if (group === "mcp" || group === "status") return;
      }
      const entries = Array.from(tax[group].entries());
      if (sortByCount) entries.sort((a, b) => b[1] - a[1]);
      container.innerHTML = entries.map(([name, count]) =>
        `<button class="chip" data-filter-value="${escapeAttr(name)}">${escapeHtml(name)} <span class="chip-count">${count}</span></button>`
      ).join("");
    };
    renderGroup("ucf");
    renderGroup("pricing");
    renderGroup("compliance");
    renderGroup("ai");
    renderGroup("warehouse");
  }

  function escapeAttr(s) {
    return String(s).replace(/[&"<>]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function escapeHtml(s) {
    return String(s).replace(/[&"<>]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  // ============ FILTERING ============
  function matchesFilters(v) {
    if (state.filters.status.size > 0 && !state.filters.status.has(v.status)) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const blob = [v.name, v.h1, v.h2, ...(v.ai || [])].join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (state.filters.ucf.size > 0) {
      if (!v.ucf.some(t => state.filters.ucf.has(t))) return false;
    }
    if (state.filters.mcp.size > 0) {
      if (!state.filters.mcp.has(v.mcp)) return false;
    }
    if (state.filters.pricing.size > 0) {
      if (!v.pricing.some(t => state.filters.pricing.has(t))) return false;
    }
    if (state.filters.compliance.size > 0) {
      for (const c of state.filters.compliance) {
        if (!v.compliance.includes(c)) return false;
      }
    }
    if (state.filters.ai.size > 0) {
      if (!v.ai.some(t => state.filters.ai.has(t))) return false;
    }
    if (state.filters.warehouse.size > 0) {
      if (!v.warehouse.some(t => state.filters.warehouse.has(t))) return false;
    }
    return true;
  }

  function sortVendors(arr) {
    const sorted = [...arr];
    switch (state.sort) {
      case "mcp":
        sorted.sort((a, b) => {
          const order = { product: 0, platform: 1, none: 2 };
          if (order[a.mcp] !== order[b.mcp]) return order[a.mcp] - order[b.mcp];
          return a.name.localeCompare(b.name);
        });
        break;
      case "ai":
        sorted.sort((a, b) => (b.ai.length - a.ai.length) || a.name.localeCompare(b.name));
        break;
      case "compliance":
        sorted.sort((a, b) => (b.compliance.length - a.compliance.length) || a.name.localeCompare(b.name));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }

  // ============ RENDER ============
  function render() {
    const matched = VENDORS.filter(matchesFilters);
    const sorted = sortVendors(matched);
    const grid = mount.querySelector("#grid");

    mount.querySelector("#resultCount").textContent = matched.length;

    if (sorted.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>No tools match these filters.</h3><p>Try removing some criteria.</p></div>`;
      return;
    }

    grid.innerHTML = sorted.map(v => {
      const mcpBadge = v.mcp === "product"
        ? `<span class="badge badge-mcp">MCP server</span>`
        : v.mcp === "platform"
        ? `<span class="badge badge-mcp-platform">MCP (platform)</span>`
        : "";
      const aiBadge = v.ai.length >= 4 ? `<span class="badge badge-ai">AI-rich</span>` : "";
      const warehouseBadge = v.warehouse.length >= 3 ? `<span class="badge badge-warehouse">Warehouse-native</span>` : "";
      const soc2Badge = v.compliance.includes("SOC 2 Type II") && v.compliance.includes("HIPAA") ? `<span class="badge badge-soc2">Enterprise-ready</span>` : "";
      const statusBadge = v.status !== "active"
        ? `<span class="card-status ${v.status}">${v.status === "acquired" ? "Acquired" : v.status === "discontinued" ? "Discontinued" : v.status}</span>`
        : "";
      const ucfChips = v.ucf.slice(0, 3).map(t => `<span class="ucf-tag">${escapeHtml(t)}</span>`).join("");
      const extraCount = v.ucf.length > 3 ? `<span class="ucf-tag">+${v.ucf.length - 3}</span>` : "";
      const pricingDisplay = v.pricing.length > 0
        ? (v.pricing.includes("Free") ? "Free tier" : v.pricing.includes("Enterprise (custom)") ? "Enterprise" : v.pricing[0])
        : "";

      return `
        <article class="card" data-slug="${escapeAttr(v.slug)}">
          <div class="card-head">
            <div class="card-name">${escapeHtml(v.name)}</div>
            ${statusBadge}
          </div>
          <div class="card-badges">${mcpBadge}${aiBadge}${warehouseBadge}${soc2Badge}</div>
          <div class="card-h1">${escapeHtml(v.h1)}</div>
          <div class="card-ucf">${ucfChips}${extraCount}</div>
          <div class="card-footer">
            <div class="card-pricing">${escapeHtml(pricingDisplay)}</div>
            <div class="card-cta">View details &rarr;</div>
          </div>
        </article>
      `;
    }).join("");

    mount.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", () => openModal(card.dataset.slug));
    });
  }

  // ============ MODAL ============
  function openModal(slug) {
    const v = VENDORS.find(x => x.slug === slug);
    if (!v) return;
    const header = mount.querySelector("#modalHeader");
    const body = mount.querySelector("#modalBody");

    const statusBadge = v.status !== "active"
      ? `<span class="card-status ${v.status}" style="position:relative;top:0;">${v.status === "acquired" ? `Acquired by ${escapeHtml(v.acquiredBy || "")}` : "Discontinued"}</span>`
      : "";

    header.innerHTML = `
      <div class="modal-name">${escapeHtml(v.name)}</div>
      <div class="modal-h1">${escapeHtml(v.h1)}</div>
      <div class="modal-h2">${escapeHtml(v.h2)}</div>
      <div class="modal-meta">
        <a href="${escapeAttr(v.url)}" target="_blank" rel="noopener" class="modal-cta">Visit website &rarr;</a>
        ${statusBadge}
      </div>
    `;

    const sections = [];

    // Editorial profile prose, sourced from the Airtable AI Features Summary field.
    const summary = v.summary;
    if (summary) {
      sections.push(`
        <div class="modal-section">
          <div class="modal-section-label">Profile</div>
          <div class="modal-profile">${escapeHtml(summary)}</div>
        </div>
      `);
    }

    if (v.mcp !== "none" && v.mcpDetail) {
      sections.push(`
        <div class="modal-section">
          <div class="modal-section-label">MCP Server</div>
          <div class="mcp-detail-box">
            <div class="mcp-detail-row"><strong>Type</strong><span>${v.mcp === "product" ? "Product-level MCP" : "Platform-level MCP"}</span></div>
            <div class="mcp-detail-row"><strong>Hosted</strong><span>${escapeHtml(v.mcpDetail.hosted)}</span></div>
            <div class="mcp-detail-row"><strong>Endpoint</strong><span style="font-family:monospace;font-size:11px;">${escapeHtml(v.mcpDetail.url)}</span></div>
            ${v.mcpDetail.docs ? `<div class="mcp-detail-row"><strong>Docs</strong><a href="${escapeAttr(v.mcpDetail.docs)}" target="_blank" rel="noopener" style="color:var(--speero-red);font-size:13px;">${escapeHtml(v.mcpDetail.docs)}</a></div>` : ''}
          </div>
        </div>
      `);
    }

    if (v.ucf.length) {
      sections.push(`
        <div class="modal-section">
          <div class="modal-section-label">Use Case Fit</div>
          <div class="modal-tags">${v.ucf.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }

    const grid = [];
    if (v.ai.length) {
      grid.push(`
        <div>
          <div class="modal-section-label">AI / Agentic Capabilities</div>
          <div class="modal-tags">${v.ai.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }
    if (v.compliance.length) {
      grid.push(`
        <div>
          <div class="modal-section-label">Compliance &amp; Security</div>
          <div class="modal-tags">${v.compliance.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }
    if (v.pricing.length) {
      grid.push(`
        <div>
          <div class="modal-section-label">Pricing Model</div>
          <div class="modal-tags">${v.pricing.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }
    if (v.warehouse.length) {
      grid.push(`
        <div>
          <div class="modal-section-label">Data Warehouses</div>
          <div class="modal-tags">${v.warehouse.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }
    if (grid.length) {
      sections.push(`<div class="modal-section"><div class="modal-grid">${grid.join("")}</div></div>`);
    }

    if (v.sdk.length) {
      sections.push(`
        <div class="modal-section">
          <div class="modal-section-label">SDK Languages (${v.sdk.length})</div>
          <div class="modal-tags">${v.sdk.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }

    if (v.integrations.length) {
      sections.push(`
        <div class="modal-section">
          <div class="modal-section-label">Integrations</div>
          <div class="modal-tags">${v.integrations.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>
      `);
    }

    sections.push(`
      <div class="modal-footer-cta">
        <div class="modal-footer-cta-label">Coming soon</div>
        <div class="modal-footer-cta-text"><strong>Read the full Speero analysis of ${escapeHtml(v.name)}</strong><br>Dedicated tool pages with extended editorial, sources, and Speero recommendations launch in Phase E.</div>
      </div>
    `);

    body.innerHTML = sections.join("");
    mount.querySelector("#modalBackdrop").classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    mount.querySelector("#modalBackdrop").classList.remove("open");
    document.body.classList.remove("modal-open");
  }

  // ============ EVENT WIRING ============
  function init() {
    mount.querySelector("#toolCount").textContent = VENDORS.length;
    mount.querySelector("#mcpCount").textContent = VENDORS.filter(v => v.status === "active" && v.mcp !== "none").length;
    mount.querySelector("#enterpriseCount").textContent = VENDORS.filter(v => v.status === "active" && v.compliance.includes("SOC 2 Type II")).length;
    mount.querySelector("#acquiredCount").textContent = VENDORS.filter(v => v.status !== "active").length;

    renderFilterChips();

    mount.querySelectorAll("[data-filter-group]").forEach(group => {
      const groupName = group.dataset.filterGroup;
      group.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        const value = chip.dataset.filterValue;
        const set = state.filters[groupName];
        if (set.has(value)) {
          set.delete(value);
          chip.classList.remove("active");
        } else {
          set.add(value);
          chip.classList.add("active");
        }
        render();
      });
    });

    let searchTimer;
    mount.querySelector("#search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        render();
      }, 150);
    });

    mount.querySelector("#sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });

    mount.querySelector("#moreFiltersBtn").addEventListener("click", () => {
      const panel = mount.querySelector("#moreFilters");
      panel.classList.toggle("open");
      mount.querySelector("#moreFiltersBtn").textContent = panel.classList.contains("open")
        ? "Hide additional filters"
        : "More filters: AI capabilities, SDKs, integrations, warehouses";
    });

    mount.querySelector("#clearAll").addEventListener("click", () => {
      Object.keys(state.filters).forEach(k => state.filters[k].clear());
      state.filters.status.add("active");
      state.search = "";
      mount.querySelector("#search").value = "";
      mount.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"));
      mount.querySelector(`[data-filter-group="status"] [data-filter-value="active"]`).classList.add("active");
      render();
    });

    mount.querySelector("#modalClose").addEventListener("click", closeModal);
    mount.querySelector("#modalBackdrop").addEventListener("click", (e) => {
      if (e.target.id === "modalBackdrop") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    render();
  }

  // ============ BOOT ============
  function showLoading() {
    mount.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading testing tools…</p></div>`;
  }

  function showError() {
    mount.innerHTML = `<div class="error-state"><h3>Tools directory temporarily unavailable</h3><p>We couldn't load the data right now. Please refresh in a moment.</p></div>`;
  }

  function normalize(v) {
    // Guard against missing array/string fields so the mockup logic never throws.
    return {
      slug: v.slug || "",
      name: v.name || "",
      status: v.status || "active",
      acquiredBy: v.acquiredBy || "",
      h1: v.h1 || "",
      h2: v.h2 || "",
      ucf: v.ucf || [],
      mcp: v.mcp || "none",
      mcpDetail: v.mcpDetail || null,
      ai: v.ai || [],
      pricing: v.pricing || [],
      sdk: v.sdk || [],
      integrations: v.integrations || [],
      warehouse: v.warehouse || [],
      compliance: v.compliance || [],
      url: v.url || "",
      summary: v.summary || ""
    };
  }

  showLoading();
  fetch(DATA_URL, { cache: "no-cache" })
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(data => {
      const list = Array.isArray(data) ? data : (data.vendors || []);
      VENDORS = list.map(normalize);
      mount.innerHTML = MARKUP;
      init();
    })
    .catch(() => showError());
})();
