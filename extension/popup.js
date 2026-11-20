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
// Eco score tiers: one set of colours used in the Bag, Compare and Impact tabs
const TIERS = {
  good: { key: "good", label: "Good choice",    color: "#1a9b66" },
  mid:  { key: "mid",  label: "Average impact", color: "#e29a2e" },
  bad:  { key: "bad",  label: "High impact",    color: "#d65353" },
  none: { key: "none", label: "No score yet",   color: "#9aa9a0" }
};
function tierOf(score) {
  if (typeof score !== "number" || isNaN(score)) return TIERS.none;
  return score >= 70 ? TIERS.good : score >= 45 ? TIERS.mid : TIERS.bad;
}
const colorFor = (n) => tierOf(n).color;
const skeleton = () => `<div class="skel"><i style="width:45%"></i><i style="width:80%"></i><i style="width:60%"></i><i style="width:90%"></i></div>`;
function tierText(score) { return tierOf(score).label; }
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

// ---------- Recommendation engine: similar products with a higher eco score (from our catalog) ----------
async function loadRecommendations(box, q) {
  box.innerHTML = `<div class="sec">🤖 Recommended products (from our catalog)</div>${skeleton()}
    <div class="sub" id="recWait">Searching our catalog…</div>`;
  const slow = setTimeout(() => { const w = box.querySelector("#recWait"); if (w) w.textContent = "The server is waking up. This can take up to a minute…"; }, 6000);
  const ctl = new AbortController();
  const killer = setTimeout(() => ctl.abort(), 90000);
  try {
    const qs = new URLSearchParams({ name: q.name || "", garment: q.garment || "", limit: "4" });
    if (typeof q.score === "number") qs.set("score", String(q.score));
    const res = await fetch(`${API}/recommend?${qs}`, { signal: ctl.signal });
    const d = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error("the recommendation service is not on the server yet (deploy backend/recommender.py)");
    if (!res.ok) throw new Error((d.error || "server error") + (d.detail ? ": " + d.detail : ""));
    const recs = d.recommendations || [];
    if (!recs.length) {
      box.innerHTML = `<div class="sec">🤖 Recommended products (from our catalog)</div>
        <div class="tip">${esc(d.note || "No similar product with a higher eco score was found in our catalog.")}</div>`;
      return;
    }
    box.innerHTML = `<div class="sec">🤖 Recommended products (from our catalog)</div>` + (d.note ? `<div class="sub" style="margin-bottom:6px">${esc(d.note)}</div>` : "") + recs.map((r) => {
      const img = r.image ? `<img src="${esc(r.image)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:10px;flex-shrink:0">` : "";
      const link = r.url
        ? `<a class="chip" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(r.url)}">View ↗</a>`
        : "";
      return `<div class="alt" style="display:block">
        <div style="display:flex;align-items:center;gap:10px">${img}
          <div class="info"><b style="text-transform:none">${esc(r.name)}</b>
            <div class="gain">${r.gain != null ? "+" + esc(r.gain) + " eco points · " : ""}${Math.round(r.similarity * 100)}% similar${r.price != null ? " · ₹" + esc(Math.round(r.price)) : ""}</div></div>
          <div class="sc">${esc(r.score)}</div>
        </div>
        <div class="chips" style="margin-top:6px">${link}${SHOPS.slice(0, 2).map(([n, f]) =>
          `<a class="chip" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(f(r.name))}">${n} ↗</a>`).join("")}</div>
      </div>`;
    }).join("") + `<div class="sub">Found by comparing product names and categories (similarity) and fabric eco scores. ${d.catalog_size ? "Catalog size: " + esc(Number(d.catalog_size).toLocaleString()) + " products." : ""}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="sec">🤖 Recommended products (from our catalog)</div>
      <div class="tip">Couldn't load recommendations right now (${esc(e.name === "AbortError" ? "server too slow" : e.message)}).
      <button class="btn ghost small" id="recRetry" style="margin-top:6px;padding:6px 12px">↻ Try again</button></div>`;
    const rb = box.querySelector("#recRetry");
    if (rb) rb.addEventListener("click", () => loadRecommendations(box, q));
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
// opts: { title, subtitle, parts:[{key,pct,data}], track?: {url,site,image,price,currency}, certs?:[ids] }
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
  loadAlternatives(score, r.carbonKg, parts.map((p) => p.key), mount.querySelector("#altBox"), r.garment.label, (parts.slice().sort((a, b) => b.pct - a.pct)[0] || {}).key);
  loadRecommendations(mount.querySelector("#recBox"), { name: opts.title || label, garment: currentGarment, score: Math.round(score) });
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

// "Take photo" opens the live camera page in a tab (a popup cannot ask for camera permission).
$("camTake").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("camera.html") });
  window.close();
});
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

// If the server model can't detect the garment, the user can pick it by hand and everything else still works.
function manualPickHTML() {
  return `<div class="sec">Or choose the garment yourself</div>
    <div class="chips" id="camManual" style="margin-top:0">${Object.entries(GARMENTS).map(([k, g]) =>
      `<span class="chip" data-g="${k}">${esc(searchName(g.label))}</span>`).join("")}</div>`;
}
function wireManualPick(out) {
  const box = out.querySelector("#camManual");
  if (box) box.addEventListener("click", (e) => { if (e.target.dataset.g) renderDetection({}, out, e.target.dataset.g); });
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
      out.innerHTML = `<div class="err">${esc(msg)}</div><button class="btn ghost full" id="camRetry">↻ Try again</button>${manualPickHTML()}`;
      $("camRetry").addEventListener("click", detectGarment);
      wireManualPick(out);
      return;
    }
    renderDetection(d, out);
  } catch (e) {
    if (my !== detectToken) return;
    out.innerHTML = `<div class="err">${e.name === "AbortError" ? "The server took too long to answer." : "Can't reach the server."} It may be asleep. Wait a few seconds and try again.</div><button class="btn ghost full" id="camRetry">↻ Try again</button>${manualPickHTML()}`;
    $("camRetry").addEventListener("click", detectGarment);
    wireManualPick(out);
  } finally {
    clearTimeout(slow);
    clearTimeout(killer);
  }
}

function renderDetection(d, out, forced) {
  const preds = forced ? [{ label: GARMENTS[forced].label, confidence: 1 }] : (d.predictions || []).slice().sort((a, b) => b.confidence - a.confidence);
  if (!preds.length) {
    out.innerHTML = `<div class="err">No garment found. Put the garment flat on a plain background, in good light, and fill the frame.</div><button class="btn ghost full" id="camRetry">↻ Try another photo</button>${manualPickHTML()}`;
    $("camRetry").addEventListener("click", () => $("camUpload").click());
    wireManualPick(out);
    return;
  }
  const top = preds[0];
  const conf = Math.round(top.confidence * 100);
  const garment = forced || mapGarment(top.label);
  currentGarment = garment; // detected garment sets the weight used in the report
  const sure = top.confidence >= 0.4;

  const rows = preds.slice(0, 3).map((p) =>
    `<div class="pbar"><b>${esc(pretty(p.label))}</b><i><em style="width:${Math.round(p.confidence * 100)}%"></em></i><span>${Math.round(p.confidence * 100)}%</span></div>`).join("");
  const likely = GARMENT_FABRICS[garment] || ["cotton", "polyester"];

  out.innerHTML = `
    <div class="card">
      <h3>${esc(pretty(top.label))}</h3>
      <div class="sub">Garment type: ${esc(GARMENTS[garment].label)} · ${forced ? "chosen by you" : "confidence " + conf + "%"}</div>
      ${sure ? "" : `<div class="banner warn"><span>⚠</span><span>Not very sure. Try a clearer photo, or choose the garment yourself below.</span></div>`}
      ${forced ? "" : rows}
      ${sure && !forced ? "" : manualPickHTML()}
      <div class="sec">What is it made of?</div>
      <div class="sub" style="margin:-2px 0 8px">Cameras can't see the fabric. Pick it from the care label (typical fabrics for this garment first).</div>
      <div class="chips" id="camChips" style="margin-top:0">${likely.map((m) => `<span class="chip" data-m="${m}">${esc(pretty(m))}</span>`).join("")}</div>
      <select id="camMat" style="margin-top:8px"><option value="">Other fabric...</option>${ALL_FABRICS.filter((m) => !likely.includes(m)).map((m) => `<option value="${m}">${esc(pretty(m))}</option>`).join("")}</select>
      <div class="sub" style="margin-top:8px">${forced ? "Garment chosen by you." : "Detection model: YOLO, trained on a subset of Fashionpedia."} It recognises the garment shape, not the fabric.</div>
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
  wireManualPick(out);
  $("camChips").addEventListener("click", (e) => { if (e.target.dataset.m) { $("camMat").value = ""; pick(e.target.dataset.m); } });
  $("camMat").addEventListener("change", (e) => { out.querySelectorAll("#camChips .chip").forEach((c) => c.classList.remove("on")); pick(e.target.value); });
}

// =====================================================================
// COMPARE: side by side, a winner for every metric
// =====================================================================
const CMP_MAX = 6;
async function getItems() { return (await chrome.storage.local.get({ items: [] })).items; }

// data: { material_label, eco_score, carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, perWearG?, price?, currency?, kind? }
async function addToCompare(data, opts) {
  const items = await getItems();
  if (!items.some((i) => i.material_label === data.material_label)) {
    items.push({
      material_label: data.material_label, eco_score: data.eco_score,
      carbon_footprint_kg_co2e_per_kg: data.carbon_footprint_kg_co2e_per_kg,
      water_usage_l_per_kg: data.water_usage_l_per_kg, perWearG: data.perWearG ?? null,
      price: data.price ?? null, currency: data.currency ?? null, kind: data.kind || "fabric"
    });
    while (items.length > CMP_MAX) items.shift(); // keep the newest six
    await chrome.storage.local.set({ items });
  }
  updateCount();
  if (opts && opts.stay) renderCompare(); else showTab("compare");
}

// one tap on a fabric chip adds it to the comparison
async function quickAddFabric(m) {
  const data = await getScore(m).catch(() => null);
  if (!data) return;
  const r = buildReport([{ key: m, pct: 100, data }], currentGarment);
  await addToCompare({
    material_label: pretty(m), eco_score: Math.round(r.score ?? data.eco_score),
    carbon_footprint_kg_co2e_per_kg: r.carbonKg != null ? Number(r.carbonKg.toFixed(1)) : null,
    water_usage_l_per_kg: r.waterKg != null ? Math.round(r.waterKg) : null,
    perWearG: r.carbonPerWearG != null ? Math.round(r.carbonPerWearG) : null, kind: "fabric"
  }, { stay: true });
}

async function updateCount() {
  $("cmpCount").textContent = (await getItems()).length;
  const d = await chrome.storage.local.get({ cart: [] });
  $("bagCount").textContent = d.cart.length;
}

const numOrNull = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const cmpName = (i) => (i.kind === "product" ? String(i.material_label) : pretty(i.material_label));
const cmpPrice = (i) => numOrNull(i.price);

// what is compared: higher = a bigger number is better
const CMP_METRICS = [
  { key: "eco_score", label: "Eco score", icon: "🌿", higher: true, get: (i) => numOrNull(i.eco_score), show: (v) => Math.round(v) + "/100", hint: "higher is better" },
  { key: "carbon", label: "Carbon", icon: "💨", higher: false, get: (i) => numOrNull(i.carbon_footprint_kg_co2e_per_kg), show: (v) => fmt(v, 1) + " kg CO₂e/kg", hint: "lower is better" },
  { key: "water", label: "Water", icon: "💧", higher: false, get: (i) => numOrNull(i.water_usage_l_per_kg), show: (v) => Math.round(v).toLocaleString("en-IN") + " L/kg", hint: "lower is better" },
  { key: "wear", label: "Carbon per wear", icon: "👕", higher: false, get: (i) => numOrNull(i.perWearG), show: (v) => Math.round(v) + " g", hint: "lower is better" },
  { key: "price", label: "Price", icon: "🏷", higher: false, get: cmpPrice, show: null, hint: "lower is cheaper" }
];

// the rows of one metric, best first, each with its bar colour and how far it is from the best
function metricRows(m, items) {
  const vals = items.map((i) => ({ i, v: m.get(i) })).filter((x) => x.v != null);
  if (!vals.length) return null;
  const best = m.higher ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  const worst = m.higher ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v));
  const maxV = Math.max(...vals.map((x) => x.v)) || 1;
  const multi = vals.length > 1;
  const tie = best === worst;
  vals.sort((a, b) => (m.higher ? b.v - a.v : a.v - b.v));
  return {
    best, worst, multi, tie,
    rows: vals.map((x) => {
      const isBest = x.v === best, isWorst = x.v === worst;
      let color = "#9fb2a7";
      if (multi) color = tie || isBest ? "#1a9b66" : isWorst ? "#d65353" : "#e29a2e";
      let diff = "";
      if (multi && !isBest) {
        if (m.key === "eco_score") diff = "−" + Math.round(best - x.v) + " pts";
        else if (best > 0) diff = x.v / best >= 4 ? "×" + Math.round(x.v / best) : "+" + Math.round(((x.v - best) / best) * 100) + "%";
      }
      return { i: x.i, v: x.v, w: Math.max(6, (x.v / maxV) * 100), color, isBest: multi && isBest && !tie, diff };
    })
  };
}

function cmpMetricHTML(m, items) {
  const mr = metricRows(m, items);
  if (!mr) return "";
  if (m.key === "price" && mr.rows.length < 2) return ""; // a lone price says nothing
  return `<div class="mt">
    <h4><span>${m.icon} ${m.label}</span><span class="hint">${m.hint}</span></h4>
    ${mr.rows.map((r) => {
      const val = m.show ? m.show(r.v) : fmtPrice(r.v, r.i.currency);
      return `<div class="mr">
        <div class="t"><span class="nm"><span style="${r.i.kind === "product" ? "" : "text-transform:capitalize"}">${esc(cmpName(r.i))}</span>${r.isBest ? `<span class="win">✓ best</span>` : ""}</span>
          <span class="vv">${esc(val)}${r.diff ? `<span class="df">${esc(r.diff)}</span>` : ""}</span></div>
        <div class="bb"><i style="width:${r.w}%;background:${r.color}"></i></div>
      </div>`;
    }).join("")}
  </div>`;
}

// one plain sentence: why the winner wins
function verdictText(best, worst) {
  const bits = [];
  const pts = (numOrNull(best.eco_score) ?? 0) - (numOrNull(worst.eco_score) ?? 0);
  if (pts > 0) bits.push("+" + Math.round(pts) + " eco points");
  const less = (a, b) => (a != null && b != null && b > 0 && a < b ? Math.round((1 - a / b) * 100) : 0);
  const c = less(numOrNull(best.carbon_footprint_kg_co2e_per_kg), numOrNull(worst.carbon_footprint_kg_co2e_per_kg));
  const w = less(numOrNull(best.water_usage_l_per_kg), numOrNull(worst.water_usage_l_per_kg));
  if (c > 0) bits.push(c + "% less carbon");
  if (w > 0) bits.push(w + "% less water");
  if (!bits.length) return "These score about the same. Pick on price, fit and how long you will wear it.";
  const last = bits.pop();
  return `${bits.length ? bits.join(", ") + " and " : ""}${last} than ${cmpName(worst)}.`;
}

async function renderCompare() {
  const items = await getItems();
  const list = $("cmpList");
  $("cmpClear").style.display = items.length ? "block" : "none";

  const have = new Set(items.map((i) => i.material_label));
  const quick = CHIPS.filter((m) => !have.has(pretty(m)));
  const quickHTML = quick.length && items.length < CMP_MAX
    ? `<div class="lbl">${items.length ? "Add a fabric to compare" : "Start with two fabrics"}</div>
       <div class="chips" id="cmpQuick">${quick.map((m) => `<span class="chip" data-m="${m}">+ ${esc(pretty(m))}</span>`).join("")}</div>` : "";
  const wireQuick = () => list.querySelectorAll("#cmpQuick .chip").forEach((c) => c.addEventListener("click", () => {
    c.textContent = "…";
    quickAddFabric(c.dataset.m);
  }));

  if (!items.length) {
    list.innerHTML = `<div class="empty"><span class="big">⚖</span>Nothing to compare yet.<br>Tap two fabrics below, or press <b>+ Compare</b> on a report or a bag item.</div>${quickHTML}`;
    wireQuick();
    return;
  }

  // winner = highest eco score, lower carbon breaks a tie
  const ranked = items.slice().sort((a, b) =>
    (numOrNull(b.eco_score) ?? -1) - (numOrNull(a.eco_score) ?? -1) ||
    (numOrNull(a.carbon_footprint_kg_co2e_per_kg) ?? Infinity) - (numOrNull(b.carbon_footprint_kg_co2e_per_kg) ?? Infinity));
  const champ = ranked[0], loser = ranked[ranked.length - 1];
  const many = items.length > 1;

  // how many metrics each item wins
  const wins = new Map(items.map((i) => [i, 0]));
  let rounds = 0;
  CMP_METRICS.forEach((m) => {
    const mr = metricRows(m, items);
    if (!mr || mr.rows.length < 2 || mr.tie) return;
    rounds++;
    mr.rows.filter((r) => r.v === mr.best).forEach((r) => wins.set(r.i, wins.get(r.i) + 1));
  });

  const verdict = many
    ? `<div class="vcard">
        <div class="vr">
          <div style="min-width:0"><div class="vt">🏆 Greener choice</div>
            <div class="vn" style="${champ.kind === "product" ? "" : "text-transform:capitalize"}">${esc(cmpName(champ))}</div></div>
          <div class="vsc">${esc(Math.round(numOrNull(champ.eco_score) ?? 0))}</div>
        </div>
        <div class="vs">${esc(verdictText(champ, loser))}</div>
      </div>`
    : `<div class="tip"><b>One more to go.</b> Add a second fabric or product and we show which one is greener, metric by metric.</div>`;

  const cards = ranked.map((i) => {
    const t = tierOf(numOrNull(i.eco_score));
    const idx = items.indexOf(i);
    const w = wins.get(i);
    return `<div class="cc tier-${t.key}">
      <div style="flex:1;min-width:0">
        <div class="cn" style="${i.kind === "product" ? "" : "text-transform:capitalize"}">${many && i === champ ? "🏆 " : ""}${esc(cmpName(i))}</div>
        <div class="cm">${esc(t.label)}${rounds && many ? ` · wins ${w} of ${rounds}` : ""}${cmpPrice(i) != null ? " · " + esc(fmtPrice(cmpPrice(i), i.currency)) : ""}</div>
      </div>
      <div class="csc" style="background:${t.color}">${i.eco_score != null ? esc(Math.round(i.eco_score)) : "?"}</div>
      <button class="x" data-i="${idx}" title="Remove">✕</button>
    </div>`;
  }).join("");

  list.innerHTML = verdict + cards + (many ? CMP_METRICS.map((m) => cmpMetricHTML(m, ranked)).join("") : "") +
    quickHTML + (many ? `<div class="sub" style="margin-top:10px">Carbon and water are per kilogram of fabric, so products and fabrics can be compared fairly. Green bar = best, red = worst. Estimates from our materials database.</div>` : "");

  list.querySelectorAll(".cc .x").forEach((b) => b.addEventListener("click", async () => {
    const arr = await getItems();
    arr.splice(Number(b.dataset.i), 1);
    await chrome.storage.local.set({ items: arr });
    renderCompare(); updateCount();
  }));
  wireQuick();
}

$("cmpClear").addEventListener("click", async () => {
  await chrome.storage.local.set({ items: [] });
  renderCompare(); updateCount();
});

// =====================================================================
// BAG: colour-coded by eco score (green good, amber average, red high impact)
// =====================================================================
const DEFAULT_FILTERS = { min: 0, max: null, sort: "new", q: "", tier: "all" };
let bagTier = "all";
async function getFilters() {
  const f = (await chrome.storage.local.get({ filters: DEFAULT_FILTERS })).filters;
  return { ...DEFAULT_FILTERS, ...f };
}
async function saveFilters(f) { await chrome.storage.local.set({ filters: f }); }

function readFilterInputs() {
  const mx = parseFloat($("fMax").value);
  return { min: Number($("fMin").value) || 0, max: isFinite(mx) && mx > 0 ? mx : null, sort: $("fSort").value, q: $("fQt").value.trim(), tier: bagTier };
}
$("fReset").addEventListener("click", async () => { bagTier = "all"; await saveFilters({ ...DEFAULT_FILTERS }); renderBag(); });
["fMin", "fMax", "fSort", "fQt"].forEach((id) => $(id).addEventListener("input", async () => {
  $("fMinVal").textContent = $("fMin").value;
  await saveFilters(readFilterInputs());
  renderBag();
}));
// the coloured chips above the list filter by tier
$("bagTiers").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-tier]");
  if (!b) return;
  bagTier = b.dataset.tier;
  await saveFilters(readFilterInputs());
  renderBag();
});

const STATUS_TEXT = { bag: "In bag", bought: "Bought", skipped: "Skipped" };

async function renderBag() {
  const { cart } = await chrome.storage.local.get({ cart: [] });
  const list = $("bagList");
  const f = await getFilters();
  bagTier = ["all", "good", "mid", "bad"].includes(f.tier) ? f.tier : "all";
  $("fMin").value = f.min; $("fMinVal").textContent = f.min;
  $("fMax").value = f.max ?? ""; $("fSort").value = f.sort;
  if (document.activeElement !== $("fQt")) $("fQt").value = f.q;
  const filtersOn = f.min > 0 || f.max != null || !!f.q || bagTier !== "all";
  $("fReset").style.display = filtersOn ? "block" : "none";
  $("bagClear").style.display = cart.length ? "block" : "none";

  // coloured tier chips with counts
  const cnt = { good: 0, mid: 0, bad: 0 };
  cart.forEach((c) => { const k = tierOf(c.score).key; if (cnt[k] !== undefined) cnt[k]++; });
  const chip = (key, label, n, dot) =>
    `<button class="tchip ${key} ${bagTier === key ? "on" : ""}" data-tier="${key}">${dot ? `<em style="background:${dot}"></em>` : ""}${label} <b>${n}</b></button>`;
  $("bagTiers").innerHTML = cart.length
    ? chip("all", "All", cart.length, "") + chip("good", "Good", cnt.good, TIERS.good.color) + chip("mid", "Average", cnt.mid, TIERS.mid.color) + chip("bad", "High impact", cnt.bad, TIERS.bad.color)
    : "";

  if (!cart.length) {
    $("fCount").textContent = "";
    list.innerHTML = `<div class="empty"><span class="big">🛍</span>Your bag is empty.<br>Press <b>Add to bag</b> on any shopping website, or use "Add to my bag" on a report, and the product appears here with its eco score.</div>`;
    return;
  }

  // apply the filter
  let rows = cart.map((c, i) => ({ c, i }));
  let hiddenNoScore = 0, hiddenNoPrice = 0;
  rows = rows.filter(({ c }) => {
    if (bagTier !== "all" && tierOf(c.score).key !== bagTier) return false;
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
  const avgTier = tierOf(avg);
  const summary = avg !== null
    ? `<div class="summary tier-${avgTier.key}"><div><small>Average eco score (skipped items excluded)</small><b>${avg}/100</b></div><div style="text-align:right"><small>${cart.length} item${cart.length > 1 ? "s" : ""}</small><span style="font-weight:700">${avgTier.label}</span></div></div>`
    : "";

  // the greenest and the worst item of the bag get a tag
  let bestI = -1, worstI = -1;
  const liveIdx = cart.map((c, i) => ({ c, i })).filter((x) => x.c.status !== "skipped" && typeof x.c.score === "number");
  if (liveIdx.length > 1) {
    const hi = liveIdx.reduce((a, b) => (b.c.score > a.c.score ? b : a));
    const lo = liveIdx.reduce((a, b) => (b.c.score < a.c.score ? b : a));
    if (hi.c.score !== lo.c.score) { bestI = hi.i; if (lo.c.score < 60) worstI = lo.i; }
  }

  if (!rows.length) {
    list.innerHTML = summary + `<div class="empty"><span class="big">🔎</span>No items match your filter.<br>Lower the minimum score, raise the budget, or tap <b>All</b>.</div>`;
    return;
  }

  list.innerHTML = summary + rows.map(({ c, i }) => {
    const hasScore = typeof c.score === "number";
    const t = tierOf(c.score);
    const st = c.status || "bag";
    const img = c.image ? `<img src="${esc(c.image)}" alt="">` : `<div class="ph">👕</div>`;
    const chips = (c.certs || []).slice(0, 3).map((id) => `<span class="chipx">${esc(labelName(id))}</span>`).join("")
      || `<span class="chipx st">no eco-label found</span>`;
    const tag = i === bestI ? `<span class="tag best">🏆 Greenest in bag</span>` : i === worstI ? `<span class="tag worst">⚠ Highest impact</span>` : "";
    return `<div class="item tier-${t.key} ${st === "skipped" ? "dim" : ""}">
      <div class="top">${img}
        <div style="flex:1;min-width:0"><div class="nm">${esc(c.title)}</div>
          <div class="meta">${esc(c.site)}${c.price != null ? " · " + esc(fmtPrice(c.price, c.currency)) : ""}${c.label ? " · " + esc(c.label) : ""}${c.guessed ? " (estimated)" : ""}</div>
          <div><span class="tpill tier-${t.key}">${hasScore ? "● " + t.label : t.label}</span>${tag}</div>
          <div><span class="chipx st ${st}">${STATUS_TEXT[st] || st}</span>${chips}</div>
          ${hasScore ? `<div class="mini"><i style="width:${Math.max(3, Math.min(100, c.score))}%;background:${t.color}"></i></div>` : ""}</div>
        ${hasScore ? `<div class="sc" style="background:${t.color}">${c.score}</div>` : `<div class="sc" style="background:#b7c5bc">?</div>`}
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
      loadRecommendations(rec, { name: item.title, garment: item.garment || "top", score: typeof item.score === "number" ? item.score : undefined });
    } else if (act === "compare") {
      if (typeof item.score !== "number") return;
      const im = itemImpact(item);
      addToCompare({
        material_label: String(item.title || item.label || "Product").slice(0, 48), eco_score: item.score,
        carbon_footprint_kg_co2e_per_kg: item.carbon, water_usage_l_per_kg: item.water,
        perWearG: im.perWearG != null ? Math.round(im.perWearG) : null,
        price: item.price ?? null, currency: item.currency ?? null, kind: "product"
      });
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
    renderReport(out.querySelector("#bagRep"), { title: item.title, subtitle: item.price != null ? "Price: " + fmtPrice(item.price, item.currency) : "", parts: ok });
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

// numbers count up from zero when the dashboard opens
function countUp(root) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0);
    const pre = el.dataset.pre || "", suf = el.dataset.suf || "";
    const t0 = performance.now(), dur = 800;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + (to * e).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// a ranked list of bars: rows = [{ title, v, color }]
function rankHTML(rows, fmtVal, total, scale) {
  if (!rows.length) return `<div class="tip">Nothing to show for this yet.</div>`;
  const max = scale || Math.max(...rows.map((r) => r.v)) || 1;
  return rows.slice(0, 6).map((r) => `<div class="rk">
      <div class="rkt"><span class="rkn">${esc(r.title)}</span><span class="rkv">${esc(fmtVal(r.v))}${total ? `<small>${Math.round((r.v / total) * 100)}%</small>` : ""}</span></div>
      <div class="rkb"><i style="width:${Math.max(4, Math.min(100, (r.v / max) * 100))}%;background:${r.color}"></i></div>
    </div>`).join("") + (rows.length > 6 ? `<div class="sub">and ${rows.length - 6} more</div>` : "");
}
const eqTiles = (arr) => `<div class="eqs">${arr.map(([big, small]) => `<div><b>${esc(big)}</b><small>${esc(small)}</small></div>`).join("")}</div>`;

// what opens under a card when you tap it
function drillHTML(kind, s) {
  if (kind === "items") {
    const rows = s.scored.slice().sort((a, b) => a.score - b.score).map((c) => ({ title: c.title, v: c.score, color: tierOf(c.score).color }));
    return `<h4>What you are tracking</h4><div class="dsub">Lowest eco score first. Red items are the ones to replace.</div>
      ${eqTiles([[s.inBag, "still in your bag"], [s.bought, "bought"], [s.skipped, "skipped"]])}
      <div style="margin-top:12px">${rankHTML(rows, (v) => v + "/100", 0, 100)}</div>`;
  }
  if (kind === "carbon") {
    const top = s.carbonRows[0];
    const lead = top && s.carbonRows.length > 1 ? `<div class="tip" style="margin-bottom:10px"><b>${esc(top.title)}</b> alone makes up <b>${Math.round((top.v / s.carbon) * 100)}%</b> of your carbon.</div>` : "";
    return `<h4>Where your carbon comes from</h4><div class="dsub">kg CO₂e to make each garment (fabric footprint × garment weight).</div>
      ${lead}${rankHTML(s.carbonRows, (v) => fmt(v, 1) + " kg", s.carbon)}
      ${eqTiles([[Math.round(s.carbon / 0.17).toLocaleString("en-IN") + " km", "in a petrol car"], [fmt(s.carbon / 21, 1), "tree-years to absorb it"]])}
      <div class="sub" style="margin-top:8px">Rough assumptions: 0.17 kg CO₂ per km, one tree absorbs about 21 kg CO₂ a year.</div>`;
  }
  if (kind === "water") {
    const top = s.waterRows[0];
    const lead = top && s.waterRows.length > 1 ? `<div class="tip" style="margin-bottom:10px"><b>${esc(top.title)}</b> alone needs <b>${Math.round((top.v / s.water) * 100)}%</b> of the water.</div>` : "";
    return `<h4>Where your water goes</h4><div class="dsub">Litres used to grow and make each garment.</div>
      ${lead}${rankHTML(s.waterRows, (v) => Math.round(v).toLocaleString("en-IN") + " L", s.water)}
      ${eqTiles([[Math.round(s.water / 65).toLocaleString("en-IN"), "showers (65 L each)"], [fmt(s.water / 2 / 365, 1) + " yr", "of one person's drinking water"]])}
      <div class="sub" style="margin-top:8px">Rough assumptions: a shower is 65 L, a person drinks 2 L a day.</div>`;
  }
  // spend
  if (!s.priced) return `<h4>Spend</h4><div class="tip">No prices were found on the pages you added. Prices appear when the shop page shows them.</div>`;
  const badShare = s.spend ? Math.round((s.spendBad / s.spend) * 100) : 0;
  const cmpLine = s.avgGood != null && s.avgBad != null
    ? (s.avgGood <= s.avgBad
        ? `Your greener items are not dearer: <b>${fmtPrice(s.avgGood, s.cur)}</b> on average against <b>${fmtPrice(s.avgBad, s.cur)}</b> for high-impact ones.`
        : `Your greener items cost about <b>${Math.round((s.avgGood / s.avgBad - 1) * 100)}% more</b>: <b>${fmtPrice(s.avgGood, s.cur)}</b> on average against <b>${fmtPrice(s.avgBad, s.cur)}</b> for high-impact ones.`)
    : "";
  return `<h4>Where your money goes</h4><div class="dsub">Price of each item that showed one, coloured by its eco score.</div>
    ${rankHTML(s.priceRows, (v) => fmtPrice(v, s.cur), s.spend)}
    ${eqTiles([[fmtPrice(s.spend / s.priced, s.cur), "average per item"], [badShare + "%", "spent on high-impact items"]])}
    ${cmpLine ? `<div class="tip" style="margin-top:10px">${cmpLine}</div>` : ""}`;
}

let kpiOpen = "carbon";
let lastStats = null;

function paintDrill() {
  const d = $("drill");
  if (!d || !lastStats) return;
  document.querySelectorAll(".kpi[data-kpi]").forEach((k) => {
    k.classList.toggle("on", k.dataset.kpi === kpiOpen);
    k.setAttribute("aria-expanded", k.dataset.kpi === kpiOpen ? "true" : "false");
  });
  d.style.display = kpiOpen ? "block" : "none";
  d.innerHTML = kpiOpen ? drillHTML(kpiOpen, lastStats) : "";
}

function summaryText(s) {
  const lines = [
    "EcoCart AI impact summary",
    `Items tracked: ${s.items} (${s.bought} bought)`,
    `Average eco score: ${s.avg}/100 (goal ${GOAL_SCORE})`,
    `Estimated carbon: ${fmt(s.carbon, 1)} kg CO2e`,
    `Estimated water: ${Math.round(s.water).toLocaleString("en-IN")} L`,
    s.priced ? `Spend: ${fmtPrice(s.spend, s.cur)} on ${s.priced} priced item${s.priced > 1 ? "s" : ""}` : "Spend: no prices found",
    `Greenest item: ${s.best.title} (${s.best.score})`,
    `Highest impact item: ${s.lowest.title} (${s.lowest.score})`,
    "Estimates from the EcoCart AI materials database."
  ];
  return lines.join("\n");
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
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
    lastStats = null;
    return;
  }

  const avg = Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length);
  const good = scored.filter((c) => c.score >= 70).length;
  const mid = scored.filter((c) => c.score >= 45 && c.score < 70).length;
  const bad = scored.filter((c) => c.score < 45).length;

  let carbon = 0, water = 0, spend = 0, priced = 0, micro = 0, spendBad = 0, spendGood = 0, nGood = 0, nBad = 0;
  const carbonRows = [], waterRows = [], priceRows = [];
  scored.forEach((c) => {
    const im = itemImpact(c);
    const color = tierOf(c.score).color;
    if (im.garmentCarbon != null) { carbon += im.garmentCarbon; carbonRows.push({ title: c.title, v: im.garmentCarbon, color }); }
    if (im.garmentWater != null) { water += im.garmentWater; waterRows.push({ title: c.title, v: im.garmentWater, color }); }
    if (im.micro != null && im.micro >= 2) micro++;
    if (c.price != null) {
      spend += c.price; priced++;
      priceRows.push({ title: c.title, v: c.price, color });
      if (c.score < 45) { spendBad += c.price; nBad++; }
      if (c.score >= 70) { spendGood += c.price; nGood++; }
    }
  });
  [carbonRows, waterRows, priceRows].forEach((r) => r.sort((a, b) => b.v - a.v));
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
  const sym = CURRENCY_SYMBOL[cur] || "";

  lastStats = {
    items: items.length, scored, bought, inBag: cart.filter((c) => (c.status || "bag") === "bag").length, skipped: skipped.length,
    carbon, water, spend, priced, cur, carbonRows, waterRows, priceRows, spendBad,
    avgGood: nGood ? spendGood / nGood : null, avgBad: nBad ? spendBad / nBad : null,
    avg, best, lowest
  };

  const insights = [];
  insights.push(`Your greenest item is <b>${esc(best.title)}</b> (${best.score}).`);
  if (lowest && lowest.score < 60) insights.push(`Your lowest is <b>${esc(lowest.title)}</b> (${lowest.score}). Open it in your Bag for greener alternatives.`);
  if (topFab) insights.push(`Most of your items are mainly <b>${esc(pretty(topFab[0]))}</b> (${topFab[1]} of ${scored.length}).`);
  if (micro) insights.push(`<b>${micro}</b> item${micro > 1 ? "s" : ""} shed microplastics when washed. Use a filter bag.`);
  if (labelled < items.length) insights.push(`<b>${items.length - labelled}</b> item${items.length - labelled > 1 ? "s have" : " has"} no recognised eco-label. Look for GOTS, OEKO-TEX or GRS.`);

  const kpi = (key, label, big, sub) => `<button class="kpi ${kpiOpen === key ? "on" : ""}" data-kpi="${key}" aria-expanded="${kpiOpen === key}"><small>${label}</small>${big}<span>${sub}</span><i class="chev">›</i></button>`;

  out.innerHTML = `
    <div class="goal">
      <div class="gt"><span>Average eco score</span><span>${avg} / ${GOAL_SCORE} goal</span></div>
      <div class="gb"><i style="width:${goalPct}%"></i></div>
      <small>${goalText}</small>
    </div>

    <div class="kpis">
      ${kpi("items", "Items tracked", `<b data-count="${items.length}">${items.length}</b>`, `${bought} bought`)}
      ${kpi("carbon", "Est. carbon", `<b data-count="${carbon.toFixed(1)}" data-dec="1" data-suf=" kg">${fmt(carbon, 1)} kg</b>`, "CO₂e, sum of garments")}
      ${kpi("water", "Est. water", `<b data-count="${Math.round(water)}" data-suf=" L">${Math.round(water).toLocaleString("en-IN")} L</b>`, "to make them")}
      ${kpi("spend", "Spend", priced ? `<b data-count="${Math.round(spend)}" data-pre="${esc(sym)}">${esc(fmtPrice(spend, cur))}</b>` : `<b>N/A</b>`, priced ? priced + " priced item" + (priced > 1 ? "s" : "") : "no prices found")}
    </div>
    <div class="kpihint">👆 Tap a card to see where the number comes from</div>
    <div class="drill" id="drill"></div>

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
    </div>
    <button class="btn ghost full" id="copySum">📋 Copy my impact summary</button>`;

  out.querySelectorAll(".kpi[data-kpi]").forEach((k) => k.addEventListener("click", () => {
    kpiOpen = kpiOpen === k.dataset.kpi ? null : k.dataset.kpi;
    paintDrill();
  }));
  out.querySelector("#copySum").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const ok = await copyText(summaryText(lastStats));
    b.textContent = ok ? "✓ Copied. Paste it in your report" : "Couldn't copy. Select the numbers manually";
    setTimeout(() => { b.textContent = "📋 Copy my impact summary"; }, 2500);
  });
  paintDrill();
  countUp(out);
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
  const d = await chrome.storage.local.get({ pendingCheck: null, unseen: 0, pendingPhoto: null });
  if (d.pendingPhoto) {
    // a photo taken on the camera page: analyse it now
    await chrome.storage.local.remove("pendingPhoto");
    showTab("camera");
    try {
      const blob = await (await fetch(d.pendingPhoto)).blob();
      takePhoto(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } catch (e) {
      $("camOut").innerHTML = `<div class="err">Could not read the photo. Please try again or use Upload.</div>`;
    }
  } else if (d.pendingCheck) {
    $("materialInput").value = d.pendingCheck;
    await chrome.storage.local.remove("pendingCheck");
    checkMaterial();
  } else if (d.unseen > 0) {
    showTab("bag");
  }
  await chrome.storage.local.set({ unseen: 0 });
})();