"""
Give two more fan motors the part numbers their source files record.

    python scripts/rename_fan_motors_from_source.py            # dry run
    python scripts/rename_fan_motors_from_source.py --apply

BACKGROUND
After renaming the six Indoor motors from wattage to model, a sweep of every
source file in the pipeline turned up two more items still named vaguely whose
real part number IS on record, each confirmed by two independent sources:

  `AC / Fan Motor / 1/2 HP`  (Genteq, 9 in stock)
      Trading_Items_Review.xlsx row 515      model `5KCP39PGN`
      All_Inventory_Warehouse_Wise.xlsx      `5KCP39PGN 1/2HP`, GENTEQ, qty 9
      -> `5KCP39PGN 1/2HP`

  `AC / Fan Motor / Outdoor / 75 W`  (0 in stock)
      Trading_Items_Review.xlsx row 524      model `YDK75-6D`, rotation CCW
      -> `YDK75-6D CCW 75WATTS`, matching every one of its siblings
         (`YDK35-6K CCW 35WATTS`, `YDK60-6D CCW 60WATTS`, ...)

NOT RENAMED, deliberately
The six Indoor motors are already as specific as the data allows -- every
source names them `YDK <watt>W INDOOR MOTOR` and nothing deeper exists.

The three Elco motors at the `AC / Fan Motor` root (`5 W`, `25 W`, `34 W`)
have NO part number in any source; the warehouse file records them only as
`25WATTS / ELCO Italy`. Their brand is already set to Elco, so a rename would
add nothing except to disambiguate `25 W` (Elco) from `YDK 25W` (Indoor) in a
flat search -- a judgement call left to the operator.

The `Axial Fan > Fan Motor with Guard` items are described by size, airflow and
phase, which is how that product is actually specified. They are not vague.

SAFETY
Same as the earlier renames: document lines reference the VARIANT CODE, never
`inventory_items.sku` (sale_order_lines 173/173, po_line_items 102/102,
receival_items 57/57 all match variant codes, zero match item skus). Variant
codes are left untouched here, so nothing pointing at these items moves.
`inventory_stock_movements` keeps its historical snapshots, as it should.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

# (old name, category path fragment, new name)
RENAMES = [
    ("1/2 HP", "AC / Fan Motor",            "5KCP39PGN 1/2HP"),
    ("75 W",   "AC / Fan Motor / Outdoor",  "YDK75-6D CCW 75WATTS"),
]


def one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def resolve(cur, path):
    return one(cur, """
      WITH RECURSIVE sub AS (
        SELECT id, name_en::text AS cp FROM inventory_categories WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, s.cp||' / '||c.name_en FROM inventory_categories c JOIN sub s ON s.id=c.parent_id)
      SELECT id FROM sub WHERE cp=%s;""", (path,))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    env = read_env(ENV_PATH)
    url = env["NEW_DB_URL"]
    assert "optishfnnctrhffpoywg" in url, "not new-prod"
    conn = psycopg2.connect(url, connect_timeout=25)
    conn.autocommit = False
    cur = conn.cursor()

    before_items = one(cur, "SELECT count(*) FROM inventory_items WHERE status='active';")[0]
    drift = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]
    print("before: %d active items, drift %d\n" % (before_items, drift))
    if drift:
        conn.rollback()
        raise SystemExit("ABORT: %d items already drifting" % drift)

    checks = []
    for old, path, new in RENAMES:
        row = resolve(cur, path)
        if not row:
            conn.rollback()
            raise SystemExit("ABORT: category %r not found" % path)
        cat = row[0]
        hit = one(cur, """SELECT i.id, v.code, coalesce(i.total_stock,0), v.brand
             FROM inventory_items i JOIN inventory_item_brand_variants v ON v.item_id=i.id
            WHERE i.status='active' AND i.category_id=%s AND btrim(i.name_en)=%s;""", (cat, old))
        if not hit:
            conn.rollback()
            raise SystemExit("ABORT: %r not found in %s" % (old, path))
        item_id, code, stock, brand = hit
        clash = one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
             AND category_id=%s AND lower(btrim(name_en))=lower(%s) AND id<>%s;""",
                    (cat, new, item_id))[0]
        if clash:
            conn.rollback()
            raise SystemExit("ABORT: %r already exists in %s" % (new, path))
        cur.execute("UPDATE inventory_items SET name_en=%s, sku=%s WHERE id=%s;", (new, new, item_id))
        print("  %-8s -> %-24s  %s  code=%s stock=%d brand=%r"
              % (old, new, path, code, int(stock), brand))
        checks.append((item_id, code, new, float(stock)))

    print("\nverify:")
    ok = True
    for item_id, code, new, stock in checks:
        nm, c2, st2 = one(cur, """SELECT i.name_en, v.code, coalesce(i.total_stock,0)
             FROM inventory_items i JOIN inventory_item_brand_variants v ON v.item_id=i.id
            WHERE i.id=%s;""", (item_id,))
        stale = one(cur, """SELECT count(*) FROM warehouse_stock_summary w
            WHERE w.brand_variant_id IN (SELECT id FROM inventory_item_brand_variants
                                          WHERE item_id=%s) AND w.item_name<>%s;""",
                    (item_id, new))[0]
        good = nm == new and c2 == code and float(st2) == stock and stale == 0
        print("  %s %-24s code %s kept, stock %d kept, summary copies current"
              % ("ok " if good else "XX ", new, c2, int(st2)))
        ok = ok and good

    after_items = one(cur, "SELECT count(*) FROM inventory_items WHERE status='active';")[0]
    drift2 = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]
    print("  items %d -> %d (want unchanged); drift %d (want 0)" % (before_items, after_items, drift2))
    ok = ok and after_items == before_items and drift2 == 0

    if not ok:
        conn.rollback()
        raise SystemExit("ABORT: a check failed - rolled back")

    if args.apply:
        conn.commit()
        print("\n>>> COMMITTED to new-prod")
    else:
        conn.rollback()
        print("\n>>> DRY RUN - ROLLED BACK (pass --apply to commit)")
    conn.close()


if __name__ == "__main__":
    main()
