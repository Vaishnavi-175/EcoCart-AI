// ---------- Right-click on selected text (e.g. "cotton") -> check eco score ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ecocart-check",
    title: 'EcoCart: check eco score of "%s"',
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
const API = "http://127.0.0.1:5000";

async function scoreOf(material) {
  try {
    const res = await fetch(`${API}/eco-score/${encodeURIComponent(material)}`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    return { __offline: true };
  }
}

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
    parts: item.parts.map((p) => ({ key: p.key, pct: p.pct })),
    guessed: item.guessed, score, carbon, water, label, time: item.time
  };

  const data = await chrome.storage.local.get({ cart: [], unseen: 0 });
  const cart = data.cart.filter((c) => !(c.url === entry.url && c.title === entry.title));
  cart.unshift(entry);
  const unseen = (data.unseen || 0) + 1;
  await chrome.storage.local.set({ cart: cart.slice(0, 50), unseen });

  chrome.action.setBadgeText({ text: String(unseen) });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });

  return { score, label, offline: offline && score === null };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ECOCART_CAPTURE") {
    handleCapture(msg.item).then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
});