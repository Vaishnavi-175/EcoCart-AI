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

async function loadAlternatives(score, carbon, exclude, box) {
  box.innerHTML = skeleton();
  const results = await Promise.all(
    CANDIDATES.filter((m) => !exclude.includes(m)).map((m) => getScore(m).catch(() => null))
  );
  const better = results
    .filter((r) => r && typeof r.eco_score === "number" && r.eco_score > score)
    .sort((a, b) => b.eco_score - a.eco_score)
    .slice(0, 3);

  if (!better.length) {
    box.innerHTML = `<div class="tip">No better material found in our database. Buying second-hand is usually the greenest option.</div>`;
    return;
  }
  box.innerHTML =
    `<div class="sec">🌿 Greener alternatives</div>` +
    better.map((b) => {
      const saving = carbon && b.carbon_footprint_kg_co2e_per_kg != null
        ? Math.round(((carbon - b.carbon_footprint_kg_co2e_per_kg) / carbon) * 100) : null;
      return `<div class="alt">
        <div class="info"><b>${esc(pretty(b.material_label))}</b>
          <div class="gain">+${Math.round(b.eco_score - score)} points${saving && saving > 0 ? ` · about ${saving}% less carbon` : ""}</div></div>
        <div class="sc">${esc(b.eco_score)}</div>
      </div>`;
    }).join("") +
    `<div class="tip">Even better: buy second-hand, or pick recycled / organic versions of these.</div>`;
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
// THE GARMENT REPORT - one card used by Material, Barcode, Camera, Scan, Bag
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
      <div class="banner ${poor ? "warn" : "good"}"><span>${poor ? "⚠" : "✓"}</span><span>${poor ? "High-impact fabric. Greener options are listed below." : "A good choice. Wear it long and care for it well."}</span></div>

      <div id="altBox"></div>

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
  if (poor) loadAlternatives(score, r.carbonKg, parts.map((p) => p.key), mount.querySelector("#altBox"));
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
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b> (port 5000).</div>`;
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

// ---------- Barcode tab (clothing only) ----------
$("barcodeBtn").addEventListener("click", checkBarcode);
$("barcodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkBarcode(); });

async function getUserCatalog() { return (await chrome.storage.local.get({ userCatalog: {} })).userCatalog; }

async function checkBarcode() {
  const code = $("barcodeInput").value.trim().replace(/\s+/g, "");
  const out = $("barcodeOut");
  if (!code) return;
  out.innerHTML = skeleton();

  // 1) products the user saved earlier (works even when the backend is off)
  const uc = await getUserCatalog();
  if (uc[code]) { await showSavedProduct(code, uc[code], out); return; }

  // 2) the EcoCart catalog in the backend
  let backendDown = false;
  try {
    const res = await fetch(`${API}/barcode/${encodeURIComponent(code)}`);
    const d = await res.json().catch(() => ({}));
    const key = String(d.material_label || d.material || d.material_name || "").toLowerCase().replace(/\s+/g, "_");
    const score = Number(d.eco_score);
    if (res.ok && key && d.eco_score != null && !isNaN(score)) {
      d.material_label = key;
      d.eco_score = score;
      out.innerHTML = `<div id="bcRep"></div>`;
      const price = Number(d.price);
      renderMaterial(d, out.querySelector("#bcRep"), {
        title: d.name || "Clothing product",
        subtitle: [d.brand, d.category].filter(Boolean).join(" · ") || "From the EcoCart catalog",
        track: { url: "barcode:" + code, site: "barcode", image: d.image || null, price: isFinite(price) && price > 0 ? price : null, currency: "INR" }
      });
      return;
    }
  } catch (e) {
    backendDown = true;
  }

  // 3) not found anywhere -> let the user add it
  renderAddProduct(code, out, backendDown);
}

async function showSavedProduct(code, entry, out) {
  out.innerHTML = `<div id="bcRep"></div><div id="bcExtra"></div>`;
  const rep = out.querySelector("#bcRep");
  const ok = await lookupParts(entry.parts).catch(() => []);
  if (!ok.length) { rep.innerHTML = `<div class="err">Your saved product "${esc(entry.name)}" needs the backend to calculate its score. Run <b>python app.py</b>.</div>`; }
  else {
    currentGarment = entry.garment || currentGarment;
    renderReport(rep, {
      title: entry.name, subtitle: `Saved by you · barcode ${code}${entry.price ? " · " + fmtPrice(entry.price, entry.currency) : ""}`,
      parts: ok, track: { url: "barcode:" + code, site: "barcode", image: null, price: entry.price ?? null, currency: entry.currency || null }
    });
  }
  const ex = out.querySelector("#bcExtra");
  ex.innerHTML = `<button class="btn ghost full danger" id="bcDel">Remove this saved product</button>`;
  ex.querySelector("#bcDel").addEventListener("click", async () => {
    const u = await getUserCatalog();
    delete u[code];
    await chrome.storage.local.set({ userCatalog: u });
    out.innerHTML = `<div class="banner good"><span>✓</span><span>Removed.</span></div>`;
  });
}

function renderAddProduct(code, out, backendDown) {
  const field = `style="width:100%;padding:11px;border:1.5px solid #e1ece5;border-radius:12px;margin-top:8px;font-size:13px;background:#fff;color:#14281f"`;
  out.innerHTML = `
    <div class="card">
      <h3>New barcode</h3>
      <div class="sub">Barcode <b>${esc(code)}</b> isn't in our clothing catalog${backendDown ? " (and the backend is not reachable)" : ""}. No free public database of clothing barcodes exists, because retailers keep them private. Add it yourself, like contributors do on Open Food Facts, and the next scan finds it instantly.</div>
      <input id="npName" ${field} placeholder="Product name, e.g. Floral cotton top">
      <input id="npComp" ${field} placeholder="Fabric from the care label, e.g. 60% cotton, 40% polyester">
      <input id="npPrice" type="number" min="0" ${field} placeholder="Price in ₹ (optional)">
      <select id="npGarment" ${field}>${Object.entries(GARMENTS).map(([k, g]) => `<option value="${k}">${esc(g.label)}</option>`).join("")}</select>
      <div class="err" id="npErr" style="display:none"></div>
      <button class="btn full" id="npSave">Save and analyse</button>
    </div>`;
  $("npSave").addEventListener("click", async () => {
    const name = $("npName").value.trim();
    const comp = $("npComp").value.trim().toLowerCase();
    const err = $("npErr");
    let parts = findParts(comp);
    if (!parts.length && ALIASES[comp]) parts = [{ key: ALIASES[comp], pct: 100 }];
    if (!name) { err.style.display = "block"; err.textContent = "Please enter a product name."; return; }
    if (!parts.length) { err.style.display = "block"; err.textContent = 'Write the fabric like "60% cotton, 40% polyester" or just "cotton".'; return; }
    const price = parseFloat($("npPrice").value);
    const u = await getUserCatalog();
    u[code] = { name, parts, price: isFinite(price) && price > 0 ? price : null, currency: "INR", garment: $("npGarment").value, added: Date.now() };
    await chrome.storage.local.set({ userCatalog: u });
    await showSavedProduct(code, u[code], out);
  });
}

// Read a barcode from a photo (works only where the browser supports BarcodeDetector)
$("bcPhotoBtn").addEventListener("click", () => $("bcPhoto").click());
$("bcPhoto").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  const out = $("barcodeOut");
  if (!f) return;
  if (!("BarcodeDetector" in window)) {
    out.innerHTML = `<div class="err">This browser can't read barcodes from a photo. Type the digits instead.</div>`;
    return;
  }
  try {
    const det = new BarcodeDetector();
    const bmp = await createImageBitmap(f);
    const codes = await det.detect(bmp);
    if (!codes.length) { out.innerHTML = `<div class="err">No barcode found in the photo. Try a closer, sharper picture.</div>`; return; }
    $("barcodeInput").value = codes[0].rawValue;
    checkBarcode();
  } catch (err) {
    out.innerHTML = `<div class="err">Couldn't read the barcode from this photo. Type the digits instead.</div>`;
  }
});

// ---------- Camera tab ----------
let photo = null;
$("camPick").addEventListener("click", () => $("camFile").click());
$("camFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  photo = f;
  $("camPreview").src = URL.createObjectURL(f);
  $("camPreview").style.display = "block";
  $("camIntro").style.display = "none";
  $("camDetect").style.display = "block";
  $("camOut").innerHTML = "";
});

$("camDetect").addEventListener("click", async () => {
  if (!photo) return;
  const out = $("camOut");
  out.innerHTML = skeleton();
  const fd = new FormData();
  fd.append("image", photo, "photo.jpg");
  try {
    const res = await fetch(`${API}/detect`, { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) { out.innerHTML = `<div class="err">${esc(d.error || "Detection failed")}</div>`; return; }
    if (!d.predictions || !d.predictions.length) { out.innerHTML = `<div class="err">No garment detected. Try a clearer, closer photo.</div>`; return; }

    currentGarment = mapGarment(d.predictions[0].label); // detected garment sets the weight used below

    const rows = d.predictions.slice(0, 3).map((p) =>
      `<div class="pbar"><b>${esc(pretty(p.label))}</b><i><em style="width:${Math.round(p.confidence * 100)}%"></em></i><span>${Math.round(p.confidence * 100)}%</span></div>`).join("");

    out.innerHTML = `
      <div class="card">
        <h3>Detected: ${esc(pretty(d.predictions[0].label))}</h3>
        ${rows}
        <div class="sub" style="margin-top:8px">Our YOLO model is trained on a subset of Fashionpedia, so accuracy is still improving.</div>
        <div class="sec">What is it made of?</div>
        <select id="camMat"><option value="">Select fabric...</option>
          ${["cotton", "polyester", "silk", "wool", "denim", "nylon", "linen", "viscose_rayon", "acrylic"].map((m) => `<option value="${m}">${pretty(m)}</option>`).join("")}
        </select>
      </div>
      <div id="camMatOut"></div>`;

    $("camMat").addEventListener("change", async (e) => {
      const m = e.target.value;
      const box = $("camMatOut");
      if (!m) { box.innerHTML = ""; return; }
      box.innerHTML = skeleton();
      const data = await getScore(m).catch(() => null);
      if (!data) { box.innerHTML = `<div class="err">No data for this material.</div>`; return; }
      renderMaterial(data, box);
    });
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend, or the detection model isn't loaded.</div>`;
  }
});

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
async function getFilters() {
  return (await chrome.storage.local.get({ filters: { min: 0, max: null, sort: "new" } })).filters;
}
async function saveFilters(f) { await chrome.storage.local.set({ filters: f }); }

function readFilterInputs() {
  const mx = parseFloat($("fMax").value);
  return { min: Number($("fMin").value) || 0, max: isFinite(mx) && mx > 0 ? mx : null, sort: $("fSort").value };
}
["fMin", "fMax", "fSort"].forEach((id) => $(id).addEventListener("input", async () => {
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
  $("fCount").textContent = `Showing ${rows.length} of ${cart.length}${notes.length ? " · " + notes.join(" · ") : ""}. Prices are compared as plain numbers, no currency conversion.`;

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
    if (!ok.length) { out.innerHTML = `<div class="err">Those fabrics aren't in our database yet, or the backend isn't running.</div>`; return; }
    currentGarment = item.garment || "top";
    out.innerHTML = `<div id="bagRep"></div><div id="bagLabels"></div>`;
    renderReport(out.querySelector("#bagRep"), { title: item.title, subtitle: item.price != null ? "Price: " + fmtPrice(item.price, item.currency) : "", parts: ok });
    const ids = item.certs || [];
    const info = { found: ECO_LABELS.filter((l) => ids.includes(l.id)), warnings: item.warnings || [] };
    out.querySelector("#bagLabels").innerHTML = labelsCardHTML(info, "Labels & claims when you added it");
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b>.</div>`;
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
