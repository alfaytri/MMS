"""
generate_services_migration.py
Auto-generates a Supabase migration SQL file from the old-system services XLSX.

Usage:
    cd D:\\MMS
    python scripts/migrate/generate_services_migration.py
"""

import pandas as pd
import uuid
from pathlib import Path

XLSX = r"C:\Users\IT\Downloads\Services From the Old system.xlsx"
OUT = Path("supabase/migrations/20260518120000_services_tree_import.sql")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def q(s):
    """SQL-escape a scalar value, returning NULL for missing values."""
    if s is None:
        return "NULL"
    if isinstance(s, float) and pd.isna(s):
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def infer_category(name, is_product_sale):
    """Infer a services.category value from name + Is Product Sale flag."""
    n = str(name).lower()
    if str(is_product_sale).strip().lower() == "yes":
        return "Installation"
    if "cleaning" in n:
        return "Cleaning"
    if any(w in n for w in ["maintenance", "level 1", "level 2"]):
        return "Maintenance"
    if any(w in n for w in ["repair", "repairing", "replace", "install"]):
        return "Repair"
    return None  # parent / category nodes — no category assigned


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"Reading {XLSX} ...")
    df = pd.read_excel(XLSX, engine="openpyxl")
    print(f"  Loaded {len(df)} rows, columns: {list(df.columns)}")

    # Build old-int-id → new UUID mapping up-front so children can reference parents
    id_map: dict[int, str] = {}
    for _, row in df.iterrows():
        old_id = int(row["ID"])
        id_map[old_id] = str(uuid.uuid4())

    # Sort by LevelNo ascending so parent INSERTs always precede child INSERTs
    df_sorted = df.sort_values("LevelNo", kind="stable").reset_index(drop=True)

    # Group rows by level for annotated output
    levels = sorted(df_sorted["LevelNo"].unique())

    # Level labels for SQL comments
    level_labels = {
        1: "Level 1: root categories",
        2: "Level 2: sub-categories",
        3: "Level 3: service groups",
        4: "Level 4: leaf services (actual services with prices)",
    }

    lines: list[str] = []

    lines.append("-- Auto-generated services import")
    lines.append("-- Source: Services From the Old system.xlsx")
    lines.append(f"-- {len(df)} rows, tree_type = 'normal'")
    lines.append("")
    lines.append("BEGIN;")

    for level in levels:
        level_df = df_sorted[df_sorted["LevelNo"] == level]
        label = level_labels.get(int(level), f"Level {int(level)}")
        lines.append("")
        lines.append(f"-- {label}")

        for _, row in level_df.iterrows():
            old_id = int(row["ID"])
            new_uuid = id_map[old_id]

            # parent_id
            if pd.notna(row["ParentId"]):
                parent_old = int(row["ParentId"])
                parent_uuid = id_map.get(parent_old)
                if parent_uuid:
                    parent_sql = f"'{parent_uuid}'"
                else:
                    parent_sql = "NULL"
            else:
                parent_sql = "NULL"

            # name_en / name_ar
            name_en_sql = q(row["Name"])
            name_ar_val = row["ArabicName"] if pd.notna(row.get("ArabicName", float("nan"))) else None
            name_ar_sql = q(name_ar_val)

            # sort_order
            sort_order = int(row["OrderSerial"]) if pd.notna(row.get("OrderSerial", float("nan"))) else 0

            # price
            price_sql = str(float(row["Price"])) if pd.notna(row.get("Price", float("nan"))) else "NULL"

            # duration
            dur_val = row.get("Duration1Minutes", float("nan"))
            duration_sql = str(int(float(dur_val))) if pd.notna(dur_val) else "NULL"

            # category
            cat = infer_category(row["Name"], row.get("Is Product Sale", "No"))
            category_sql = q(cat)  # q(None) → NULL

            # spare_parts
            has_inv = row.get("HasInventory", False)
            spare_parts_sql = "TRUE" if has_inv is True or str(has_inv).strip().lower() == "true" else "FALSE"

            # status
            is_active = row.get("IsActive", False)
            status_sql = "'active'" if is_active is True or str(is_active).strip().lower() == "true" else "'inactive'"

            insert = (
                f"INSERT INTO services "
                f"(id, parent_id, name_en, name_ar, tree_type, sort_order, "
                f"price, duration, category, spare_parts, status) VALUES ("
                f"'{new_uuid}', {parent_sql}, {name_en_sql}, {name_ar_sql}, "
                f"'normal', {sort_order}, {price_sql}, {duration_sql}, "
                f"{category_sql}, {spare_parts_sql}, {status_sql}"
                f") ON CONFLICT (id) DO NOTHING;"
            )
            lines.append(insert)

    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    sql = "\n".join(lines)

    # Ensure output directory exists
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(sql, encoding="utf-8")
    print(f"Written: {OUT}")

    # ---------------------------------------------------------------------------
    # Verification
    # ---------------------------------------------------------------------------
    insert_count = sql.count("ON CONFLICT (id) DO NOTHING;")
    has_begin = "BEGIN;" in sql
    has_commit = "COMMIT;" in sql
    has_installation = "category = 'Installation'" in sql or "'Installation'" in sql
    has_spare_parts = "spare_parts = TRUE" in sql or "TRUE" in sql

    print("\n--- Verification ---")
    print(f"  INSERT statements  : {insert_count}  (expected {len(df)})")
    print(f"  BEGIN present      : {has_begin}")
    print(f"  COMMIT present     : {has_commit}")
    print(f"  Has Installation   : {has_installation}")
    print(f"  Has spare_parts=TRUE: {has_spare_parts}")

    ok = (
        insert_count == len(df)
        and has_begin
        and has_commit
        and has_installation
        and has_spare_parts
    )
    if ok:
        print("\nAll checks PASSED.")
    else:
        print("\nOne or more checks FAILED — review output above.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
