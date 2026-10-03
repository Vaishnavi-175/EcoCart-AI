// EcoCart AI - runs on shopping pages. Detects "Add to bag / cart / basket" clicks,
// reads the product name + fabric composition, and sends it to the extension.

(function () {
  if (window.__ecocartLoaded) return;
  window.__ecocartLoaded = true;

  const ALIASES = {
    cotton: "cotton", polyester: "polyester", nylon: "nylon", polyamide: "nylon", silk: "silk",
    wool: "wool", merino: "wool", linen: "linen", flax: "linen", hemp: "hemp", acrylic: "acrylic",
    viscose: "viscose_rayon", rayon: "viscose_rayon", denim: "denim", tencel: "tencel", lyocell: "tencel",
    elastane: "elastane", spandex: "elastane", lycra: "elastane", leather: "leather"
  };

  const CART_RE = /add[\s_-]*(this[\s_-]*)?(item[\s_-]*)?to[\s_-]*(my[\s_-]*)?(cart|bag|basket|trolley)|buy[\s_-]*now/i;
  const BTN_SELECTOR = 'button, a, input[type="submit"], input[type="button"], [role="button"], [class*="add-to"], [class*="addto"], [class*="AddTo"], [class*="add_to"]';

  function looksLikeCartButton(el) {
    const cls = typeof el.className === "string" ? el.className : "";
    const text = [
      (el.innerText || "").slice(0, 80), el.value, el.getAttribute("aria-label"), el.title,
      el.id, cls, el.getAttribute("data-testid"), el.getAttribute("name")
    ].filter(Boolean).join(" ");
    return CART_RE.test(text.slice(0, 400));
  }

  function meta(name) {
    const m = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return m && m.content ? m.content.trim() : "";
  }

  function getProductInfo() {
    const h1 = document.querySelector("h1");
    let title = meta("og:title") || (h1 && h1.innerText.trim()) || document.title || "Product";
    title = title.replace(/\s+/g, " ").slice(0, 120);
    return { title, image: meta("og:image"), url: location.href, site: location.hostname.replace(/^www\./, "") };
  }

  // Looks for "60% cotton", "40% recycled polyester" etc.
  function findComposition(text) {
    const found = {};
    const re = /(\d{1,3})\s*%\s*(?:recycled\s+|organic\s+|virgin\s+)?([a-z]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = ALIASES[m[2]];
      const pct = parseInt(m[1], 10);
      if (key && pct > 0 && pct <= 100 && !(key in found)) found[key] = pct;
    }
    return Object.entries(found).map(([key, pct]) => ({ key, pct }));
  }

  function mostMentioned(text) {
    const counts = {};
    Object.keys(ALIASES).forEach((w) => {
      const n = (text.match(new RegExp("\\b" + w + "\\b", "g")) || []).length;
      if (n) counts[ALIASES[w]] = (counts[ALIASES[w]] || 0) + n;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }

  function readComposition() {
    // visible text first, then all text (some sites hide composition inside collapsed sections)
    let text = (document.body.innerText || "").toLowerCase().slice(0, 200000);
    let parts = findComposition(text);
    if (!parts.length) {
      text = (document.body.textContent || "").toLowerCase().slice(0, 300000);
      parts = findComposition(text);
    }
    let guessed = false;
    if (!parts.length) {
      const top = mostMentioned(text);
      if (top) { parts = [{ key: top, pct: 100 }]; guessed = true; }
    }
    return { parts, guessed };
  }

  // ---------- Toast (shadow DOM so site CSS can't break it) ----------
  function showToast(info, result) {
    const old = document.getElementById("ecocart-toast-host");
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = "ecocart-toast-host";
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });

    let body;
    if (result && typeof result.score === "number") {
      const s = Math.round(result.score);
      const color = s >= 70 ? "#1a9b66" : s >= 45 ? "#e29a2e" : "#d65353";
      const verdict = s >= 70 ? "Good choice" : s >= 45 ? "Average impact" : "High impact";
      body = `<div class="row"><div class="score" style="background:${color}">${s}</div>
        <div><div class="v" style="color:${color}">${verdict}${result.guessed ? " (estimated)" : ""}</div>
        <div class="s">${result.label ? result.label : ""}</div></div></div>
        <div class="h">${s < 60 ? "Open the EcoCart icon for greener alternatives." : "Saved to your EcoCart bag."}</div>`;
    } else if (result && result.offline) {
      body = `<div class="h">Saved. Start the EcoCart backend (python app.py) to get the score.</div>`;
    } else {
      body = `<div class="h">Saved to your EcoCart bag. No fabric details found on this page. Open the EcoCart icon to check it manually.</div>`;
    }

    root.innerHTML = `
      <style>
        .box{font-family:"Segoe UI",Arial,sans-serif;width:290px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;border:1px solid #e1ece5}
        .top{background:linear-gradient(135deg,#0b2e21,#1a7a52);color:#fff;padding:10px 14px;font-size:12px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
        .x{cursor:pointer;opacity:.8;font-size:16px;line-height:1}
        .in{padding:12px 14px}
        .t{font-size:12px;color:#14281f;font-weight:600;margin-bottom:8px;line-height:1.35;max-height:34px;overflow:hidden}
        .row{display:flex;gap:10px;align-items:center}
        .score{width:46px;height:46px;border-radius:50%;color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .v{font-weight:800;font-size:13px}.s{font-size:11px;color:#7a8f84;margin-top:2px;text-transform:capitalize}
        .h{font-size:11.5px;color:#4b6256;margin-top:8px;line-height:1.45}
      </style>
      <div class="box"><div class="top"><span>🌿 EcoCart AI</span><span class="x" id="x">×</span></div>
      <div class="in"><div class="t"></div>${body}</div></div>`;
    root.querySelector(".t").textContent = info.title;
    root.getElementById("x").addEventListener("click", () => host.remove());
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 9000);
  }

  // ---------- Click detection ----------
  let lastKey = "", lastAt = 0;
  document.addEventListener("click", (e) => {
    try {
      const el = e.target && e.target.closest ? e.target.closest(BTN_SELECTOR) : null;
      if (!el || !looksLikeCartButton(el)) return;

      const info = getProductInfo();
      const key = info.url + "|" + info.title;
      if (key === lastKey && Date.now() - lastAt < 4000) return;
      lastKey = key; lastAt = Date.now();

      const { parts, guessed } = readComposition();
      const item = { ...info, parts, guessed, time: Date.now() };

      chrome.runtime.sendMessage({ type: "ECOCART_CAPTURE", item }, (res) => {
        if (chrome.runtime.lastError) return;
        showToast(info, res ? { ...res, guessed } : null);
      });
    } catch (err) {
      /* extension was reloaded or page blocked it - ignore */
    }
  }, true);
})();