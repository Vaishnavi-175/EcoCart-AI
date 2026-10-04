from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import bcrypt
import requests
import re
import os
import tempfile
from garment_detector import detect_garments

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "ecocart_ai"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "port": int(os.getenv("DB_PORT", "5432")),
    "sslmode": "require"
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)


# ---------- SCORING ----------
def calculate_eco_score(carbon, water):
    if carbon is None:
        return None
    carbon = float(carbon)
    carbon_score = max(0, min(100, 100 - (carbon / 35) * 100))
    if water is not None:
        water = float(water)
        water_score = max(0, min(100, 100 - (water / 180000) * 100))
        eco_score = (carbon_score * 0.6) + (water_score * 0.4)
    else:
        eco_score = carbon_score
    return round(eco_score)


def score_label(score):
    if score is None:
        return "Unknown"
    if score >= 70:
        return "Good"
    elif score >= 45:
        return "Moderate"
    else:
        return "Poor"


@app.route("/")
def home():
    return jsonify({"message": "EcoCart AI backend is running"})


# ---------- ECO SCORE ----------
@app.route("/eco-score/<material_label>")
def get_eco_score(material_label):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM materials WHERE material_label = %s", (material_label.lower(),))
    result = cur.fetchone()
    cur.close()
    conn.close()
    if result is None:
        return jsonify({"error": "Material not found"}), 404

    result = dict(result)
    score = calculate_eco_score(result["carbon_footprint_kg_co2e_per_kg"], result["water_usage_l_per_kg"])
    result["eco_score"] = score
    result["eco_score_label"] = score_label(score)
    return jsonify(result)


# ---------- DETAILED ECO SCORE (for rich UI like material cards) ----------
CARE_TIPS = {
    "cotton": {"recycling": "Widely recyclable through textile recycling programs.", "care": "Cold wash, line dry to extend garment life and cut emissions.", "tip": "Choose organic or recycled cotton where possible."},
    "polyester": {"recycling": "Plastic-based. Needs special textile recycling.", "care": "Cold wash in a filter bag to limit microplastic shedding.", "tip": "Choose recycled polyester where possible."},
    "nylon": {"recycling": "Plastic-based. Needs special textile recycling.", "care": "Cold wash in a filter bag to limit microplastics.", "tip": "Choose recycled nylon where possible."},
    "wool": {"recycling": "Biodegradable, but rarely recycled in regular programs.", "care": "Hand wash or dry clean; avoid frequent washing.", "tip": "Buy fewer, higher-quality wool pieces and keep them longer."},
    "silk": {"recycling": "Biodegradable, but rarely recycled in regular programs.", "care": "Hand wash cold or dry clean only.", "tip": "Air out between wears instead of washing every time."},
    "denim": {"recycling": "Cotton-based; some brands run take-back recycling.", "care": "Wash less often, cold water, inside out.", "tip": "Repair small tears instead of replacing."},
    "linen": {"recycling": "Biodegradable and compostable if undyed.", "care": "Machine wash cold, air dry.", "tip": "Naturally durable — expect it to last many years."},
    "leather": {"recycling": "Not biodegradable when tanned; rarely recycled.", "care": "Spot clean, condition occasionally, avoid soaking.", "tip": "Consider second-hand or recycled leather alternatives."},
}
DEFAULT_CARE = {"recycling": "Recyclability depends on local textile recycling facilities.", "care": "Follow the garment's care label to extend its life.", "tip": "Buying fewer, longer-lasting pieces usually has the biggest impact."}


@app.route("/eco-score-detail/<material_label>")
def get_eco_score_detail(material_label):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM materials WHERE material_label = %s", (material_label.lower(),))
    result = cur.fetchone()
    cur.close()
    conn.close()
    if result is None:
        return jsonify({"error": "Material not found"}), 404

    result = dict(result)
    score = calculate_eco_score(result["carbon_footprint_kg_co2e_per_kg"], result["water_usage_l_per_kg"])
    result["eco_score"] = score
    result["eco_score_label"] = score_label(score)

    carbon_per_kg = result.get("carbon_footprint_kg_co2e_per_kg")
    garment_weight_kg = 0.25
    garment_carbon = round(float(carbon_per_kg) * garment_weight_kg, 2) if carbon_per_kg else None
    driving_km = round(garment_carbon / 0.17, 1) if garment_carbon else None

    care = CARE_TIPS.get(material_label.lower(), DEFAULT_CARE)

    verdict = (
        "An excellent choice. Low footprint across the board." if score is not None and score >= 80 else
        "A good choice. Wear it long and care for it well." if score is not None and score >= 70 else
        "A moderate choice. Fine occasionally, but look for better alternatives for everyday wear." if score is not None and score >= 45 else
        "A higher-impact choice. Consider an alternative material if you can." if score is not None else
        "Not enough data to give a verdict."
    )

    result["garment_estimate"] = {
        "weight_kg": garment_weight_kg,
        "carbon_kg_co2e": garment_carbon,
        "driving_km_equivalent": driving_km
    }
    result["verdict"] = verdict
    result["care"] = care

    return jsonify(result)


# ---------- ALTERNATIVES (better materials, same type) ----------
@app.route("/alternatives/<material_label>")
def get_alternatives(material_label):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM materials WHERE material_label = %s", (material_label.lower(),))
    current = cur.fetchone()
    if current is None:
        cur.close()
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    current = dict(current)
    current_score = calculate_eco_score(current["carbon_footprint_kg_co2e_per_kg"], current["water_usage_l_per_kg"])

    cur.execute("SELECT * FROM materials WHERE material_label != %s", (material_label.lower(),))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    candidates = []
    for r in rows:
        r = dict(r)
        s = calculate_eco_score(r["carbon_footprint_kg_co2e_per_kg"], r["water_usage_l_per_kg"])
        if s is not None and current_score is not None and s > current_score:
            r["eco_score"] = s
            r["eco_score_label"] = score_label(s)
            candidates.append(r)

    candidates.sort(key=lambda x: x["eco_score"], reverse=True)
    top3 = candidates[:3]

    return jsonify({
        "material": current["material_label"],
        "current_score": current_score,
        "alternatives": top3
    })


# ---------- CATALOG ----------
@app.route("/catalog")
def get_catalog():
    category = request.args.get("category")
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    if category and category != "all":
        cur.execute("""
            SELECT c.*, m.carbon_footprint_kg_co2e_per_kg, m.water_usage_l_per_kg,
                   m.confidence_score, m.impact_category, m.source, m.notes
            FROM catalog_products c
            JOIN materials m ON c.material_label = m.material_label
            WHERE c.category = %s
            ORDER BY c.product_id
        """, (category,))
    else:
        cur.execute("""
            SELECT c.*, m.carbon_footprint_kg_co2e_per_kg, m.water_usage_l_per_kg,
                   m.confidence_score, m.impact_category, m.source, m.notes
            FROM catalog_products c
            JOIN materials m ON c.material_label = m.material_label
            ORDER BY c.product_id
        """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    result = []
    for r in rows:
        r = dict(r)
        score = calculate_eco_score(r["carbon_footprint_kg_co2e_per_kg"], r["water_usage_l_per_kg"])
        r["eco_score"] = score
        r["eco_score_label"] = score_label(score)
        result.append(r)

    return jsonify(result)


@app.route("/catalog/stats")
def catalog_stats():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT c.*, m.carbon_footprint_kg_co2e_per_kg, m.water_usage_l_per_kg
        FROM catalog_products c
        JOIN materials m ON c.material_label = m.material_label
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    scores = []
    for r in rows:
        s = calculate_eco_score(r["carbon_footprint_kg_co2e_per_kg"], r["water_usage_l_per_kg"])
        if s is not None:
            scores.append(s)

    categories = set(r["category"] for r in rows)
    avg_score = round(sum(scores) / len(scores)) if scores else 0
    high_impact = sum(1 for s in scores if s >= 75)

    return jsonify({
        "total_pieces": len(rows),
        "avg_eco_score": avg_score,
        "high_impact_count": high_impact,
        "categories_count": len(categories)
    })


# ---------- PACKAGING KNOWLEDGE BASE ----------
PACKAGING_KB = {
    "glass": {"name": "Glass", "code": None, "concern": "low", "recycling": "Widely recyclable.", "health": "Inert material, no known leaching concerns."},
    "aluminium": {"name": "Aluminium", "code": None, "concern": "low", "recycling": "Widely recyclable and can be recycled repeatedly.", "health": "Cans and foils often have a thin polymer coating. Generally considered safe for food contact."},
    "steel": {"name": "Steel / tin", "code": None, "concern": "low", "recycling": "Widely recyclable.", "health": "Cans usually have an internal coating. Generally considered safe for food contact."},
    "paper": {"name": "Paper / cardboard", "code": None, "concern": "low", "recycling": "Recyclable when clean. Food residue or plastic coating can reduce recyclability.", "health": "Low concern. Some coated papers include a plastic layer."},
    "plastic": {"name": "Plastic (type not specified)", "code": None, "concern": "unknown", "recycling": "Depends on the resin type. Check the number (1-7) printed on the pack.", "health": "Cannot be judged without the resin type."},
    "pet": {"name": "PET plastic", "code": 1, "concern": "low", "recycling": "Commonly recycled.", "health": "Generally considered lower concern for food contact. Not designed for repeated reuse."},
    "hdpe": {"name": "HDPE plastic", "code": 2, "concern": "low", "recycling": "Commonly recycled.", "health": "Generally considered lower concern for food contact."},
    "pvc": {"name": "PVC plastic", "code": 3, "concern": "high", "recycling": "Rarely recycled, and a contaminant in other plastic recycling streams.", "health": "Some sources raise concerns about additives such as phthalates, especially when heated."},
    "ldpe": {"name": "LDPE plastic", "code": 4, "concern": "low", "recycling": "Accepted by fewer programmes (mostly bags and films).", "health": "Generally considered lower concern for food contact."},
    "pp": {"name": "PP plastic", "code": 5, "concern": "low", "recycling": "Increasingly recycled.", "health": "Generally considered lower concern. Heat tolerant, but the number alone does not guarantee microwave safety."},
    "ps": {"name": "Polystyrene (PS)", "code": 6, "concern": "high", "recycling": "Rarely recycled, foam polystyrene especially.", "health": "Can release styrene, a possible human carcinogen, especially when heated."},
}

MATERIAL_PATTERNS = [
    ("pet", r"\bpet\b|terephthalate|\bpete\b"),
    ("hdpe", r"hdpe|high[- ]density"),
    ("ldpe", r"ldpe|low[- ]density"),
    ("pvc", r"\bpvc\b|polyvinyl|vinyl chloride"),
    ("pp", r"\bpp\b|polypropylene"),
    ("ps", r"\bps\b|polystyrene|styrofoam"),
    ("glass", r"glass"),
    ("aluminium", r"alumin"),
    ("steel", r"steel|tinplate|\bmetal\b"),
    ("paper", r"paper|cardboard|carton|paperboard"),
    ("plastic", r"plastic"),
]
SPECIFIC_PLASTICS = {"pet", "hdpe", "ldpe", "pvc", "pp", "ps"}


def analyse_packaging(p):
    structured = []
    for t in p.get("packaging_materials_tags") or []:
        structured.append(str(t).replace("en:", "").replace("-", " "))
    for pk in p.get("packagings") or []:
        if isinstance(pk, dict) and pk.get("material"):
            structured.append(str(pk["material"]).replace("en:", "").replace("-", " "))
    sources = structured if structured else [str(p.get("packaging") or "")]
    found = []
    for s in sources:
        s = s.lower()
        for key, pattern in MATERIAL_PATTERNS:
            if re.search(pattern, s) and key not in found:
                found.append(key)
    if SPECIFIC_PLASTICS.intersection(found) and "plastic" in found:
        found.remove("plastic")
    result = []
    for key in found:
        kb = PACKAGING_KB.get(key)
        if kb:
            result.append({"key": key, **kb})
    return result


# ---------- BARCODE LOOKUP ----------
OPEN_FACTS_SOURCES = [
    ("food", "https://world.openfoodfacts.org"),
    ("cosmetics", "https://world.openbeautyfacts.org"),
    ("general", "https://world.openproductsfacts.org"),
]
OPEN_FACTS_HEADERS = {"User-Agent": "EcoCartAI/1.0 (student project)"}


def clean_tags(tags):
    out = []
    for t in tags or []:
        s = str(t)
        if ":" in s:
            s = s.split(":", 1)[1]
        out.append(s.replace("-", " "))
    return out


@app.route("/barcode/<code>")
def barcode_lookup(code):
    code = code.strip()

    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT c.*, m.carbon_footprint_kg_co2e_per_kg, m.water_usage_l_per_kg,
               m.confidence_score, m.impact_category, m.source
        FROM catalog_products c
        JOIN materials m ON c.material_label = m.material_label
        WHERE c.barcode = %s
    """, (code,))
    local = cur.fetchone()
    cur.close()
    conn.close()

    if local:
        local = dict(local)
        score = calculate_eco_score(local["carbon_footprint_kg_co2e_per_kg"], local["water_usage_l_per_kg"])
        return jsonify({
            "barcode": code,
            "category": "clothing",
            "source": "EcoCart AI catalog (demo barcode)",
            "name": local["name"],
            "brand": local["brand"],
            "quantity": None,
            "image": local["image_url"],
            "labels": None,
            "material_label": local["material_label"],
            "eco_score": score,
            "eco_score_label": score_label(score),
            "carbon_kg_co2e_per_kg": local["carbon_footprint_kg_co2e_per_kg"],
            "packaging_text": local["packaging"],
            "env_grade": None,
            "env_score": None,
            "nutrition": {},
            "nutrient_levels": {},
            "nutriscore_grade": None,
            "nova_group": None,
            "additives": [],
            "allergens": [],
            "ingredients": "",
            "packaging_analysis": analyse_packaging({"packaging": local["packaging"]})
        })

    if not code.isdigit() or not (8 <= len(code) <= 14):
        return jsonify({"error": "Invalid barcode. Use 8 to 14 digits."}), 400

    for category, base in OPEN_FACTS_SOURCES:
        try:
            r = requests.get(f"{base}/api/v2/product/{code}.json", headers=OPEN_FACTS_HEADERS, timeout=8)
            if r.status_code != 200:
                continue
            data = r.json()
        except Exception:
            continue

        p = data.get("product")
        if not p:
            continue

        grade = p.get("ecoscore_grade") or p.get("environmental_score_grade")
        if grade not in ("a", "b", "c", "d", "e"):
            grade = None
        score = p.get("ecoscore_score")
        if score is None:
            score = p.get("environmental_score_score")
        if not isinstance(score, (int, float)):
            score = None

        carbon = None
        eco_data = p.get("ecoscore_data")
        if isinstance(eco_data, dict):
            agri = eco_data.get("agribalyse")
            if isinstance(agri, dict) and isinstance(agri.get("co2_total"), (int, float)):
                carbon = round(agri["co2_total"], 2)

        n = p.get("nutriments") or {}

        def num(key):
            v = n.get(key)
            return round(float(v), 2) if isinstance(v, (int, float)) else None

        nutrition = {
            "energy_kcal": num("energy-kcal_100g"), "fat": num("fat_100g"),
            "saturated_fat": num("saturated-fat_100g"), "carbs": num("carbohydrates_100g"),
            "sugars": num("sugars_100g"), "fiber": num("fiber_100g"),
            "protein": num("proteins_100g"), "salt": num("salt_100g"),
        }

        nova = p.get("nova_group")
        if not isinstance(nova, int):
            nova = None

        ingredients = (p.get("ingredients_text") or "").strip()
        if len(ingredients) > 400:
            ingredients = ingredients[:400] + "..."

        return jsonify({
            "barcode": code, "category": category, "source": base,
            "name": p.get("product_name") or p.get("generic_name"),
            "brand": p.get("brands"), "quantity": p.get("quantity"),
            "image": p.get("image_front_url") or p.get("image_url"),
            "labels": p.get("labels"), "nutrition": nutrition,
            "nutrient_levels": p.get("nutrient_levels") or {},
            "nutriscore_grade": p.get("nutriscore_grade"), "nova_group": nova,
            "additives": [a.upper() for a in clean_tags(p.get("additives_tags"))],
            "allergens": clean_tags(p.get("allergens_tags")), "ingredients": ingredients,
            "env_grade": grade, "env_score": score, "carbon_kg_co2e_per_kg": carbon,
            "packaging_text": p.get("packaging"), "packaging_analysis": analyse_packaging(p),
        })

    return jsonify({"error": "Product not found in our catalog or Open Food, Beauty, Products Facts"}), 404


# ---------- CAMERA / IMAGE DETECTION ----------
@app.route("/detect", methods=["POST", "OPTIONS"])
def detect():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    image_file = request.files["image"]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            image_file.save(tmp.name)
            tmp_path = tmp.name
        detections = detect_garments(tmp_path)
        predictions = [{"label": d["garment"], "confidence": d["confidence"]} for d in detections]
        predictions.sort(key=lambda p: p["confidence"], reverse=True)
        return jsonify({"predictions": predictions})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


# ---------- SIGNUP ----------
@app.route("/signup", methods=["POST", "OPTIONS"])
def signup():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    data = request.get_json()
    full_name = data.get("full_name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not full_name or not email or not password:
        return jsonify({"error": "All fields are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s) RETURNING user_id",
                    (full_name, email, password_hash))
        user_id = cur.fetchone()[0]
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback(); cur.close(); conn.close()
        return jsonify({"error": "Email already registered"}), 409
    except Exception as e:
        conn.rollback(); cur.close(); conn.close()
        return jsonify({"error": str(e)}), 500
    cur.close(); conn.close()
    return jsonify({"message": "Account created successfully", "user_id": user_id}), 201


# ---------- LOGIN ----------
@app.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    data = request.get_json()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close(); conn.close()
    if user is None:
        return jsonify({"error": "Invalid email or password"}), 401
    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401
    return jsonify({"message": "Login successful",
                     "user": {"user_id": user["user_id"], "full_name": user["full_name"], "email": user["email"]}}), 200


# ---------- MATERIAL DETECTION FROM TEXT ----------
def detect_material(text):
    text = text.lower()
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT material_label FROM materials ORDER BY LENGTH(material_label) DESC")
    all_materials = cur.fetchall()
    cur.close(); conn.close()
    for row in all_materials:
        label = row["material_label"].replace("_", " ")
        if label in text or row["material_label"] in text:
            return row["material_label"]
    return None


# ---------- ADD TO CART ----------
@app.route("/cart/add", methods=["POST", "OPTIONS"])
def add_to_cart():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    data = request.get_json()
    user_id = data.get("user_id")
    product_name = data.get("product_name", "").strip()
    product_description = data.get("product_description", "").strip()
    price = data.get("price")
    product_url = data.get("product_url")
    if not user_id or not product_name:
        return jsonify({"error": "user_id and product_name are required"}), 400
    detected = detect_material(product_description + " " + product_name)
    material_data = None
    if detected:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM materials WHERE material_label = %s", (detected,))
        material_data = cur.fetchone()
        cur.close(); conn.close()
    eco_score = None
    if material_data:
        eco_score = calculate_eco_score(material_data["carbon_footprint_kg_co2e_per_kg"], material_data["water_usage_l_per_kg"])
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO cart_items
        (user_id, product_name, product_description, price, detected_material,
         carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, confidence_score, product_url)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING cart_item_id
    """, (user_id, product_name, product_description, price, detected,
          material_data["carbon_footprint_kg_co2e_per_kg"] if material_data else None,
          material_data["water_usage_l_per_kg"] if material_data else None,
          material_data["confidence_score"] if material_data else None, product_url))
    cart_item_id = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()
    return jsonify({
        "message": "Added to cart", "cart_item_id": cart_item_id, "detected_material": detected,
        "material_found": material_data is not None, "eco_score": eco_score,
        "eco_score_label": score_label(eco_score)
    }), 201


# ---------- VIEW CART ----------
@app.route("/cart/<int:user_id>")
def view_cart(user_id):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM cart_items WHERE user_id = %s ORDER BY added_at DESC", (user_id,))
    items = cur.fetchall()
    cur.close(); conn.close()
    result = []
    for i in items:
        i = dict(i)
        score = calculate_eco_score(i["carbon_footprint_kg_co2e_per_kg"], i["water_usage_l_per_kg"])
        i["eco_score"] = score
        i["eco_score_label"] = score_label(score)
        result.append(i)
    return jsonify(result)


# ---------- REMOVE FROM CART ----------
@app.route("/cart/remove/<int:cart_item_id>", methods=["DELETE", "OPTIONS"])
def remove_from_cart(cart_item_id):
    if request.method == "OPTIONS":
        return jsonify({}), 200
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM cart_items WHERE cart_item_id = %s", (cart_item_id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Removed from cart"}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)