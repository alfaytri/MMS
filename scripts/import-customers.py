"""
One-time import of legacy customer data into service_customers.

Usage:
  python scripts/import-customers.py --dry-run   # preview only, nothing written
  python scripts/import-customers.py             # actual import

Strategy: pre-generate UUIDs in Python so all inserts can be batched.
  1. Batch-insert service_customers (BATCH_SIZE rows at a time)
  2. Batch-insert service_customer_phones
  3. Batch-insert service_customer_addresses
  ~3 large operations instead of 20k individual ones.
"""

import sys, argparse, time, uuid, os
import pandas as pd
import requests

# ── Config ───────────────────────────────────────────────────────────────────

EXCEL_PATH   = r"C:\Users\IT\Downloads\Customer Old Data.xlsx"
SUPABASE_URL = "https://wkmvjxxmzstsvahuiwsz.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_KEY:
    raise SystemExit("Set SUPABASE_SERVICE_ROLE_KEY env var before running this script.")
BATCH_SIZE   = 500

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",   # faster — don't return rows
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def normalise_phone(raw) -> str | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip().replace(" ", "").replace("-", "").replace("+", "")
    if s.endswith(".0"):
        s = s[:-2]
    if not s or not s.isdigit():
        return None
    return "+" + s

def waze_url(lat, lng) -> str:
    return f"https://waze.com/ul?ll={lat},{lng}&navigate=yes"

def clean_str(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return None if s in ("", "nan", "None", "NaT") else s

def batch_insert(table: str, rows: list, dry_run: bool):
    if dry_run or not rows:
        return
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=chunk,
        )
        if not r.ok:
            raise RuntimeError(f"Batch insert into {table} failed "
                               f"({r.status_code}): {r.text[:400]}")
        end = min(i + BATCH_SIZE, len(rows))
        print(f"  {table}: {end:,}/{len(rows):,}", end="\r")
    print(f"  {table}: {len(rows):,}/{len(rows):,} done          ")

def rest_get_all(path, select="*") -> list:
    results, page, size = [], 0, 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers=HEADERS,
            params={"select": select, "limit": size, "offset": page * size},
        )
        r.raise_for_status()
        batch = r.json()
        results.extend(batch)
        if len(batch) < size:
            break
        page += 1
    return results

# ── Load Excel ────────────────────────────────────────────────────────────────

def load_excel():
    print("Loading Excel…")
    cust_df  = pd.read_excel(EXCEL_PATH, sheet_name="Customer",         dtype=str)
    phone_df = pd.read_excel(EXCEL_PATH, sheet_name="Customer Phone",   dtype=str)
    addr_df  = pd.read_excel(EXCEL_PATH, sheet_name="Customer Address", dtype=str)

    # ── Customers ──
    cust_df = cust_df[cust_df["IsDummy"].str.strip().str.lower() != "true"].copy()
    customers = {}
    for _, row in cust_df.iterrows():
        cid = clean_str(row.get("ID"))
        if not cid:
            continue
        cid = int(float(cid))
        status  = clean_str(row.get("CustomerStatusID")) or "1"
        bl_id   = clean_str(row.get("BlacklistReasonId"))
        bl_text = clean_str(row.get("BlacklistReasonText"))
        blocked = (status == "2" or bl_id is not None)
        customers[cid] = {
            "name":         (clean_str(row.get("Name")) or "").strip(),
            "is_blocked":   blocked,
            "block_reason": bl_text if blocked else None,
        }

    # ── Phones ──
    phone_df = phone_df[phone_df["IsActive"].str.strip().str.lower() != "false"].copy()
    phones_by: dict[int, list] = {}
    for _, row in phone_df.iterrows():
        cid = clean_str(row.get("CustomerId"))
        if not cid:
            continue
        cid = int(float(cid))
        normed = normalise_phone(row.get("PhoneNo"))
        if not normed:
            continue
        is_primary = clean_str(row.get("IsDefault", "False")) or "False"
        phones_by.setdefault(cid, []).append({
            "phone":      normed,
            "label":      "mobile",
            "is_primary": is_primary.lower() == "true",
        })

    # ── Addresses ──
    addr_df = addr_df[addr_df["IsActive"].str.strip().str.lower() != "false"].copy()
    addrs_by: dict[int, list] = {}
    for _, row in addr_df.iterrows():
        cid = clean_str(row.get("CustomerId"))
        if not cid:
            continue
        cid = int(float(cid))
        label      = clean_str(row.get("Label"))
        is_default = (clean_str(row.get("IsDefault", "False")) or "False").lower() == "true"
        no_bp      = (clean_str(row.get("NoBluePlate", "False")) or "False").lower() == "true"
        try:
            lat_s = clean_str(row.get("Latitude"))
            lng_s = clean_str(row.get("Longitude"))
            lat = float(lat_s) if lat_s else None
            lng = float(lng_s) if lng_s else None
        except (ValueError, TypeError):
            lat = lng = None

        if no_bp:
            addr = {
                "address_type": "google-coords",
                "label":        label,
                "zone": None, "street": None, "building": None, "unit": None,
                "lat": lat, "lng": lng,
                "is_primary":  is_default,
                "is_geocoded": (lat is not None and lng is not None),
                "waze_link":   waze_url(lat, lng) if (lat and lng) else None,
            }
        else:
            addr = {
                "address_type": "blue-plate",
                "label":        label,
                "zone":         clean_str(row.get("ZoneNo")),
                "street":       clean_str(row.get("StreetNo")),
                "building":     clean_str(row.get("BuildingNo")),
                "unit":         clean_str(row.get("UnitNo")),
                "lat": lat, "lng": lng,
                "is_primary":  is_default,
                "is_geocoded": (lat is not None and lng is not None),
                "waze_link":   waze_url(lat, lng) if (lat and lng) else None,
            }
        addrs_by.setdefault(cid, []).append(addr)

    print(f"  {len(customers):,} customers | "
          f"{sum(len(v) for v in phones_by.values()):,} phones | "
          f"{sum(len(v) for v in addrs_by.values()):,} addresses")
    return customers, phones_by, addrs_by

# ── Main ──────────────────────────────────────────────────────────────────────

def run(dry_run: bool):
    customers, phones_by, addrs_by = load_excel()

    print("Fetching existing phones from Supabase…")
    existing = {r["phone"] for r in rest_get_all("service_customer_phones", "phone")}
    print(f"  {len(existing):,} phone(s) already in DB")

    # ── Build flat insert lists with pre-generated UUIDs ──
    cust_rows   = []
    phone_rows  = []
    addr_rows   = []
    block_rows  = []

    skipped_no_phone  = 0
    skipped_duplicate = 0

    for legacy_id, cust in customers.items():
        phones = phones_by.get(legacy_id, [])
        if not phones:
            skipped_no_phone += 1
            continue
        if any(p["phone"] in existing for p in phones):
            skipped_duplicate += 1
            continue

        new_uuid = str(uuid.uuid4())

        cust_rows.append({
            "id":              new_uuid,
            "name":            cust["name"],
            "referral_source": None,
            "is_blocked":      cust["is_blocked"],
        })

        for p in phones:
            phone_rows.append({"customer_id": new_uuid, **p})

        for a in addrs_by.get(legacy_id, []):
            addr_rows.append({"customer_id": new_uuid, **a})

        if cust["is_blocked"] and cust["block_reason"]:
            block_rows.append({
                "customer_id": new_uuid,
                "reason":      cust["block_reason"],
            })

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Import plan:")
    print(f"  Customers to import:    {len(cust_rows):,}")
    print(f"  Skipped (no phone):     {skipped_no_phone:,}")
    print(f"  Skipped (dup phone):    {skipped_duplicate:,}")
    print(f"  Phones to insert:       {len(phone_rows):,}")
    print(f"  Addresses to insert:    {len(addr_rows):,}")
    print(f"  Blacklist entries:      {len(block_rows):,}")

    if dry_run:
        print("\nDry run complete — nothing written.")
        return

    print(f"\nInserting…")
    t0 = time.time()

    batch_insert("service_customers",         cust_rows,  dry_run)
    batch_insert("service_customer_phones",   phone_rows, dry_run)
    batch_insert("service_customer_addresses",addr_rows,  dry_run)
    if block_rows:
        batch_insert("customer_blocks",       block_rows, dry_run)

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s — {len(cust_rows):,} customers imported.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
