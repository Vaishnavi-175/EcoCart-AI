// EcoCart AI - runs on shopping pages (loaded after data.js, page.js and sync.js).
// Detects "Add to bag / cart / basket" clicks, reads the product (name, price, fabric, eco-labels)
// and sends it to the extension.

(function () {
  if (window.__ecocartLoaded) return;
  window.__ecocartLoaded = true;

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

  function readComposition(visible, all) {
    let text = visible.toLowerCase();
    let parts = findParts(text);
    if (!parts.length) { text = all.toLowerCase(); parts = findParts(text); }
    let guessed = false;
    if (!parts.length) {
      const top = topMentioned(text);
      if (top) { parts = [{ key: top, pct: 100 }]; guessed = true; }
    }
    return { parts, guessed };
  }

  // ---------- Toast (shadow DOM so site CSS can't break it) ----------
  function showToast(title, result, labels, price, currency) {
    const old = document.getElementById("ecocart-toast-host");
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = "ecocart-toast-host";
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });

    const labelLine = labels.found.length
      ? `<div class="l ok">🏷 ${labels.found.slice(0, 3).map((l) => l.name.replace(/ \(.*\)$/, "")).join(", ")}</div>`
      : `<div class="l warn">No recognised eco-label on this page</div>`;
    const priceLine = price ? `<div class="s">${fmtPrice(price, currency)}</div>` : "";

    let body;
    if (result && typeof result.score === "number") {
      const s = Math.round(result.score);
      const color = s >= 70 ? "#1a9b66" : s >= 45 ? "#e29a2e" : "#d65353";
      const verdict = s >= 70 ? "Good choice" : s >= 45 ? "Average impact" : "High impact";
      body = `<div class="row"><div class="score" style="background:${color}">${s}</div>
        <div><div class="v" style="color:${color}">${verdict}${result.guessed ? " (estimated)" : ""}</div>
        <div class="s">${result.label ? result.label : ""}</div>${priceLine}</div></div>
        ${labelLine}
        <div class="h">${s < 60 ? "Open the EcoCart icon for greener alternatives." : "Saved to your EcoCart bag."}</div>`;
    } else if (result && result.offline) {
      body = `${labelLine}<div class="h">Saved. Start the EcoCart backend (python app.py) to get the score.</div>`;
    } else {
      body = `${labelLine}<div class="h">Saved to your EcoCart bag. No fabric details found on this page. Open the EcoCart icon to check it manually.</div>`;
    }

    let syncLine = "";
    if (result && result.sync === "pending") syncLine = `<div class="l ok">☁ Adding to your website cart…</div>`;
    else if (result && result.sync === "done") syncLine = `<div class="l ok">☁ Already in your website cart</div>`;
    else if (result && result.sync === "nologin") syncLine = `<div class="l warn">Log in on the EcoCart website once to also add to your website cart.</div>`;

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
        .l{font-size:11.5px;font-weight:700;margin-top:9px}.l.ok{color:#14633f}.l.warn{color:#8a5a16}
        .h{font-size:11.5px;color:#4b6256;margin-top:8px;line-height:1.45}
      </style>
      <div class="box"><div class="top"><span>🌿 EcoCart AI</span><span class="x" id="x">×</span></div>
      <div class="in"><div class="t"></div>${body}${syncLine}</div></div>`;
    root.querySelector(".t").textContent = title;
    root.getElementById("x").addEventListener("click", () => host.remove());
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 10000);
  }

  // ---------- Click detection ----------
  let lastKey = "", lastAt = 0;
  document.addEventListener("click", (e) => {
    try {
      const el = e.target && e.target.closest ? e.target.closest(BTN_SELECTOR) : null;
      if (!el || !looksLikeCartButton(el)) return;

      const p = window.__ecocartProbe();
      const key = p.url + "|" + p.title;
      if (key === lastKey && Date.now() - lastAt < 4000) return;
      lastKey = key; lastAt = Date.now();

      const { parts, guessed } = readComposition(p.visible, p.all);
      const labels = detectLabels(p.labelText);
      const item = {
        title: p.title, image: p.image, url: p.url, site: p.site,
        parts, guessed, price: p.price, currency: p.currency,
        certs: labels.found.map((l) => l.id), warnings: labels.warnings,
        garment: mapGarment(p.title), time: Date.now()
      };

      chrome.runtime.sendMessage({ type: "ECOCART_CAPTURE", item }, (res) => {
        if (chrome.runtime.lastError) return;
        showToast(p.title, res ? { ...res, guessed } : null, labels, p.price, p.currency);
      });
    } catch (err) {
      /* extension was reloaded or page blocked it - ignore */
    }
  }, true);
})();