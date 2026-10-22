// EcoCart AI - page probe (page.js)
// Runs inside a shopping page (content script, or injected by the popup).
// Reads: product title, image, price, fabric text, and text that may contain eco-labels.
// Defines window.__ecocartProbe(). Safe to inject more than once.

(function () {
  function meta(name) {
    const m = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return m && m.content ? m.content.trim() : "";
  }

  // "1,299.00" -> 1299 ; "1.299,00" -> 1299 ; "499" -> 499
  function parseNum(v) {
    if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
    const s = String(v || "").replace(/[^\d.,]/g, "");
    if (!s) return null;
    const m = s.match(/^(.*?)([.,])(\d{1,2})$/);
    const n = m ? parseFloat(m[1].replace(/[.,]/g, "") + "." + m[3]) : parseFloat(s.replace(/[.,]/g, ""));
    return isFinite(n) && n > 0 ? n : null;
  }

  function currencyFromText(s) {
    const t = String(s || "").toLowerCase();
    if (/₹|\brs\.?|\binr\b/.test(t)) return "INR";
    if (/\$|\busd\b/.test(t)) return "USD";
    if (/€|\beur\b/.test(t)) return "EUR";
    if (/£|\bgbp\b/.test(t)) return "GBP";
    return null;
  }

  function collectOffers(of, out) {
    (Array.isArray(of) ? of : [of]).forEach((x) => {
      if (!x || typeof x !== "object") return;
      const spec = x.priceSpecification || {};
      const p = x.price ?? x.lowPrice ?? spec.price;
      if (p != null) out.push({ price: parseNum(p), currency: x.priceCurrency || spec.priceCurrency || null });
      if (x.offers) collectOffers(x.offers, out);
    });
  }
  function walk(o, depth, out) {
    if (!o || depth > 6) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1, out)); return; }
    if (typeof o !== "object") return;
    if (o.offers) collectOffers(o.offers, out);
    Object.values(o).forEach((v) => { if (v && typeof v === "object") walk(v, depth + 1, out); });
  }

  function getPrice() {
    // 1) meta tags
    const mp = parseNum(meta("product:price:amount") || meta("og:price:amount"));
    if (mp) return { price: mp, currency: meta("product:price:currency") || meta("og:price:currency") || null };

    // 2) JSON-LD structured data
    const found = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { walk(JSON.parse(s.textContent), 0, found); } catch (e) { /* ignore bad JSON */ }
    });
    const ld = found.find((f) => f.price);
    if (ld) return { price: ld.price, currency: ld.currency };

    // 3) price elements in the page
    const els = document.querySelectorAll('[itemprop="price"], [class*="price" i], [id*="price" i], [data-price]');
    const skip = /old|mrp|strike|was\b|original|compare|cut|discount|save|\boff\b|emi|shipping/i;
    let n = 0;
    for (const el of els) {
      if (++n > 80) break;
      const cls = (typeof el.className === "string" ? el.className : "") + " " + (el.id || "");
      if (skip.test(cls) || el.closest("del, s, strike")) continue;
      const attr = el.getAttribute("content") || el.getAttribute("data-price");
      let p = parseNum(attr);
      let cur = currencyFromText(attr);
      if (!p) {
        const txt = (el.innerText || el.textContent || "").slice(0, 60);
        if (/%/.test(txt)) continue;
        const m = txt.match(/(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*([\d][\d,.]*)/i);
        if (m) { p = parseNum(m[2]); cur = currencyFromText(m[1]); }
      }
      if (p) return { price: p, currency: cur || meta("product:price:currency") || null };
    }
    return { price: null, currency: null };
  }

  function probe() {
    const h1 = document.querySelector("h1");
    let title = meta("og:title") || (h1 && h1.innerText.trim()) || document.title || "Product";
    title = title.replace(/\s+/g, " ").slice(0, 120);

    const visible = (document.body.innerText || "").slice(0, 200000);
    const all = (document.body.textContent || "").slice(0, 300000);

    // text that may hold labels: image alt/title/aria text and image file names (e.g. "gots-logo.png")
    const extra = [];
    document.querySelectorAll("img, [title], [aria-label]").forEach((el, i) => {
      if (i > 800) return;
      const a = el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("aria-label");
      if (a) extra.push(a);
      if (el.tagName === "IMG") {
        const src = (el.currentSrc || el.src || "").split("?")[0].split("/").pop();
        if (src) extra.push(src.replace(/[_-]+/g, " "));
      }
    });
    const md = meta("description") || meta("og:description");
    if (md) extra.push(md);
    const labelText = visible + " \n " + extra.join(" \n ");

    const pr = getPrice();
    return {
      title, image: meta("og:image"), url: location.href, site: location.hostname.replace(/^www\./, ""),
      visible, all, labelText, price: pr.price, currency: pr.currency
    };
  }

  window.__ecocartProbe = probe;
})();