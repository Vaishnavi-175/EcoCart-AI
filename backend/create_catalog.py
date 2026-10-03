import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "database": "ecocart_ai",
    "user": "postgres",
    "password": "vaishnavi@1708",
    "port": 5432
}

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

cur.execute("""
    CREATE TABLE IF NOT EXISTS catalog_products (
        product_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(150),
        category VARCHAR(50) NOT NULL,
        price NUMERIC(10,2),
        material_label VARCHAR(50) NOT NULL REFERENCES materials(material_label),
        image_url TEXT,
        packaging VARCHAR(100)
    );
""")

cur.execute("TRUNCATE TABLE catalog_products RESTART IDENTITY;")

products = [
    ("Oxford Organic Shirt", "Field and Form", "shirts", 72.00, "cotton", "https://images.unsplash.com/photo-1598961942613-ba897716405b?w=400", "Recycled paper bag"),
    ("Relaxed Linen Shirt", "Morrow Studio", "shirts", 64.00, "flax_linen", "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=400", "Compostable mailer"),
    ("Rewoven Work Shirt", "Common Ground", "shirts", 59.00, "viscose_rayon", "https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=400", "Plastic polybag"),
    ("Daily Poplin Button Down", "Westward", "shirts", 48.00, "polyester", "https://images.unsplash.com/photo-1618453292459-53524b5d5f8c?w=400", "Plastic polybag"),
    ("Heritage Flannel Shirt", "North Fields", "shirts", 68.00, "wool", "https://images.unsplash.com/photo-1608748010899-18f300247112?w=400", "Recycled paper bag"),
    ("Classic Crew Tee", "Basis", "t-shirts", 28.00, "cotton", "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400", "Plastic polybag"),
    ("Performance Tech Tee", "Runwell", "t-shirts", 34.00, "polyester", "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400", "Plastic polybag"),
    ("Soft Modal Tee", "Lune", "t-shirts", 32.00, "modal", "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400", "Compostable mailer"),
    ("Straight Fit Jeans", "Denim Co", "jeans", 89.00, "denim", "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400", "Recycled paper bag"),
    ("Slim Stretch Jeans", "Form&Fade", "jeans", 82.00, "elastane_spandex", "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400", "Plastic polybag"),
    ("Wool Blend Hoodie", "North Fields", "hoodies", 76.00, "wool", "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400", "Recycled paper bag"),
    ("Fleece Pullover Hoodie", "Basis", "hoodies", 54.00, "polyester", "https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=400", "Plastic polybag"),
    ("Recycled Shell Jacket", "Runwell", "jackets", 128.00, "nylon", "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400", "Recycled paper bag"),
    ("Cotton Canvas Jacket", "Field and Form", "jackets", 112.00, "cotton", "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=400", "Recycled paper bag"),
    ("Silk Wrap Dress", "Lune", "dresses", 96.00, "silk", "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400", "Compostable mailer"),
    ("Linen Midi Dress", "Morrow Studio", "dresses", 88.00, "flax_linen", "https://images.unsplash.com/photo-1572804013427-4d7ca7268217?w=400", "Compostable mailer"),
    ("Tailored Wool Trousers", "Westward", "trousers", 94.00, "wool", "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400", "Recycled paper bag"),
    ("Everyday Chino Trousers", "Common Ground", "trousers", 58.00, "polyester", "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400", "Plastic polybag"),
]

for p in products:
    cur.execute("""
        INSERT INTO catalog_products (name, brand, category, price, material_label, image_url, packaging)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, p)

conn.commit()
print(f"Inserted {len(products)} catalog products.")
cur.close()
conn.close()