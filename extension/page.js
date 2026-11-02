const API = "https://ecocart-ai-backend.onrender.com";
const $ = (id) => document.getElementById(id);

// Materials checked when looking for greener alternatives (ones missing in DB are skipped)
const CANDIDATES = ["organic_cotton", "hemp", "linen", "tencel", "cotton", "wool", "silk", "viscose_rayon", "denim", "nylon", "polyester", "acrylic"];
const CHIPS = ["cotton", "polyester", "denim", "silk", "wool", "linen", "nylon"];
const GOAL_SCORE = 70; // dashboard target for the average eco score

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pretty = (s) => String(s).replace(/_/g, " ");
const colorFor = (n) => (n >= 70 ? "#1a9b66" : n >= 45 ? "#e29a2e" : "#d65353");
const skeleton = () => `<div class="skel"><i style="width:45%"></i><i style="width:80%"></i><i style="width:60%"></i><i style="width:90%"></i></div>`;
function tierText(score) { return score >= 70 ? "Good choice" : score >= 45 ? "Average impact" : "High impact"; }
const fmt = (n, d = 1) => (n == null || isNaN(n) ? "N/A" : Number(n).toFixed(d).replace(/\.0+$/, ""));

let currentGarment = "top"; // remembered garment type

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
  if (name === "compare") renderCompare();
  if (name === "bag") renderBag();
  if (name === "stats") renderStats();
}

// ---------- API (with cache) ----------
const cache = new Map();
async function getScore(material) {
  if (cache.has(material)) return cache.get(material);
  const res = await fetch(`${API}/eco-score/${encodeURIComponent(material)}`);
  const data = res.ok ? await res.json() : null;
  cache.set(material, data);
  return data;
}

async function lookupParts(parts) {
  const looked = await Promise.all(parts.map(async (p) => ({ ...p, data: await getScore(p.key).catch(() => null) })));
  return looked.filter((p) => p.data && typeof p.data.eco_score === "number");
}

// ---------- Shared UI pieces ----------
function ringHTML(score, color) {
  const r = 42, c = 2 * Math.PI * r;
  return `<div class="ring">
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle class="bg" cx="48" cy="48" r="${r}"></circle>
      <circle class="fg" cx="48" cy="48" r="${r}" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c - (score / 100) * c}"></circle>
    </svg>
    <div class="num"><b style="color:${color}">${esc(Math.round(score))}</b><small>out of 100</small></div>
  </div>`;
}
function animate(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll(".fg").forEach((el) => (el.style.strokeDashoffset = el.dataset.target));
    root.querySelectorAll(".scale i").forEach((el) => (el.style.left = el.dataset.left + "%"));
  }));
}
function scaleHTML(score) {
  return `<div class="scale"><i data-left="${Math.max(2, Math.min(98, score))}"></i></div>`;
}
function stars(n) {
  return "★".repeat(n) + `<span class="off">${"★".repeat(5 - n)}</span>`;
}

// ---------- Shop links: real search pages on Indian shopping sites ----------
const SHOPS = [
  ["Myntra", (q) => "https://www.myntra.com/" + encodeURIComponent(q.trim().replace(/\s+/g, "-"))],
  ["Amazon", (q) => "https://www.amazon.in/s?k=" + encodeURIComponent(q)],
  ["Flipkart", (q) => "https://www.flipkart.com/search?q=" + encodeURIComponent(q)],
  ["Meesho", (q) => "https://www.meesho.com/search?q=" + encodeURIComponent(q)]
];
const searchName = (label) => String(label || "clothing").split("/")[0].trim().toLowerCase();
function shopLinks(q) {
  return `<div class="chips" style="margin-top:6px">${SHOPS.map(([n, f]) =>
    `<a class="chip" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(f(q))}">${n} ↗</a>`).join("")}</div>`;
}

async function loadAlternatives(score, carbon, exclude, box, garmentLabel, mainKey) {
  const g = searchName(garmentLabel);
  const main = pretty(mainKey || "cotton");
  const certBlock = `
    <div class="sec">🛒 Shop certified options</div>
    <div class="tip"><b>GOTS organic ${esc(g)}</b>${shopLinks("GOTS organic " + g)}</div>
    <div class="tip"><b>OEKO-TEX certified ${esc(g)}</b>${shopLinks("OEKO-TEX certified " + g)}</div>
    <div class="tip">Second-hand is usually the greenest: <b>${esc(g)}</b> on resale apps (OLX, Instagram thrift stores).</div>
    <div class="sub">These open a search on each site. We don't control the results, so check the fabric label of the product you pick.</div>`;

  if (score >= 60) {
    box.innerHTML = `
      <div class="sec">🛒 Find more like this</div>
      <div class="tip"><b>Organic ${esc(main)} ${esc(g)}</b>${shopLinks("organic " + main + " " + g)}</div>` + certBlock;
    return;
  }

  box.innerHTML = skeleton();
  const results = await Promise.all(
    CANDIDATES.filter((m) => !exclude.includes(m)).map((m) => getScore(m).catch(() => null))
  );
  const better = results
    .filter((r) => r && typeof r.eco_score === "number" && r.eco_score > score)
    .sort((a, b) => b.eco_score - a.eco_score)
    .slice(0, 3);

  if (!better.length) {
    box.innerHTML = `<div class="tip">No better material found in our database. Buying second-hand is usually the greenest option.</div>` + certBlock;
    return;
  }
  box.innerHTML =
    `<div class="sec">🌿 Greener alternatives (tap a shop to see products)</div>` +
    better.map((b) => {
      const saving = carbon && b.carbon_footprint_kg_co2e_per_kg != null
        ? Math.round(((carbon - b.carbon_footprint_kg_co2e_per_kg) / carbon) * 100) : null;
      const name = pretty(b.material_label);
      return `<div class="alt" style="display:block">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="info"><b>${esc(name)} ${esc(g)}</b>
            <div class="gain">+${Math.round(b.eco_score - score)} points${saving && saving > 0 ? ` · about ${saving}% less carbon` : ""}</div></div>
          <div class="sc">${esc(b.eco_score)}</div>
        </div>
        ${shopLinks(name + " " + g)}
      </div>`;
    }).join("") + certBlock;
}

// =====================================================================
// SMART SWAPS: similar products with a higher eco score (from our catalog)
// =====================================================================
function injectRecStyles() {
  if (document.getElementById("rcStyle")) return;
  const s = document.createElement("style");
  s.id = "rcStyle";
  s.textContent = `
  .rc-intro{font-size:11.5px;color:#5d7266;margin:-2px 0 8px;line-height:1.4}
  .rc-tools{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
  .rc-card{position:relative;background:#fff;border:1.5px solid #e1ece5;border-radius:16px;padding:11px;margin-bottom:10px;
    box-shadow:0 2px 8px rgba(26,90,60,.06);transition:transform .15s,box-shadow .15s;animation:rcIn .35s ease both}
  .rc-card:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(26,90,60,.12)}
  .rc-card.best{border-color:#1a9b66;background:linear-gradient(180deg,#f2fbf6,#fff 60%)}
  .rc-badge{position:absolute;top:-9px;left:12px;background:#1a9b66;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.6px;
    padding:3px 9px;border-radius:999px;box-shadow:0 2px 6px rgba(26,155,102,.4)}
  .rc-top{display:flex;gap:10px;align-items:center}
  .rc-img{width:56px;height:56px;border-radius:12px;object-fit:cover;flex-shrink:0;background:#eef5f0}
  .rc-ph{width:56px;height:56px;border-radius:12px;flex-shrink:0;background:#eef5f0;display:flex;align-items:center;justify-content:center;font-size:24px}
  .rc-info{flex:1;min-width:0}
  .rc-name{font-weight:700;font-size:12.5px;line-height:1.3;color:#14281f;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .rc-meta{font-size:11px;color:#6a7f73;margin-top:2px}
  .rc-score{width:42px;height:42px;border-radius:50%;color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;
    box-shadow:0 3px 8px rgba(0,0,0,.18)}
  .rc-bar{margin:9px 0 6px;display:flex;align-items:center;gap:8px;font-size:10.5px;color:#6a7f73}
  .rc-bar i{flex:1;height:6px;border-radius:99px;background:#e8f0ea;overflow:hidden;display:block}
  .rc-bar em{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7fd1a8,#1a9b66)}
  .rc-why{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
  .rc-why span{font-size:10.5px;padding:3px 8px;border-radius:999px;background:#eaf6ef;color:#17744d;font-weight:600}
  .rc-why span.p{background:#fff4e1;color:#9a6208}
  .rc-acts{display:flex;flex-wrap:wrap;gap:6px}
  .rc-btn{font:inherit;font-size:11px;font-weight:700;padding:6px 10px;border-radius:9px;border:1.5px solid #cfe2d6;background:#fff;color:#17744d;
    cursor:pointer;text-decoration:none;transition:background .12s}
  .rc-btn:hover{background:#eaf6ef}
  .rc-btn.pri{background:#1a9b66;border-color:#1a9b66;color:#fff}
  .rc-btn.pri:hover{background:#158557}
  .rc-btn:disabled{opacity:.6;cursor:default}
  .rc-empty{padding:14px;border-radius:14px;background:#f4faf6;border:1.5px dashed #bfd9c8;font-size:12px;color:#355445;line-height:1.5}
  .rc-empty b{display:block;font-size:13px;margin-bottom:3px}
  .rc-foot{font-size:10.5px;color:#7a8f84;margin-top:4px;line-height:1.4}
  .rc-shim{height:92px;border-radius:16px;margin-bottom:10px;background:linear-gradient(100deg,#eef5f0 30%,#f8fcf9 50%,#eef5f0 70%);background-size:200% 100%;animation:rcShim 1.2s infinite}
  @keyframes rcShim{to{background-position:-200% 0}}
  @keyframes rcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  `;
  document.head.appendChild(s);
}

async function loadRecommendations(box, q, st) {
  injectRecStyles();
  st = st || { sort: "match", same: false };
  const HEAD = `<div class="sec">🤖 Smart swaps from our catalog</div>`;
  box.innerHTML = `${HEAD}<div class="rc-shim"></div><div class="rc-shim" style="height:70px"></div><div class="sub" id="recWait">Searching our catalog…</div>`;
  const slow = setTimeout(() => { const w = box.querySelector("#recWait"); if (w) w.textContent = "The server is waking up. This can take up to a minute…"; }, 6000);
  const ctl = new AbortController();
  const killer = setTimeout(() => ctl.abort(), 90000);

  try {
    const qs = new URLSearchParams({ name: q.name || "", garment: q.garment || "", limit: "8" });
    if (typeof q.score === "number") qs.set("score", String(q.score));
    if (typeof q.carbon === "number") qs.set("carbon", String(q.carbon));
    if (typeof q.price === "number") {
      qs.set("price", String(q.price));
      if (st.same) qs.set("max_price", String(Math.round(q.price * 1.3)));
    }
    const res = await fetch(`${API}/recommend?${qs}`, { signal: ctl.signal });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || d.error || "failed (" + res.status + ")");
    const recs = d.recommendations || [];

    const retryTools = () => `<div class="rc-tools">${typeof q.price === "number" ? `<span class="chip ${st.same ? "on" : ""}" data-same="1">≈ Similar price</span>` : ""}</div>`;
    const wireTools = () => {
      const sm = box.querySelector("[data-same]");
      if (sm) sm.addEventListener("click", () => { st.same = !st.same; loadRecommendations(box, q, st); });
    };

    if (!recs.length) {
      const g = d.diagnostics
        ? `<div class="rc-foot">Checked ${esc(d.diagnostics.scanned)} products · ${esc(d.diagnostics.with_score)} scored · ${esc(d.diagnostics.higher_score)} greener.</div>` : "";
      box.innerHTML = `${HEAD}${retryTools()}<div class="rc-empty"><b>${st.same ? "Nothing in this price range" : "No swap needed"}</b>${esc(d.note || "No similar product with a higher eco score was found in our catalog.")}</div>${g}`;
      wireTools();
      return;
    }

    const draw = () => {
      const list = recs.slice();
      if (st.sort === "green") list.sort((a, b) => b.score - a.score);
      else if (st.sort === "cheap") list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      else list.sort((a, b) => b.match - a.match);
      const shown = list.slice(0, 5);

      const tools = `<div class="rc-tools">
        <span class="chip ${st.sort === "match" ? "on" : ""}" data-sort="match">★ Best match</span>
        <span class="chip ${st.sort === "green" ? "on" : ""}" data-sort="green">🌿 Greenest</span>
        <span class="chip ${st.sort === "cheap" ? "on" : ""}" data-sort="cheap">₹ Cheapest</span>
        ${typeof q.price === "number" ? `<span class="chip ${st.same ? "on" : ""}" data-same="1">≈ Similar price</span>` : ""}
      </div>`;

      const cards = shown.map((r, i) => {
        const isBest = st.sort === "match" && i === 0;
        const img = r.image && /^https?:/i.test(r.image) ? `<img class="rc-img" src="${esc(r.image)}" alt="">` : `<div class="rc-ph">👕</div>`;
        const sim = Math.round((r.similarity || 0) * 100);
        const why = (r.reasons || []).map((t) => `<span class="${/cheaper/.test(t) ? "p" : ""}">${esc(t)}</span>`).join("");
        const link = r.url && /^https?:/i.test(r.url) ? `<a class="rc-btn pri" target="_blank" rel="noopener" href="${esc(r.url)}">View ↗</a>` : "";
        const shops = SHOPS.slice(0, 2).map(([n, f]) => `<a class="rc-btn" target="_blank" rel="noopener" href="${esc(f(r.name))}">${n} ↗</a>`).join("");
        return `<div class="rc-card ${isBest ? "best" : ""}" style="animation-delay:${i * 60}ms">
          ${isBest ? `<span class="rc-badge">★ BEST PICK</span>` : ""}
          <div class="rc-top">${img}
            <div class="rc-info"><div class="rc-name">${esc(r.name)}</div>
              <div class="rc-meta">${r.price != null ? "₹" + esc(Math.round(r.price)) : "Price n/a"}${r.category ? " · " + esc(r.category) : ""}</div></div>
            <div class="rc-score" style="background:${colorFor(r.score)}">${esc(r.score)}</div>
          </div>
          <div class="rc-bar"><span>${r.same_type ? "Same type" : "Close match"}</span><i><em style="width:${sim}%"></em></i><span>${sim}%</span></div>
          ${why ? `<div class="rc-why">${why}</div>` : ""}
          <div class="rc-acts">${link}${shops}
            <button class="rc-btn" data-act="cmp" data-i="${i}">+ Compare</button>
            <button class="rc-btn" data-act="bag" data-i="${i}">🛍 Add to bag</button></div>
        </div>`;
      }).join("");

      const loose = shown.some((r) => !r.same_type);
      box.innerHTML = HEAD +
        `<div class="rc-intro">Similar products from our catalog with a better eco score${typeof q.score === "number" ? " than " + esc(q.score) : ""}.</div>` +
        tools + cards +
        `<div class="rc-foot">${loose ? "Some results are close matches, not the exact garment type. " : ""}Ranked by garment similarity, eco gain and price. ${d.catalog_size ? "Catalog: " + esc(Number(d.catalog_size).toLocaleString()) + " products." : ""} Scores for catalog items are estimated from the fabric named in their description.</div>`;

      box.querySelectorAll("img.rc-img").forEach((im) => im.addEventListener("error", () => im.replaceWith(Object.assign(document.createElement("div"), { className: "rc-ph", textContent: "👕" }))));
      box.querySelectorAll("[data-sort]").forEach((c) => c.addEventListener("click", () => { st.sort = c.dataset.sort; draw(); }));
      const sm = box.querySelector("[data-same]");
      if (sm) sm.addEventListener("click", () => { st.same = !st.same; loadRecommendations(box, q, st); });

      box.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", async () => {
        const r = shown[Number(b.dataset.i)];
        if (!r) return;
        if (b.dataset.act === "cmp") {
          addToCompare({ material_label: r.name, eco_score: r.score, carbon_footprint_kg_co2e_per_kg: r.carbon ?? null, water_usage_l_per_kg: null });
        } else {
          let site = "EcoCart catalog";
          try { if (r.url) site = new URL(r.url).hostname.replace(/^www\./, ""); } catch (e) {}
          const fabs = r.fabrics || [];
          await addEntryToBag({
            title: r.name, url: r.url || "", site, image: r.image || null, price: r.price ?? null, currency: "INR",
            parts: fabs.map((f) => ({ key: f, pct: Math.round(100 / fabs.length) })), guessed: true,
            score: r.score, carbon: r.carbon ?? null, water: null, label: fabs.map(pretty).join(" / "),
            garment: currentGarment, certs: [], warnings: []
          });
          b.textContent = "✓ Added";
          b.disabled = true;
        }
      }));
    };
    draw();
  } catch (e) {
    box.innerHTML = `${HEAD}<div class="rc-empty"><b>Couldn't load swaps</b>${esc(e.name === "AbortError" ? "The server took too long. It may be asleep." : e.message)}
      <div style="margin-top:8px"><button class="rc-btn pri" id="recRetry">↻ Try again</button></div></div>`;
    const rb = box.querySelector("#recRetry");
    if (rb) rb.addEventListener("click", () => loadRecommendations(box, q, st));
  } finally {
    clearTimeout(slow); clearTimeout(killer);
  }
}

// =====================================================================
// LABELS & CLAIMS CARD
// =====================================================================
function labelsCardHTML(info, heading) {
  const found = info.found;
  const items = found.map((l) => `
    <div class="lab">
      <div class="lh"><b>${esc(l.name)}</b><span class="px ok">${esc(l.covers)}</span></div>
      <div class="lt">${esc(l.meaning)}</div>
      ${l.watch ? `<div class="lw">⚠ ${esc(l.watch)}</div>` : ""}
    </div>`).join("");
  const none = found.length ? "" : `<div class="banner warn"><span>⚠</span><span>No recognised sustainability certification found on this page.</span></div>`;
  const warns = info.warnings.map((w) => `<div class="banner warn"><span>⚠</span><span>${esc(w)}</span></div>`).join("");
  return `
    <div class="card">
      <h3>${esc(heading || "Labels & claims")}</h3>
      <div class="sub">Found by reading the page text. We can't confirm a certificate is genuine, so check the licence number on the certifier's website.</div>
      <div style="margin-top:10px">${items}</div>
      ${none}${warns}
    </div>`;
}

// =====================================================================
// THE GARMENT REPORT - one card used by Material, Camera, Scan, Bag
// opts: { title, subtitle, price?, parts:[{key,pct,data}], track?: {url,site,image,price,currency}, certs?:[ids] }
// =====================================================================
function renderReport(mount, opts) {
  const parts = opts.parts;
  const r = buildReport(parts, currentGarment);
  const score = r.score ?? 0;
  const color = colorFor(score);
  const poor = score < 60;
  const blend = parts.length > 1;
  const total = parts.reduce((s, p) => s + p.pct, 0) || 1;
  const label = parts.map((p) => (blend ? p.pct + "% " : "") + pretty(p.key)).join(" / ");

  const blendRows = blend ? `<div class="comp">${parts.map((p) => `
      <div class="r"><span class="n">${esc(pretty(p.key))}</span>
        <span class="bar"><em style="width:${Math.round((p.pct / total) * 100)}%;background:${colorFor(p.data.eco_score)}"></em></span>
        <span class="v">${p.pct}% · score ${esc(p.data.eco_score)}</span></div>`).join("")}</div>` : "";

  const garmentOptions = Object.entries(GARMENTS).map(([k, g]) =>
    `<option value="${k}" ${k === currentGarment ? "selected" : ""}>${esc(g.label)} (~${Math.round(g.kg * 1000)} g)</option>`).join("");

  const healthRows = r.micro == null ? `<div class="tip">This fabric isn't in our clothing reference table yet.</div>` : `
    <div class="kv"><span class="k">Microplastic shedding</span><span class="v"><span class="px ${MICRO_CLASS[r.micro]}">${MICRO_LABEL[r.micro]}</span></span></div>
    <div class="kv"><span class="k">Durability</span><span class="v"><span class="stars">${stars(r.durability)}</span> <small>~${r.wears} wears</small></span></div>
    <div class="kv"><span class="k">Recyclability</span><span class="v"><span class="px ${r.recyc === "High" ? "ok" : r.recyc === "Medium" ? "mid" : "bad"}">${r.recyc}</span></span></div>
    <div class="kv"><span class="k">Biodegradable</span><span class="v"><span class="px ${r.bio ? "ok" : "bad"}">${r.bio ? "Yes" : "No"}</span></span></div>
    ${r.mixedNote ? `<div class="tip" style="margin-top:8px"><b>Blend note:</b> ${esc(r.mixedNote)}</div>` : ""}`;

  const careBlock = r.micro == null ? "" : `
    <div class="sec">🧺 Care guide</div>
    <div class="care">
      <div><small>Wash</small><b>${r.wash != null ? "≤ " + r.wash + "°C" : "Don't machine wash"}</b></div>
      <div><small>Dry</small><b>${esc(r.dry)}</b></div>
      <div><small>Tip</small><b>${r.micro >= 2 ? "Use filter bag" : "Wash less often"}</b></div>
    </div>
    ${r.careList.map((c) => `<div class="tip">${esc(c)}</div>`).join("")}`;

  const certBlock = !r.certs.length ? "" : `
    <div class="sec">🏷 Look for these labels</div>
    <div class="certs">${r.certs.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`;

  const eolBlock = !r.eolList.length ? "" : `
    <div class="sec">♻ End of life</div>
    ${r.eolList.map((c) => `<div class="tip">${esc(c)}</div>`).join("")}`;

  mount.innerHTML = `
    <div class="card">
      <h3>${esc(opts.title || label)}</h3>
      <div class="sub">${esc(opts.subtitle || (blend ? "Weighted score from the fabric composition" : ""))}</div>
      <div class="hero">
        ${ringHTML(score, color)}
        <div>
          <div class="verdict" style="color:${color}">${tierText(score)}</div>
          <div class="pill">${blend ? "Blend of " + parts.length + " fibres" : "Single fibre"}</div>
          ${r.confidence != null ? `<div class="pill">Data confidence ${Math.round(r.confidence)}%</div>` : ""}
        </div>
      </div>
      ${scaleHTML(score)}
      ${blendRows}

      <div class="sec">👕 Impact of this garment</div>
      <select id="garmentSel">${garmentOptions}</select>
      <div class="metrics" style="margin-top:8px">
        <div><small>Carbon</small><b>${fmt(r.garmentCarbon, 2)} kg</b></div>
        <div><small>Water</small><b>${r.garmentWater != null ? Math.round(r.garmentWater) + " L" : "N/A"}</b></div>
        <div><small>Per wear</small><b>${r.carbonPerWearG != null ? Math.round(r.carbonPerWearG) + " g" : "N/A"}</b></div>
      </div>
      ${r.garmentCarbon != null ? `<div class="equiv">One ${esc(r.garment.label.toLowerCase())} of this fabric ≈ <b>${fmt(r.garmentCarbon, 2)} kg CO₂e</b>, about <b>${Math.round(r.km)} km</b> in a petrol car. ${r.wears ? `Worn <b>~${r.wears} times</b>, that is <b>${Math.round(r.carbonPerWearG)} g CO₂e per wear</b>. Every extra wear lowers it.` : ""}</div>` : ""}
      <div class="banner ${poor ? "warn" : "good"}"><span>${poor ? "⚠" : "✓"}</span><span>${poor ? "High-impact fabric. Greener options and shop links are below." : "A good choice. Wear it long and care for it well. Similar options are below."}</span></div>

      <div id="altBox"></div>
      <div id="recBox"></div>

      <div class="sec">🔬 Fabric health check</div>
      ${healthRows}
      ${certBlock}
      ${careBlock}
      ${eolBlock}
      ${r.unknown.length ? `<div class="sub" style="margin-top:8px">No clothing-table data for: ${esc(r.unknown.map(pretty).join(", "))}</div>` : ""}
      <div class="sub" style="margin-top:10px">Score, carbon and water: our materials database. Durability, microplastics, recyclability, labels and care: indicative reference table. Garment weight and wears are assumptions.</div>
      ${opts.track ? `<button class="btn full" id="trackBtn">🛍 Add to my bag (track in Impact)</button>` : ""}
      <button class="btn ghost full" id="addCmp">+ Add to Compare</button>
    </div>`;

  mount.querySelector("#garmentSel").addEventListener("change", (e) => {
    currentGarment = e.target.value;
    renderReport(mount, opts);
  });
  mount.querySelector("#addCmp").addEventListener("click", () =>
    addToCompare({
      material_label: label, eco_score: Math.round(score), carbon_footprint_kg_co2e_per_kg: r.carbonKg != null ? Number(r.carbonKg.toFixed(1)) : null,
      water_usage_l_per_kg: r.waterKg != null ? Math.round(r.waterKg) : null, perWearG: r.carbonPerWearG != null ? Math.round(r.carbonPerWearG) : null
    }));
  const tb = mount.querySelector("#trackBtn");
  if (tb) tb.addEventListener("click", async () => {
    await addEntryToBag({
      title: opts.title || label, url: opts.track.url, site: opts.track.site, image: opts.track.image || null,
      price: opts.track.price ?? null, currency: opts.track.currency || null,
      parts: parts.map((p) => ({ key: p.key, pct: p.pct })), guessed: false,
      score: Math.round(score), carbon: r.carbonKg != null ? Number(r.carbonKg.toFixed(1)) : null,
      water: r.waterKg != null ? Math.round(r.waterKg) : null, label,
      garment: currentGarment, certs: opts.certs || [], warnings: []
    });
    tb.textContent = "✓ Added to your bag";
    tb.disabled = true;
  });
  animate(mount);
  const mainKey = (parts.slice().sort((a, b) => b.pct - a.pct)[0] || {}).key;
  loadAlternatives(score, r.carbonKg, parts.map((p) => p.key), mount.querySelector("#altBox"), r.garment.label, mainKey);
  const itemPrice = opts.price != null ? opts.price : (opts.track && opts.track.price != null ? opts.track.price : null);
  loadRecommendations(mount.querySelector("#recBox"), {
    name: opts.title || label, garment: currentGarment, score: Math.round(score), material: mainKey,
    carbon: typeof r.carbonKg === "number" ? Number(r.carbonKg.toFixed(2)) : undefined,
    price: typeof itemPrice === "number" ? itemPrice : undefined
  });
}

function renderMaterial(data, mount, opts) {
  const key = String(data.material_label || "").toLowerCase();
  renderReport(mount, {
    title: (opts && opts.title) || pretty(key),
    subtitle: (opts && opts.subtitle) || `${data.type === "fibre" ? "Fibre" : "Fabric"}${data.impact_category ? " · " + data.impact_category : ""}`,
    parts: [{ key, pct: 100, data }],
    track: opts && opts.track, certs: opts && opts.certs
  });
}

// ---------- Bag storage helper ----------
async function addEntryToBag(e) {
  const entry = {
    id: String(Date.now()), site: "", image: null, price: null, currency: null, guessed: false,
    garment: "top", certs: [], warnings: [], status: "bag", time: Date.now(), ...e
  };
  const data = await chrome.storage.local.get({ cart: [] });
  const cart = data.cart.filter((c) => !(c.url === entry.url && c.title === entry.title));
  cart.unshift(entry);
  await chrome.storage.local.set({ cart: cart.slice(0, 100) });
  updateCount();
}

// ---------- Material tab ----------
$("materialChips").innerHTML = CHIPS.map((c) => `<span class="chip" data-m="${c}">${c}</span>`).join("");
$("materialChips").addEventListener("click", (e) => {
  if (e.target.dataset.m) { $("materialInput").value = e.target.dataset.m; checkMaterial(); }
});
$("materialBtn").addEventListener("click", checkMaterial);
$("materialInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkMaterial(); });

async function checkMaterial() {
  const raw = $("materialInput").value.trim();
  const out = $("materialOut");
  if (!raw) return;
  let m = raw.toLowerCase();
  m = ALIASES[m] || m.replace(/\s+/g, "_");
  out.innerHTML = skeleton();
  try {
    const data = await getScore(m);
    if (data) { renderMaterial(data, out); return; }
    // not a fabric: maybe the user typed an eco-label like "GOTS"
    const lab = detectLabels(raw);
    if (lab.found.length) { out.innerHTML = labelsCardHTML({ found: lab.found, warnings: [] }, "About this label"); return; }
    out.innerHTML = `<div class="err">No data for "${esc(raw)}". Try a fabric (cotton, polyester, denim) or a label (GOTS, OEKO-TEX, GRS).</div>`;
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the server. It may be waking up, so wait a few seconds and try again.</div>`;
  }
}

// ---------- Scan the current shopping page: fabric + labels ----------
$("scanBtn").addEventListener("click", scanPage);

async function probeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["page.js"] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__ecocartProbe() });
  return res && res.result ? res.result : null;
}

async function scanPage() {
  const out = $("materialOut");
  out.innerHTML = skeleton();
  let p;
  try {
    p = await probeActiveTab();
    if (!p) throw new Error("empty");
  } catch (e) {
    out.innerHTML = `<div class="err">Can't read this page (browser pages like chrome:// are blocked). Open a product page and try again.</div>`;
    return;
  }

  const labels = detectLabels(p.labelText);
  out.innerHTML = `<div id="scanReport"></div><div id="scanLabels">${labelsCardHTML(labels, "Labels & claims on this page")}</div>`;
  const rep = out.querySelector("#scanReport");
  rep.innerHTML = skeleton();

  const track = { url: p.url, site: p.site, image: p.image, price: p.price, currency: p.currency };
  const certs = labels.found.map((l) => l.id);
  currentGarment = mapGarment(p.title);

  let text = p.visible.toLowerCase();
  let parts = findParts(text);
  if (!parts.length) { text = p.all.toLowerCase(); parts = findParts(text); }

  if (!parts.length) {
    const top = topMentioned(text);
    if (!top) {
      rep.innerHTML = `<div class="err">No fabric details found on this page. Look for the "Material / Composition" section, select the word (e.g. cotton), right-click and choose "EcoCart".</div>`;
      return;
    }
    $("materialInput").value = top;
    const data = await getScore(top).catch(() => null);
    if (!data) { rep.innerHTML = `<div class="err">Found "${esc(top)}" on the page, but it isn't in our database.</div>`; return; }
    renderReport(rep, { title: p.title, subtitle: `No composition % on this page. Estimated from the most mentioned fabric (${pretty(top)}).`, parts: [{ key: top, pct: 100, data }], track, certs });
    return;
  }

  const ok = await lookupParts(parts);
  if (!ok.length) { rep.innerHTML = `<div class="err">Found fabrics on the page, but none are in our database yet.</div>`; return; }
  renderReport(rep, { title: p.title, subtitle: "Weighted score from the composition found on the page", parts: ok, track, certs });
}

// ---------- Camera tab ----------
// Typical fabrics per garment (a hint only; the user confirms from the care label)
const GARMENT_FABRICS = {
  tshirt: ["cotton", "polyester"], top: ["cotton", "polyester", "viscose_rayon"],
  shirt: ["cotton", "linen", "polyester"], dress: ["polyester", "viscose_rayon", "cotton"],
  sweater: ["wool", "acrylic", "cotton"], saree: ["silk", "cotton", "polyester"],
  jeans: ["denim", "cotton"], jacket: ["polyester", "nylon", "wool"]
};
const ALL_FABRICS = ["cotton", "polyester", "silk", "wool", "denim", "nylon", "linen", "viscose_rayon", "acrylic", "hemp", "tencel"];
let photo = null;
let detectToken = 0;

$("camTake").addEventListener("click", () => $("camFileCam").click());
$("camUpload").addEventListener("click", () => $("camFileUp").click());
// reset the input after reading so choosing the same photo again still works
function onPick(e) { const f = e.target.files[0]; e.target.value = ""; takePhoto(f); }
$("camFileCam").addEventListener("change", onPick);
$("camFileUp").addEventListener("change", onPick);

// drag & drop a photo onto the camera panel
const camPanel = $("panel-camera");
camPanel.addEventListener("dragover", (e) => { e.preventDefault(); camPanel.classList.add("drop"); });
camPanel.addEventListener("dragleave", () => camPanel.classList.remove("drop"));
camPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  camPanel.classList.remove("drop");
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) takePhoto(f);
});

// shrink big phone photos before upload: faster, and fewer failures on a sleeping server
async function shrink(file, max = 800) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.85));
  } catch (e) {
    return file;
  }
}

async function takePhoto(f) {
  if (!f) return;
  if (!f.type.startsWith("image/")) { $("camOut").innerHTML = `<div class="err">Please choose an image file (JPG or PNG).</div>`; return; }
  photo = f;
  $("camPreview").src = URL.createObjectURL(f);
  $("camPreview").style.display = "block";
  $("camIntro").style.display = "none";
  detectGarment(); // runs automatically, no extra click
}

async function detectGarment() {
  if (!photo) return;
  const my = ++detectToken;
  const out = $("camOut");
  out.innerHTML = `<div class="skel"><i style="width:55%"></i><i style="width:85%"></i><i style="width:40%"></i></div>
    <div class="sub" id="camWait" style="margin-top:6px">Analysing your photo…</div>`;
  const slow = setTimeout(() => {
    const w = $("camWait");
    if (w && my === detectToken) w.textContent = "The server is waking up. The first request can take up to a minute…";
  }, 6000);

  const ctl = new AbortController();
  const killer = setTimeout(() => ctl.abort(), 90000);
  try {
    const blob = await shrink(photo);
    const fd = new FormData();
    fd.append("image", blob, "photo.jpg");
    const res = await fetch(`${API}/detect`, { method: "POST", body: fd, signal: ctl.signal });
    const d = await res.json().catch(() => ({}));
    if (my !== detectToken) return; // a newer photo replaced this one
    if (!res.ok) {
      const msg = res.status >= 500
        ? "The detection model on the server failed. Try again in a moment."
        : (d.error || "Detection failed.");
      out.innerHTML = `<div class="err">${esc(msg)}</div><button class="btn ghost full" id="camRetry">↻ Try again</button>`;
      $("camRetry").addEventListener("click", detectGarment);
      return;
    }
    renderDetection(d, out);
  } catch (e) {
    if (my !== detectToken) return;
    out.innerHTML = `<div class="err">${e.name === "AbortError" ? "The server took too long to answer." : "Can't reach the server."} It may be asleep. Wait a few seconds and try again.</div><button class="btn ghost full" id="camRetry">↻ Try again</button>`;
    $("camRetry").addEventListener("click", detectGarment);
  } finally {
    clearTimeout(slow);
    clearTimeout(killer);
  }
}

function renderDetection(d, out) {
  const preds = (d.predictions || []).slice().sort((a, b) => b.confidence - a.confidence);
  if (!preds.length) {
    out.innerHTML = `<div class="err">No garment found. Put the garment flat on a plain background, in good light, and fill the frame.</div><button class="btn ghost full" id="camRetry">↻ Try another photo</button>`;
    $("camRetry").addEventListener("click", () => $("camUpload").click());
    return;
  }
  const top = preds[0];
  const conf = Math.round(top.confidence * 100);
  const garment = mapGarment(top.label);
  currentGarment = garment; // detected garment sets the weight used in the report
  const sure = top.confidence >= 0.4;

  const rows = preds.slice(0, 3).map((p) =>
    `<div class="pbar"><b>${esc(pretty(p.label))}</b><i><em style="width:${Math.round(p.confidence * 100)}%"></em></i><span>${Math.round(p.confidence * 100)}%</span></div>`).join("");
  const likely = GARMENT_FABRICS[garment] || ["cotton", "polyester"];

  out.innerHTML = `
    <div class="card">
      <h3>${esc(pretty(top.label))}</h3>
      <div class="sub">Garment type: ${esc(GARMENTS[garment].label)} · confidence ${conf}%</div>
      ${sure ? "" : `<div class="banner warn"><span>⚠</span><span>Not very sure. Try a clearer photo, or check the other guesses below.</span></div>`}
      ${rows}
      <div class="sec">What is it made of?</div>
      <div class="sub" style="margin:-2px 0 8px">Cameras can't see the fabric. Pick it from the care label (typical fabrics for this garment first).</div>
      <div class="chips" id="camChips" style="margin-top:0">${likely.map((m) => `<span class="chip" data-m="${m}">${esc(pretty(m))}</span>`).join("")}</div>
      <select id="camMat" style="margin-top:8px"><option value="">Other fabric...</option>${ALL_FABRICS.filter((m) => !likely.includes(m)).map((m) => `<option value="${m}">${esc(pretty(m))}</option>`).join("")}</select>
      <div class="sub" style="margin-top:8px">Detection model: YOLO, trained on a subset of Fashionpedia. It recognises the garment shape, not the fabric.</div>
    </div>
    <div id="camMatOut"></div>`;

  const pick = async (m) => {
    const box = $("camMatOut");
    if (!m) { box.innerHTML = ""; return; }
    out.querySelectorAll("#camChips .chip").forEach((c) => c.classList.toggle("on", c.dataset.m === m));
    box.innerHTML = skeleton();
    const data = await getScore(m).catch(() => null);
    if (!data) { box.innerHTML = `<div class="err">No data for this fabric.</div>`; return; }
    renderMaterial(data, box, { title: `${pretty(top.label)} · ${pretty(m)}`, subtitle: "Fabric chosen by you. Check the care label to be sure." });
  };
  $("camChips").addEventListener("click", (e) => { if (e.target.dataset.m) { $("camMat").value = ""; pick(e.target.dataset.m); } });
  $("camMat").addEventListener("change", (e) => { out.querySelectorAll("#camChips .chip").forEach((c) => c.classList.remove("on")); pick(e.target.value); });
}

// ---------- Compare ----------
async function getItems() { return (await chrome.storage.local.get({ items: [] })).items; }

async function addToCompare(data) {
  const items = await getItems();
  if (!items.some((i) => i.material_label === data.material_label)) {
    items.push({
      material_label: data.material_label, eco_score: data.eco_score,
      carbon_footprint_kg_co2e_per_kg: data.carbon_footprint_kg_co2e_per_kg,
      water_usage_l_per_kg: data.water_usage_l_per_kg, perWearG: data.perWearG ?? null
    });
    await chrome.storage.local.set({ items });
  }
  updateCount();
  showTab("compare");
}

async function updateCount() {
  $("cmpCount").textContent = (await getItems()).length;
  const d = await chrome.storage.local.get({ cart: [] });
  $("bagCount").textContent = d.cart.length;
}

async function renderCompare() {
  const items = await getItems();
  const list = $("cmpList");
  $("cmpClear").style.display = items.length ? "block" : "none";
  if (!items.length) {
    list.innerHTML = `<div class="empty"><span class="big">⚖</span>Nothing to compare yet.<br>Analyse a fabric and tap "Add to Compare".</div>`;
    return;
  }
  const best = Math.max(...items.map((i) => i.eco_score ?? -1));
  list.innerHTML = items.map((i, idx) => `
    <div class="cmp">
      <div style="min-width:0">
        <b style="text-transform:capitalize">${esc(pretty(i.material_label))}</b>${i.eco_score === best && items.length > 1 ? `<span class="best">BEST</span>` : ""}
        <div class="sub">CO₂ ${esc(i.carbon_footprint_kg_co2e_per_kg ?? "—")} kg/kg · Water ${i.water_usage_l_per_kg ? esc(i.water_usage_l_per_kg) + " L/kg" : "N/A"}${i.perWearG != null ? " · " + esc(i.perWearG) + " g/wear" : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;font-size:18px;color:${colorFor(i.eco_score)}">${esc(i.eco_score ?? "—")}</div>
        <button class="x" data-i="${idx}">remove</button>
      </div>
    </div>`).join("");
  list.querySelectorAll(".x").forEach((b) => b.addEventListener("click", async () => {
    const arr = await getItems();
    arr.splice(Number(b.dataset.i), 1);
    await chrome.storage.local.set({ items: arr });
    renderCompare(); updateCount();
  }));
}

$("cmpClear").addEventListener("click", async () => {
  await chrome.storage.local.set({ items: [] });
  renderCompare(); updateCount();
});

// =====================================================================
// BAG with SUSTAINABILITY + BUDGET FILTER
// =====================================================================
const DEFAULT_FILTERS = { min: 0, max: null, sort: "new", q: "" };
async function getFilters() {
  const f = (await chrome.storage.local.get({ filters: DEFAULT_FILTERS })).filters;
  return { ...DEFAULT_FILTERS, ...f };
}
// search box + reset button are added from JS (so popup.html needs no change)
$("fCount").insertAdjacentHTML("beforebegin", `
  <div class="frow"><label>Search</label><input type="number" id="fQ" style="display:none"><input type="text" id="fQt" placeholder="name, site or fabric" style="flex:1;min-width:0;padding:8px 10px;border:1.5px solid var(--line);border-radius:10px;font-size:12px;background:#fff;color:var(--ink)"></div>
  <button class="btn ghost full" id="fReset" style="display:none;margin:2px 0 8px">↺ Show all items (clear filters)</button>`);
async function saveFilters(f) { await chrome.storage.local.set({ filters: f }); }

function readFilterInputs() {
  const mx = parseFloat($("fMax").value);
  return { min: Number($("fMin").value) || 0, max: isFinite(mx) && mx > 0 ? mx : null, sort: $("fSort").value, q: $("fQt").value.trim() };
}
$("fReset").addEventListener("click", async () => { await saveFilters({ ...DEFAULT_FILTERS }); renderBag(); });
["fMin", "fMax", "fSort", "fQt"].forEach((id) => $(id).addEventListener("input", async () => {
  $("fMinVal").textContent = $("fMin").value;
  await saveFilters(readFilterInputs());
  renderBag();
}));

const STATUS_TEXT = { bag: "In bag", bought: "Bought", skipped: "Skipped" };

async function renderBag() {
  const { cart } = await chrome.storage.local.get({ cart: [] });
  const list = $("bagList");
  const f = await getFilters();
  $("fMin").value = f.min; $("fMinVal").textContent = f.min;
  $("fMax").value = f.max ?? ""; $("fSort").value = f.sort;
  if (document.activeElement !== $("fQt")) $("fQt").value = f.q;
  const filtersOn = f.min > 0 || f.max != null || !!f.q;
  $("fReset").style.display = filtersOn ? "block" : "none";
  $("bagClear").style.display = cart.length ? "block" : "none";

  if (!cart.length) {
    $("fCount").textContent = "";
    list.innerHTML = `<div class="empty"><span class="big">🛍</span>Your bag is empty.<br>Press <b>Add to bag</b> on any shopping website, or use "Add to my bag" on a report, and the product appears here with its eco score.</div>`;
    return;
  }

  // apply the filter
  let rows = cart.map((c, i) => ({ c, i }));
  let hiddenNoScore = 0, hiddenNoPrice = 0;
  rows = rows.filter(({ c }) => {
    if (f.q) {
      const hay = [c.title, c.site, c.label].join(" ").toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    if (f.min > 0 && typeof c.score !== "number") { hiddenNoScore++; return false; }
    if (f.min > 0 && c.score < f.min) return false;
    if (f.max != null && c.price == null) { hiddenNoPrice++; return false; }
    if (f.max != null && c.price > f.max) return false;
    return true;
  });
  if (f.sort === "green") rows.sort((a, b) => (b.c.score ?? -1) - (a.c.score ?? -1));
  else if (f.sort === "cheap") rows.sort((a, b) => (a.c.price ?? Infinity) - (b.c.price ?? Infinity));
  else rows.sort((a, b) => (b.c.time || 0) - (a.c.time || 0));

  const notes = [];
  if (hiddenNoScore) notes.push(`${hiddenNoScore} hidden (no score yet)`);
  if (hiddenNoPrice) notes.push(`${hiddenNoPrice} hidden (price not found)`);
  $("fCount").textContent = `${rows.length < cart.length ? "⚠ Filters are hiding " + (cart.length - rows.length) + " item(s). " : ""}Showing ${rows.length} of ${cart.length}${notes.length ? " · " + notes.join(" · ") : ""}. Prices are compared as plain numbers, no currency conversion.`;

  const live = cart.filter((c) => c.status !== "skipped" && typeof c.score === "number");
  const avg = live.length ? Math.round(live.reduce((s, c) => s + c.score, 0) / live.length) : null;
  const summary = avg !== null
    ? `<div class="summary"><div><small>Average eco score (skipped items excluded)</small><b>${avg}/100</b></div><div style="text-align:right"><small>${cart.length} item${cart.length > 1 ? "s" : ""}</small><span style="font-weight:700">${tierText(avg)}</span></div></div>`
    : "";

  if (!rows.length) {
    list.innerHTML = summary + `<div class="empty"><span class="big">🔎</span>No items match your filter.<br>Lower the minimum score or raise the budget.</div>`;
    return;
  }

  list.innerHTML = summary + rows.map(({ c, i }) => {
    const hasScore = typeof c.score === "number";
    const st = c.status || "bag";
    const img = c.image ? `<img src="${esc(c.image)}" alt="">` : `<div class="ph">👕</div>`;
    const chips = (c.certs || []).slice(0, 3).map((id) => `<span class="chipx">${esc(labelName(id))}</span>`).join("")
      || `<span class="chipx st">no eco-label found</span>`;
    return `<div class="item ${st === "skipped" ? "dim" : ""}">
      <div class="top">${img}
        <div style="flex:1;min-width:0"><div class="nm">${esc(c.title)}</div>
          <div class="meta">${esc(c.site)}${c.price != null ? " · " + esc(fmtPrice(c.price, c.currency)) : ""}${c.label ? " · " + esc(c.label) : ""}${c.guessed ? " (estimated)" : ""}</div>
          <div><span class="chipx st ${st}">${STATUS_TEXT[st] || st}</span>${chips}</div></div>
        ${hasScore ? `<div class="sc" style="background:${colorFor(c.score)}">${c.score}</div>` : `<div class="sc" style="background:#b7c5bc">?</div>`}
      </div>
      <div class="acts">
        <button data-act="details" data-i="${i}">Full report</button>
        <button data-act="swap" data-i="${i}">🌿 Greener swap</button>
        <button data-act="compare" data-i="${i}">+ Compare</button>
        <button data-act="bought" data-i="${i}">✓ Bought</button>
        <button data-act="skipped" data-i="${i}">✗ Skip</button>
        <button class="rm" data-act="remove" data-i="${i}">Remove</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const data = await chrome.storage.local.get({ cart: [] });
    const idx = Number(b.dataset.i);
    const item = data.cart[idx];
    if (!item) return;
    const act = b.dataset.act;
    if (act === "remove") {
      data.cart.splice(idx, 1);
      await chrome.storage.local.set({ cart: data.cart });
      renderBag(); updateCount();
    } else if (act === "bought" || act === "skipped") {
      item.status = item.status === act ? "bag" : act; // press again to undo
      await chrome.storage.local.set({ cart: data.cart });
      renderBag();
    } else if (act === "swap") {
      const card = b.closest(".item");
      const open = card.querySelector(".swap");
      if (open) { open.remove(); return; }
      const g = searchName((GARMENTS[item.garment || "top"] || {}).label);
      const top = (item.parts || []).slice().sort((x, y) => y.pct - x.pct)[0];
      const main = top ? pretty(top.key) : "cotton";
      const sw = document.createElement("div");
      sw.className = "swap";
      sw.innerHTML = `<div class="tip" style="margin-top:10px"><b>Organic ${esc(main)} ${esc(g)}</b>${shopLinks("organic " + main + " " + g)}</div>
        <div class="tip"><b>GOTS certified ${esc(g)}</b>${shopLinks("GOTS organic " + g)}</div>
        <div class="tip"><b>Cheaper &amp; greener:</b> try <b>cotton / linen / tencel ${esc(g)}</b>${shopLinks("linen cotton " + g)}</div>`;
      const rec = document.createElement("div");
      sw.appendChild(rec);
      card.appendChild(sw);
      loadRecommendations(rec, {
        name: item.title, garment: item.garment || "top",
        score: typeof item.score === "number" ? item.score : undefined,
        material: top ? top.key : undefined,
        carbon: typeof item.carbon === "number" ? item.carbon : undefined,
        price: typeof item.price === "number" ? item.price : undefined
      });
    } else if (act === "compare") {
      if (typeof item.score !== "number") return;
      addToCompare({ material_label: item.label || item.title, eco_score: item.score, carbon_footprint_kg_co2e_per_kg: item.carbon, water_usage_l_per_kg: item.water });
    } else {
      openBagItem(item);
    }
  }));
}

async function openBagItem(item) {
  showTab("material");
  const out = $("materialOut");
  out.innerHTML = skeleton();
  if (!item.parts || !item.parts.length) {
    out.innerHTML = `<div class="err">No fabric details were found on that product page. Type the fabric (for example cotton) in the box above to check it.</div>`;
    return;
  }
  try {
    const ok = await lookupParts(item.parts);
    if (!ok.length) { out.innerHTML = `<div class="err">Those fabrics aren't in our database yet, or the server is asleep. Try again in a moment.</div>`; return; }
    currentGarment = item.garment || "top";
    out.innerHTML = `<div id="bagRep"></div><div id="bagLabels"></div>`;
    renderReport(out.querySelector("#bagRep"), { title: item.title, subtitle: item.price != null ? "Price: " + fmtPrice(item.price, item.currency) : "", price: item.price, parts: ok });
    const ids = item.certs || [];
    const info = { found: ECO_LABELS.filter((l) => ids.includes(l.id)), warnings: item.warnings || [] };
    out.querySelector("#bagLabels").innerHTML = labelsCardHTML(info, "Labels & claims when you added it");
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the server. It may be waking up, so wait a few seconds and try again.</div>`;
  }
}

$("bagClear").addEventListener("click", async () => {
  await chrome.storage.local.set({ cart: [] });
  renderBag(); updateCount();
});

// =====================================================================
// PERSONAL SUSTAINABILITY DASHBOARD
// =====================================================================
function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

function trendSVG(items) {
  const now = weekStart(Date.now());
  const weeks = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(now); d.setDate(d.getDate() - 7 * k); weeks.push(d.getTime()); }
  const buckets = weeks.map(() => []);
  items.forEach((c) => {
    const ws = weekStart(c.time || Date.now());
    const idx = weeks.indexOf(ws);
    if (idx >= 0 && typeof c.score === "number") buckets[idx].push(c.score);
  });
  const W = 340, H = 120, bw = 34, gap = (W - bw * 6) / 7;
  const bars = buckets.map((b, i) => {
    const x = gap + i * (bw + gap);
    const label = new Date(weeks[i]).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    if (!b.length) return `<rect x="${x}" y="${H - 28 - 3}" width="${bw}" height="3" rx="1.5" fill="#dbe7df"></rect><text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#9fb2a7">${label}</text>`;
    const avg = Math.round(b.reduce((s, v) => s + v, 0) / b.length);
    const h = Math.max(4, ((H - 40) * avg) / 100);
    return `<rect x="${x}" y="${H - 28 - h}" width="${bw}" height="${h}" rx="5" fill="${colorFor(avg)}"></rect>
      <text x="${x + bw / 2}" y="${H - 28 - h - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#14281f">${avg}</text>
      <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#7a8f84">${label}</text>`;
  }).join("");
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average eco score per week">${bars}</svg>`;
}

async function renderStats() {
  const { cart } = await chrome.storage.local.get({ cart: [] });
  const scope = $("statsScope").value;
  const out = $("statsOut");
  $("statsReset").style.display = cart.length ? "block" : "none";

  const items = cart.filter((c) => (scope === "bought" ? c.status === "bought" : c.status !== "skipped"));
  const scored = items.filter((c) => typeof c.score === "number");

  if (!items.length || !scored.length) {
    out.innerHTML = `<div class="empty"><span class="big">📊</span>${scope === "bought" ? "No bought items yet.<br>Tap <b>✓ Bought</b> on an item in your Bag." : "Nothing tracked yet.<br>Add clothes to your bag and your impact appears here."}</div>`;
    return;
  }

  const avg = Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length);
  const good = scored.filter((c) => c.score >= 70).length;
  const mid = scored.filter((c) => c.score >= 45 && c.score < 70).length;
  const bad = scored.filter((c) => c.score < 45).length;

  let carbon = 0, water = 0, spend = 0, priced = 0, micro = 0;
  scored.forEach((c) => {
    const im = itemImpact(c);
    if (im.garmentCarbon != null) carbon += im.garmentCarbon;
    if (im.garmentWater != null) water += im.garmentWater;
    if (im.micro != null && im.micro >= 2) micro++;
    if (c.price != null) { spend += c.price; priced++; }
  });
  const labelled = items.filter((c) => (c.certs || []).length).length;
  const bought = cart.filter((c) => c.status === "bought").length;
  const skipped = cart.filter((c) => c.status === "skipped");
  const skippedHigh = skipped.filter((c) => typeof c.score === "number" && c.score < 60);
  let skippedCarbon = 0;
  skippedHigh.forEach((c) => { const im = itemImpact(c); if (im.garmentCarbon != null) skippedCarbon += im.garmentCarbon; });

  const lowest = scored.slice().sort((a, b) => a.score - b.score)[0];
  const best = scored.slice().sort((a, b) => b.score - a.score)[0];
  const fabCount = {};
  scored.forEach((c) => { const top = (c.parts || []).slice().sort((a, b) => b.pct - a.pct)[0]; if (top) fabCount[top.key] = (fabCount[top.key] || 0) + 1; });
  const topFab = Object.entries(fabCount).sort((a, b) => b[1] - a[1])[0];

  const goalPct = Math.min(100, Math.round((avg / GOAL_SCORE) * 100));
  const goalText = avg >= GOAL_SCORE ? "Goal reached. Keep it up." : `${GOAL_SCORE - avg} points to go. Greener fabrics and certified items raise your average.`;
  const pc = (n) => Math.round((n / scored.length) * 100);
  const cur = (scored.find((c) => c.currency) || {}).currency;

  const insights = [];
  insights.push(`Your greenest item is <b>${esc(best.title)}</b> (${best.score}).`);
  if (lowest && lowest.score < 60) insights.push(`Your lowest is <b>${esc(lowest.title)}</b> (${lowest.score}). Open it in your Bag for greener alternatives.`);
  if (topFab) insights.push(`Most of your items are mainly <b>${esc(pretty(topFab[0]))}</b> (${topFab[1]} of ${scored.length}).`);
  if (micro) insights.push(`<b>${micro}</b> item${micro > 1 ? "s" : ""} shed microplastics when washed. Use a filter bag.`);
  if (labelled < items.length) insights.push(`<b>${items.length - labelled}</b> item${items.length - labelled > 1 ? "s have" : " has"} no recognised eco-label. Look for GOTS, OEKO-TEX or GRS.`);

  out.innerHTML = `
    <div class="goal">
      <div class="gt"><span>Average eco score</span><span>${avg} / ${GOAL_SCORE} goal</span></div>
      <div class="gb"><i style="width:${goalPct}%"></i></div>
      <small>${goalText}</small>
    </div>

    <div class="kpis">
      <div class="kpi"><small>Items tracked</small><b>${items.length}</b><span>${bought} bought</span></div>
      <div class="kpi"><small>Est. carbon</small><b>${fmt(carbon, 1)} kg</b><span>CO₂e, sum of garments</span></div>
      <div class="kpi"><small>Est. water</small><b>${Math.round(water).toLocaleString()} L</b><span>to make them</span></div>
      <div class="kpi"><small>Spend</small><b>${priced ? fmtPrice(spend, cur) : "N/A"}</b><span>${priced ? priced + " priced item" + (priced > 1 ? "s" : "") : "no prices found"}</span></div>
    </div>

    <div class="card">
      <h3>Your choices</h3>
      <div class="tierbar">
        <i style="width:${pc(good)}%;background:#1a9b66"></i><i style="width:${pc(mid)}%;background:#e29a2e"></i><i style="width:${pc(bad)}%;background:#d65353"></i>
      </div>
      <div class="legend">
        <span><em style="background:#1a9b66"></em>Good ${good}</span>
        <span><em style="background:#e29a2e"></em>Average ${mid}</span>
        <span><em style="background:#d65353"></em>High impact ${bad}</span>
      </div>
      <div class="sec">📈 Average score per week</div>
      ${trendSVG(items)}
    </div>

    <div class="card">
      <h3>Progress</h3>
      <div class="kv"><span class="k">Items with an eco-label</span><span class="v">${labelled} of ${items.length}</span></div>
      <div class="kv"><span class="k">Microplastic-shedding items</span><span class="v">${micro}</span></div>
      <div class="kv"><span class="k">High-impact items you skipped</span><span class="v">${skippedHigh.length}</span></div>
      ${skippedHigh.length ? `<div class="tip" style="margin-top:8px">Skipping them avoided roughly <b>${fmt(skippedCarbon, 1)} kg CO₂e</b>, if you did not buy something else instead. This is an estimate.</div>` : ""}
    </div>

    <div class="card">
      <h3>Insights</h3>
      ${insights.map((t) => `<div class="insight">${t}</div>`).join("")}
      <div class="sub">Carbon and water are estimates: score data from our materials database, garment weights are assumptions. Only items added through the extension are counted.</div>
    </div>`;
}

$("statsScope").addEventListener("change", renderStats);
$("statsReset").addEventListener("click", async () => {
  if (!confirm("Clear everything tracked in your bag and dashboard?")) return;
  await chrome.storage.local.set({ cart: [], items: [] });
  renderStats(); updateCount();
});

// ---------- Init (handles right-click "check" from background.js) ----------
(async function init() {
  updateCount();
  chrome.action.setBadgeText({ text: "" });
  const d = await chrome.storage.local.get({ pendingCheck: null, unseen: 0 });
  if (d.pendingCheck) {
    $("materialInput").value = d.pendingCheck;
    await chrome.storage.local.remove("pendingCheck");
    checkMaterial();
  } else if (d.unseen > 0) {
    showTab("bag");
  }
  await chrome.storage.local.set({ unseen: 0 });
})();