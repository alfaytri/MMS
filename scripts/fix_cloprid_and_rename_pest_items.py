"""
Top Cloprid 200 SL up to the invoice quantity and give four Pest Control items
the names the supplier invoice uses.

    python scripts/fix_cloprid_and_rename_pest_items.py            # dry run
    python scripts/fix_cloprid_and_rename_pest_items.py --apply

WHY
`D:\\007\\Details.xlsx` is the October purchase invoice behind the stock loaded
by load_rsh_opening_stock.py. Checking it against the catalogue turned up two
things:

  * It bills 29 units of Cloprid 200 SL; the RSH sheet's "Oct IN" said 28, so
    28 were loaded. The invoice is the primary document, so 1 unit is added.

  * Four items carry names vaguer than, or misspelled against, the invoice.
    "Clobride" is a misspelling of "Cloprid" (Imidacloprid shortens to Cloprid)
    that came from the RSH sheet itself, not from the load.

RENAMING IS SAFE HERE
`sku` is snapshotted onto ~15 document-line tables, so renaming an item that
already appears on paperwork would split its history across two skus. These
four appear on ZERO document lines (Pest Control has no transaction history at
all), so name_en and sku move together with nothing left behind. The script
re-checks that count before writing rather than trusting this note.

`warehouse_stock_summary.item_name`/`sku` are denormalized copies, kept in step
by trg_item_stock_summary_meta -> refresh_stock_summary_metadata. No manual
propagation needed; the script asserts it happened.

VARIANT CODES ARE LEFT ALONE. RAT-RAT-001 and friends were generated from the
old names, but a code is an identifier, not a label - regenerating them would
invalidate references for cosmetic gain.

NOT DONE HERE: "Avenger" sits under Pest Control / Mosquito while the invoice
describes a termite product. That is a recategorisation, not a rename, and was
not asked for.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

PEST_DIV = "c6070d16-a7e4-4ee8-a8ad-0dae5ce3d583"
BIRKAT_PEST_SUB = "2ae80d43-3baa-47d0-a487-7dcecfe87078"

CLOPRID_OLD = "Clobride 200 SL"
CLOPRID_NEW_QTY = 29

# old name -> name the invoice uses
RENAMES = [
    ("Rat",                        "ARS Rat and Mice Sticky Trap"),
    ("Cockroach Injection",        "Advion Ant Control Gel 30g"),
    ("Clobride 200 SL",            "Cloprid 200 SL"),
    ("Avenger Insect Killer, 1 L", "Avenger 30 SC Termite Control Insecticide 1L"),
]

LINE_TABLES = ["consumption_lines", "credit_note_lines", "debit_note_lines",
               "inventory_check_items", "inventory_stock_movements",
               "landed_cost_item_allocations", "po_line_items", "po_version_lines",
               "purchase_forecasts", "receival_items", "return_line_progress",
               "return_lines", "sale_delivery_lines", "sale_order_lines",
               "warehouse_transfer_items", "warranty_records"]


def one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def pest_total(cur):
    return one(cur, """SELECT coalesce(sum(w.qty),0) FROM warehouse_stock_summary w
         JOIN warehouse_sub_containers s ON s.id=w.sub_container_id
        WHERE s.division_id=%s AND w.qty>0;""", (PEST_DIV,))[0]


def drift(cur):
    return one(cur, """SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
                   WHERE v.item_id=i.id),0);""")[0]


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

    pest_before = pest_total(cur)
    drift_before = drift(cur)
    print("before: Pest Control %s units, catalogue-wide total_stock drift %s\n"
          % (pest_before, drift_before))
    if drift_before:
        conn.rollback()
        raise SystemExit("ABORT: %s items already drifting - fix that first" % drift_before)

    # --- guard: none of these may appear on a document line -------------------
    skus = [old for old, _ in RENAMES]
    touched_lines = 0
    for t in LINE_TABLES:
        has_sku = one(cur, """SELECT count(*) FROM information_schema.columns WHERE
                table_schema='public' AND table_name=%s AND column_name='sku';""", (t,))[0]
        if not has_sku:
            continue
        touched_lines += one(cur, "SELECT count(*) FROM public.%s WHERE btrim(sku)=ANY(%%s);" % t,
                             (skus,))[0]
    print("document lines carrying these skus: %s" % touched_lines)
    if touched_lines:
        conn.rollback()
        raise SystemExit("ABORT: these items appear on documents - renaming would split their history")

    # --- 1. Cloprid 28 -> 29 --------------------------------------------------
    vid, iid, before_qty, cost = one(cur, """SELECT v.id, i.id, v.stock_level, v.cost_price
         FROM inventory_items i JOIN inventory_item_brand_variants v ON v.item_id=i.id
        WHERE i.status='active' AND btrim(i.name_en)=%s;""", (CLOPRID_OLD,))
    here = one(cur, """SELECT coalesce(sum(w.qty),0) FROM warehouse_stock_summary w
        WHERE w.brand_variant_id=%s AND w.sub_container_id=%s;""", (vid, BIRKAT_PEST_SUB))[0]
    print("\nCloprid: %s on hand, %s of them in Birkat Alawamer / Pest Control"
          % (before_qty, here))
    if int(here) != int(before_qty):
        conn.rollback()
        raise SystemExit("ABORT: stock is split across sub-containers (%s of %s here)"
                         % (here, before_qty))

    delta = CLOPRID_NEW_QTY - int(before_qty)
    if delta:
        # Same RPC the opening load used: writes the layer AND refreshes the caches.
        auth_uid, who = one(cur, """SELECT ud.auth_user_id::text, ud.full_name FROM user_data ud
            WHERE public._user_has_permission(ud.id,'inventory.catalog.manage')
              AND ud.auth_user_id IS NOT NULL ORDER BY ud.full_name LIMIT 1;""")
        cur.execute("SELECT set_config('request.jwt.claims', %s, true);",
                    ('{"sub":"' + auth_uid + '"}',))
        assert one(cur, "SELECT public._current_user_data_id() IS NOT NULL;")[0], "no auth context"
        payload = ('[{"brand_variant_id":"%s","sub_container_id":"%s","qty":%d,"unit_cost":%s}]'
                   % (vid, BIRKAT_PEST_SUB, delta, cost or 0))
        cur.execute("SELECT public.rpc_import_inventory_stock(%s::jsonb);", (payload,))
        print("  +%d @ cost %s (as %s) -> %d" % (delta, cost or 0, who, CLOPRID_NEW_QTY))
    else:
        print("  already %d, nothing to add" % CLOPRID_NEW_QTY)

    # --- 2. renames -----------------------------------------------------------
    print("\nrenames:")
    for old, new in RENAMES:
        row = one(cur, """SELECT id, category_id FROM inventory_items
                           WHERE status='active' AND btrim(name_en)=%s;""", (old,))
        if not row:
            conn.rollback()
            raise SystemExit("ABORT: %r not found (already renamed?)" % old)
        item_id, cat_id = row
        clash = one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
                     AND category_id=%s AND lower(btrim(name_en))=lower(%s) AND id<>%s;""",
                    (cat_id, new, item_id))[0]
        if clash:
            conn.rollback()
            raise SystemExit("ABORT: %r already exists in that category" % new)
        cur.execute("UPDATE inventory_items SET name_en=%s, sku=%s WHERE id=%s;",
                    (new, new, item_id))
        print("  %r\n    -> %r" % (old, new))

    # --- verification ---------------------------------------------------------
    print("\nverify:")
    ok = True
    for _, new in RENAMES:
        n = one(cur, """SELECT count(*) FROM warehouse_stock_summary w
             JOIN inventory_item_brand_variants v ON v.id=w.brand_variant_id
             JOIN inventory_items i ON i.id=v.item_id
            WHERE i.name_en=%s AND w.item_name=%s AND w.sku=%s;""", (new, new, new))[0]
        print("  %s stock-summary copy follows: %s" % ("ok " if n else "XX ", new[:46]))
        ok = ok and bool(n)

    ts, sl, layers = one(cur, """SELECT i.total_stock, v.stock_level,
          coalesce((SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
                     WHERE l.brand_variant_id=v.id AND l.remaining_qty>0),0)
         FROM inventory_items i JOIN inventory_item_brand_variants v ON v.item_id=i.id
        WHERE i.id=%s;""", (iid,))
    print("  Cloprid: total_stock %s, stock_level %s, fifo layers %s (want %d each)"
          % (ts, sl, layers, CLOPRID_NEW_QTY))
    ok = ok and (int(ts) == int(sl) == int(layers) == CLOPRID_NEW_QTY)

    pest_after = pest_total(cur)
    drift_after = drift(cur)
    print("  Pest Control %s -> %s (want +%d); drift %s (want 0)"
          % (pest_before, pest_after, delta, drift_after))
    ok = ok and (int(pest_after) - int(pest_before) == delta) and drift_after == 0

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
