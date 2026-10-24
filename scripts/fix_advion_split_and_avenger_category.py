"""
Undo a bad rename, name the real ant product, and file Avenger under Termite.

    python scripts/fix_advion_split_and_avenger_category.py            # dry run
    python scripts/fix_advion_split_and_avenger_category.py --apply

WHAT WENT WRONG
`D:\\007\\Details.xlsx` (the October invoice) bills one line as "Advion Ant
Control Gel 30g". The catalogue item that received those 60 units was called
"Cockroach Injection", so the two disagreed. Acting on that invoice, the
previous script renamed the 285-unit item to the ant name.

`D:\\007\\MEP&RSH Inv.xlsx` settles it, and the rename was wrong. RSH's own
inventory carries BOTH products on separate lines:

    r29  Advion Cockroach Injection            160 pcs @ 60
    r47  Adrion Ant Gel-[Indoxacarb 0.05%]       0 pcs @ 72.89

and the catalogue already had both too - the vague `Ant` item is brand Advion
at cost 72.89, which is that second line exactly. So the 285-unit item is the
COCKROACH gel, and renaming it to the ant name pointed it at an identity that
already existed one row away.

WHAT THIS DOES
  1. `Advion Ant Control Gel 30g` -> `Advion Cockroach Injection`  (the revert)
  2. `Ant`                        -> `Advion Ant Gel [Indoxacarb 0.05%]`
  3. Avenger: Pest Control / Mosquito -> Pest Control / Termite. The invoice
     describes it as a termite product (Imidacloprid 30% SC). Because
     `inventory_item_divisions.category_id` mirrors `inventory_items.category_id`
     everywhere in the catalogue (verified: 0 rows differ), both move together.

WHAT THIS DELIBERATELY DOES NOT DO
Move the 60 October units from the cockroach item to the ant item. Three
markers on the invoice say those 60 were ant gel - the name, the strength
(indoxacarb 0.05% is the ant formulation; cockroach is 0.6%) and the supplier
code ORK-IP-ANT-1001 - but RSH posted them to the cockroach line, and which
product physically arrived is not answerable from paperwork. That is 60 units
and roughly 2,925 QAR moving between two items, so it is the operator's call.

Names come from source documents, not invention: "Advion Cockroach Injection"
is RSH's own name for it, and the ant name follows the catalogue's existing
bracket convention ("Hard Brush-[Green]", "Honig Wax Italy [B-Chem]") with
RSH's "Adrion" typo corrected.

Variant codes (ANT-COC-001, ANT-ANT-001, MOS-AVE-001) are left alone, as in the
previous script - a code is an identifier, not a label.
"""
import argparse
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, read_env  # noqa: E402

PEST_DIV = "c6070d16-a7e4-4ee8-a8ad-0dae5ce3d583"
MOSQUITO = "3675e12b-6fe6-413a-bc97-e95c42df62e1"
TERMITE = "14597023-3855-4e3e-af6f-0fa1b6e9943b"

RENAMES = [
    ("Advion Ant Control Gel 30g", "Advion Cockroach Injection"),
    ("Ant",                        "Advion Ant Gel [Indoxacarb 0.05%]"),
]
AVENGER = "Avenger 30 SC Termite Control Insecticide 1L"

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
    div_mismatch_before = one(cur, """SELECT count(*) FROM inventory_item_divisions d
        JOIN inventory_items i ON i.id=d.item_id
       WHERE d.category_id IS DISTINCT FROM i.category_id;""")[0]
    print("before: Pest Control %s units, drift %s, division/category mismatches %s\n"
          % (pest_before, drift_before, div_mismatch_before))
    if drift_before or div_mismatch_before:
        conn.rollback()
        raise SystemExit("ABORT: pre-existing inconsistency - investigate first")

    # --- guard: nothing being renamed may appear on a document line -----------
    skus = [old for old, _ in RENAMES]
    lines = 0
    for t in LINE_TABLES:
        if not one(cur, """SELECT count(*) FROM information_schema.columns WHERE
                table_schema='public' AND table_name=%s AND column_name='sku';""", (t,))[0]:
            continue
        lines += one(cur, "SELECT count(*) FROM public.%s WHERE btrim(sku)=ANY(%%s);" % t, (skus,))[0]
    print("document lines carrying these skus: %s" % lines)
    if lines:
        conn.rollback()
        raise SystemExit("ABORT: these items appear on documents - renaming would split their history")

    # --- 1 + 2. renames -------------------------------------------------------
    print("\nrenames:")
    for old, new in RENAMES:
        row = one(cur, """SELECT id, category_id, coalesce(total_stock,0) FROM inventory_items
                           WHERE status='active' AND btrim(name_en)=%s;""", (old,))
        if not row:
            conn.rollback()
            raise SystemExit("ABORT: %r not found" % old)
        item_id, cat_id, stock = row
        clash = one(cur, """SELECT count(*) FROM inventory_items WHERE status='active'
                     AND category_id=%s AND lower(btrim(name_en))=lower(%s) AND id<>%s;""",
                    (cat_id, new, item_id))[0]
        if clash:
            conn.rollback()
            raise SystemExit("ABORT: %r already exists in that category" % new)
        cur.execute("UPDATE inventory_items SET name_en=%s, sku=%s WHERE id=%s;",
                    (new, new, item_id))
        print("  %-30r -> %r  (stock %d, untouched)" % (old, new, int(stock)))

    # --- 3. Avenger: Mosquito -> Termite -------------------------------------
    print("\ncategory move:")
    row = one(cur, """SELECT id, category_id FROM inventory_items
                       WHERE status='active' AND btrim(name_en)=%s;""", (AVENGER,))
    if not row:
        conn.rollback()
        raise SystemExit("ABORT: %r not found" % AVENGER)
    av_id, av_cat = row
    if str(av_cat) != MOSQUITO:
        conn.rollback()
        raise SystemExit("ABORT: Avenger is not in Mosquito (found %s)" % av_cat)
    cur.execute("UPDATE inventory_items SET category_id=%s WHERE id=%s;", (TERMITE, av_id))
    cur.execute("""UPDATE inventory_item_divisions SET category_id=%s
                    WHERE item_id=%s AND category_id=%s;""", (TERMITE, av_id, MOSQUITO))
    print("  %s\n    Pest Control / Mosquito -> Pest Control / Termite (%d division link(s) moved too)"
          % (AVENGER, cur.rowcount))

    # --- verification ---------------------------------------------------------
    print("\nverify:")
    ok = True
    for _, new in RENAMES:
        n = one(cur, """SELECT count(*) FROM inventory_items i
             JOIN inventory_item_brand_variants v ON v.item_id=i.id
             LEFT JOIN warehouse_stock_summary w ON w.brand_variant_id=v.id
            WHERE i.name_en=%s AND i.sku=%s
              AND (w.item_name IS NULL OR (w.item_name=%s AND w.sku=%s));""",
                   (new, new, new, new))[0]
        print("  %s %s" % ("ok " if n else "XX ", new))
        ok = ok and bool(n)

    # The summary splits the path: category_name is the PARENT, subcategory_name the leaf.
    cat, stale = one(cur, """SELECT c.name_en,
          (SELECT count(*) FROM warehouse_stock_summary w
             JOIN inventory_item_brand_variants v ON v.id=w.brand_variant_id
            WHERE v.item_id=i.id
              AND (w.category_name IS DISTINCT FROM 'Pest Control'
                   OR w.subcategory_name IS DISTINCT FROM 'Termite'))
       FROM inventory_items i JOIN inventory_categories c ON c.id=i.category_id
      WHERE i.id=%s;""", (av_id,))
    print("  %s Avenger now under %r; stock-summary rows not yet reading Pest Control/Termite: %s"
          % ("ok " if cat == "Termite" and stale == 0 else "XX ", cat, stale))
    ok = ok and cat == "Termite" and stale == 0

    for old, _ in RENAMES:
        if one(cur, "SELECT count(*) FROM inventory_items WHERE status='active' AND btrim(name_en)=%s;",
               (old,))[0]:
            print("  XX old name still present: %r" % old)
            ok = False

    pest_after = pest_total(cur)
    drift_after = drift(cur)
    mismatch_after = one(cur, """SELECT count(*) FROM inventory_item_divisions d
        JOIN inventory_items i ON i.id=d.item_id
       WHERE d.category_id IS DISTINCT FROM i.category_id;""")[0]
    print("  Pest Control %s -> %s (want unchanged); drift %s; division/category mismatches %s"
          % (pest_before, pest_after, drift_after, mismatch_after))
    ok = ok and pest_after == pest_before and drift_after == 0 and mismatch_after == 0

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
