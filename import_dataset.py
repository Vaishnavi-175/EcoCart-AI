
import json
import os
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, execute_values

# Dataset Downloads folder madhun gheto
DATA_FILE = (
    Path.home()
    / "Downloads"
    / "6_JSONL_component_normalized_public.jsonl"
)

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise SystemExit(
        "DATABASE_URL set nahi. Step 4 madhil instructions follow kara."
    )

if not DATA_FILE.exists():
    raise SystemExit(f"Dataset file sapadli nahi: {DATA_FILE}")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS public.ecocart_dataset_products (
    id BIGSERIAL PRIMARY KEY,
    parent_product_id TEXT,
    brand TEXT,
    region TEXT,
    product_name TEXT,
    product_url TEXT,
    category TEXT,
    variant_colour TEXT,
    material_text TEXT,
    components JSONB,
    raw_record JSONB NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (parent_product_id, brand, variant_colour)
);
"""

INSERT_SQL = """
INSERT INTO public.ecocart_dataset_products (
    parent_product_id, brand, region, product_name,
    product_url, category, variant_colour,
    material_text, components, raw_record
) VALUES %s
ON CONFLICT (parent_product_id, brand, variant_colour)
DO NOTHING;
"""

batch = []
read_count = 0
bad_count = 0
insert_attempts = 0
BATCH_SIZE = 500

def make_row(record):
    return (
        str(record["parent_product_id"])
        if record.get("parent_product_id") is not None else None,
        record.get("brand"),
        record.get("region"),
        record.get("product_name"),
        record.get("url"),
        record.get("detail_category") or record.get("raw_category"),
        record.get("variant_colour"),
        record.get("raw_material_text_norm")
        or record.get("raw_material_text"),
        Json(record.get("components_structured") or []),
        Json(record),
    )

def insert_batch(cursor, rows):
    global insert_attempts
    if rows:
        execute_values(cursor, INSERT_SQL, rows, page_size=100)
        insert_attempts += len(rows)
        rows.clear()

print("Dataset file:", DATA_FILE)
print("Neon database la connect hot aahe...")

with psycopg2.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        # Fakta navin, vegla table tayar hoil.
        cur.execute(CREATE_TABLE)

        with DATA_FILE.open("r", encoding="utf-8-sig") as file:
            for line_number, line in enumerate(file, start=1):
                if not line.strip():
                    continue

                try:
                    record = json.loads(line)
                    if not isinstance(record, dict):
                        raise ValueError("JSON object expected")

                    read_count += 1
                    batch.append(make_row(record))

                    if len(batch) >= BATCH_SIZE:
                        insert_batch(cur, batch)
                        conn.commit()
                        print("Processed records:", read_count)

                except (json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
                    bad_count += 1
                    print(f"Skipped line {line_number}: {exc}")

        if batch:
            insert_batch(cur, batch)

        conn.commit()

        cur.execute(
            "SELECT COUNT(*) FROM public.ecocart_dataset_products"
        )
        total_rows = cur.fetchone()[0]

print("\nImport process complete.")
print("Valid JSON records read:", read_count)
print("Malformed/incomplete records skipped:", bad_count)
print("Rows attempted in insert batches:", insert_attempts)
print("Total rows now in EcoCart dataset table:", total_rows)
print("Existing project tables were not intentionally modified.")
