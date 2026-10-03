const API = "http://127.0.0.1:5000";
const $ = (id) => document.getElementById(id);

// Materials checked when looking for greener alternatives (ones missing in DB are skipped)
const CANDIDATES = ["organic_cotton", "hemp", "linen", "tencel", "cotton", "wool", "silk", "viscose_rayon", "denim", "nylon", "polyester", "acrylic"];
const CHIPS = ["cotton", "polyester", "denim", "silk", "wool", "linen", "nylon"];

// Words found on shopping pages -> material key in your database
const ALIASES = {
  cotton: "cotton", polyester: "polyester", nylon: "nylon", polyamide: "nylon", silk: "silk",
  wool: "wool", merino: "wool", linen: "linen", flax: "linen", hemp: "hemp", acrylic: "acrylic",
  viscose: "viscose_rayon", rayon: "viscose_rayon", denim: "denim", tencel: "tencel", lyocell: "tencel",
  elastane: "elastane", spandex: "elastane", lycra: "elastane", leather: "leather"
};

// General recycling / care guidance
const INFO = {
  cotton: { recycle: "Recyclable in textile recycling. Donate if wearable; worn-out cotton becomes cleaning rags or recycled fibre.", care: "Wash cold, line dry. Fewer washes means a longer life.", tip: "Choose organic or recycled cotton to cut water use." },
  polyester: { recycle: "Plastic-based. Use textile take-back or recycling bins. Single-fibre polyester recycles best.", care: "Wash cold with a microfibre filter bag to stop microplastics.", tip: "Prefer recycled polyester (rPET) if you must buy it." },
  denim: { recycle: "Take to textile recycling or donate. Old jeans can be upcycled into bags or patches.", care: "Wash rarely, cold, inside out.", tip: "Look for low-water or recycled denim." },
  silk: { recycle: "Natural fibre, compostable if undyed and 100% silk. Donate if in good shape.", care: "Hand wash or dry clean; avoid heat.", tip: "Silk lasts long when cared for properly." },
  wool: { recycle: "Wool is often re-spun into new yarn. Natural wool is compostable.", care: "Air it out; wash rarely in cold water.", tip: "Choose recycled or certified-responsible wool." },
  linen: { recycle: "Biodegradable. Donate or textile-recycle; scraps can be composted.", care: "Wash cold; it gets softer with age.", tip: "One of the lower-impact fabrics." },
  nylon: { recycle: "Plastic-based. Needs special textile recycling.", care: "Cold wash in a filter bag to limit microplastics.", tip: "Choose recycled nylon where possible." },
  viscose_rayon: { recycle: "Semi-synthetic from wood pulp, limited recycling. Donate if wearable.", care: "Gentle wash, don't wring when wet.", tip: "Look for certified (FSC / Lyocell-type) viscose." },
  leather: { recycle: "Hard to recycle. Repair, resell or donate.", care: "Condition regularly; avoid soaking.", tip: "Buy less, buy durable." },
  acrylic: { recycle: "Plastic-based, rarely recycled. Use textile take-back schemes.", care: "Cold wash, low-heat dry; it sheds microplastics.", tip: "Prefer wool or recycled blends instead." }
};
const DEFAULT_INFO = { recycle: "Donate if wearable, otherwise use a textile recycling bin. Don't put textiles in general waste.", care: "Wash cold, less often, and air dry.", tip: "The most sustainable garment is the one you already own." };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pretty = (s) => String(s).replace(/_/g, " ");
const colorFor = (n) => (n >= 70 ? "#1a9b66" : n >= 45 ? "#e29a2e" : "#d65353");
const skeleton = () => `<div class="skel"><i style="width:45%"></i><i style="width:80%"></i><i style="width:60%"></i><i style="width:90%"></i></div>`;

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
function tierText(score) { return score >= 70 ? "Good choice" : score >= 45 ? "Average impact" : "High impact"; }

function infoBlock(key, blend) {
  const info = INFO[key] || DEFAULT_INFO;
  return `
    <div class="sec">♻ Recycling &amp; care</div>
    ${blend ? `<div class="tip"><b>Mixed fibres:</b> blends are much harder to recycle than single-fibre clothes. Pure fabrics are easier to reuse.</div>` : ""}
    <div class="tip"><b>Recycling:</b> ${esc(info.recycle)}</div>
    <div class="tip"><b>Care:</b> ${esc(info.care)}</div>
    <div class="tip"><b>Tip:</b> ${esc(info.tip)}</div>`;
}

function equivHTML(carbon, water) {
  if (carbon == null || isNaN(carbon)) return "";
  const co2 = (carbon * 0.25).toFixed(2);
  const km = Math.round((carbon * 0.25) / 0.17);
  const w = water ? Math.round(water * 0.25) : null;
  return `<div class="equiv">A typical <b>250 g</b> garment (like a T-shirt) of this fabric ≈ <b>${co2} kg CO₂e</b>${w ? ` and <b>${w} L</b> of water` : ""}. That is roughly <b>${km} km</b> driven in an average petrol car.</div>`;
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

// ---------- Single material result ----------
function renderMaterial(data, mount) {
  const score = data.eco_score ?? 0;
  const color = colorFor(score);
  const key = (data.material_label || "").toLowerCase();
  const poor = score < 60;

  mount.innerHTML = `
    <div class="card">
      <h3>${esc(pretty(data.material_label))}</h3>
      <div class="sub">${data.type === "fibre" ? "Fibre" : "Fabric"} · ${esc(data.impact_category || "")}</div>
      <div class="hero">
        ${ringHTML(score, color)}
        <div>
          <div class="verdict" style="color:${color}">${esc(data.eco_score_label || tierText(score))}</div>
          <div class="pill">Data confidence ${esc(data.confidence_score ?? "—")}%</div>
        </div>
      </div>
      ${scaleHTML(score)}
      <div class="metrics">
        <div><small>Carbon</small><b>${esc(data.carbon_footprint_kg_co2e_per_kg ?? "—")} kg/kg</b></div>
        <div><small>Water</small><b>${data.water_usage_l_per_kg ? esc(data.water_usage_l_per_kg) + " L/kg" : "N/A"}</b></div>
        <div><small>Type</small><b style="text-transform:capitalize">${esc(data.type || "—")}</b></div>
      </div>
      ${equivHTML(data.carbon_footprint_kg_co2e_per_kg, data.water_usage_l_per_kg)}
      <div class="banner ${poor ? "warn" : "good"}"><span>${poor ? "⚠" : "✓"}</span><span>${poor ? "High-impact material. Greener options are listed below." : "A good choice. Wear it long and care for it well."}</span></div>
      <div id="altBox"></div>
      ${infoBlock(key, false)}
      <div class="sub" style="margin-top:8px">Source: ${esc(data.source || "")}</div>
      <button class="btn ghost full" id="addCmp">+ Add to Compare</button>
    </div>`;

  mount.querySelector("#addCmp").addEventListener("click", () => addToCompare(data));
  animate(mount);
  if (poor) loadAlternatives(score, data.carbon_footprint_kg_co2e_per_kg, [key], mount.querySelector("#altBox"));
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

async function scanPage() {
  const out = $("materialOut");
  out.innerHTML = skeleton();
  let text = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ visible: document.body.innerText.slice(0, 200000), all: document.body.textContent.slice(0, 300000) })
    });
    const r = res && res.result ? res.result : { visible: "", all: "" };
    text = r.visible.toLowerCase();
    var allText = r.all.toLowerCase();
  } catch (e) {
    out.innerHTML = `<div class="err">Can't read this page (browser pages like chrome:// are blocked). Open a product page and try again.</div>`;
    return;
  }

  // Find things like "60% cotton", "40% recycled polyester"
  const findParts = (t) => {
    const f = {};
    const re = /(\d{1,3})\s*%\s*(?:recycled\s+|organic\s+|virgin\s+)?([a-z]+)/g;
    let mm;
    while ((mm = re.exec(t)) !== null) {
      const key = ALIASES[mm[2]];
      const pct = parseInt(mm[1], 10);
      if (key && pct > 0 && pct <= 100 && !(key in f)) f[key] = pct;
    }
    return Object.entries(f).map(([k, p]) => ({ key: k, pct: p }));
  };

  let parts = findParts(text);
  if (!parts.length) { parts = findParts(allText); if (parts.length) text = allText; }

  if (!parts.length) {
    // No percentages, so use the most-mentioned material word
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
    out.innerHTML = `<div class="banner good"><span>🔍</span><span>No composition % on this page. The most mentioned fabric is <b>${esc(pretty(top[0]))}</b>.</span></div><div id="scanSingle"></div>`;
    const data = await getScore(top[0]).catch(() => null);
    if (data) renderMaterial(data, out.querySelector("#scanSingle"));
    return;
  }

  // Look up every component, then compute a weighted score
  const looked = await Promise.all(parts.map(async (p) => ({ ...p, data: await getScore(p.key).catch(() => null) })));
  const ok = looked.filter((p) => p.data && typeof p.data.eco_score === "number");
  if (!ok.length) {
    out.innerHTML = `<div class="err">Found fabrics on the page, but none are in our database yet.</div>`;
    return;
  }
  renderBlend(ok, out);
}

function renderBlend(parts, mount, title) {
  const total = parts.reduce((s, p) => s + p.pct, 0);
  const wavg = (f) => parts.reduce((s, p) => s + (Number(f(p.data)) || 0) * p.pct, 0) / total;
  const score = wavg((d) => d.eco_score);
  const carbon = wavg((d) => d.carbon_footprint_kg_co2e_per_kg);
  const water = wavg((d) => d.water_usage_l_per_kg);
  const color = colorFor(score);
  const poor = score < 60;
  const main = parts.slice().sort((a, b) => b.pct - a.pct)[0];
  const label = parts.map((p) => `${p.pct}% ${pretty(p.key)}`).join(" / ");

  const rows = parts.map((p) => `
    <div class="r"><span class="n">${esc(pretty(p.key))}</span>
      <span class="bar"><em style="width:${Math.round((p.pct / total) * 100)}%;background:${colorFor(p.data.eco_score)}"></em></span>
      <span class="v">${p.pct}% · score ${esc(p.data.eco_score)}</span></div>`).join("");

  mount.innerHTML = `
    <div class="card">
      <h3>${title ? esc(title) : "This product's fabric"}</h3>
      <div class="sub">Weighted score from the composition found on the page</div>
      <div class="hero">
        ${ringHTML(score, color)}
        <div>
          <div class="verdict" style="color:${color}">${tierText(score)}</div>
          <div class="pill">${parts.length > 1 ? "Blend of " + parts.length + " fibres" : "Single fibre"}</div>
        </div>
      </div>
      ${scaleHTML(score)}
      <div class="comp">${rows}</div>
      <div class="metrics" style="margin-top:12px">
        <div><small>Carbon</small><b>${carbon.toFixed(1)} kg/kg</b></div>
        <div><small>Water</small><b>${water ? Math.round(water) + " L/kg" : "N/A"}</b></div>
        <div><small>Parts</small><b>${parts.length}</b></div>
      </div>
      ${equivHTML(carbon, water)}
      <div class="banner ${poor ? "warn" : "good"}"><span>${poor ? "⚠" : "✓"}</span><span>${poor ? "This product has a high-impact fabric mix." : "Looks like a reasonable fabric choice."}</span></div>
      <div id="altBox"></div>
      ${infoBlock(main.key, parts.length > 1)}
      <button class="btn ghost full" id="addCmp">+ Add to Compare</button>
    </div>`;

  animate(mount);
  mount.querySelector("#addCmp").addEventListener("click", () =>
    addToCompare({ material_label: label, eco_score: Math.round(score), eco_score_label: tierText(score), carbon_footprint_kg_co2e_per_kg: Number(carbon.toFixed(1)), water_usage_l_per_kg: Math.round(water), confidence_score: Math.round(wavg((d) => d.confidence_score)) }));
  if (poor) loadAlternatives(score, carbon, parts.map((p) => p.key), mount.querySelector("#altBox"));
}

// ---------- Barcode tab ----------
$("barcodeBtn").addEventListener("click", checkBarcode);
$("barcodeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkBarcode(); });

async function checkBarcode() {
  const code = $("barcodeInput").value.trim();
  const out = $("barcodeOut");
  if (!code) return;
  out.innerHTML = skeleton();
  try {
    const res = await fetch(`${API}/barcode/${encodeURIComponent(code)}`);
    const d = await res.json();
    if (!res.ok) { out.innerHTML = `<div class="err">${esc(d.error || "Product not found")}</div>`; return; }

    if (d.material_label && typeof d.eco_score === "number") {
      out.innerHTML = `<div class="card"><h3>${esc(d.name || "Product")}</h3><div class="sub">${esc(d.brand || "")}</div></div><div id="bcMat"></div>`;
      renderMaterial(d, out.querySelector("#bcMat"));
      return;
    }

    const img = d.image ? `<img src="${esc(d.image)}" style="width:68px;height:68px;object-fit:contain;border-radius:12px;background:#f4f7f5;margin-right:12px" alt="">` : "";
    out.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center">${img}
          <div><h3>${esc(d.name || "Unnamed product")}</h3><div class="sub">${esc(d.brand || "Brand unknown")}${d.quantity ? " · " + esc(d.quantity) : ""}</div></div>
        </div>
        <div class="banner ${d.env_grade ? "good" : "warn"}"><span>🌍</span><span>${d.env_grade ? "Environmental grade: <b>" + esc(String(d.env_grade).toUpperCase()) + "</b>" : "Environmental grade not available for this product. We don't guess."}</span></div>
        ${d.nutriscore_grade ? `<div class="tip" style="margin-top:8px"><b>Nutri-Score:</b> ${esc(String(d.nutriscore_grade).toUpperCase())}</div>` : ""}
        ${d.packaging_text ? `<div class="tip" style="margin-top:8px"><b>Packaging:</b> ${esc(d.packaging_text)}</div>` : ""}
        <div class="sub" style="margin-top:8px">Source: ${esc(d.source || "open database")}</div>
      </div>`;
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b>.</div>`;
  }
}

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

    const rows = d.predictions.slice(0, 3).map((p) =>
      `<div class="pbar"><b>${esc(pretty(p.label))}</b><i><em style="width:${Math.round(p.confidence * 100)}%"></em></i><span>${Math.round(p.confidence * 100)}%</span></div>`).join("");

    out.innerHTML = `
      <div class="card">
        <h3>Detected: ${esc(pretty(d.predictions[0].label))}</h3>
        ${rows}
        <div class="sub" style="margin-top:8px">Model accuracy is still improving as it trains on more data.</div>
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
      material_label: data.material_label, eco_score: data.eco_score, eco_score_label: data.eco_score_label,
      carbon_footprint_kg_co2e_per_kg: data.carbon_footprint_kg_co2e_per_kg,
      water_usage_l_per_kg: data.water_usage_l_per_kg, confidence_score: data.confidence_score
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
        <button data-act="details" data-i="${i}">Details &amp; alternatives</button>
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
      addToCompare({ material_label: item.label || item.title, eco_score: item.score, eco_score_label: tierText(item.score), carbon_footprint_kg_co2e_per_kg: item.carbon, water_usage_l_per_kg: item.water, confidence_score: null });
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
    const looked = await Promise.all(item.parts.map(async (p) => ({ ...p, data: await getScore(p.key).catch(() => null) })));
    const ok = looked.filter((p) => p.data && typeof p.data.eco_score === "number");
    if (!ok.length) { out.innerHTML = `<div class="err">Those fabrics aren't in our database yet, or the backend isn't running.</div>`; return; }
    renderBlend(ok, out, item.title);
  } catch (e) {
    out.innerHTML = `<div class="err">Can't reach the backend. Run <b>python app.py</b>.</div>`;
  }
}

$("bagClear").addEventListener("click", async () => {
  await chrome.storage.local.set({ cart: [] });
  renderBag(); updateCount();
});

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
        <div class="sub">CO₂ ${esc(i.carbon_footprint_kg_co2e_per_kg ?? "—")} kg/kg · Water ${i.water_usage_l_per_kg ? esc(i.water_usage_l_per_kg) + " L/kg" : "N/A"}</div>
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
    showTab("bag");   // something was added to a bag since last time
  }
  await chrome.storage.local.set({ unseen: 0 });
})();