import pandas as pd
import json
import re
import os

# =========================
# LOAD DATASETS
# =========================

zara = pd.read_csv("../data/raw/zara/Zara dataset sample.csv")
sustainability = pd.read_csv("../data/raw/sustainability/60_materials.csv")


# =========================
# EXTRACT MATERIALS
# =========================

def extract_materials(material_json):
    if pd.isna(material_json) or material_json == "[]":
        return []

    try:
        data = json.loads(material_json)
    except:
        return []

    results = []

    for item in data:
        value = item.get("value", "")

        if "%" not in value:
            continue

        matches = re.findall(
            r"(\d+(?:\.\d+)?)%\s*([A-Za-zÀ-ÿÆØÅäöüšžłńęóśźżŁŃĘÓŚŹŻ-]+)",
            value
        )

        for percentage, material in matches:
            results.append({
                "percentage": float(percentage),
                "material": material.lower()
            })

    return results


# =========================
# NORMALIZE MATERIAL NAMES
# =========================

def normalize_material(material):

    mapping = {
        "bawelna": "cotton",
        "puuvilla": "cotton",
        "cotton": "cotton",

        "polyesteri": "polyester",
        "polyester": "polyester",

        "poliamid": "nylon",
        "nylon": "nylon",

        "elastan": "elastane",
        "elastodieeni": "elastane",

        "poliuretaani": "polyurethane",
        "polyuretan": "polyurethane",

        "wool": "wool",
        "lana": "wool",

        "linen": "linen",
        "flax": "linen",

        "hemp": "hemp",

        "viscose": "viscose",
        "viskoosi": "viscose",

        "modal": "modal",

        "lyocell": "lyocell",

        "acrylic": "acrylic",

        "leather": "leather",

        "rubber": "rubber",

        "recycled": "recycled_cotton",
        "rcs": "recycled_cotton"
    }

    return mapping.get(material, material)


# =========================
# TEST FIRST 10 PRODUCTS
# =========================

print("\n==============================")
print("TESTING FIRST 10 PRODUCTS")
print("==============================")

for i in range(10):

    print("\nPRODUCT:", i)
    print("Name:", zara.loc[i, "product_name"])

    materials = extract_materials(
        zara.loc[i, "materials"]
    )

    if not materials:
        print("Material: Not available")
        continue

    for m in materials:

        material = normalize_material(
            m["material"]
        )

        match = sustainability[
            sustainability["material"] == material
        ]

        if not match.empty:

            carbon = match.iloc[0][
                "carbon_kg_co2e_per_kg"
            ]

            score = match.iloc[0][
                "eco_score"
            ]

            print(
                f'{m["percentage"]}% {material} '
                f'| Carbon: {carbon} '
                f'| Eco Score: {score}'
            )

        else:

            print(
                f'{m["percentage"]}% {material} '
                f'| Sustainability data: Not found'
            )


# =========================
# DATASET SUMMARY
# =========================

total_products = len(zara)

products_with_materials = sum(
    bool(extract_materials(x))
    for x in zara["materials"]
)

print("\n==============================")
print("DATASET SUMMARY")
print("==============================")

print(
    "Total Zara products:",
    total_products
)

print(
    "Products with materials:",
    products_with_materials
)


# =========================
# CREATE PROCESSED DATA
# =========================

output = []

for i in range(len(zara)):

    materials = extract_materials(
        zara.loc[i, "materials"]
    )

    for m in materials:

        material = normalize_material(
            m["material"]
        )

        match = sustainability[
            sustainability["material"] == material
        ]

        if not match.empty:

            row = match.iloc[0]

            output.append({
                "product_id": zara.loc[i, "product_id"],
                "product_name": zara.loc[i, "product_name"],
                "percentage": m["percentage"],
                "material": material,
                "carbon": row[
                    "carbon_kg_co2e_per_kg"
                ],
                "eco_score": row[
                    "eco_score"
                ]
            })


# =========================
# SAVE PROCESSED FILE
# =========================

result = pd.DataFrame(output)

os.makedirs(
    "../data/processed",
    exist_ok=True
)

output_file = (
    "../data/processed/"
    "zara_material_sustainability.csv"
)

result.to_csv(
    output_file,
    index=False
)


# =========================
# FINAL OUTPUT
# =========================

print("\n==============================")
print("PROCESSING COMPLETE")
print("==============================")

print(
    "Saved:",
    len(result),
    "material records"
)

print(
    "File:",
    output_file
)