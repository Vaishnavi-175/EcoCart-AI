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

// ask the server for one material; the free server may be asleep, so allow up to 70 s
async function scoreOf(material) {
  const ctl = new AbortController();
  const killer = setTimeout(() => ctl.abort(), 70000);
  try {
    const res = await fetch(`${API}/eco-score/${encodeURIComponent(material)}`, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return { __offline: true };
  } finally {
    clearTimeout(killer);
  }
}

// weighted score / carbon / water for the fabrics found on the page
async function scoreParts(parts) {
  const looked = await Promise.all(parts.map(async (p) => ({ ...p, data: await scoreOf(p.key) })));
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
  return { score, carbon, water, label, offline: offline && score === null };
}

async function handleCapture(item) {
  const parts = item.parts || [];

  // 1) SAVE AT ONCE, so the product is in the bag even if the server is asleep
  const entry = {
    id: String(item.time),
    title: item.title, url: item.url, site: item.site, image: item.image,
    price: item.price ?? null, currency: item.currency || null,
    parts: parts.map((p) => ({ key: p.key, pct: p.pct })),
    guessed: item.guessed, score: null, carbon: null, water: null, label: "",
    garment: item.garment || "top", certs: item.certs || [], warnings: item.warnings || [],
    status: "bag", time: item.time
  };
  const data = await chrome.storage.local.get({ cart: [], unseen: 0 });
  const cart = data.cart.filter((c) => !(c.url === entry.url && c.title === entry.title));
  cart.unshift(entry);
  const unseen = (data.unseen || 0) + 1;
  await chrome.storage.local.set({ cart: cart.slice(0, 100), unseen });
  chrome.action.setBadgeText({ text: String(unseen) });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });

  // 2) SCORE it, then update the saved item (this can take a minute if the server is waking up)
  const scoring = scoreParts(parts).then(async (r) => {
    const d = await chrome.storage.local.get({ cart: [] });
    const saved = d.cart.find((c) => c.id === entry.id);
    if (saved) {
      saved.score = r.score; saved.carbon = r.carbon; saved.water = r.water; saved.label = r.label;
      await chrome.storage.local.set({ cart: d.cart });
    }
    return r;
  });

  // 3) the toast waits at most 8 s for the score
  const quick = await Promise.race([scoring, new Promise((res) => setTimeout(() => res(null), 8000))]);
  if (quick) return { score: quick.score, label: quick.label, offline: quick.offline };
  return { score: null, label: "", offline: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ECOCART_CAPTURE") {
    handleCapture(msg.item).then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
});