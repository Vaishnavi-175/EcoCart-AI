// ---------- Right-click on selected text (e.g. "cotton" or "GOTS") -> check ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ecocart-check",
    title: 'EcoCart: check "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "ecocart-check" || !info.selectionText) return;
  await chrome.storage.local.set({ pendingCheck: info.selectionText.trim() });
  try {
    await chrome.action.openPopup();
  } catch (e) {
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  }
});

// ---------- "Add to bag" captured by content.js ----------
const API = "https://ecocart-ai-backend.onrender.com";

async function scoreOf(material) {
  try {
    const res = await fetch(`${API}/eco-score/${encodeURIComponent(material)}`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    return { __offline: true };
  }
}

// ---------- Website cart sync (retries, handles a sleeping Render backend) ----------
async function wakeBackend() {
  // Render free plan sleeps; the first request can take up to ~60 s
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90000);
  try { await fetch(`${API}/eco-score/cotton`, { signal: ctl.signal }); } catch (e) { /* still asleep */ }
  clearTimeout(t);
}

async function postToWebsite(entry, user) {
  const description = entry.parts.length
    ? entry.parts.map((p) => `${p.pct}% ${p.key.replace(/_/g, " ")}`).join(", ")
    : entry.title;
  try {
    const res = await fetch(`${API}/cart/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.user_id,
        product_name: entry.title,
        product_description: description,
        price: entry.price,
        product_url: /^https?:/.test(entry.url) ? entry.url : null
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

let syncing = false;
async function syncPending() {
  if (syncing) return;
  syncing = true;
  try {
    const st = await chrome.storage.local.get({ cart: [], ecoUser: null });
    if (!st.ecoUser) return;
    const todo = st.cart.filter((c) => !c.synced && c.status !== "skipped");
    if (!todo.length) return;
    await wakeBackend();
    for (const entry of todo) {
      const ok = await postToWebsite(entry, st.ecoUser);
      if (!ok) break; // try again at the next alarm
      const d = await chrome.storage.local.get({ cart: [] });
      const it = d.cart.find((c) => c.url === entry.url && c.title === entry.title);
      if (it) { it.synced = true; await chrome.storage.local.set({ cart: d.cart }); }
    }
  } finally {
    syncing = false;
  }
}

// retry every minute, at browser start, and when the website login is detected
chrome.alarms.create("ecocart-sync", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "ecocart-sync") syncPending(); });
chrome.runtime.onStartup.addListener(syncPending);
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.ecoUser) syncPending(); });

async function handleCapture(item) {
  const looked = await Promise.all(item.parts.map(async (p) => ({ ...p, data: await scoreOf(p.key) })));
  const offline = looked.some((p) => p.data && p.data.__offline);
  const ok = looked.filter((p) => p.data && typeof p.data.eco_score === "number");

  let score = null, carbon = null, water = null, label = "";
  if (ok.length) {
    const total = ok.reduce((s, p) => s + p.pct, 0);
    const wavg = (f) => ok.reduce((s, p) => s + (Number(f(p.data)) || 0) * p.pct, 0) / total;
    score = Math.round(wavg((d) => d.eco_score));
    carbon = Number(wavg((d) => d.carbon_footprint_kg_co2e_per_kg).toFixed(1));
    water = Math.round(wavg((d) => d.water_usage_l_per_kg));
    label = ok.map((p) => `${p.pct}% ${p.key.replace(/_/g, " ")}`).join(" / ");
  }

  const entry = {
    id: String(item.time),
    title: item.title, url: item.url, site: item.site, image: item.image,
    price: item.price ?? null, currency: item.currency || null,
    parts: item.parts.map((p) => ({ key: p.key, pct: p.pct })),
    guessed: item.guessed, score, carbon, water, label,
    garment: item.garment || "top", certs: item.certs || [], warnings: item.warnings || [],
    status: "bag", time: item.time
  };

  const data = await chrome.storage.local.get({ cart: [], unseen: 0, ecoUser: null });
  const prev = data.cart.find((c) => c.url === entry.url && c.title === entry.title);
  entry.synced = prev ? !!prev.synced : false;
  const cart = data.cart.filter((c) => !(c.url === entry.url && c.title === entry.title));
  cart.unshift(entry);
  const unseen = (data.unseen || 0) + 1;
  await chrome.storage.local.set({ cart: cart.slice(0, 100), unseen });

  chrome.action.setBadgeText({ text: String(unseen) });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });

  // also add it to the website cart (needs a login on the EcoCart website once)
  let sync = "nologin";
  if (data.ecoUser) {
    sync = entry.synced ? "done" : "pending";
    if (!entry.synced) syncPending();
  }

  return { score, label, offline: offline && score === null, sync };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ECOCART_CAPTURE") {
    handleCapture(msg.item).then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
});