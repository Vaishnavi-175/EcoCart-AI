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
    CREATE TABLE IF NOT EXISTS cart_items (
        cart_item_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        product_name VARCHAR(255) NOT NULL,
        product_description TEXT,
        price NUMERIC(10,2),
        detected_material VARCHAR(50),
        carbon_footprint_kg_co2e_per_kg NUMERIC(8,2),
        water_usage_l_per_kg NUMERIC(10,2),
        confidence_score INTEGER,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
""")

conn.commit()
print("cart_items table created successfully!")

cur.close()
conn.close()