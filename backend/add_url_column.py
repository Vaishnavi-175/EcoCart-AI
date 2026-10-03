import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "database": "ecocart_ai",
    "user": "postgres",
    "password": "vaishnavi@1708",
    "port": 5432
}

try:
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("""
        ALTER TABLE cart_items
        ADD COLUMN IF NOT EXISTS product_url TEXT;
    """)

    conn.commit()

    print("SUCCESS: product_url column added (or already existed).")

    cur.close()
    conn.close()

except Exception as e:
    print("ERROR:", e)
