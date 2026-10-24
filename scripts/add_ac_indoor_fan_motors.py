"""
Name the AC indoor fan motors properly and add four new ones.

    python scripts/add_ac_indoor_fan_motors.py            # dry run
    python scripts/add_ac_indoor_fan_motors.py --apply

CONTEXT
Four motors came in from the workshop (photos + labels). All four are INDOOR
units, so they belong in `AC / Fan Motor / Indoor`. None of them exist --
checked against the catalogue on eight model-number variants, and against
`D:\\ERP\\Inventory Works\\Trading_Items_Review.xlsx` (588 rows), which does not
list them either.

THE "SAME ITEM" DOUBT, RESOLVED
`AC / Fan Motor / Indoor / 30 W` looked like it might already be the Gree 30 W
DC motor. The review file settles it: that item is row 531, model
`YDK 30W INDOOR MOTOR` -- a YDK-series AC motor. The Gree is `FN30G-ZL`,
brushless DC 310 V. Different products that happen to share a wattage, so the
Gree is a genuine addition.

RENAMES
The whole Indoor branch is named by wattage alone (`15 W` ... `30 W`), which
tells a picker nothing about which motor they are holding -- and would collide
outright once a second 30 W motor exists. The review file carries the model for
each, so they take it, matching how the Outdoor branch is already named
(`YDK35-6K CCW 35WATTS`). The redundant "INDOOR MOTOR" suffix is dropped
because the category already says Indoor, exactly as Outdoor drops "OUTDOOR".

WHY THE RENAMES ARE SAFE
Document lines do NOT reference `inventory_items.sku`. Checked across all 21
tables holding a `sku` column: `sale_order_lines`, `po_line_items` and
`receival_items` store the **variant code** (`IND-W-001` ...), 173/173, 102/102
and 57/57 respectively, with zero matches against any item sku. This script
leaves every variant code untouched, so nothing that points at these items
moves.

`inventory_stock_movements` is the one exception -- 5,418 of its rows do carry
an item sku. It is a historical ledger of snapshots, so the one movement on
`30 W` (a sale delivery of 3 units on 2026-09-03) keeps reading `30 W` after
the rename. That is correct for a point-in-time record, not drift.

NEW ITEMS
Created at ZERO stock and ZERO cost -- no prices or quantities were supplied.
Loading those is a separate step, as with the RSH items.

Brand `O General` is created if missing. The catalogue currently has no such
brand and bakes it into an item name instead (`YDK120-50-6A2 O GENERAL`, brand
`no brand`); the spelling comes from the review file's own source tag
`[O GENERAL]` and its spec `for: O General AC`. `Gree` already exists.
Variant `brand` text and `code` are filled by existing triggers
(`sync_brand_variant_brand_text`, `generate_brand_variant_sku`).
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

INDOOR_CAT = "89e0b1ff-5959-49d2-9ed1-ecaff55abe62"   # AC / Fan Motor / Indoor
TRADING = "1b821883-c99e-4177-8144-1c5c1204b007"
GREE = "e74b4863-8b26-42ad-8a31-c07285d6a462"

# old name -> model from Trading_Items_Review.xlsx (rows 526-531)
RENAMES = [
    ("15 W", "YDK 15W"),
    ("16 W", "YDK 16W"),
    ("18 W", "YDK 18W"),
    ("20 W", "YDK 20W"),
    ("25 W", "YDK 25W"),
    ("30 W", "YDK 30W"),
]

# (name, brand key, note kept here for the record)
NEW_ITEMS = [
    ("SIC-55CVL-F161-2 DC310V 61W", "O General", "General 2.5 ton, 8-pole"),
    ("MFD-U70XA3F DC340V 68W",      "O General", "General 1.5-2.0 ton, 8-pole, FGA Thailand"),
    ("FN35A-PG 220-240V 35W",       "Gree",      "AC capacitor-run, 50 Hz"),
    ("FN30G-ZL DC310V 30W",         "Gree",      "brushless DC, ZWR30-F, 1160 r/min"),
]


def one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def snapshot(cur):
    cur.execute("""SELECT i.name_en, i.sku, v.code, coalesce(i.total_stock,0), v.brand
         FROM inventory_items i JOIN inventory_item_brand_variants v ON v.item_id=i.id
        WHERE i.status='active' AND i.category_id=%s ORDER BY v.code;""", (INDOOR_CAT,))
    return cur.fetchall()


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

    items_before = one(cur, "SELECT count(*) FROM inventory_items WHERE status='active';")[0]
    drift_before = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]
    print("before: %d active items, drift %d\n" % (items_before, drift_before))
    if drift_before:
        conn.rollback()
        raise SystemExit("ABORT: %d items already drifting" % drift_before)

    before = snapshot(cur)
    codes_before = {r[2]: (r[0], float(r[3])) for r in before}
    print("Indoor branch as it stands:")
    for nm, sku, code, st, brand in before:
        print("  %-8s sku=%-8s code=%-12s stock=%-4d brand=%r" % (nm, sku, code, int(st), brand))

    # --- 1. brand -------------------------------------------------------------
    row = one(cur, "SELECT id FROM brands WHERE lower(btrim(name))='o general';")
    if row:
        og = row[0]
        print("\nbrand 'O General' already exists")
    else:
        og = one(cur, "INSERT INTO brands (name) VALUES ('O General') RETURNING id;")[0]
        print("\nbrand 'O General' created")
    brand_id = {"O General": og, "Gree": GREE}

    # --- 2. renames -----------------------------------------------------------
    print("\nrenames (variant codes untouched):")
    for old, new in RENAMES:
        r = one(cur, """SELECT id FROM inventory_items WHERE status='active'
                         AND category_id=%s AND btrim(name_en)=%s;""", (INDOOR_CAT, old))
        if not r:
            conn.rollback()
            raise SystemExit("ABORT: %r not found in Indoor" % old)
        clash = one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
             AND category_id=%s AND lower(btrim(name_en))=lower(%s) AND id<>%s;""",
                    (INDOOR_CAT, new, r[0]))[0]
        if clash:
            conn.rollback()
            raise SystemExit("ABORT: %r already exists in Indoor" % new)
        cur.execute("UPDATE inventory_items SET name_en=%s, sku=%s WHERE id=%s;", (new, new, r[0]))
        print("  %-8s -> %s" % (old, new))

    # --- 3. new items ---------------------------------------------------------
    print("\nnew items (zero stock, zero cost):")
    for name, bkey, note in NEW_ITEMS:
        if one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
                 AND category_id=%s AND lower(btrim(name_en))=lower(%s);""", (INDOOR_CAT, name))[0]:
            print("  = %-32s already present" % name[:31])
            continue
        item_id = one(cur, """INSERT INTO inventory_items (category_id, name_en, sku, unit, cost_price)
                               VALUES (%s,%s,%s,'Piece',0) RETURNING id;""",
                      (INDOOR_CAT, name, name))[0]
        # brand text and code are filled by triggers
        cur.execute("""INSERT INTO inventory_item_brand_variants
                         (item_id, brand_id, cost_price, selling_price) VALUES (%s,%s,0,0);""",
                    (item_id, brand_id[bkey]))
        cur.execute("""INSERT INTO inventory_item_divisions (item_id, division_id, category_id)
                       VALUES (%s,%s,%s) ON CONFLICT (item_id, division_id) DO NOTHING;""",
                    (item_id, TRADING, INDOOR_CAT))
        print("  + %-32s brand=%-10s (%s)" % (name[:31], bkey, note))

    # --- verification ----------------------------------------------------------
    print("\nafter:")
    after = snapshot(cur)
    for nm, sku, code, st, brand in after:
        print("  %-30s sku=%-30s code=%-12s stock=%-4d brand=%r"
              % (nm[:29], sku[:29], code, int(st), brand))

    ok = True
    # every pre-existing variant code must still exist, with its stock intact
    codes_after = {r[2]: (r[0], float(r[3])) for r in after}
    for code, (oldname, oldstock) in codes_before.items():
        if code not in codes_after:
            print("  XX variant code %s disappeared" % code); ok = False
        elif codes_after[code][1] != oldstock:
            print("  XX stock moved on %s: %s -> %s" % (code, oldstock, codes_after[code][1]))
            ok = False
    print("  %s all %d original variant codes intact with unchanged stock"
          % ("ok " if ok else "XX ", len(codes_before)))

    for old, _ in RENAMES:
        if one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
                 AND category_id=%s AND btrim(name_en)=%s;""", (INDOOR_CAT, old))[0]:
            print("  XX old name still present: %r" % old); ok = False

    for _, new in RENAMES:
        n = one(cur, """SELECT count(*) FROM warehouse_stock_summary w
             JOIN inventory_item_brand_variants v ON v.id=w.brand_variant_id
             JOIN inventory_items i ON i.id=v.item_id
            WHERE i.name_en=%s AND w.item_name<>%s;""", (new, new))[0]
        if n:
            print("  XX stock-summary copy stale for %s" % new); ok = False

    made = one(cur, """SELECT count(*) FROM inventory_items WHERE status='active' AND category_id=%s;""",
               (INDOOR_CAT,))[0]
    items_after = one(cur, "SELECT count(*) FROM inventory_items WHERE status='active';")[0]
    drift_after = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]
    orphan = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.status='active'
         AND i.category_id=%s AND NOT EXISTS
         (SELECT 1 FROM inventory_item_divisions d WHERE d.item_id=i.id);""", (INDOOR_CAT,))[0]
    print("  Indoor now holds %d items (was 6, want 10); catalogue %d -> %d (want +4)"
          % (made, items_before, items_after))
    print("  drift %d (want 0); new items with no division: %d (want 0)" % (drift_after, orphan))
    ok = ok and made == 10 and items_after == items_before + 4 and drift_after == 0 and orphan == 0

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
