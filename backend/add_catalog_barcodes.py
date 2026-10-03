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

cur.execute("ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS barcode VARCHAR(20);")

cur.execute("SELECT product_id FROM catalog_products ORDER BY product_id")
ids = [r[0] for r in cur.fetchall()]

for i, pid in enumerate(ids):
    demo_barcode = f"890{str(pid).zfill(3)}{str(1000 + i)}"
    cur.execute("UPDATE catalog_products SET barcode = %s WHERE product_id = %s", (demo_barcode, pid))

conn.commit()
print(f"Assigned demo barcodes to {len(ids)} products.")

cur.execute("SELECT product_id, name, barcode FROM catalog_products ORDER BY product_id LIMIT 5")
for row in cur.fetchall():
    print(row)

cur.close()
conn.close()