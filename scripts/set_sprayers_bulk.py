"""
Switch Cleaning Machines / Sprayer from serialized to bulk tracking.

    python scripts/set_sprayers_bulk.py            # dry run
    python scripts/set_sprayers_bulk.py --apply

WHY
Sprayers are consumable-style kit, not individually tracked assets. The
category was serialized only because that was the default for tool categories
before migration 20260831001200 flipped new ones to bulk, so both sprayer
items inherited a mode nobody chose.

WHAT IS IN THE WAY
`guard_tool_tracking_mode_switch` refuses serialized -> bulk while the category
holds ANY serial unit. Sprayer holds 2, both on `Handheld`. They are
**placeholders**: is_placeholder = true, no serial number, no custody location,
no assignee, zero cost, not created from a receival, and referenced by nothing
-- 0 rows in tool_unit_assignments, tool_unit_inspections, warehouse_transfers
and stock_adjustments (all four FKs into tool_asset_units checked). They are
the artifact of the wrong default, holding no information at all.

The real stock is unaffected by removing them. It lives in the FIFO layers and
is already bulk-shaped: Gloria 1 unit (0 placeholders), Handheld 2 units
(2 placeholders mirroring the same 2). Deleting the placeholders and switching
to bulk leaves one representation instead of two.

STEPS
  1. delete the 2 orphaned placeholder units (re-verified orphaned in-transaction)
  2. category Sprayer: serialized -> bulk
  3. clear `Handheld` x Pest Control & Cleaning's explicit 'serialized' override
     so it inherits the category again (Gloria and Handheld x Maintenance are
     already NULL/inherit)

Scoped to Sprayer only. Its five sibling categories under Cleaning Machines are
also serialized, and several hold REAL serial units (Pressure Washer 45,
AC Cleaning Machine 4, Steam Cleaner 1) -- those are not placeholders and are
not touched.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

CATEGORY = "Sprayer"
PARENT = "Cleaning Machines"


def one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def modes(cur, cat_id):
    cur.execute("""SELECT i.name_en, cd.name, d.tool_tracking_mode,
         public.tool_effective_mode(i.id, d.division_id), coalesce(i.total_stock,0)
       FROM inventory_items i
       JOIN inventory_item_divisions d ON d.item_id=i.id
       JOIN company_divisions cd ON cd.id=d.division_id
      WHERE i.status='active' AND i.category_id=%s ORDER BY i.name_en, cd.name;""", (cat_id,))
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

    cat_id, cat_mode = one(cur, """SELECT c.id, c.tool_tracking_mode FROM inventory_categories c
         JOIN inventory_categories p ON p.id=c.parent_id
        WHERE c.name_en=%s AND p.name_en=%s;""", (CATEGORY, PARENT))
    print("category %s / %s  mode=%s" % (PARENT, CATEGORY, cat_mode))
    print("\nbefore:")
    for nm, dv, m, eff, st in modes(cur, cat_id):
        print("  %-44s %-26s row=%-11s effective=%-11s stock=%d"
              % (nm[:43], dv, m, eff, int(st)))

    stock_before = one(cur, """SELECT coalesce(sum(i.total_stock),0) FROM inventory_items i
        WHERE i.category_id=%s AND i.status='active';""", (cat_id,))[0]
    layers_before = one(cur, """SELECT coalesce(sum(l.remaining_qty),0) FROM fifo_cost_layers l
         JOIN inventory_item_brand_variants v ON v.id=l.brand_variant_id
         JOIN inventory_items i ON i.id=v.item_id
        WHERE i.category_id=%s AND l.remaining_qty>0;""", (cat_id,))[0]

    # --- 1. the placeholder units ---------------------------------------------
    cur.execute("""SELECT tu.id, i.name_en, tu.serial_number, tu.is_placeholder, tu.status
         FROM tool_asset_units tu JOIN inventory_items i ON i.id=tu.item_id
        WHERE i.category_id=%s;""", (cat_id,))
    units = cur.fetchall()
    print("\nserial units in the category: %d" % len(units))
    ids = [u[0] for u in units]
    for uid, nm, sn, ph, st in units:
        print("  %-30s serial=%-8s placeholder=%s status=%s" % (nm[:29], sn, ph, st))
        if not ph or sn is not None:
            conn.rollback()
            raise SystemExit("ABORT: %s is a REAL serial unit, not a placeholder - "
                             "switching to bulk would discard tracked history" % uid)

    if ids:
        for tbl, col in [("tool_unit_assignments", "unit_id"), ("tool_unit_inspections", "unit_id"),
                         ("warehouse_transfers", "tool_unit_id"), ("stock_adjustments", "tool_unit_id")]:
            n = one(cur, "SELECT count(*) FROM public.%s WHERE %s = ANY(%%s::uuid[]);" % (tbl, col),
                    (ids,))[0]
            if n:
                conn.rollback()
                raise SystemExit("ABORT: %d row(s) in %s reference these units" % (n, tbl))
        cur.execute("DELETE FROM tool_asset_units WHERE id = ANY(%s::uuid[]);", (ids,))
        print("  deleted %d orphaned placeholder(s)" % cur.rowcount)

    # --- 2. category -> bulk ---------------------------------------------------
    cur.execute("""UPDATE inventory_categories SET tool_tracking_mode='bulk'::public.tool_tracking_mode
                    WHERE id=%s;""", (cat_id,))
    print("\ncategory switched to bulk")

    # --- 3. clear explicit overrides so every division inherits ---------------
    cur.execute("""UPDATE inventory_item_divisions d SET tool_tracking_mode=NULL
         FROM inventory_items i
        WHERE i.id=d.item_id AND i.category_id=%s AND d.tool_tracking_mode IS NOT NULL;""", (cat_id,))
    print("cleared %d per-division override(s) -> inherit the category" % cur.rowcount)

    # --- verification ----------------------------------------------------------
    print("\nafter:")
    ok = True
    rows = modes(cur, cat_id)
    for nm, dv, m, eff, st in rows:
        flag = "" if eff == "bulk" else "   <-- NOT BULK"
        print("  %-44s %-26s row=%-11s effective=%-11s stock=%d%s"
              % (nm[:43], dv, m, eff, int(st), flag))
        ok = ok and eff == "bulk"

    left = one(cur, """SELECT count(*) FROM tool_asset_units tu JOIN inventory_items i ON i.id=tu.item_id
        WHERE i.category_id=%s;""", (cat_id,))[0]
    stock_after = one(cur, """SELECT coalesce(sum(i.total_stock),0) FROM inventory_items i
        WHERE i.category_id=%s AND i.status='active';""", (cat_id,))[0]
    layers_after = one(cur, """SELECT coalesce(sum(l.remaining_qty),0) FROM fifo_cost_layers l
         JOIN inventory_item_brand_variants v ON v.id=l.brand_variant_id
         JOIN inventory_items i ON i.id=v.item_id
        WHERE i.category_id=%s AND l.remaining_qty>0;""", (cat_id,))[0]
    drift = one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]
    other_units = one(cur, "SELECT count(*) FROM tool_asset_units;")[0]

    print("\n  serial units left in Sprayer: %d (want 0)" % left)
    print("  stock %s -> %s, fifo layers %s -> %s (both want unchanged)"
          % (stock_before, stock_after, layers_before, layers_after))
    print("  catalogue drift %s (want 0); tool_asset_units catalogue-wide now %d (was 155)"
          % (drift, other_units))
    ok = ok and left == 0 and stock_after == stock_before and layers_after == layers_before \
        and drift == 0 and other_units == 155 - len(ids)

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
