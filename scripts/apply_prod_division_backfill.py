"""
Backfill missing item->division links in new-prod. Additive only.

    python scripts/apply_prod_division_backfill.py            # dry run, rolled back
    python scripts/apply_prod_division_backfill.py --apply    # commit

Source: docs/DB Audits/prod-division-assignment-diff-2026-10-22.json, built by
comparing the operator's `unassigned (1).xlsx` against live prod. That sheet
turned out to be a stale export — every item in it already had a division — so
this only adds the ones the sheet lists and prod lacks.

It NEVER deletes a division link. The 27 items where prod holds divisions the
sheet does not mention keep them.
"""
import argparse
import io
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_schema_export import ENV_PATH, connect, read_env  # noqa: E402

DIFF = r"D:\MMS\docs\DB Audits\prod-division-assignment-diff-2026-10-22.json"

# The one item in all of prod with no division at all (operator: Maintenance).
ORPHAN = ("b7041e55-1b52-4d6a-adbc-69ca1c71f4a3", "Manifold guage", "Maintenance")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    diff = json.load(io.open(DIFF, encoding="utf-8"))
    env = read_env(ENV_PATH)
    # connect() opens READ ONLY; reopen writable only when actually applying.
    conn, ref = connect(env, "newprod")
    conn.close()
    import psycopg2
    url = env["NEW_DB_URL"]
    assert "optishfnnctrhffpoywg" in url, "not new-prod"
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT name, id FROM company_divisions;")
    div_id = {n: i for n, i in cur.fetchall()}

    work = [(r["item_id"], r["item"], d) for r in diff["to_add"] for d in r["add"]]
    work.append((ORPHAN[0], ORPHAN[1], ORPHAN[2]))

    print(f"target {ref}   links to add: {len(work)} across {len(diff['to_add']) + 1} items\n")

    added = skipped = 0
    for item_id, item_name, div_name in work:
        did = div_id.get(div_name)
        if not did:
            raise SystemExit(f"unknown division {div_name!r}")
        cur.execute("""
            INSERT INTO public.inventory_item_divisions (item_id, division_id, category_id)
            SELECT i.id, %s, i.category_id
              FROM public.inventory_items i
             WHERE i.id = %s
            ON CONFLICT (item_id, division_id) DO NOTHING;""", (did, item_id))
        if cur.rowcount:
            added += 1
            print(f"  + {item_name[:34]:34s} -> {div_name}")
        else:
            skipped += 1
            print(f"  = {item_name[:34]:34s} -> {div_name} (already present)")

    # Prove the outcome inside the same transaction, before deciding to keep it.
    cur.execute("""SELECT count(*) FROM inventory_items i
                    WHERE i.status='active' AND NOT EXISTS (
                      SELECT 1 FROM inventory_item_divisions d WHERE d.item_id=i.id);""")
    orphans = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM inventory_item_divisions;")
    total = cur.fetchone()[0]

    print(f"\n  inserted {added}, already present {skipped}")
    print(f"  item-division links now: {total}")
    print(f"  active items with NO division: {orphans}")

    if orphans != 0:
        conn.rollback()
        raise SystemExit(f"ABORT: expected 0 unassigned items, found {orphans} — rolled back")

    if args.apply:
        conn.commit()
        print("\n>>> COMMITTED to new-prod")
    else:
        conn.rollback()
        print("\n>>> DRY RUN - ROLLED BACK (pass --apply to commit)")
    conn.close()


if __name__ == "__main__":
    main()
