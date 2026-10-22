"""
Load RSH (Pest Control & Cleaning) opening stock from `D:\\007\\RSH new data.xlsx`.

    python scripts/load_rsh_opening_stock.py            # dry run, rolled back
    python scripts/load_rsh_opening_stock.py --apply

Brings each item's Pest Control stock to the sheet's final figure
("Software Qty after October", which equals "RSH Summary Qty (Today)") at the
sheet's New Avg Cost, in the Birkat Alawamer / Pest Control & Cleaning
sub-container — the single location all 51 existing items already use.

WHY AN OPENING-BALANCE LOAD AND NOT A STOCK ADJUSTMENT
Pest Control has no transaction history: zero movements of any kind, ever, in
any of its seven sub-containers. There is no drift to correct. This is the RSH
portion of the same opening load every other division got (source_type
'inventory_import'), arriving later. Routing it through stock_adjustments would
raise 5 approval steps per line — ~270 clicks — to approve a correction to a
history that does not exist.

HOW IT STAYS ON THE SANCTIONED PATH
Increases go through `rpc_import_inventory_stock`, the same RPC the original
import used, which writes the layer AND refreshes the caches the FIFO trigger
does not (variants.stock_level, variants.average_cost, items.total_stock). It
is auth-gated, so the session sets `request.jwt.claims` to a real user holding
`inventory.catalog.manage`; that id is used for the permission check only — no
column records it.

Decreases use `deduct_fifo_layers` (FIFO order, sub-container scoped). Cost
changes rewrite the layer cost, then the same cache refresh is replayed.

HELD BACK DELIBERATELY: the two Shoe Cover rows. The sheet calls them "move
from Unassigned", but their stock is in MAINTENANCE sub-containers — moving
41,900 units off Maintenance's books is an inter-division transfer, not an
opening balance, and is the operator's decision.
"""
import argparse
import io
import os
import sys
from collections import defaultdict

import openpyxl
import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

SHEET = r"D:\007\RSH new data.xlsx"
PEST_DIV = "c6070d16-a7e4-4ee8-a8ad-0dae5ce3d583"
BIRKAT_PEST_SUB = "2ae80d43-3baa-47d0-a487-7dcecfe87078"   # Birkat Alawamer / Pest Control & Cleaning
HELD = {"blue", "blue, box of 20"}                          # Shoe Covers — see docstring

# Names the sheet uses for items created in the previous step, where the sheet's
# text differs from what was created.
NEW_ITEM_ALIASES = {
    "gloria stainless steel pesticide sprayer,10 l, model t510":
        "gloria stainless steel pesticide sprayer, 10 l, t510",
    "latex gloves (each box 10pcs)": "latex",      # merged into the existing Latex item
}


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def load_sheet():
    """Aggregate to one target per item — the sheet splits Air Freshener over two rows."""
    ws = openpyxl.load_workbook(SHEET, data_only=True)["Software Update Sheet"]
    # Keyed on BRAND too: "Air Freshener" is one item with two brand variants
    # (Smart Clean and Bait Al Teb) carrying different targets AND costs, so
    # merging them on item name alone would mis-set both.
    agg = defaultdict(lambda: {"target": 0.0, "cost": None, "rows": 0, "label": ""})
    for r in ws.iter_rows(min_row=7, values_only=True):
        if not r[2] or str(r[0]) == "Total":
            continue
        name = str(r[2]).strip()
        is_new = str(r[0]).startswith("NEW")
        leaf = "" if is_new else str(r[1]).split("/")[-1].strip()
        brand = str(r[3] or "").strip().lower()
        key = NEW_ITEM_ALIASES.get(name.lower(), name.lower())
        a = agg[(leaf.lower(), key, brand)]
        a["target"] += num(r[16])
        a["rows"] += 1
        a["label"] = name
        if a["cost"] is None or a["cost"] == 0:
            a["cost"] = num(r[12])
    return agg


def resolve(cur, leaf, name, brand):
    """Find the variant + current Pest Control qty. Matches on category when the
    sheet gives one, on name alone for the items created in the previous step."""
    if leaf:
        cur.execute("""SELECT v.id, i.id, i.name_en, v.brand FROM inventory_items i
             JOIN inventory_categories c ON c.id=i.category_id
             JOIN inventory_item_brand_variants v ON v.item_id=i.id
            WHERE lower(btrim(i.name_en))=%s AND lower(btrim(c.name_en))=%s
              AND i.status='active';""", (name, leaf))
    else:
        cur.execute("""SELECT v.id, i.id, i.name_en, v.brand FROM inventory_items i
             JOIN inventory_item_brand_variants v ON v.item_id=i.id
            WHERE lower(btrim(i.name_en))=%s AND i.status='active';""", (name,))
    got = cur.fetchall()
    if len(got) > 1 and brand:
        got = [g for g in got if (g[3] or "").strip().lower() == brand] or got
    if len(got) != 1:
        return None, None, f"{len(got)} matches (brand={brand!r})"
    vid, iid, label, vbrand = got[0]
    # Current qty is per VARIANT, not per item — two brands of the same item
    # hold separate stock.
    cur.execute("""SELECT coalesce(sum(w.qty),0) FROM warehouse_stock_summary w
         JOIN warehouse_sub_containers s ON s.id=w.sub_container_id
        WHERE w.brand_variant_id=%s AND s.division_id=%s;""", (vid, PEST_DIV))
    return vid, float(cur.fetchone()[0]), f"{label} [{vbrand}]" if vbrand else label


def refresh_caches(cur, variant_ids):
    """Exactly what rpc_import_inventory_stock replays after writing layers."""
    if not variant_ids:
        return
    cur.execute("""UPDATE public.inventory_item_brand_variants bv SET
          stock_level = COALESCE((SELECT SUM(l.remaining_qty) FROM public.fifo_cost_layers l
             WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0),0),
          average_cost = COALESCE((
             SELECT SUM(l.remaining_qty::numeric*l.total_unit_cost) FILTER (WHERE l.total_unit_cost>0)
                  / NULLIF(SUM(l.remaining_qty) FILTER (WHERE l.total_unit_cost>0),0)
             FROM public.fifo_cost_layers l
            WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0), bv.average_cost)
        WHERE bv.id = ANY(%s::uuid[]);""", (list(variant_ids),))
    cur.execute("""UPDATE public.inventory_items ii SET
          total_stock = COALESCE((SELECT SUM(bv.stock_level)
             FROM public.inventory_item_brand_variants bv WHERE bv.item_id=ii.id),0)
        WHERE ii.id IN (SELECT DISTINCT item_id FROM public.inventory_item_brand_variants
                         WHERE id = ANY(%s::uuid[]));""", (list(variant_ids),))


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

    # rpc_import_inventory_stock is auth-gated; auth.uid() reads this setting.
    cur.execute("""SELECT ud.auth_user_id::text, ud.full_name FROM user_data ud
        WHERE public._user_has_permission(ud.id,'inventory.catalog.manage')
          AND ud.auth_user_id IS NOT NULL ORDER BY ud.full_name LIMIT 1;""")
    auth_uid, who = cur.fetchone()
    cur.execute("SELECT set_config('request.jwt.claims', %s, true);",
                ('{"sub":"%s"}' % auth_uid,))
    cur.execute("SELECT public._current_user_data_id() IS NOT NULL;")
    assert cur.fetchone()[0], "could not establish an authenticated context"
    print(f"authenticated as {who} (permission check only — no column records it)\n")

    agg = load_sheet()
    inc = dec = costonly = noop = 0
    touched, problems, held = set(), [], []

    for (leaf, name, brand), v in sorted(agg.items()):
        if name in HELD:
            held.append(v["label"])
            continue
        vid, current, label = resolve(cur, leaf, name, brand)
        if vid is None:
            problems.append((v["label"], label))
            continue
        target, cost = v["target"], v["cost"] or 0.0
        delta = int(round(target - current))

        if delta > 0:
            cur.execute("SELECT public.rpc_import_inventory_stock(%s::jsonb);",
                        ('[{"brand_variant_id":"%s","sub_container_id":"%s","qty":%d,"unit_cost":%s}]'
                         % (vid, BIRKAT_PEST_SUB, delta, cost),))
            inc += 1
            print(f"  +{delta:>7}  {label[:38]:<40} {current:>8.0f} -> {target:<8.0f} @ {cost}")
        elif delta < 0:
            cur.execute("""SELECT warehouse_id FROM warehouse_sub_containers WHERE id=%s;""",
                        (BIRKAT_PEST_SUB,))
            wh = cur.fetchone()[0]
            cur.execute("SELECT public.deduct_fifo_layers(%s,%s,%s,false,%s);",
                        (vid, wh, -delta, BIRKAT_PEST_SUB))
            dec += 1
            print(f"  {delta:>8}  {label[:38]:<40} {current:>8.0f} -> {target:<8.0f}")
        else:
            noop += 1

        # Cost: rewrite this division's live layers to the sheet's figure.
        if cost > 0:
            cur.execute("""UPDATE fifo_cost_layers f SET unit_cost=%s, total_unit_cost=%s
                  FROM warehouse_sub_containers s
                 WHERE s.id=f.sub_container_id AND s.division_id=%s
                   AND f.brand_variant_id=%s AND f.remaining_qty>0
                   AND f.total_unit_cost IS DISTINCT FROM %s;""",
                        (cost, cost, PEST_DIV, vid, cost))
            if cur.rowcount and delta == 0:
                costonly += 1
                print(f"   cost    {label[:38]:<40} -> {cost}")
        touched.add(vid)

    refresh_caches(cur, touched)

    cur.execute("""SELECT coalesce(sum(w.qty),0), count(DISTINCT w.brand_variant_id)
         FROM warehouse_stock_summary w JOIN warehouse_sub_containers s ON s.id=w.sub_container_id
        WHERE s.division_id=%s AND w.qty>0;""", (PEST_DIV,))
    qty, variants = cur.fetchone()

    print(f"\n  increases {inc}, decreases {dec}, cost-only {costonly}, unchanged {noop}")
    print(f"  held back (operator decision): {held}")
    if problems:
        print(f"  COULD NOT RESOLVE: {problems}")
    print(f"  Pest Control stock now: {qty} units over {variants} variants")

    if problems:
        conn.rollback()
        raise SystemExit("ABORT: unresolved items — rolled back")
    if args.apply:
        conn.commit(); print("\n>>> COMMITTED to new-prod")
    else:
        conn.rollback(); print("\n>>> DRY RUN - ROLLED BACK (pass --apply to commit)")
    conn.close()


if __name__ == "__main__":
    main()
