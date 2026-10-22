// =====================================================================
// EcoCart AI - Knowledge data + helpers (data.js)
//
// IMPORTANT (for the presentation):
//  * Carbon, water and the Eco Score come from the backend PostgreSQL
//    `materials` table (our Sustainability Reference dataset).
//  * Everything in THIS file is a separate, qualitative reference table:
//      - durability, microplastics, recyclability, care  (indicative ratings)
//      - ECO_LABELS: what each sustainability certification covers and its limits
//    The ratings are NOT measured values.
//  * Garment weights and "wears in a lifetime" are stated ASSUMPTIONS.
//  * Label detection is TEXT matching on the page. It does not verify that a
//    certificate is genuine and it cannot read logos that are only images.
// =====================================================================

// Words found on shopping pages -> material key in the database
const ALIASES = {
  cotton: "cotton", polyester: "polyester", nylon: "nylon", polyamide: "nylon", silk: "silk",
  wool: "wool", merino: "wool", linen: "linen", flax: "linen", hemp: "hemp", acrylic: "acrylic",
  viscose: "viscose_rayon", rayon: "viscose_rayon", denim: "denim", tencel: "tencel", lyocell: "tencel",
  elastane: "elastane", spandex: "elastane", lycra: "elastane", leather: "leather"
};

// "60% cotton, 40% recycled polyester"  ->  [{key:"cotton",pct:60},{key:"polyester",pct:40}]
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

// Most-mentioned fabric word on a page (used only when no "%" composition exists)
function topMentioned(text) {
  const counts = {};
  Object.keys(ALIASES).forEach((w) => {
    const n = (text.match(new RegExp("\\b" + w + "\\b", "g")) || []).length;
    if (n) counts[ALIASES[w]] = (counts[ALIASES[w]] || 0) + n;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// Typical garment weights in kg (assumption)
const GARMENTS = {
  tshirt:  { label: "T-shirt",             kg: 0.20 },
  top:     { label: "Top / kurti",         kg: 0.25 },
  shirt:   { label: "Shirt / blouse",      kg: 0.30 },
  dress:   { label: "Dress / skirt",       kg: 0.40 },
  sweater: { label: "Sweater / hoodie",    kg: 0.50 },
  saree:   { label: "Saree",               kg: 0.60 },
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

// =====================================================================
// SUSTAINABILITY LABEL DATASET
// covers = what the label is about, meaning = one line, watch = its limit
// =====================================================================
const ECO_LABELS = [
  { id: "gots", name: "GOTS", re: /\bgots\b|global organic textile standard/i, covers: "Organic + processing",
    meaning: "Certified organic fibre, and the whole supply chain meets environmental and social criteria.",
    watch: "Check the grade: 'organic' needs at least 95% organic fibre, 'made with organic' needs 70%." },
  { id: "ocs", name: "OCS (Organic Content Standard)", re: /\bocs\b|organic content standard/i, covers: "Organic content",
    meaning: "Verifies how much organic fibre the product contains.",
    watch: "Covers organic content only, not chemicals or working conditions." },
  { id: "oekotex", name: "OEKO-TEX", re: /oeko[\s-]?tex|oekotex/i, covers: "Harmful substances",
    meaning: "The finished textile is tested for harmful substances.",
    watch: "It is about safety for the wearer. It does not measure environmental impact." },
  { id: "madeingreen", name: "Made in Green by OEKO-TEX", re: /made in green/i, covers: "Tested + responsible factories",
    meaning: "Tested for harmful substances and made in checked facilities, traceable with a label ID.",
    watch: "Verify the product ID on the OEKO-TEX website." },
  { id: "grs", name: "GRS (Global Recycled Standard)", re: /\bgrs\b|global recycled standard/i, covers: "Recycled content",
    meaning: "Verifies recycled content plus responsible processing.",
    watch: "Look for the recycled percentage, it can be partial." },
  { id: "rcs", name: "RCS (Recycled Claim Standard)", re: /\brcs\b|recycled claim standard/i, covers: "Recycled content",
    meaning: "Tracks recycled material through the supply chain.",
    watch: "Covers recycled content only, not chemicals or labour." },
  { id: "bci", name: "Better Cotton (BCI)", re: /\bbci\b|better cotton/i, covers: "Cotton farming",
    meaning: "A programme that trains farmers towards more sustainable cotton growing.",
    watch: "It works by mass balance, so your garment may not physically contain Better Cotton." },
  { id: "fairtrade", name: "Fairtrade", re: /fair[\s-]?trade/i, covers: "Farmer pay",
    meaning: "Farmers receive fair prices and a Fairtrade premium.",
    watch: "Often covers only the raw cotton, check whether the finished product is covered." },
  { id: "bluesign", name: "bluesign", re: /bluesign/i, covers: "Chemicals in production",
    meaning: "Controls chemicals and resource use in textile production.",
    watch: "It can apply to the fabric only or the whole product, check which." },
  { id: "fsc", name: "FSC / PEFC", re: /\bfsc\b|forest stewardship|\bpefc\b/i, covers: "Wood-pulp sourcing",
    meaning: "The wood pulp (viscose, paper, packaging) comes from responsibly managed forests.",
    watch: "Says nothing about how the fibre was spun or dyed." },
  { id: "euecolabel", name: "EU Ecolabel", re: /eu ecolabel|eu flower/i, covers: "Life-cycle criteria",
    meaning: "Official EU label with criteria on water, chemicals and durability.",
    watch: "" },
  { id: "rws", name: "RWS (Responsible Wool Standard)", re: /\brws\b|responsible wool standard/i, covers: "Wool farming",
    meaning: "Animal welfare and land management on wool farms.",
    watch: "Does not cover the dyeing or finishing of the fabric." },
  { id: "rds", name: "RDS (Responsible Down Standard)", re: /\brds\b|responsible down standard/i, covers: "Animal welfare",
    meaning: "Animal welfare for down and feathers.",
    watch: "Welfare only, nothing about the rest of the garment." },
  { id: "lwg", name: "LWG (Leather Working Group)", re: /\blwg\b|leather working group/i, covers: "Tannery audits",
    meaning: "Audits the environmental performance of tanneries.",
    watch: "Covers the tannery, not the farm or the finished product." },
  { id: "c2c", name: "Cradle to Cradle Certified", re: /cradle to cradle|c2c certified/i, covers: "Circularity",
    meaning: "Rates material health, circularity, clean water and social fairness.",
    watch: "It has levels (Bronze to Platinum), check which one." },
  { id: "tencel", name: "TENCEL (Lenzing)", re: /tencel|lenzing/i, covers: "Branded fibre",
    meaning: "Branded wood-pulp fibres made in a mostly closed-loop process.",
    watch: "A fibre brand, not a certificate for the whole garment." },
  { id: "econyl", name: "ECONYL", re: /econyl/i, covers: "Recycled nylon",
    meaning: "Regenerated nylon made from waste like fishing nets and old carpets.",
    watch: "Brand claim for the nylon part only." },
  { id: "fairwear", name: "Fair Wear Foundation", re: /fair wear/i, covers: "Factory workers",
    meaning: "The brand is checked on working conditions in its factories.",
    watch: "A brand membership, not a product label." },
  { id: "bcorp", name: "B Corp", re: /\bb[\s-]?corp\b|certified b corporation/i, covers: "Company level",
    meaning: "The company is certified on overall social and environmental performance.",
    watch: "Says little about this particular product's fabric." }
];

// Wording that sounds green but is not a certification
const VAGUE_RE = /\b(eco[\s-]?friendly|eco[\s-]?conscious|sustainable|planet[\s-]?friendly|earth[\s-]?friendly|conscious (?:collection|choice|fashion)|responsibly made|ethically made|green (?:collection|choice))\b/gi;

// text -> { found:[label], claims:{organic,recycled}, vague:[words], warnings:[text] }
function detectLabels(text) {
  const t = String(text || "");
  const found = ECO_LABELS.filter((l) => l.re.test(t));
  const ids = found.map((l) => l.id);
  const claims = { organic: /\borganic\b/i.test(t), recycled: /\brecycled\b/i.test(t) };
  const vague = [...new Set((t.match(VAGUE_RE) || []).map((s) => s.toLowerCase()))].slice(0, 4);

  const warnings = [];
  if (claims.organic && !ids.includes("gots") && !ids.includes("ocs")) {
    warnings.push("Claims organic material, but no GOTS or OCS certificate was found on the page.");
  }
  if (claims.recycled && !ids.some((i) => ["grs", "rcs", "econyl"].includes(i))) {
    warnings.push("Claims recycled material, but no GRS or RCS certificate was found on the page.");
  }
  if (vague.length && !found.length) {
    warnings.push(`Words like "${vague[0]}" appear, but no recognised certification was found. Treat them as marketing, not proof.`);
  }
  return { found, claims, vague, warnings };
}

// Names of known labels by id (for showing saved items)
function labelName(id) {
  const l = ECO_LABELS.find((x) => x.id === id);
  return l ? l.name.replace(/ \(.*\)$/, "") : id;
}

// ---------- garments & price ----------
// Product title / camera label -> garment type
function mapGarment(label) {
  const l = String(label || "").toLowerCase();
  if (/t-?shirt|\btee\b/.test(l)) return "tshirt";
  if (/saree|sari/.test(l)) return "saree";
  if (/jean|trouser|pant|legging|jogger|shorts?\b|palazzo|salwar/.test(l)) return "jeans";
  if (/jacket|coat|cape|blazer|shrug|outerwear|puffer/.test(l)) return "jacket";
  if (/sweater|cardigan|hoodie|sweatshirt|pullover|jumper/.test(l)) return "sweater";
  if (/dress|gown|jumpsuit|skirt|maxi/.test(l)) return "dress";
  if (/shirt|blouse/.test(l)) return "shirt";
  return "top";
}

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
function fmtPrice(price, currency) {
  if (price == null || isNaN(price)) return "";
  return (CURRENCY_SYMBOL[currency] || "") + Math.round(price).toLocaleString("en-IN");
}

// =====================================================================
// PROFILE: durability, wears, microplastics, recyclability for a list of parts
// parts: [{ key, pct }]  (only those present in MATERIAL_INFO are used)
// =====================================================================
function profileOf(parts) {
  const known = parts.filter((p) => MATERIAL_INFO[p.key]);
  if (!known.length) return null;
  const kTotal = known.reduce((s, p) => s + p.pct, 0) || 1;
  const dur = known.reduce((s, p) => s + MATERIAL_INFO[p.key].dur * p.pct, 0) / kTotal;
  const durability = Math.max(1, Math.min(5, Math.round(dur)));
  const wears = WEARS_BY_DURABILITY[durability];
  const micro = Math.max(...known.map((p) => MATERIAL_INFO[p.key].micro));
  const bio = known.every((p) => MATERIAL_INFO[p.key].bio);

  // recyclability = the hardest component; mixing natural + synthetic forces "Low"
  let r = Math.min(...known.map((p) => RECYC_RANK[MATERIAL_INFO[p.key].recyc]));
  let mixedNote = "";
  const kinds = new Set(known.map((p) => MATERIAL_INFO[p.key].kind));
  if (known.length > 1 && kinds.size > 1) {
    r = 0;
    mixedNote = "Natural + synthetic blends are very hard to separate, so they are rarely recycled into new clothes.";
  } else if (known.length > 1) {
    mixedNote = "Mixed fibres are harder to recycle than single-fibre clothes.";
  }
  return { known, durability, wears, micro, bio, recyc: ["Low", "Medium", "High"][r], mixedNote };
}

// parts: [{ key, pct, data }]  data = backend record { eco_score, carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, confidence_score }
function buildReport(parts, garmentKey) {
  const g = GARMENTS[garmentKey] || GARMENTS.top;

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

  const prof = profileOf(parts);
  const unknown = parts.filter((p) => !MATERIAL_INFO[p.key]).map((p) => p.key);

  let durability = null, wears = null, micro = null, recyc = null, bio = null;
  let wash = null, dry = null, mixedNote = "";
  let certs = [], careList = [], eolList = [];

  if (prof) {
    ({ durability, wears, micro, recyc, bio, mixedNote } = prof);
    const known = prof.known;
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

// Dashboard helper: impact numbers for one saved bag item
// item: { parts:[{key,pct}], carbon (kg CO2e per kg), water (L per kg), garment }
function itemImpact(item) {
  const g = GARMENTS[item.garment] || GARMENTS.top;
  const prof = profileOf(item.parts || []);
  const garmentCarbon = item.carbon != null ? item.carbon * g.kg : null;
  const garmentWater = item.water != null ? item.water * g.kg : null;
  const wears = prof ? prof.wears : null;
  return {
    garmentCarbon, garmentWater, wears,
    perWearG: garmentCarbon != null && wears ? (garmentCarbon * 1000) / wears : null,
    micro: prof ? prof.micro : null
  };
}

if (typeof module !== "undefined") {
  module.exports = { ALIASES, findParts, topMentioned, GARMENTS, WEARS_BY_DURABILITY, MATERIAL_INFO, ECO_LABELS, detectLabels, labelName, mapGarment, fmtPrice, profileOf, buildReport, itemImpact, MICRO_LABEL };
}