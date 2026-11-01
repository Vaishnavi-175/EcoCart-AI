"""
EcoCart AI - product recommendation engine (content-based filtering)

Idea: given a product the user is looking at (name, garment type, current eco score),
find products in the catalog table that
  1. look similar  (same garment words / category)         -> similarity
  2. have a higher eco score than the current product      -> eco gain
and rank them with  final = 0.55 * similarity + 0.45 * eco_gain.

The eco score of a catalog product comes from (first one that works):
  1. its own `eco_score` column, if the table has one;
  2. its `material_label`, looked up in the `materials` table and scored with the SAME formula as app.py
     (carbon + water); otherwise
  3. the fabrics found in its name / description text.

It adapts to your table: it looks at the real column names of `catalog_products`.
Open  /recommend/debug  in the browser to see what it found.
"""
import os
import re

from flask import Blueprint, jsonify, request

bp = Blueprint("recommender", __name__)

TABLE = "catalog_products"

# candidate column names (lower case). The first one that exists in your table is used.
CANDS = {
    "name":  ["prod_name", "productdisplayname", "product_name", "name", "title"],
    "cat":   ["product_type_name", "articletype", "article_type", "category", "product_type", "subcategory", "type"],
    "group": ["product_group_name", "mastercategory", "master_category", "garment_group_name", "department_name"],
    "desc":  ["detail_desc", "description", "details"],
    "mat":   ["material_label", "detected_material", "material", "fabric", "composition"],
    "score": ["eco_score"],
    "price": ["price"],
    "img":   ["image_url", "image", "img", "image_link"],
    "url":   ["product_url", "url", "link"],
    "id":    ["id", "article_id", "product_id", "catalog_id"],
}

GARMENT_WORDS = {
    "tshirt": ["t-shirt", "tshirt", "tee", "t shirt"],
    "top": ["top", "blouse", "kurti", "tunic"],
    "shirt": ["shirt", "blouse"],
    "dress": ["dress", "gown", "jumpsuit"],
    "sweater": ["sweater", "jumper", "cardigan", "hoodie", "pullover"],
    "saree": ["saree", "sari"],
    "jeans": ["jeans", "trousers", "denim", "pants"],
    "jacket": ["jacket", "coat", "blazer"],
}
FABRIC_ALIASES = {  # word in product text -> materials.material_label
    "rayon": "viscose_rayon", "viscose": "viscose_rayon", "lyocell": "tencel",
    "jeans": "denim", "denim": "denim",
}
STOP = set("the and for with from this that men women mens womens ladies boys girls kids casual printed pure "
           "regular fit buy apparel size wear new set pack".split())

_cache = {"cols": None, "materials": None}


# ---------------------------------------------------------------- DB helpers
def _conn():
    """Same database settings as app.py (DB_HOST, DB_NAME, ...); DATABASE_URL also works if you set it."""
    import psycopg2
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg2.connect(url)
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        dbname=os.getenv("DB_NAME", "ecocart_ai"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        port=int(os.getenv("DB_PORT", "5432")),
        sslmode="require",
    )


def _columns(cur):
    if _cache["cols"] is None:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (TABLE,))
        have = {r[0].lower(): r[0] for r in cur.fetchall()}
        picked = {}
        for key, names in CANDS.items():
            picked[key] = next((have[n] for n in names if n in have), None)
        picked["_all"] = sorted(have.values())
        _cache["cols"] = picked
    return _cache["cols"]


def eco_score_formula(carbon, water):
    """Exactly the formula used in app.py (calculate_eco_score)."""
    if carbon is None:
        return None
    carbon = float(carbon)
    carbon_score = max(0, min(100, 100 - (carbon / 35) * 100))
    if water is not None:
        water_score = max(0, min(100, 100 - (float(water) / 180000) * 100))
        return round(carbon_score * 0.6 + water_score * 0.4)
    return round(carbon_score)


def _materials(cur):
    """{material_label: eco_score} computed from the materials table."""
    if _cache["materials"] is None:
        cur.execute("SELECT * FROM materials")
        names = [d[0].lower() for d in cur.description]
        out = {}
        for row in cur.fetchall():
            d = dict(zip(names, row))
            label = d.get("material_label")
            if not label:
                continue
            sc = eco_score_formula(d.get("carbon_footprint_kg_co2e_per_kg"), d.get("water_usage_l_per_kg"))
            if sc is None and d.get("eco_score") is not None:
                sc = float(d["eco_score"])
            if sc is not None:
                out[str(label).lower()] = float(sc)
        _cache["materials"] = out
    return _cache["materials"]


# ---------------------------------------------------------------- pure logic (easy to test)
def tokens(text):
    words = re.findall(r"[a-z]+", str(text or "").lower())
    return {w for w in words if len(w) >= 3 and w not in STOP}


def fabric_score(text, materials):
    """Average eco score of the fabrics mentioned in text (longest names matched first)."""
    t = " " + str(text or "").lower().replace("-", " ") + " "
    names = {}
    for label in materials:
        names[label.replace("_", " ")] = label
    for alias, label in FABRIC_ALIASES.items():
        if label in materials:
            names[alias] = label
    found, used = [], set()
    for phrase in sorted(names, key=len, reverse=True):
        if re.search(r"\b" + re.escape(phrase) + r"\b", t):
            if names[phrase] not in used:   # count each fabric once (denim + jeans = one)
                used.add(names[phrase])
                found.append(materials[names[phrase]])
            t = re.sub(r"\b" + re.escape(phrase) + r"\b", " ", t)
    return round(sum(found) / len(found), 1) if found else None


def similarity(q_tokens, p_tokens):
    if not q_tokens or not p_tokens:
        return 0.0
    inter = len(q_tokens & p_tokens)
    return inter / ((len(q_tokens) * len(p_tokens)) ** 0.5)  # cosine on word sets


def rank(rows, cols, materials, query, current_score=None, limit=5, max_price=None, min_sim=0.1):
    """rows: list of dicts from the catalog. Returns the best recommendations."""
    q_tokens = tokens(query["name"])
    for g in query.get("garment_words", []):
        q_tokens |= tokens(g)
    out, seen = [], set()
    for r in rows:
        name = str(r.get(cols["name"]) or "").strip() if cols["name"] else ""
        if not name or name.lower() in seen:
            continue
        text = " ".join(str(r.get(cols[k]) or "") for k in ("name", "cat", "desc", "mat") if cols[k])
        score = None
        if cols["score"] and r.get(cols["score"]) is not None:
            score = float(r[cols["score"]])
        if score is None and cols["mat"] and r.get(cols["mat"]):
            score = materials.get(str(r[cols["mat"]]).strip().lower())
        if score is None:
            score = fabric_score(text, materials)
        if score is None:
            continue
        if current_score is not None and score <= current_score:
            continue
        price = r.get(cols["price"]) if cols["price"] else None
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None
        if max_price is not None and price is not None and price > max_price:
            continue
        p_tokens = (tokens(name) | tokens(r.get(cols["cat"]) if cols["cat"] else "")
                    | tokens(str(r.get(cols["mat"]) or "").replace("_", " ") if cols["mat"] else ""))
        sim = similarity(q_tokens, p_tokens)
        if q_tokens and sim < min_sim:  # not similar enough: a nightdress should not suggest jeans
            continue
        base = current_score if current_score is not None else 0
        gain = max(0.0, min(1.0, (score - base) / 40.0))
        final = 0.55 * sim + 0.45 * gain
        seen.add(name.lower())
        out.append({
            "name": name,
            "score": round(score),
            "gain": round(score - base) if current_score is not None else None,
            "similarity": round(sim, 2),
            "match": round(final, 3),
            "price": price,
            "image": r.get(cols["img"]) if cols["img"] else None,
            "url": r.get(cols["url"]) if cols["url"] else None,
            "category": r.get(cols["cat"]) if cols["cat"] else None,
        })
    out.sort(key=lambda x: x["match"], reverse=True)
    return out[:limit]


# ---------------------------------------------------------------- routes
@bp.route("/recommend", methods=["GET"])
def recommend():
    name = request.args.get("name", "").strip()
    garment = request.args.get("garment", "").strip().lower()
    material = request.args.get("material", "").strip().lower()
    try:
        current = float(request.args["score"]) if request.args.get("score") else None
        limit = max(1, min(10, int(request.args.get("limit", 5))))
        max_price = float(request.args["max_price"]) if request.args.get("max_price") else None
    except ValueError:
        return jsonify({"error": "score, limit and max_price must be numbers"}), 400

    words = GARMENT_WORDS.get(garment, [])
    q_text = (name + " " + " ".join(words[:1])).strip()
    if not tokens(q_text):
        return jsonify({"error": "give a product name or a garment type"}), 400

    conn = None
    try:
        conn = _conn()
        cur = conn.cursor()
        cols = _columns(cur)
        if not cols["name"]:
            return jsonify({"error": "no name column found in " + TABLE, "columns": cols["_all"]}), 500
        materials = _materials(cur)

        # pre-filter in SQL: product text must contain one of the search words
        search = sorted(tokens(name), key=len, reverse=True)[:4] + [w for w in words]
        search = [s for s in dict.fromkeys(search) if s][:8]
        text_cols = [cols[k] for k in ("name", "cat", "mat") if cols[k]]
        where, params = [], []
        for s in search:
            for c in text_cols:
                where.append(f'"{c}" ILIKE %s')
                params.append(f"%{s}%")
        sql = f'SELECT * FROM "{TABLE}"' + (" WHERE " + " OR ".join(where) if where else "") + " LIMIT 4000"
        cur.execute(sql, params)
        names = [d[0] for d in cur.description]
        rows = [dict(zip(names, r)) for r in cur.fetchall()]
        if len(rows) < 30:  # small catalog or unusual words: look at the whole table instead
            cur.execute(f'SELECT * FROM "{TABLE}" LIMIT 4000')
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, r)) for r in cur.fetchall()]
        total = None
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{TABLE}"')
            total = cur.fetchone()[0]
        except Exception:
            pass

        query = {"name": q_text, "garment_words": words}
        recs = rank(rows, cols, materials, query, current_score=current, limit=limit, max_price=max_price)
        note = None
        if not recs:  # nothing similar enough: show the greenest products, less similar
            recs = rank(rows, cols, materials, query, current_score=current, limit=limit, max_price=max_price, min_sim=0.0)
            note = "No close match found, showing the greenest products in the catalog." if recs else \
                   "No product with a higher eco score was found in the catalog."
        return jsonify({
            "query": q_text, "current_score": current, "scanned": len(rows), "catalog_size": total,
            "recommendations": recs, "note": note,
        })
    except Exception as e:
        return jsonify({"error": "recommendation failed", "detail": str(e)[:200]}), 500
    finally:
        if conn:
            conn.close()


@bp.route("/recommend/debug", methods=["GET"])
def debug():
    """Open this in the browser to see which columns were detected."""
    conn = None
    try:
        conn = _conn()
        cur = conn.cursor()
        _cache["cols"] = None
        cols = _columns(cur)
        cur.execute(f'SELECT COUNT(*) FROM "{TABLE}"')
        total = cur.fetchone()[0]
        mats = _materials(cur)
        cur.execute(f'SELECT * FROM "{TABLE}" LIMIT 1')
        names = [d[0] for d in cur.description]
        sample = dict(zip(names, cur.fetchone() or []))
        return jsonify({"table": TABLE, "rows": total, "detected_columns": {k: v for k, v in cols.items() if k != "_all"},
                        "all_columns": cols["_all"], "materials_loaded": len(mats), "sample_row": {k: str(v)[:80] for k, v in sample.items()}})
    except Exception as e:
        return jsonify({"error": str(e)[:300]}), 500
    finally:
        if conn:
            conn.close()