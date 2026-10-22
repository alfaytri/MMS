"""
Merge four duplicate items created during the RSH load into the catalogue
entries that already existed.

    python scripts/merge_rsh_duplicate_items.py            # dry run
    python scripts/merge_rsh_duplicate_items.py --apply

WHY THEY EXIST
The RSH sheet listed these products under RSH's own naming, and the duplicate
check run before creating them compared against the SHEET's rows rather than
against every Pest Control item already in the catalogue. The four originals
hold zero stock, so they did not show up in any stock-based comparison either.

Operator's call: keep the existing names (they match each category's
conventions and their siblings), move the loaded stock onto them, delete the
ones created today.

Stock moves by repointing `fifo_cost_layers.brand_variant_id`; the FIFO
trigger refreshes warehouse_stock_summary for both the old and new variant,
and the caches with no trigger are replayed afterwards.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

# (created today -> keep this one), matched on variant code so there is no
# ambiguity about which row is which.
MERGES = [
    ("BRU-HAR-002", "BRU-HAR-001"),   # Hard Brush-[Green]              -> Hard
    ("BRU-SOF-002", "BRU-SOF-001"),   # Soft Brush                      -> Soft
    ("TAB-SUF-003", "TAB-SUF-001"),   # Sufra Plastic Roll Cover-[10kg] -> Sufra Plastic Cover, 10 kg
    ("FLO-SMA-001", "FLO-PVC-002"),   # Smart Clean PVC Floor Wiper-45  -> PVC, 45 cm
]


def variant(cur, code):
    cur.execute("""SELECT v.id, v.item_id, i.name_en, v.brand, v.cost_price,
         coalesce((SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
            WHERE l.brand_variant_id=v.id AND l.remaining_qty>0),0)
       FROM inventory_item_brand_variants v JOIN inventory_items i ON i.id=v.item_id
      WHERE v.code=%s;""", (code,))
    got = cur.fetchall()
    if len(got) != 1:
        raise SystemExit(f"{code}: {len(got)} matches")
    return got[0]


def refresh(cur, variant_ids, item_ids):
    cur.execute("""UPDATE inventory_item_brand_variants bv SET
          stock_level = coalesce((SELECT sum(l.remaining_qty) FROM fifo_cost_layers l
             WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0),0),
          average_cost = coalesce((
             SELECT sum(l.remaining_qty::numeric*l.total_unit_cost) FILTER (WHERE l.total_unit_cost>0)
                  / NULLIF(sum(l.remaining_qty) FILTER (WHERE l.total_unit_cost>0),0)
             FROM fifo_cost_layers l WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0), bv.average_cost)
        WHERE bv.id = ANY(%s::uuid[]);""", (list(variant_ids),))
    cur.execute("""UPDATE inventory_items i SET total_stock = coalesce((
          SELECT sum(v.stock_level) FROM inventory_item_brand_variants v WHERE v.item_id=i.id),0)
        WHERE i.id = ANY(%s::uuid[]);""", (list(item_ids),))


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

    moved_total = 0
    variants, items = set(), set()
    for src_code, dst_code in MERGES:
        s_id, s_item, s_name, s_brand, s_cost, s_qty = variant(cur, src_code)
        d_id, d_item, d_name, d_brand, d_cost, d_qty = variant(cur, dst_code)
        print(f"  {s_name[:34]:<36} {s_qty:>4} -> {d_name[:30]:<32} (had {d_qty})")
        if s_brand != d_brand:
            print(f"      note: brand changes {s_brand!r} -> {d_brand!r}")

        # Refuse to clobber: the survivor must be the empty one.
        if d_qty != 0:
            conn.rollback()
            raise SystemExit(f"ABORT: {dst_code} already holds {d_qty} — not an empty duplicate")

        cur.execute("UPDATE fifo_cost_layers SET brand_variant_id=%s WHERE brand_variant_id=%s;",
                    (d_id, s_id))
        moved_layers = cur.rowcount
        # Carry the cost the sheet gave onto the surviving variant.
        cur.execute("UPDATE inventory_item_brand_variants SET cost_price=%s WHERE id=%s AND cost_price=0;",
                    (s_cost, d_id))
        cur.execute("DELETE FROM inventory_item_divisions WHERE item_id=%s;", (s_item,))
        cur.execute("DELETE FROM inventory_items WHERE id=%s;", (s_item,))
        moved_total += s_qty
        variants.add(str(d_id)); items.add(str(d_item))
        print(f"      {moved_layers} layer(s) repointed, duplicate deleted")

    refresh(cur, variants, items)

    for _, dst_code in MERGES:
        d_id, d_item, d_name, _b, _c, q = variant(cur, dst_code)
        cur.execute("SELECT total_stock FROM inventory_items WHERE id=%s;", (d_item,))
        print(f"  {d_name[:34]:<36} now holds {q} (item total_stock {cur.fetchone()[0]})")

    cur.execute("""SELECT count(*) FROM inventory_items i WHERE i.total_stock IS DISTINCT FROM
        coalesce((SELECT sum(v.stock_level) FROM inventory_item_brand_variants v WHERE v.item_id=i.id),0);""")
    drift = cur.fetchone()[0]
    cur.execute("""SELECT coalesce(sum(w.qty),0) FROM warehouse_stock_summary w
        JOIN warehouse_sub_containers s ON s.id=w.sub_container_id
       WHERE s.division_id='c6070d16-a7e4-4ee8-a8ad-0dae5ce3d583' AND w.qty>0;""")
    pest = cur.fetchone()[0]
    print(f"\n  moved {moved_total} units; cache drift {drift}; Pest Control total {pest} (must stay 8562)")
    if drift or pest != 8562:
        conn.rollback()
        raise SystemExit("ABORT: totals moved or caches drifted — rolled back")

    if args.apply:
        conn.commit(); print("\n>>> COMMITTED")
    else:
        conn.rollback(); print("\n>>> DRY RUN - ROLLED BACK")
    conn.close()


if __name__ == "__main__":
    main()
