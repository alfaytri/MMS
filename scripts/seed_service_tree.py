"""
Dev-DB fixture: a realistic multi-level service tree for the picker work.

THROWAWAY FIXTURE DATA — not a migration, not the real catalogue.
Targets the Dev DB only (wkmvjxxmzstsvahuiwsz) via DEV_DB_URL.

Idempotent: every row it creates carries a `code` starting with SEED-, and a run
deletes those first. The operator's own pre-existing rows have a NULL code and are
never touched; the existing root "AC General Service" is reused as a parent, not
replaced.

Usage:
    python scripts/seed_service_tree.py                # tree + photos
    python scripts/seed_service_tree.py --thumbs-only  # backfill catalog_thumb_url
"""
import io
import json
import sys
import urllib.error
import urllib.request
import uuid

import psycopg2
from PIL import Image, ImageDraw

SEED_CODE_PREFIX = "SEED-"
BUCKET = "service-photos"
TREE_TYPE = "normal"
MAIN = ["main-division"]
MEP = ["alfaytri-mep"]
BOTH = ["main-division", "alfaytri-mep"]

ENV_PATH = r"D:\MMS\supabase\.temp\migrate.env"
DOTENV_PATH = r"D:\MMS\.env.local"


def read_env(path):
    env = {}
    for line in io.open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip("'").strip('"')
    return env


# ── The tree ──────────────────────────────────────────────────────────────────
# (name, divisions, price, [children...])  — a node with no children is a leaf.
# The AC > Split > Repair > Compressor > Replacement > On-site chain is deliberately
# six levels deep, counting the reused root as level 1.

AC_CHILDREN = [
    ("Split", MAIN, None, [
        ("Cleaning", MAIN, 180, []),                      # "Cleaning" #1
        ("Repair", MAIN, None, [
            ("Compressor", MAIN, None, [
                ("Replacement", MAIN, None, [
                    ("On-site", MAIN, 1450, []),          # level 6
                    ("Workshop", MAIN, 1200, []),         # level 6
                ]),
                ("Diagnostics", MAIN, 150, []),
            ]),
            ("Gas Refill", MAIN, 220, []),
            ("Thermostat", MAIN, 160, []),
            ("Drain Line", MAIN, 90, []),
        ]),
        ("Installation", MAIN, 650, []),
        ("Relocation", MAIN, 480, []),
    ]),
    ("Ducted", BOTH, None, [
        ("Cleaning", BOTH, 340, []),                      # "Cleaning" #2 — same name, different path
        ("Repair", BOTH, 400, []),
        ("Duct Sanitising", BOTH, 520, []),
        ("Filter Replacement", BOTH, 130, []),
    ]),
    ("Chiller", MEP, None, [
        ("Annual Service", MEP, 2800, []),
        ("Coil Clean", MEP, 950, []),
        ("Pump Overhaul", MEP, 1750, []),
    ]),
    ("Window Unit", MAIN, None, [
        ("Service", MAIN, 120, []),
        ("Install", MAIN, 260, []),
    ]),
]

PLUMBING_CHILDREN = [
    ("Water Pump", MAIN, None, [
        ("Circulation Pump Replacement", MAIN, 780, []),
        ("Booster Pump Service", MAIN, 420, []),
        ("Pressure Tank", MAIN, 350, []),
    ]),
    ("Drainage", MAIN, None, [
        ("Blockage Clearing", MAIN, 200, []),
        ("CCTV Survey", MAIN, 600, []),
        ("Soakaway", MAIN, 1500, []),
    ]),
    ("Sanitary Ware", MAIN, None, [
        ("Mixer Replacement", MAIN, 160, []),
        ("WC Installation", MAIN, 380, []),
        ("Shower Tray", MAIN, 450, []),
    ]),
    ("Water Heater", BOTH, None, [
        ("Element Replacement", BOTH, 240, []),
        ("Descaling", BOTH, 190, []),
        ("Full Replacement", BOTH, 900, []),
    ]),
    ("Leak Detection", MAIN, 300, []),
]

ELECTRICAL_CHILDREN = [
    ("Distribution Board", MEP, None, [
        ("Breaker Replacement", MEP, 180, []),
        ("Board Upgrade", MEP, 2200, []),
        ("Load Balancing", MEP, 700, []),
    ]),
    ("Lighting", MAIN, None, [
        ("Fixture Installation", MAIN, 140, []),
        ("Emergency Light Test", MAIN, 95, []),
        ("Floodlight", MAIN, 520, []),
    ]),
    ("Power", MEP, None, [
        ("Socket Installation", MEP, 110, []),
        ("Cable Pulling", MEP, 850, []),
        ("Earthing Check", MEP, 300, []),
    ]),
    ("Generator", MEP, None, [
        ("Load Test", MEP, 1400, []),
        ("Oil Service", MEP, 600, []),
    ]),
    ("Fire Alarm", MEP, None, [
        ("Panel Service", MEP, 780, []),
        ("Detector Replacement", MEP, 160, []),
    ]),
]


def flatten(nodes, parent_id, level, out):
    """Depth-first walk producing insert rows; returns the list of leaf rows."""
    for sort_order, (name, divisions, price, children) in enumerate(nodes):
        node_id = str(uuid.uuid4())
        is_leaf = not children
        out.append({
            "id": node_id,
            "parent_id": parent_id,
            "name_en": name,
            "divisions": divisions,
            "price": price if is_leaf else None,
            "sort_order": sort_order,
            "level": level,
            "is_leaf": is_leaf,
        })
        if children:
            flatten(children, node_id, level + 1, out)
    return out


def make_placeholder_png(label):
    """A small solid tile with the service's initials — enough to be a real image."""
    img = Image.new("RGB", (400, 300), (237, 124, 44))
    draw = ImageDraw.Draw(img)
    initials = "".join(w[0] for w in label.split()[:3]).upper()
    draw.rectangle([12, 12, 388, 288], outline=(255, 255, 255), width=3)
    draw.text((28, 130), initials, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def storage_upload(base_url, service_key, path, data, content_type):
    url = f"{base_url}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {service_key}")
    req.add_header("apikey", service_key)
    req.add_header("Content-Type", content_type)
    req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        return f"{base_url}/storage/v1/object/public/{BUCKET}/{path}"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"upload {path} failed: {e.code} {body}") from e


def verify(cur):
    """Assert the fixture's shape. Exits non-zero on any failure."""
    cte = """WITH RECURSIVE t AS (
      SELECT id, name_en, parent_id, 1 AS lvl FROM public.services
       WHERE parent_id IS NULL AND deleted_at IS NULL
      UNION ALL
      SELECT s.id, s.name_en, s.parent_id, t.lvl + 1 FROM public.services s
        JOIN t ON s.parent_id = t.id WHERE s.deleted_at IS NULL)"""

    cur.execute(cte + " SELECT max(lvl), count(*) FROM t;")
    max_lvl, total = cur.fetchone()

    cur.execute(cte + """ SELECT count(*) FROM t WHERE NOT EXISTS (
      SELECT 1 FROM public.services c WHERE c.parent_id = t.id AND c.deleted_at IS NULL);""")
    leaves = cur.fetchone()[0]

    cur.execute(cte + " SELECT count(*) FROM t WHERE name_en = 'Cleaning';")
    cleanings = cur.fetchone()[0]

    cur.execute("SELECT count(*) FROM public.services WHERE catalog_image_url IS NOT NULL;")
    photos = cur.fetchone()[0]

    checks = [
        ("tree is 6 levels deep", max_lvl == 6, max_lvl),
        ("at least 40 leaves", leaves >= 40, leaves),
        ("exactly 2 services named 'Cleaning'", cleanings == 2, cleanings),
        ("15 services carry a photo", photos == 15, photos),
    ]
    ok = True
    for label, passed, actual in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {label} (got {actual})")
        ok = ok and passed
    print(f"total nodes: {total}, leaves: {leaves}")
    if not ok:
        raise SystemExit(1)
    print("fixture OK")


def probe_search(cur):
    """Assert rpc_search_services behaves against the seeded tree. Exits non-zero on failure."""
    fails = []

    def check(label, cond, detail=""):
        print(f"  [{'PASS' if cond else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
        if not cond:
            fails.append(label)

    cur.execute("SELECT name_en, path, is_leaf FROM rpc_search_services('Cleaning');")
    cleanings = [r for r in cur.fetchall() if r[0] == "Cleaning"]
    paths = {tuple(r[1]) for r in cleanings}
    check("both 'Cleaning' services returned", len(cleanings) == 2, f"got {len(cleanings)}")
    check("their breadcrumbs differ", len(paths) == 2, f"{len(paths)} distinct")

    cur.execute("SELECT name_en, is_leaf FROM rpc_search_services('Repair');")
    rep = cur.fetchall()
    check("a branch returns is_leaf = false", any(not r[1] for r in rep))
    check("a leaf returns is_leaf = true", any(r[1] for r in rep))

    cur.execute("SELECT array_length(path, 1), is_leaf FROM rpc_search_services('On-site');")
    r = cur.fetchone()
    check("six-level leaf returns a 6-element path", bool(r) and r[0] == 6,
          f"len={r[0] if r else 'n/a'}")

    cur.execute("SELECT count(*) FROM rpc_search_services('Chiller', 'normal', ARRAY['main-division']);")
    main_only = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM rpc_search_services('Chiller', 'normal', ARRAY['alfaytri-mep']);")
    mep_only = cur.fetchone()[0]
    check("division filter excludes another division's service",
          main_only == 0 and mep_only > 0, f"main={main_only} mep={mep_only}")

    cur.execute("SELECT count(*) FROM rpc_search_services('e', 'normal', '{}', 5);")
    check("p_limit is honoured", cur.fetchone()[0] == 5)

    cur.execute("SELECT count(*) FROM rpc_search_services('', 'normal', '{}', 500) WHERE thumb_url IS NOT NULL;")
    check("thumb_url comes through", cur.fetchone()[0] > 0)

    if fails:
        raise SystemExit(1)
    print("search RPC OK")


def main():
    thumbs_only = "--thumbs-only" in sys.argv
    verify_only = "--verify" in sys.argv
    search_probe = "--probe-search" in sys.argv

    env = read_env(ENV_PATH)
    dotenv = read_env(DOTENV_PATH)
    base_url = dotenv["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    service_key = dotenv["SUPABASE_SERVICE_ROLE_KEY"]
    if "wkmvjxxmzstsvahuiwsz" not in env["DEV_DB_URL"]:
        raise SystemExit("refusing to run: DEV_DB_URL is not the Dev project")
    if "wkmvjxxmzstsvahuiwsz" not in base_url:
        raise SystemExit(f"refusing to run: .env.local points at {base_url}, not Dev")

    conn = psycopg2.connect(env["DEV_DB_URL"])
    conn.autocommit = False
    cur = conn.cursor()

    if verify_only:
        verify(cur)
        conn.close()
        return

    if search_probe:
        probe_search(cur)
        conn.close()
        return

    if thumbs_only:
        backfill_thumbs(conn, cur, base_url, service_key)
        return

    # ── Reuse the operator's existing root; never delete it ────────────────────
    cur.execute(
        "SELECT id FROM public.services WHERE name_en = %s AND parent_id IS NULL "
        "AND deleted_at IS NULL LIMIT 1;",
        ("AC General Service",),
    )
    row = cur.fetchone()
    if row:
        ac_root_id = row[0]
        print(f"reusing existing root 'AC General Service' ({ac_root_id})")
    else:
        ac_root_id = str(uuid.uuid4())
        print("existing root not found — creating 'AC General Service'")

    # ── Idempotency: drop only rows this script created ───────────────────────
    cur.execute(
        "DELETE FROM public.services WHERE code LIKE %s;", (SEED_CODE_PREFIX + "%",)
    )
    print(f"cleared {cur.rowcount} previously seeded row(s)")

    rows = []
    flatten(AC_CHILDREN, ac_root_id, 2, rows)

    for root_name, children, divisions in [
        ("Plumbing", PLUMBING_CHILDREN, MAIN),
        ("Electrical", ELECTRICAL_CHILDREN, MEP),
    ]:
        root_id = str(uuid.uuid4())
        rows.append({
            "id": root_id, "parent_id": None, "name_en": root_name,
            "divisions": divisions, "price": None, "sort_order": 10,
            "level": 1, "is_leaf": False,
        })
        flatten(children, root_id, 2, rows)

    if not row:
        rows.insert(0, {
            "id": ac_root_id, "parent_id": None, "name_en": "AC General Service",
            "divisions": MAIN, "price": None, "sort_order": 0,
            "level": 1, "is_leaf": False,
        })

    for i, r in enumerate(rows):
        cur.execute(
            """INSERT INTO public.services
                 (id, parent_id, name_en, code, price, division, tree_type,
                  status, service_type, sort_order, price_unit)
               VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', 'standard', %s, 'unit');""",
            (r["id"], r["parent_id"], r["name_en"], f"{SEED_CODE_PREFIX}{i:04d}",
             r["price"], r["divisions"], TREE_TYPE, r["sort_order"]),
        )

    leaves = [r for r in rows if r["is_leaf"]]
    photo_leaves = leaves[::max(1, len(leaves) // 15)][:15]
    for r in photo_leaves:
        url = storage_upload(
            base_url, service_key, f"catalog/{r['id']}.png",
            make_placeholder_png(r["name_en"]), "image/png",
        )
        cur.execute(
            "UPDATE public.services SET catalog_image_url = %s WHERE id = %s;",
            (url, r["id"]),
        )

    conn.commit()

    cur.execute("""
        WITH RECURSIVE t AS (
          SELECT id, name_en, parent_id, 1 AS lvl, name_en::text AS path
            FROM public.services WHERE parent_id IS NULL AND deleted_at IS NULL
          UNION ALL
          SELECT s.id, s.name_en, s.parent_id, t.lvl + 1, t.path || ' > ' || s.name_en
            FROM public.services s JOIN t ON s.parent_id = t.id
           WHERE s.deleted_at IS NULL)
        SELECT lvl, path FROM t ORDER BY lvl DESC, path LIMIT 1;""")
    deepest = cur.fetchone()

    print(f"inserted {len(rows)} rows ({len(leaves)} leaves, {len(photo_leaves)} with photos)")
    print(f"deepest: L{deepest[0]}  {deepest[1]}")
    conn.close()


def backfill_thumbs(conn, cur, base_url, service_key):
    """Task 2 step 8: derive catalog_thumb_url for every seeded row that has a photo."""
    cur.execute(
        "SELECT id, name_en FROM public.services "
        "WHERE catalog_image_url IS NOT NULL AND code LIKE %s;",
        (SEED_CODE_PREFIX + "%",),
    )
    targets = cur.fetchall()
    for sid, name in targets:
        img = Image.open(io.BytesIO(make_placeholder_png(name)))
        img.thumbnail((200, 200))
        buf = io.BytesIO()
        img.save(buf, format="WEBP")
        url = storage_upload(
            base_url, service_key, f"catalog/{sid}_thumb.webp",
            buf.getvalue(), "image/webp",
        )
        cur.execute(
            "UPDATE public.services SET catalog_thumb_url = %s WHERE id = %s;",
            (url, sid),
        )
    conn.commit()
    print(f"backfilled {len(targets)} thumbnail(s)")
    conn.close()


if __name__ == "__main__":
    main()
