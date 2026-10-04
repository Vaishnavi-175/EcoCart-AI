const API = "http://127.0.0.1:5000";
const $ = (id) => document.getElementById(id);

// Materials checked when looking for greener alternatives (ones missing in DB are skipped)
const CANDIDATES = ["organic_cotton", "hemp", "linen", "tencel", "cotton", "wool", "silk", "viscose_rayon", "denim", "nylon", "polyester", "acrylic"];
const CHIPS = ["cotton", "polyester", "denim", "silk", "wool", "linen", "nylon"];

// Words found on shopping pages -> material key in the database
const ALIASES = {
  cotton: "cotton", polyester: "polyester", nylon: "nylon", polyamide: "nylon", silk: "silk",
  wool: "wool", merino: "wool", linen: "linen", flax: "linen", hemp: "hemp", acrylic: "acrylic",
  viscose: "viscose_rayon", rayon: "viscose_rayon", denim: "denim", tencel: "tencel", lyocell: "tencel",
  elastane: "elastane", spandex: "elastane", lycra: "elastane", leather: "leather"
};

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
// THE GARMENT REPORT - one card used by Material, Barcode, Camera, Scan, Bag
// parts: [{ key, pct, data }]   (single material = one part with pct 100)
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
  animate(mount);
  if (poor) loadAlternatives(score, r.carbonKg, parts.map((p) => p.key), mount.querySelector("#altBox"));
}

function renderMaterial(data, mount, opts) {
  const key = String(data.material_label || "").toLowerCase();
  renderReport(mount, {
    title: (opts && opts.title) || pretty(key),
    subtitle: (opts && opts.subtitle) || `${data.type === "fibre" ? "Fibre" : "Fabric"}${data.impact_category ? " · " + data.impact_category : ""}`,
    parts: [{ key, pct: 100, data }]
  });
}

// ---------- Material tab ----------
$("materialChips").innerHTML = CHIPS.map((c) => `<span class="chip" data-m="${c}">${c}</span>`).join("");
$("materialChips").addEventListener("click", (e) => {
  if (e.target.dataset.m) { $("materialInput").value = e.target.dataset.m; checkMaterial(); }
});
$("materialBtn").addEventListener("click", checkMaterial);
$("materialInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkMaterial(); });

async function checkMaterial() {
  let m = $("materialInput").value.trim().toLowerCase();
  const out = $("materialOut");
  if (!m) return;
  m = ALIASES[m] || m.replace(/\s+/g, "_");
  out.innerHTML = skeleton();
  try {
    const data = await getScore(m);
    if (!data) { out.innerHTML = `<div class="err">No data for "${esc(m)}". Try: cotton, polyester, denim, silk, wool.</div>`; return; }
    renderMaterial(data, out);
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b> (port 5000).</div>`;
  }
}

// ---------- Scan the current shopping page ----------
$("scanBtn").addEventListener("click", scanPage);

function findParts(t) {
  const f = {};
  const re = /(\d{1,3})\s*%\s*(?:recycled\s+|organic\s+|virgin\s+)?([a-z]+)/g;
  let mm;
  while ((mm = re.exec(t)) !== null) {
    const key = ALIASES[mm[2]];
    const pct = parseInt(mm[1], 10);
    if (key && pct > 0 && pct <= 100 && !(key in f)) f[key] = pct;
  }
  return Object.entries(f).map(([k, p]) => ({ key: k, pct: p }));
}

async function lookupParts(parts) {
  const looked = await Promise.all(parts.map(async (p) => ({ ...p, data: await getScore(p.key).catch(() => null) })));
  return looked.filter((p) => p.data && typeof p.data.eco_score === "number");
}

async function scanPage() {
  const out = $("materialOut");
  out.innerHTML = skeleton();
  let text = "", allText = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ visible: document.body.innerText.slice(0, 200000), all: document.body.textContent.slice(0, 300000) })
    });
    const r = res && res.result ? res.result : { visible: "", all: "" };
    text = r.visible.toLowerCase();
    allText = r.all.toLowerCase();
  } catch (e) {
    out.innerHTML = `<div class="err">Can't read this page (browser pages like chrome:// are blocked). Open a product page and try again.</div>`;
    return;
  }

  let parts = findParts(text);
  if (!parts.length) { parts = findParts(allText); if (parts.length) text = allText; }

  if (!parts.length) {
    const counts = {};
    Object.keys(ALIASES).forEach((w) => {
      const n = (text.match(new RegExp("\\b" + w + "\\b", "g")) || []).length;
      if (n) counts[ALIASES[w]] = (counts[ALIASES[w]] || 0) + n;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) {
      out.innerHTML = `<div class="err">No fabric details found on this page. Look for the "Material / Composition" section, select the word (e.g. cotton), right-click and choose "EcoCart".</div>`;
      return;
    }
    $("materialInput").value = top[0];
    out.innerHTML = `<div class="banner good"><span>🔍</span><span>No composition % on this page. The most mentioned fabric is <b>${esc(pretty(top[0]))}</b> (estimate).</span></div><div id="scanSingle"></div>`;
    const data = await getScore(top[0]).catch(() => null);
    if (data) renderMaterial(data, out.querySelector("#scanSingle"));
    return;
  }

  const ok = await lookupParts(parts);
  if (!ok.length) { out.innerHTML = `<div class="err">Found fabrics on the page, but none are in our database yet.</div>`; return; }
  renderReport(out, { title: "This product's fabric", parts: ok });
}

// ---------- Barcode tab (clothing only) ----------
$("barcodeBtn").addEventListener("click", checkBarcode);
$("barcodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkBarcode(); });

async function checkBarcode() {
  const code = $("barcodeInput").value.trim();
  const out = $("barcodeOut");
  if (!code) return;
  out.innerHTML = skeleton();
  try {
    const res = await fetch(`${API}/barcode/${encodeURIComponent(code)}`);
    const d = await res.json().catch(() => ({}));
    const isClothing = res.ok && d && d.material_label && typeof d.eco_score === "number";

    if (!isClothing) {
      out.innerHTML = `<div class="err"><b>Not in our clothing catalog.</b><br>No free public database exists for clothing barcodes, because retailers keep them private. Check the fabric from the care label instead (Material tab).</div>`;
      return;
    }
    renderMaterial(d, out, { title: d.name || "Clothing product", subtitle: [d.brand, d.category].filter(Boolean).join(" · ") || "From the EcoCart catalog" });
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b>.</div>`;
  }
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

// ---------- Bag: products captured when you press "Add to bag" on any website ----------
async function renderBag() {
  const { cart } = await chrome.storage.local.get({ cart: [] });
  const list = $("bagList");
  $("bagClear").style.display = cart.length ? "block" : "none";
  if (!cart.length) {
    list.innerHTML = `<div class="empty"><span class="big">🛍</span>Your bag is empty.<br>Press <b>Add to bag</b> on any shopping website and the product appears here with its eco score.</div>`;
    return;
  }

  const scored = cart.filter((c) => typeof c.score === "number");
  const avg = scored.length ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : null;
  const summary = avg !== null
    ? `<div class="summary"><div><small>Average eco score of your bag</small><b>${avg}/100</b></div><div style="text-align:right"><small>${cart.length} item${cart.length > 1 ? "s" : ""}</small><span style="font-weight:700">${tierText(avg)}</span></div></div>`
    : "";

  list.innerHTML = summary + cart.map((c, i) => {
    const hasScore = typeof c.score === "number";
    const img = c.image ? `<img src="${esc(c.image)}" alt="">` : `<div class="ph">👕</div>`;
    return `<div class="item">
      <div class="top">${img}
        <div style="flex:1;min-width:0"><div class="nm">${esc(c.title)}</div>
          <div class="meta">${esc(c.site)}${c.label ? " · " + esc(c.label) : ""}${c.guessed ? " (estimated)" : ""}</div></div>
        ${hasScore ? `<div class="sc" style="background:${colorFor(c.score)}">${c.score}</div>` : `<div class="sc" style="background:#b7c5bc">?</div>`}
      </div>
      <div class="acts">
        <button data-act="details" data-i="${i}">Full report</button>
        <button data-act="compare" data-i="${i}">+ Compare</button>
        <button class="rm" data-act="remove" data-i="${i}">Remove</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const data = await chrome.storage.local.get({ cart: [] });
    const item = data.cart[Number(b.dataset.i)];
    if (!item) return;
    if (b.dataset.act === "remove") {
      data.cart.splice(Number(b.dataset.i), 1);
      await chrome.storage.local.set({ cart: data.cart });
      renderBag(); updateCount();
    } else if (b.dataset.act === "compare") {
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
    renderReport(out, { title: item.title, parts: ok });
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b>.</div>`;
  }
}

$("bagClear").addEventListener("click", async () => {
  await chrome.storage.local.set({ cart: [] });
  renderBag(); updateCount();
});

// ---------- Init (handles right-click "check" from background.js) ----------
(async function init() {
  updateCount();
  chrome.action.setBadgeText({ text: "" });
  const d = await chrome.storage.local.get({ pendingCheck: null, unseen: 0 });
  if (d.pendingCheck) {
    $("materialInput").value = d.pendingCheck.toLowerCase();
    await chrome.storage.local.remove("pendingCheck");
    checkMaterial();
  } else if (d.unseen > 0) {
    showTab("bag");
  }
  await chrome.storage.local.set({ unseen: 0 });
})();