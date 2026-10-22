"""
Recompute the stock caches that nothing keeps in sync.

    python scripts/fix_total_stock_drift.py --db newprod          # dry run
    python scripts/fix_total_stock_drift.py --db newprod --apply

WHY IT DRIFTS
`fifo_cost_layers` is the source of truth. A trigger keeps
`warehouse_stock_summary` in step with it, but two caches have no trigger at
all: `inventory_item_brand_variants.stock_level` and
`inventory_items.total_stock`. Thirteen functions write stock_level
(receivals, transfers, consumption, deliveries, adjustments, deductions) and
exactly ONE of them — rpc_import_inventory_stock — also refreshes
total_stock. So every path except the original Excel import leaves it stale.

This repairs the data in the right order: layers -> stock_level -> total_stock.
Recomputing total_stock from a stock_level that is itself wrong would just
launder the error.

It does NOT install a trigger. That is the durable fix and a schema change,
and belongs in a migration the operator agrees to.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, PROJECTS, read_env  # noqa: E402

COUNT_SL = """
SELECT count(*) FROM inventory_item_brand_variants v
 WHERE v.stock_level IS DISTINCT FROM coalesce((
   SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
    WHERE l.brand_variant_id = v.id AND l.remaining_qty > 0), 0);"""

COUNT_TS = """
SELECT count(*) FROM inventory_items i
 WHERE i.total_stock IS DISTINCT FROM coalesce((
   SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
    WHERE v.item_id = i.id), 0);"""

FIX_SL = """
UPDATE inventory_item_brand_variants v
   SET stock_level = coalesce((SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
        WHERE l.brand_variant_id = v.id AND l.remaining_qty > 0), 0)
 WHERE v.stock_level IS DISTINCT FROM coalesce((
   SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
    WHERE l.brand_variant_id = v.id AND l.remaining_qty > 0), 0);"""

FIX_TS = """
UPDATE inventory_items i
   SET total_stock = coalesce((SELECT sum(v.stock_level)
        FROM inventory_item_brand_variants v WHERE v.item_id = i.id), 0)
 WHERE i.total_stock IS DISTINCT FROM coalesce((
   SELECT sum(v.stock_level) FROM inventory_item_brand_variants v
    WHERE v.item_id = i.id), 0);"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="newprod", choices=["newprod", "dev"])
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    env = read_env(ENV_PATH)
    key, ref = PROJECTS[args.db]
    url = env[key]
    assert ref in url, f"{key} does not point at {ref}"
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()
    print(f"target {args.db} ({ref})\n")

    cur.execute(COUNT_SL); sl_before = cur.fetchone()[0]
    cur.execute(COUNT_TS); ts_before = cur.fetchone()[0]
    print(f"  before:  stock_level drifted {sl_before}   total_stock drifted {ts_before}")

    cur.execute(FIX_SL); sl_fixed = cur.rowcount
    cur.execute(FIX_TS); ts_fixed = cur.rowcount
    print(f"  fixed :  stock_level {sl_fixed}            total_stock {ts_fixed}")

    cur.execute(COUNT_SL); sl_after = cur.fetchone()[0]
    cur.execute(COUNT_TS); ts_after = cur.fetchone()[0]
    print(f"  after :  stock_level drifted {sl_after}    total_stock drifted {ts_after}")

    # The whole point is that the caches agree with the layers afterwards.
    if sl_after or ts_after:
        conn.rollback()
        raise SystemExit(f"ABORT: still drifting ({sl_after}/{ts_after}) — rolled back")

    cur.execute("SELECT sum(total_stock) FROM inventory_items WHERE status='active';")
    print(f"\n  total active stock now reads: {cur.fetchone()[0]:,}")

    if args.apply:
        conn.commit(); print("\n>>> COMMITTED")
    else:
        conn.rollback(); print("\n>>> DRY RUN - ROLLED BACK (pass --apply to commit)")
    conn.close()


if __name__ == "__main__":
    main()
