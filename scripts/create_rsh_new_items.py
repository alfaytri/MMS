"""
Create the 21 new RSH (Pest Control & Cleaning) items from
`D:\\007\\RSH new data.xlsx` rows 61-81, plus the categories they need.

    python scripts/create_rsh_new_items.py            # dry run, rolled back
    python scripts/create_rsh_new_items.py --apply

Items are created at ZERO stock. Quantities and the September/October
corrections are a separate step — this one only establishes the catalogue
entries so they land in the right place.

Idempotent: every category and item is looked up before insert, so a re-run
adds nothing.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

PEST_DIV = "c6070d16-a7e4-4ee8-a8ad-0dae5ce3d583"
NO_BRAND = "baee6457-1a5e-4031-8c1f-7c7172013a2e"

# Existing parents, by id — NOT by name. `Cleaning Equipment` exists twice at
# root (tools and consumables); the brush and wiper trees live under the tools
# one, and resolving by name could silently pick the wrong trunk.
GLOVES          = "e73b7f27-5211-4df6-93ff-6d7e759572c2"   # Safety & PPE / Gloves
PEST_ROOT       = "140f8326-9fc5-46a6-bda0-e41be3a858fc"   # Pest Control

# (name, parent_id or None, type)
NEW_CATEGORIES = [
    ("Stone & Floor Care", None, "consumables"),
    ("Grout",              "@Stone & Floor Care", "consumables"),
    ("Polishing",          "@Stone & Floor Care", "consumables"),
    ("Wax & Sealant",      "@Stone & Floor Care", "consumables"),
    ("Latex Disposable Gloves", GLOVES,    "consumables"),
    ("General Insecticide",     PEST_ROOT, "consumables"),
]

# (item name, unit, cost, category path to resolve)
#   "@Name" resolves against the categories created above;
#   a plain path resolves against the live tree by walking parents.
ITEMS = [
    ("Latex Gloves (Each Box 10pcs)",            "Cartoon", 11.19, "@Latex Disposable Gloves"),
    ("Chemical Gloves",                          "Piece",    9.00, "@Latex Disposable Gloves"),
    ("Rat Bait Station",                         "Piece",   27.21, "Pest Control / Rat"),
    ("Hard Brush-[Green]",                       "Piece",   10.00, "Cleaning Equipment / Brooms & Brushes / Brush"),
    ("Soft Brush",                               "Piece",   12.00, "Cleaning Equipment / Brooms & Brushes / Brush"),
    ("Smart Clean PVC Floor Wiper-[45cm]",       "Piece",   12.00, "Cleaning Equipment / Wipers & Squeegees / Floor Wiper"),
    ("Sufra Plastic Roll Cover-[10kg]",          "Piece",   68.00, "Cleaning Supplies / Table Roll"),
    ("Oxalic Acid KG",                           "Piece",   20.00, "Cleaning Supplies / Chemicals / Acid Cleaner"),
    ("25KG TIGER AUTOMOTIVE [Detergent Powder]", "Piece",   70.00, "Cleaning Supplies / Chemicals"),
    ("Gloria Stainless Steel Pesticide Sprayer, 10 L, T510", "Piece", 0.00, "Cleaning Machines / Sprayer"),
    ("Clobride 200 SL",                          "Piece",    0.00, "@General Insecticide"),
    ("Sniper 50 SC",                             "Piece",    0.00, "@General Insecticide"),
    ("Weber Grout White",                        "Piece",   30.00, "@Grout"),
    ("Weber Grout Beige",                        "Piece",   30.00, "@Grout"),
    ("Dekogrout Antique White Italy",            "Piece",   63.20, "@Grout"),
    ("Dekogrout Bright White Italy",             "Piece",   63.20, "@Grout"),
    ("Yellow Stone Italy",                       "Piece",   15.00, "@Polishing"),
    ("Midnight Black Italy",                     "Piece",   45.00, "@Polishing"),
    ("Jolly Cream Box",                          "Piece",  150.00, "@Polishing"),
    ("Honig Wax Italy [B-Chem]",                 "Piece",   60.00, "@Wax & Sealant"),
    ("Super Mastics Bucket-7kg [White]",         "Piece",  110.00, "@Wax & Sealant"),
]


def resolve_path(cur, path):
    """Walk a ' / ' path from the root, matching parent by id at each step."""
    parent = None
    for part in [p.strip() for p in path.split("/")]:
        if parent is None:
            cur.execute("""SELECT id FROM inventory_categories
                            WHERE lower(btrim(name_en))=lower(%s) AND parent_id IS NULL
                              AND type='tools'::inventory_type""", (part,)) \
                if part == "Cleaning Equipment" else \
            cur.execute("""SELECT id FROM inventory_categories
                            WHERE lower(btrim(name_en))=lower(%s) AND parent_id IS NULL""", (part,))
        else:
            cur.execute("""SELECT id FROM inventory_categories
                            WHERE lower(btrim(name_en))=lower(%s) AND parent_id=%s""", (part, parent))
        got = cur.fetchall()
        if len(got) != 1:
            raise SystemExit(f"path {path!r}: {part!r} resolved to {len(got)} categories")
        parent = got[0][0]
    return parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    env = read_env(ENV_PATH)
    url = env["NEW_DB_URL"]
    assert "optishfnnctrhffpoywg" in url, "not new-prod"
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    made = {}
    print("— categories —")
    for name, parent, ctype in NEW_CATEGORIES:
        pid = made[parent[1:]] if isinstance(parent, str) and parent.startswith("@") else parent
        if pid is None:
            cur.execute("""SELECT id FROM inventory_categories
                            WHERE lower(btrim(name_en))=lower(%s) AND parent_id IS NULL""", (name,))
        else:
            cur.execute("""SELECT id FROM inventory_categories
                            WHERE lower(btrim(name_en))=lower(%s) AND parent_id=%s""", (name, pid))
        row = cur.fetchone()
        if row:
            made[name] = row[0]
            print(f"  = {name:<26} already exists")
        else:
            cur.execute("""INSERT INTO inventory_categories (name_en, parent_id, type)
                           VALUES (%s, %s, %s::inventory_type) RETURNING id;""", (name, pid, ctype))
            made[name] = cur.fetchone()[0]
            print(f"  + {name:<26} created under {'(root)' if pid is None else pid}")

    print("\n— items —")
    created = existing = 0
    for name, unit, cost, path in ITEMS:
        cat = made[path[1:]] if path.startswith("@") else resolve_path(cur, path)
        cur.execute("""SELECT id FROM inventory_items
                        WHERE category_id=%s AND lower(btrim(name_en))=lower(%s)""", (cat, name))
        row = cur.fetchone()
        if row:
            item_id = row[0]
            existing += 1
            print(f"  = {name[:46]:<48} exists")
        else:
            cur.execute("""INSERT INTO inventory_items (category_id, name_en, sku, unit, cost_price)
                           VALUES (%s, %s, %s, %s, %s) RETURNING id;""", (cat, name, name, unit, cost))
            item_id = cur.fetchone()[0]
            created += 1
            print(f"  + {name[:46]:<48} {unit:<8} cost={cost}")
        # one variant, no brand, cost carried; triggers fill brand text + code
        cur.execute("""INSERT INTO inventory_item_brand_variants
                         (item_id, brand, brand_id, country_id, cost_price, selling_price)
                       SELECT %s, 'no brand', %s, NULL, %s, 0
                        WHERE NOT EXISTS (SELECT 1 FROM inventory_item_brand_variants
                                           WHERE item_id=%s AND brand_id=%s);""",
                    (item_id, NO_BRAND, cost, item_id, NO_BRAND))
        cur.execute("""INSERT INTO inventory_item_divisions (item_id, division_id, category_id)
                       VALUES (%s, %s, %s) ON CONFLICT (item_id, division_id) DO NOTHING;""",
                    (item_id, PEST_DIV, cat))

    cur.execute("""SELECT count(*) FROM inventory_items i
                    WHERE i.status='active' AND NOT EXISTS (
                      SELECT 1 FROM inventory_item_divisions d WHERE d.item_id=i.id);""")
    orphans = cur.fetchone()[0]
    print(f"\n  created {created}, already present {existing}")
    print(f"  active items with NO division: {orphans}")
    if orphans:
        conn.rollback()
        raise SystemExit(f"ABORT: {orphans} items left unassigned — rolled back")

    if args.apply:
        conn.commit(); print("\n>>> COMMITTED to new-prod")
    else:
        conn.rollback(); print("\n>>> DRY RUN - ROLLED BACK (pass --apply to commit)")
    conn.close()


if __name__ == "__main__":
    main()
