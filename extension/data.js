// =====================================================================
// EcoCart AI - Clothing Knowledge Dataset (data.js)
//
// IMPORTANT (for the presentation):
//  * Carbon, water and the Eco Score come from the backend PostgreSQL
//    `materials` table (our Sustainability Reference dataset).
//  * Everything in THIS file is a separate, qualitative reference table
//    (durability, microplastic shedding, recyclability, labels, care).
//    The ratings are indicative (Low/Medium/High), compiled from general
//    textile-industry knowledge. They are NOT measured values.
//  * Garment weights and "wears in a lifetime" are stated ASSUMPTIONS
//    so that per-garment and per-wear numbers can be shown.
// =====================================================================

// Typical garment weights in kg (assumption)
const GARMENTS = {
  tshirt:  { label: "T-shirt",             kg: 0.20 },
  top:     { label: "Top / kurti",         kg: 0.25 },
  shirt:   { label: "Shirt / blouse",      kg: 0.30 },
  dress:   { label: "Dress / skirt",       kg: 0.40 },
  sweater: { label: "Sweater / hoodie",    kg: 0.50 },
  jeans:   { label: "Jeans / trousers",    kg: 0.70 },
  jacket:  { label: "Jacket / coat",       kg: 0.90 }
};

// Assumed number of wears in a garment's life, by durability rating 1-5
const WEARS_BY_DURABILITY = { 1: 15, 2: 30, 3: 50, 4: 80, 5: 120 };

// micro: 0 none, 1 low, 2 medium, 3 high  (microplastic / fibre shedding, indicative)
// recyc: "High" | "Medium" | "Low"        (ease of textile-to-textile recycling, indicative)
// kind:  "natural" | "synthetic"          (used for the blend rule)
const MATERIAL_INFO = {
  cotton: {
    dur: 3, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["GOTS (organic)", "OCS", "BCI", "OEKO-TEX Standard 100"],
    care: "Wash at 30°C, line dry. Avoid over-washing, it weakens fibres.",
    eol: "Donate if wearable. Worn-out cotton goes to textile recycling or becomes cleaning rags."
  },
  organic_cotton: {
    dur: 3, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["GOTS", "OCS", "OEKO-TEX Standard 100"],
    care: "Wash at 30°C, line dry.",
    eol: "Donate or textile-recycle. Undyed organic cotton can be composted."
  },
  denim: {
    dur: 4, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["GOTS", "OEKO-TEX Standard 100", "BCI"],
    care: "Wash rarely, cold, inside out. Spot-clean when possible.",
    eol: "Repair, resell or donate. Old jeans can be upcycled into bags or patches."
  },
  polyester: {
    dur: 4, micro: 3, recyc: "Medium", bio: false, kind: "synthetic", wash: 30, dry: "Line dry",
    certs: ["GRS (recycled)", "RCS", "OEKO-TEX Standard 100", "bluesign"],
    care: "Wash cold in a microfibre filter bag, full loads only, line dry.",
    eol: "Use a textile take-back bin. Pure single-fibre polyester recycles best. Never burn it."
  },
  recycled_polyester: {
    dur: 4, micro: 3, recyc: "Medium", bio: false, kind: "synthetic", wash: 30, dry: "Line dry",
    certs: ["GRS", "RCS", "OEKO-TEX Standard 100"],
    care: "Wash cold in a microfibre filter bag, line dry.",
    eol: "Textile take-back bin. Still sheds microplastics, so filter your wash."
  },
  nylon: {
    dur: 5, micro: 2, recyc: "Medium", bio: false, kind: "synthetic", wash: 30, dry: "Line dry",
    certs: ["GRS / ECONYL (recycled)", "bluesign", "OEKO-TEX Standard 100"],
    care: "Cold wash in a filter bag. Avoid high heat.",
    eol: "Needs special textile recycling. Look for brand take-back schemes."
  },
  acrylic: {
    dur: 2, micro: 3, recyc: "Low", bio: false, kind: "synthetic", wash: 30, dry: "Line dry",
    certs: ["OEKO-TEX Standard 100"],
    care: "Cold wash in a filter bag. It pills and sheds easily.",
    eol: "Rarely recycled. Use take-back schemes. Prefer wool or recycled blends next time."
  },
  elastane: {
    dur: 2, micro: 1, recyc: "Low", bio: false, kind: "synthetic", wash: 30, dry: "Line dry",
    certs: ["OEKO-TEX Standard 100"],
    care: "Cold wash, no tumble drying, heat destroys the stretch.",
    eol: "Even a few percent of elastane makes recycling harder. Prefer garments with little or none."
  },
  wool: {
    dur: 4, micro: 0, recyc: "High", bio: true, kind: "natural", wash: 30, dry: "Dry flat",
    certs: ["RWS (Responsible Wool Standard)", "GOTS", "OEKO-TEX Standard 100"],
    care: "Air it out, wash rarely at 30°C with wool detergent, dry flat.",
    eol: "Wool is re-spun into new yarn. Natural undyed wool is compostable."
  },
  silk: {
    dur: 2, micro: 0, recyc: "Low", bio: true, kind: "natural", wash: 30, dry: "Dry flat",
    certs: ["GOTS", "OEKO-TEX Standard 100"],
    care: "Hand wash cold or dry clean, never wring, keep away from heat.",
    eol: "Donate or resell. 100% undyed silk is compostable."
  },
  linen: {
    dur: 4, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["European Flax / Masters of Linen", "OEKO-TEX Standard 100", "GOTS"],
    care: "Wash at 30°C, line dry. It softens with age.",
    eol: "Biodegradable. Donate or textile-recycle, scraps can be composted."
  },
  hemp: {
    dur: 5, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["GOTS", "OEKO-TEX Standard 100"],
    care: "Wash at 30-40°C, line dry. Gets softer with every wash.",
    eol: "Biodegradable and long-lasting. Donate or textile-recycle."
  },
  viscose_rayon: {
    dur: 2, micro: 0, recyc: "Low", bio: true, kind: "natural", wash: 30, dry: "Dry flat",
    certs: ["FSC / PEFC", "EU Ecolabel", "Canopy Green Shirt", "OEKO-TEX Standard 100"],
    care: "Gentle cold wash, never wring when wet, dry flat.",
    eol: "Limited recycling. Donate if wearable. Choose certified wood-pulp sources next time."
  },
  tencel: {
    dur: 3, micro: 0, recyc: "Medium", bio: true, kind: "natural", wash: 30, dry: "Line dry",
    certs: ["TENCEL (Lenzing)", "FSC / PEFC", "EU Ecolabel"],
    care: "Gentle wash at 30°C, line dry.",
    eol: "Biodegradable. Donate or textile-recycle."
  },
  leather: {
    dur: 5, micro: 0, recyc: "Low", bio: false, kind: "natural", wash: null, dry: "Do not wash",
    certs: ["LWG (Leather Working Group)"],
    care: "Do not machine wash. Wipe clean, condition regularly, keep dry.",
    eol: "Hard to recycle. Repair, resell or donate to leather repair shops."
  }
};

const MICRO_LABEL = ["None", "Low", "Medium", "High"];
const MICRO_CLASS = ["ok", "ok", "mid", "bad"];
const RECYC_RANK = { Low: 0, Medium: 1, High: 2 };
const DRY_RANK = { "Do not wash": 3, "Dry flat": 2, "Line dry": 1 };

// Fashionpedia-style detection label -> garment type
function mapGarment(label) {
  const l = String(label || "").toLowerCase();
  if (/t-?shirt|tee/.test(l)) return "tshirt";
  if (/shirt|blouse/.test(l)) return "shirt";
  if (/dress|jumpsuit|skirt/.test(l)) return "dress";
  if (/pant|jean|trouser|short|legging/.test(l)) return "jeans";
  if (/jacket|coat|cape|blazer|outerwear/.test(l)) return "jacket";
  if (/sweater|cardigan|hoodie|sweatshirt|pullover/.test(l)) return "sweater";
  return "top";
}

// parts: [{ key, pct, data }]  data = backend record { eco_score, carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, confidence_score }
function buildReport(parts, garmentKey) {
  const g = GARMENTS[garmentKey] || GARMENTS.top;
  const total = parts.reduce((s, p) => s + p.pct, 0) || 1;

  const wavg = (get) => {
    let sum = 0, w = 0;
    parts.forEach((p) => {
      const v = Number(get(p.data));
      if (get(p.data) != null && !isNaN(v)) { sum += v * p.pct; w += p.pct; }
    });
    return w ? sum / w : null;
  };

  const score = wavg((d) => d.eco_score);
  const carbonKg = wavg((d) => d.carbon_footprint_kg_co2e_per_kg);
  const waterKg = wavg((d) => d.water_usage_l_per_kg);
  const confidence = wavg((d) => d.confidence_score);

  const known = parts.filter((p) => MATERIAL_INFO[p.key]);
  const unknown = parts.filter((p) => !MATERIAL_INFO[p.key]).map((p) => p.key);

  let durability = null, wears = null, micro = null, recyc = null, bio = null;
  let wash = null, dry = null, mixedNote = "";
  let certs = [], careList = [], eolList = [];

  if (known.length) {
    const kTotal = known.reduce((s, p) => s + p.pct, 0) || 1;
    const dur = known.reduce((s, p) => s + MATERIAL_INFO[p.key].dur * p.pct, 0) / kTotal;
    durability = Math.max(1, Math.min(5, Math.round(dur)));
    wears = WEARS_BY_DURABILITY[durability];

    micro = Math.max(...known.map((p) => MATERIAL_INFO[p.key].micro));
    bio = known.every((p) => MATERIAL_INFO[p.key].bio);

    // recyclability = the hardest component; mixing natural + synthetic forces "Low"
    let r = Math.min(...known.map((p) => RECYC_RANK[MATERIAL_INFO[p.key].recyc]));
    const kinds = new Set(known.map((p) => MATERIAL_INFO[p.key].kind));
    if (known.length > 1 && kinds.size > 1) {
      r = 0;
      mixedNote = "Natural + synthetic blends are very hard to separate, so they are rarely recycled into new clothes.";
    } else if (known.length > 1) {
      mixedNote = "Mixed fibres are harder to recycle than single-fibre clothes.";
    }
    recyc = ["Low", "Medium", "High"][r];

    const temps = known.map((p) => MATERIAL_INFO[p.key].wash).filter((t) => t != null);
    wash = temps.length ? Math.min(...temps) : null;
    dry = known.map((p) => MATERIAL_INFO[p.key].dry).sort((a, b) => DRY_RANK[b] - DRY_RANK[a])[0];

    const byPct = known.slice().sort((a, b) => b.pct - a.pct);
    byPct.forEach((p) => MATERIAL_INFO[p.key].certs.forEach((c) => { if (!certs.includes(c)) certs.push(c); }));
    certs = certs.slice(0, 6);
    careList = byPct.slice(0, 2).map((p) => MATERIAL_INFO[p.key].care);
    eolList = byPct.slice(0, 2).map((p) => MATERIAL_INFO[p.key].eol);
  }

  const garmentCarbon = carbonKg != null ? carbonKg * g.kg : null;       // kg CO2e for the whole garment
  const garmentWater = waterKg != null ? waterKg * g.kg : null;          // litres
  const carbonPerWearG = garmentCarbon != null && wears ? (garmentCarbon * 1000) / wears : null;
  const waterPerWearL = garmentWater != null && wears ? garmentWater / wears : null;
  const km = garmentCarbon != null ? garmentCarbon / 0.17 : null;        // 0.17 kg CO2/km petrol car (assumption)

  return {
    garment: g, score, carbonKg, waterKg, confidence,
    garmentCarbon, garmentWater, carbonPerWearG, waterPerWearL, km,
    durability, wears, micro, recyc, bio, wash, dry, mixedNote,
    certs, careList, eolList, unknown
  };
}

if (typeof module !== "undefined") {
  module.exports = { GARMENTS, WEARS_BY_DURABILITY, MATERIAL_INFO, buildReport, mapGarment, MICRO_LABEL };
}