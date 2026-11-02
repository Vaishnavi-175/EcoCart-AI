"""
EcoCart AI - recommendation engine v2 (content-based filtering)

For a product the user is looking at, find *similar* products in `catalog_products`
that have a *higher eco score*.

  similarity = 0.7 * garment-type match + 0.3 * name-word cosine
  eco gain   = (candidate score - current score) / 40, clipped to 0..1
  price fit  = 1 if not dearer than the current product, falls off as it gets dearer
  final      = 0.45*similarity + 0.35*gain + 0.12*price_fit + 0.08*has_image

Eco score of a catalog row: its own `eco_score` column, else computed from the fabrics
found in name / description / material text (weighted by % when the text has them).
"""
import os
import re
import time

from flask import Blueprint, jsonify, request

bp = Blueprint("recommender", __name__)

TABLE = "catalog_products"

CANDS = {
    "name":  ["prod_name", "productdisplayname", "product_name", "name", "title"],
    "cat":   ["product_type_name", "articletype", "article_type", "category", "product_type", "subcategory", "type"],
    "group": ["product_group_name", "mastercategory", "master_category", "garment_group_name", "department_name"],
    "desc":  ["detail_desc", "description", "details"],
    "mat":   ["detected_material", "material", "fabric", "composition"],
    "score": ["eco_score"],
    "price": ["price"],
    "img":   ["image_url", "image", "img", "image_link"],
    "url":   ["product_url", "url", "link"],
    "id":    ["id", "article_id", "product_id", "catalog_id"],
}

GARMENT_WORDS = {
    "tshirt":  ["t-shirt", "tshirt", "tee", "t shirt"],
    "top":     ["top", "blouse", "kurti", "tunic"],
    "shirt":   ["shirt", "blouse"],
    "dress":   ["dress", "gown", "jumpsuit"],
    "sweater": ["sweater", "jumper", "cardigan", "hoodie", "pullover"],
    "saree":   ["saree", "sari"],
    "jeans":   ["jeans", "trousers", "denim", "pants"],
    "jacket":  ["jacket", "coat", "blazer"],
}

FABRIC_ALIASES = {
    "rayon": "viscose_rayon", "viscose": "viscose_rayon", "lyocell": "tencel",
    "jeans": "denim", "denim": "denim",
}

FABRIC_WORDS = set("""cotton polyester silk wool denim nylon linen viscose rayon acrylic hemp tencel lyocell
organic elastane spandex lycra modal bamboo jute leather fleece""".split())

COLOR_WORDS = set("""black white red blue green yellow pink purple orange brown grey gray beige navy maroon cream
olive mustard teal peach lavender khaki multi floral paisley striped solid checked printed""".split())

STOP = set("""the and for with from this that men women mens womens ladies boys girls kids casual pure regular fit
buy apparel size wear new set pack online cart bag shop slim relaxed""".split())

_cache = {"cols": None, "materials": None}
_rc = {}                      # response cache {key: (time, payload)}
RC_TTL = 300


# ------------------------------------------------------------ DB helpers
def _conn():
    import psycopg2
    url = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL") or os.environ.get("DB_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(url)


def _columns(cur):
    if _cache["cols"] is None:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (TABLE,))
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
def tokens(text, drop_fabrics=True, drop_colors=True):
    words = re.findall(r"[a-z]+", str(text or "").lower())
    out = {w for w in words if len(w) >= 3 and w not in STOP}
    if drop_fabrics:
        out -= FABRIC_WORDS
    if drop_colors:
        out -= COLOR_WORDS
    return out


def infer_garments(name):
    """Garment keys whose words appear in the product name."""
    t = " " + re.sub(r"[^a-z]+", " ", str(name or "").lower().replace("-", " ")) + " "
    keys = []
    for key, words in GARMENT_WORDS.items():
        if any(" " + re.sub(r"[^a-z]+", " ", w) .strip() + " " in t for w in words):
            keys.append(key)
    return keys


def fabric_info(text, materials):
    """Fabrics found in text -> {"labels", "score", "carbon"} (weighted by % when given)."""
    if not materials:
        return None
    t = " " + str(text or "").lower().replace("-", " ") + " "
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
        for m in ms:                         # blank it out (same length) so shorter names don't re-match
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
    """q: dict(name_tokens, garment_tokens, score, carbon, price, max_price, material).
    Returns (recommendations, diagnostics)."""
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

        cat_text = " ".join(str(r.get(cols[k]) or "") for k in ("name", "cat", "group") if cols[k])
        p_tokens = tokens(cat_text)
        cat_match = bool(gt & p_tokens) if gt else True
        word_sim = cosine(q["name_tokens"], tokens(name))
        if not gt and word_sim <= 0:
            continue
        sim = 0.7 * (1.0 if cat_match else 0.0) + 0.3 * min(1.0, word_sim * 2)
        if not cat_match and word_sim <= 0:
            continue
        if cat_match:
            diag["same_type"] += 1

        base = cur_score if cur_score is not None else 0
        gain = max(0.0, min(1.0, (score - base) / 40.0))

        if cur_price and price:
            ratio = price / cur_price
            price_fit = 1.0 if ratio <= 1.0 else max(0.0, 1.0 - (ratio - 1.0))
        else:
            price_fit = 0.5

        img = r.get(cols["img"]) if cols["img"] else None
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

        item = {
            "name": name, "score": round(score),
            "gain": round(score - base) if cur_score is not None else None,
            "similarity": round(sim, 2), "match": round(final, 3),
            "price": price, "image": img,
            "url": r.get(cols["url"]) if cols["url"] else None,
            "category": r.get(cols["cat"]) if cols["cat"] else None,
            "fabrics": info["labels"] if info else [],
            "carbon": carbon, "carbon_saving_pct": saving,
            "same_type": bool(cat_match and gt), "reasons": reasons[:4],
        }
        seen.add(name.lower())
        (exact if (cat_match or not gt) else loose).append(item)

    exact.sort(key=lambda x: x["match"], reverse=True)
    loose.sort(key=lambda x: x["match"], reverse=True)
    out = exact[:limit]
    if len(out) < 3:                       # not enough same-type matches: fill with close ones
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
        cols = _columns(cur)
        if not cols["name"]:
            return jsonify({"error": "no name column found in " + TABLE, "columns": cols["_all"]}), 500
        materials = _materials(cur)

        search = gwords[:] if gwords else sorted(name_tokens, key=len, reverse=True)[:6]
        text_cols = [cols[k] for k in ("name", "cat", "group") if cols[k]]
        where, params = [], []
        for s in search:
            for c in text_cols:
                where.append(f'"{c}" ILIKE %s')
                params.append(f"%{s}%")
        sql = f'SELECT * FROM "{TABLE}"' + (" WHERE " + " OR ".join(where) if where else "") + " LIMIT 6000"
        cur.execute(sql, params)
        names = [d[0] for d in cur.description]
        rows = [dict(zip(names, r)) for r in cur.fetchall()]
        if not rows:
            cur.execute(f'SELECT * FROM "{TABLE}" LIMIT 3000')
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, r)) for r in cur.fetchall()]

        total = None
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{TABLE}"')
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
                note = "The catalog table is empty."
            elif diag["with_score"] == 0:
                note = ("Catalog products have no eco score and no known fabric in their text, so none can be "
                        "scored. Add an eco_score column or a material column to catalog_products.")
            elif diag["higher_score"] == 0:
                note = "This is already greener than everything similar in our catalog. Great choice!"
            else:
                note = "No similar product with a higher eco score was found in our catalog."

        payload = {
            "garment": gkeys[0] if gkeys else None, "current_score": current,
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
        _cache["cols"] = None
        _cache["materials"] = None
        _rc.clear()
        cols = _columns(cur)
        cur.execute(f'SELECT COUNT(*) FROM "{TABLE}"')
        total = cur.fetchone()[0]
        mats = _materials(cur)
        cur.execute(f'SELECT * FROM "{TABLE}" LIMIT 1')
        names = [d[0] for d in cur.description]
        sample = dict(zip(names, cur.fetchone() or []))
        return jsonify({
            "table": TABLE, "rows": total,
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