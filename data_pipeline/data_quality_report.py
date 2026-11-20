
import os
import re
from pathlib import Path

import psycopg2


def main():
    # Read the Neon connection string from an environment variable.
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise SystemExit(
            "DATABASE_URL missing. Set your Neon connection string "
            "in PowerShell before running this script."
        )

    output_dir = Path("runs")
    output_dir.mkdir(exist_ok=True)

    print("Connecting to Neon database...")

    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor() as cur:

                # 1. Basic dataset quality statistics
                cur.execute("""
                    SELECT
                        COUNT(*) AS total_rows,
                        COUNT(*) FILTER (
                            WHERE product_name IS NULL
                               OR TRIM(product_name) = ''
                        ) AS missing_product_names,
                        COUNT(*) FILTER (
                            WHERE material_text IS NULL
                               OR TRIM(material_text) = ''
                        ) AS missing_materials,
                        COUNT(*) FILTER (
                            WHERE parent_product_id IS NULL
                               OR TRIM(parent_product_id) = ''
                        ) AS missing_parent_ids,
                        COUNT(*) FILTER (
                            WHERE category IS NULL
                               OR TRIM(category) = ''
                        ) AS missing_categories,
                        COUNT(DISTINCT parent_product_id)
                            AS distinct_parent_ids
                    FROM public.ecocart_dataset_products;
                """)

                result = cur.fetchone()

                (
                    total_rows,
                    missing_names,
                    missing_materials,
                    missing_ids,
                    missing_categories,
                    distinct_parent_ids,
                ) = result

                # 2. Exact duplicate raw JSON records.
                # This is a candidate check, not a definitive
                # duplicate-product count.
                cur.execute("""
                    SELECT COUNT(*)
                    FROM (
                        SELECT raw_record
                        FROM public.ecocart_dataset_products
                        GROUP BY raw_record
                        HAVING COUNT(*) > 1
                    ) AS repeated_records;
                """)

                repeated_raw_record_groups = cur.fetchone()[0]

                # 3. Check simple material compositions.
                cur.execute("""
                    SELECT material_text
                    FROM public.ecocart_dataset_products
                    WHERE material_text IS NOT NULL
                      AND TRIM(material_text) <> '';
                """)

                materials = [row[0] for row in cur.fetchall()]

        simple_checked = 0
        simple_not_100 = 0
        complex_compositions = 0
        no_percentages = 0

        for material in materials:
            percentages = re.findall(
                r"(\d+(?:\.\d+)?)\s*%",
                material
            )

            if not percentages:
                no_percentages += 1
                continue

            # These patterns can represent multiple garment parts,
            # so don't incorrectly add their percentages together.
            if (
                "/" in material
                or "\n" in material
                or "body:" in material.lower()
                or "rib:" in material.lower()
            ):
                complex_compositions += 1
                continue

            values = [float(value) for value in percentages]
            simple_checked += 1

            if abs(sum(values) - 100.0) > 1.0:
                simple_not_100 += 1

        # 4. Build the report.
        report_lines = [
            "EcoCart-AI Dataset Quality Report",
            "=" * 38,
            "",
            "DATABASE SUMMARY",
            f"Total database rows: {total_rows}",
            f"Distinct parent product IDs (NULL excluded): "
            f"{distinct_parent_ids}",
            "",
            "MISSING DATA CHECKS",
            f"Rows missing product names: {missing_names}",
            f"Rows missing material text: {missing_materials}",
            f"Rows missing parent product IDs: {missing_ids}",
            f"Rows missing categories: {missing_categories}",
            "",
            "DUPLICATE CANDIDATE CHECK",
            f"Repeated raw_record groups: "
            f"{repeated_raw_record_groups}",
            "",
            "FABRIC COMPOSITION CHECKS",
            f"Simple compositions checked: {simple_checked}",
            f"Simple compositions not approximately 100%: "
            f"{simple_not_100}",
            f"Complex compositions needing separate validation: "
            f"{complex_compositions}",
            f"Rows with no percentage found: {no_percentages}",
            "",
            "INTERPRETATION AND LIMITATIONS",
            "- Repeated parent IDs can represent legitimate variants.",
            "- Repeated raw records need investigation before deduplication.",
            "- Complex material compositions require part-wise validation.",
            "- These checks do not verify environmental footprint values.",
            "- This script does not update or delete database records.",
        ]

        report_text = "\n".join(report_lines)
        report_path = output_dir / "data_quality_report.txt"
        report_path.write_text(report_text, encoding="utf-8")

        print()
        print(report_text)
        print(f"\nReport saved to: {report_path.resolve()}")

    except psycopg2.Error as error:
        raise SystemExit(
            "Database query failed. Check the connection and table name.\n"
            f"PostgreSQL error: {error}"
        )


if __name__ == "__main__":
    main()
