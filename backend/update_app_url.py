from pathlib import Path

p = Path("app.py")
s = p.read_text()

s = s.replace(
    '    price = data.get("price")\n',
    '    price = data.get("price")\n    product_url = data.get("product_url")\n',
    1
)

s = s.replace(
    '         carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, confidence_score)\n'
    '        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING cart_item_id\n',
    '         carbon_footprint_kg_co2e_per_kg, water_usage_l_per_kg, confidence_score, product_url)\n'
    '        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING cart_item_id\n',
    1
)

s = s.replace(
    '        material_data["confidence_score"] if material_data else None,\n'
    '    ))\n',
    '        material_data["confidence_score"] if material_data else None,\n'
    '        product_url,\n'
    '    ))\n',
    1
)

p.write_text(s)
print("SUCCESS: app.py updated for product_url")
