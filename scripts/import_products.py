"""
EcoCart AI - recommendation engine v4 (content-based filtering)

Uses `product_dataset` if it has rows, otherwise `catalog_products`. Column names are auto-detected.
  similarity = 0.7 * garment-type match + 0.3 * name-word cosine
  eco gain   = (candidate score - current score) / 40, clipped to 0..1
  final      = 0.45*similarity + 0.35*gain + 0.12*price_fit + 0.08*has_image
Open /recommend/debug to see the chosen table, columns and a sample row.
"""
import os
import re
import time

from flask import Blueprint, jsonify, request

bp = Blueprint("recommender", __name__)

TABLE_CANDIDATES = ["product_dataset", "catalog_products"]

CANDS = {
    "name":  ["product_name", "prod_name", "productdisplayname", "name", "title"],
    "cat":   ["category", "product_type_name", "articletype", "article_type", "product_type", "subcategory", "type", "garment_type"],
    "group": ["brand", "product_group_name", "mastercategory", "master_category", "department_name"],
    "desc":  ["description", "detail_desc", "details", "product_description"],
    "mat":   ["material_label", "fibre", "fiber", "detected_material", "material", "fabric", "composition", "materials"],
    "score": ["eco_score", "score"],
    "price": ["price", "selling_price", "discounted_price", "retail_price", "sale_price"],
    "img":   ["image_url", "image", "images", "img", "image_link"],
    "url":   ["product_url", "url", "link", "product_link"],
    "id":    ["product_id", "id", "article_id", "catalog_id"],
}

GARMENT_WORDS = {
    "tshirt":    ["t-shirt", "tshirt", "tee", "t shirt"],
    "top":       ["top", "blouse", "tunic"],
    "shirt":     ["shirt"],
    "dress":     ["dress", "gown", "jumpsuit"],
    "sweater":   ["sweater", "jumper", "cardigan", "hoodie", "pullover", "sweatshirt"],
    "saree":     ["saree", "sari"],
    "jeans":     ["jeans", "denim"],
    "jacket":    ["jacket", "coat", "blazer"],
    "kurta":     ["kurta", "kurti"],
    "trousers":  ["trouser", "pant", "palazzo", "legging", "jogger"],
    "innerwear": ["bra", "brief", "innerwear", "vest", "boxer", "panty", "lingerie"],
}

# word in product text -> label in `materials` table (only used if that label exists)
FABRIC_ALIASES = {
    "rayon": "viscose_rayon", "viscose": "viscose_rayon", "lyocell": "tencel",
    "linen": "flax_linen", "flax": "flax_linen",
    "elastane": "elastane_spandex", "spandex": "elastane_spandex", "lycra": "elastane_spandex",
    "jeans": "denim", "denim": "denim",
}

FABRIC_WORDS = set("""cotton polyester silk wool denim nylon linen viscose rayon acrylic hemp tencel lyocell
organic elastane spandex lycra modal bamboo jute leather fleece flax""".split())

COLOR_WORDS = set("""black white red blue green yellow pink purple orange brown grey gray beige navy maroon cream
olive mustard teal peach lavender khaki multi floral paisley striped solid checked printed""".split())

STOP = set("""the and for with from this that men women mens womens ladies boys girls kids casual pure regular fit
buy apparel size wear new set pack online cart bag shop slim relaxed clothing""".split())

_cache = {"table": None, "cols": None, "materials": None}
_rc = {}
RC_TTL = 300


# ------------------------------------------------------------ DB helpers
def _conn():
    import psycopg2
    url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL") or os.environ.get("DB_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(url)


def _table(cur):
    """First candidate table that exists AND has rows."""
    if _cache["table"] is None:
        existing = []
        for t in TABLE_CANDIDATES:
            cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name = %s LIMIT 1", (t,))
            if cur.fetchone():
                existing.append(t)
                cur.execute(f'SELECT COUNT(*) FROM "{t}"')
                if cur.fetchone()[0] > 0:
                    _cache["table"] = t
                    break
        if _cache["table"] is None:
            if not existing:
                raise RuntimeError("none of these tables exist: " + ", ".join(TABLE_CANDIDATES))
            _cache["table"] = existing[0]
    return _cache["table"]


def _columns(cur):
    if _cache["cols"] is None:
        t = _table(cur)
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (t,))
        have = {r[0].lower(): r[0] for r in cur.fetchall()}
        picked = {k: next((have[n] for n in names if n in have), None) for k, names in CANDS.items()}
        picked["_all"] = sorted(have.values())
        _cache["cols"] = picked
    return _cache["cols"]


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _materials(cur):
    """{label: {"score","carbon","water"}} from the materials table. Never raises."""
    if _cache["materials"] is None:
        out = {}
        try:
            cur.execute("SELECT * FROM materials")
            names = [d[0].lower() for d in cur.description]
            lab = next((n for n in ["material_label", "material", "name", "label"] if n in names), names[0])
            carbon_c = next((n for n in names if "carbon" in n), None)
            water_c = next((n for n in names if "water" in n), None)
            if "eco_score" in names:
                for row in cur.fetchall():
                    d = dict(zip(names, row))
                    s = _num(d.get("eco_score"))
                    if s is None:
                        continue
                    out[str(d[lab]).lower()] = {
                        "score": s,
                        "carbon": _num(d.get(carbon_c)) if carbon_c else None,
                        "water": _num(d.get(water_c)) if water_c else None,
                    }
        except Exception:
            try:
                cur.connection.rollback()
            except Exception:
                pass
        _cache["materials"] = out
    return _cache["materials"]


# ------------------------------------------------------------ pure logic
def _norm_word(w):
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def tokens(text, drop_fabrics=True, drop_colors=True):
    words = [_norm_word(w) for w in re.findall(r"[a-z]+", str(text or "").lower())]
    out = {w for w in words if len(w) >= 3 and w not in STOP}
    if drop_fabrics:
        out -= {_norm_word(x) for x in FABRIC_WORDS}
    if drop_colors:
        out -= COLOR_WORDS
    return out


def infer_garments(name):
    t = " " + re.sub(r"[^a-z]+", " ", str(name or "").lower().replace("-", " ")) + " "
    keys = []
    for key, words in GARMENT_WORDS.items():
        for w in words:
            w2 = re.sub(r"[^a-z]+", " ", w).strip()
            if re.search(r"\b" + re.escape(w2) + r"s?\b", t):
                keys.append(key)
                break
    return keys


def first_url(v):
    """Image/url columns may hold a list-like string; return the first http(s) URL."""
    m = re.search(r"https?://[^\s\"'\]\[,]+", str(v or ""))
    return m.group(0) if m else None


def fabric_info(text, materials):
    """Fabrics found in text -> {"labels","score","carbon"} (weighted by % when given)."""
    if not materials:
        return None
    # underscores and hyphens become spaces, so "flax_linen" matches "flax linen"
    t = " " + re.sub(r"[_\-]+", " ", str(text or "").lower()) + " "
    names = {label.replace("_", " "): label for label in materials}
    for alias, label in FABRIC_ALIASES.items():
        if label in materials:
            names[alias] = label

    hits = {}
    for phrase in sorted(names, key=len, reverse=True):
        ms = list(re.finditer(r"\b" + re.escape(phrase) + r"\b", t))
        if not ms:
            continue
        label = names[phrase]
        if label not in hits:
            m = ms[0]
            before = t[max(0, m.start() - 8):m.start()]
            after = t[m.end():m.end() + 8]
            a = re.search(r"(\d{1,3})\s*%\s*$", before)
            b = re.match(r"\s*(\d{1,3})\s*%", after)
            hits[label] = int(a.group(1)) if a else (int(b.group(1)) if b else None)
        for m in ms:
            t = t[:m.start()] + " " * (m.end() - m.start()) + t[m.end():]
    if not hits:
        return None

    labels = list(hits)
    pcts = [hits[l] for l in labels]
    if all(p is not None for p in pcts) and sum(pcts) > 0:
        w = [p / sum(pcts) for p in pcts]
    else:
        w = [1 / len(labels)] * len(labels)

    score = sum(materials[l]["score"] * wi for l, wi in zip(labels, w))
    cs = [(materials[l]["carbon"], wi) for l, wi in zip(labels, w) if materials[l]["carbon"] is not None]
    carbon = (sum(c * wi for c, wi in cs) / sum(wi for _, wi in cs)) if cs else None
    return {"labels": labels, "score": round(score, 1), "carbon": round(carbon, 2) if carbon is not None else None}


def cosine(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / ((len(a) * len(b)) ** 0.5)


def rank(rows, cols, materials, q, limit=6):
    diag = {"scanned": len(rows), "with_score": 0, "higher_score": 0, "same_type": 0, "returned": 0}
    gt = q["garment_tokens"]
    cur_score, cur_carbon, cur_price = q["score"], q["carbon"], q["price"]
    exact, loose, seen = [], [], set()

    for r in rows:
        name = str(r.get(cols["name"]) or "").strip() if cols["name"] else ""
        if not name or name.lower() in seen:
            continue

        text = " ".join(str(r.get(cols[k]) or "") for k in ("name", "cat", "desc", "mat") if cols[k])
        info = fabric_info(text, materials)

        score = _num(r.get(cols["score"])) if cols["score"] else None
        if score is None and info:
            score = info["score"]
        if score is None:
            continue
        diag["with_score"] += 1

        if cur_score is not None and score <= cur_score:
            continue
        diag["higher_score"] += 1

        price = _num(r.get(cols["price"])) if cols["price"] else None
        if q["max_price"] is not None and price is not None and price > q["max_price"]:
            continue

        cat_text = " ".join(str(r.get(cols[k]) or "") for k in ("name", "cat") if cols[k])
        p_tokens = tokens(cat_text)
        cat_match = bool(gt & p_tokens) if gt else True
        word_sim = cosine(q["name_tokens"], tokens(name))
        if not gt and word_sim <= 0:
            continue
        if not cat_match and word_sim <= 0:
            continue
        sim = 0.7 * (1.0 if cat_match else 0.0) + 0.3 * min(1.0, word_sim * 2)
        if cat_match:
            diag["same_type"] += 1

        base = cur_score if cur_score is not None else 0
        gain = max(0.0, min(1.0, (score - base) / 40.0))

        if cur_price and price:
            ratio = price / cur_price
            price_fit = 1.0 if ratio <= 1.0 else max(0.0, 1.0 - (ratio - 1.0))
        else:
            price_fit = 0.5

        img = first_url(r.get(cols["img"])) if cols["img"] else None
        link = first_url(r.get(cols["url"])) if cols["url"] else None
        final = 0.45 * sim + 0.35 * gain + 0.12 * price_fit + (0.08 if img else 0.0)

        carbon = info["carbon"] if info else None
        saving = None
        if cur_carbon and carbon is not None and cur_carbon > 0:
            saving = round((cur_carbon - carbon) / cur_carbon * 100)

        reasons = []
        if cur_score is not None:
            reasons.append(f"+{round(score - cur_score)} eco points")
        if saving is not None and saving > 0:
            reasons.append(f"about {saving}% less carbon")
        if cur_price and price and price < cur_price:
            reasons.append(f"₹{round(cur_price - price)} cheaper")
        if info:
            reasons.append("made of " + ", ".join(l.replace("_", " ") for l in info["labels"]))
        if cat_match and gt:
            reasons.append("same garment type")

        cat_val = r.get(cols["cat"]) if cols["cat"] else None
        item = {
            "name": name, "score": round(score),
            "gain": round(score - base) if cur_score is not None else None,
            "similarity": round(sim, 2), "match": round(final, 3),
            "price": price, "image": img, "url": link,
            "category": str(cat_val)[:40] if cat_val else None,
            "fabrics": info["labels"] if info else [],
            "carbon": carbon, "carbon_saving_pct": saving,
            "same_type": bool(cat_match and gt), "reasons": reasons[:4],
        }
        seen.add(name.lower())
        (exact if (cat_match or not gt) else loose).append(item)

    exact.sort(key=lambda x: x["match"], reverse=True)
    loose.sort(key=lambda x: x["match"], reverse=True)
    out = exact[:limit]
    if len(out) < 3:
        out += loose[: limit - len(out)]
    diag["returned"] = len(out)
    return out, diag


# ------------------------------------------------------------ routes
@bp.route("/recommend", methods=["GET"])
def recommend():
    a = request.args
    name = a.get("name", "").strip()
    garment = a.get("garment", "").strip().lower()
    try:
        current = float(a["score"]) if a.get("score") else None
        carbon = float(a["carbon"]) if a.get("carbon") else None
        price = float(a["price"]) if a.get("price") else None
        max_price = float(a["max_price"]) if a.get("max_price") else None
        limit = max(1, min(12, int(a.get("limit", 6))))
    except ValueError:
        return jsonify({"error": "score, carbon, price, max_price and limit must be numbers"}), 400

    gkeys = [garment] if garment in GARMENT_WORDS else []
    gkeys += [k for k in infer_garments(name) if k not in gkeys]
    gwords = []
    for k in gkeys:
        for w in GARMENT_WORDS[k]:
            if w not in gwords:
                gwords.append(w)
    gtokens = set()
    for w in gwords:
        gtokens |= tokens(w)
    name_tokens = tokens(name) - gtokens
    if not gtokens and not name_tokens:
        return jsonify({"error": "give a product name or a garment type"}), 400

    key = (name.lower(), tuple(gkeys), current, carbon, price, max_price, limit)
    hit = _rc.get(key)
    if hit and time.time() - hit[0] < RC_TTL:
        return jsonify(hit[1])

    conn = None
    try:
        conn = _conn()
        cur = conn.cursor()
        table = _table(cur)
        cols = _columns(cur)
        if not cols["name"]:
            return jsonify({"error": "no name column found in " + table, "columns": cols["_all"]}), 500
        materials = _materials(cur)

        search = gwords[:] if gwords else sorted(name_tokens, key=len, reverse=True)[:6]
        text_cols = [cols[k] for k in ("name", "cat") if cols[k]]
        where, params = [], []
        for s in search:
            for c in text_cols:
                where.append(f'"{c}"::text ILIKE %s')
                params.append(f"%{s}%")
        sql = f'SELECT * FROM "{table}"' + (" WHERE " + " OR ".join(where) if where else "") + " LIMIT 6000"
        cur.execute(sql, params)
        names = [d[0] for d in cur.description]
        rows = [dict(zip(names, r)) for r in cur.fetchall()]
        if not rows:
            cur.execute(f'SELECT * FROM "{table}" LIMIT 3000')
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, r)) for r in cur.fetchall()]

        total = None
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            total = cur.fetchone()[0]
        except Exception:
            pass

        recs, diag = rank(rows, cols, materials, {
            "name_tokens": name_tokens, "garment_tokens": gtokens,
            "score": current, "carbon": carbon, "price": price, "max_price": max_price,
        }, limit=limit)

        note = None
        if not recs:
            if diag["scanned"] == 0:
                note = "The product table is empty."
            elif diag["with_score"] == 0:
                note = "Products have no eco score and no known fabric in their text, so none can be scored."
            elif diag["higher_score"] == 0:
                note = "This is already greener than everything similar in our catalog. Great choice!"
            else:
                note = "No similar product with a higher eco score was found in our catalog."

        payload = {
            "table": table, "garment": gkeys[0] if gkeys else None, "current_score": current,
            "catalog_size": total, "diagnostics": diag,
            "recommendations": recs, "note": note,
        }
        if recs:
            if len(_rc) > 200:
                _rc.clear()
            _rc[key] = (time.time(), payload)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": "recommendation failed", "detail": str(e)[:300]}), 500
    finally:
        if conn:
            conn.close()


@bp.route("/recommend/debug", methods=["GET"])
def debug():
    conn = None
    try:
        conn = _conn()
        cur = conn.cursor()
        _cache["table"] = None
        _cache["cols"] = None
        _cache["materials"] = None
        _rc.clear()

        tables = {}
        for t in TABLE_CANDIDATES:
            try:
                cur.execute(f'SELECT COUNT(*) FROM "{t}"')
                tables[t] = cur.fetchone()[0]
            except Exception:
                conn.rollback()
                tables[t] = "missing"

        table = _table(cur)
        cols = _columns(cur)
        mats = _materials(cur)
        cur.execute(f'SELECT * FROM "{table}" LIMIT 1')
        names = [d[0] for d in cur.description]
        sample = dict(zip(names, cur.fetchone() or []))
        return jsonify({
            "version": "v4",
            "table_row_counts": tables,
            "table_used": table,
            "detected_columns": {k: v for k, v in cols.items() if k != "_all"},
            "all_columns": cols["_all"],
            "materials_loaded": len(mats), "materials": mats,
            "sample_row": {k: str(v)[:80] for k, v in sample.items()},
        })
    except Exception as e:
        return jsonify({"error": str(e)[:300]}), 500
    finally:
        if conn:
            conn.close()