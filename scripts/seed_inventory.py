"""
Seed inventory from Inventory.xlsx into Supabase.

Steps:
  1. Clear all existing inventory data (FK order)
  2. Parse Excel into categories → items → brand_variants
  3. Insert to Supabase via REST API

Usage:
    python scripts/seed_inventory.py
"""

import json, sys, re, uuid, urllib.request, urllib.error
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://wkmvjxxmzstsvahuiwsz.supabase.co'
SERVICE_KEY  = 'YOUR_SUPABASE_SERVICE_KEY'
EXCEL_PATH   = 'C:/Users/IT/Downloads/Inventory.xlsx'

HEADERS = {
    'apikey':        SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}

EN_DASH = '–'  # U+2013


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def rest(method, table, data=None, params=''):
    url = f'{SUPABASE_URL}/rest/v1/{table}{params}'
    body = json.dumps(data).encode() if data is not None else None
    req  = urllib.request.Request(url, headers=HEADERS, data=body, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        raise RuntimeError(f'{method} {table}: {e.code} {msg}')


def insert_batch(table, rows, batch=200):
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        rest('POST', table, chunk)
    print(f'  ✓ {len(rows)} rows → {table}')


def delete_all(table, params=''):
    rest('DELETE', table, params=params or '?id=neq.00000000-0000-0000-0000-000000000000')
    print(f'  ✓ cleared {table}')


# ─── Categorisation ────────────────────────────────────────────────────────────

def get_inv_type(name: str) -> str:
    """Map item name to inventory_type enum value."""
    n = name.lower()
    # consumables: filter cartridges + chemicals + misc materials
    if any(n.startswith(p) for p in ['cto ', 'pp ', 'udf ', 'membrane', 'stainless pp']):
        return 'consumables'
    if any(x in n for x in ['cartridge', 'drainage cleaner', 'electric wire', 'magic hose',
                              'fuse 1', '3-pin top', 'water heart thermostat']):
        return 'consumables'
    # tools: deflectors, stands, reusable equipment
    if 'air deflector' in n or 'aluminium air filter' in n:
        return 'tools'
    if 'pump stand' in n or 'water cooler steel stand' in n:
        return 'tools'
    if 'water circulator' in n:
        return 'tools'
    # products: complete units
    if re.match(r'ac\s*[-–]', n):
        return 'products'
    if 'water heater' in n and 'element' not in n:
        return 'products'
    if 'water cooler' in n and 'stand' not in n and 'thermostat' not in n:
        return 'products'
    if any(x in n for x in ['espa pump', 'grundfos pump', 'submersible pump',
                              'silent pump', 'slient pump', 'shower water filter']):
        return 'products'
    if any(x in n for x in ['stainless steel water filter', 'cck ro filter',
                              'alkawther kitchen filter', 'cck jumbo filter',
                              'alfapure 20', 'alfapure 30']):
        return 'products'
    if 'circulation pump' in n:
        return 'products'
    # default: spare-parts
    return 'spare-parts'


def get_category_name(name: str, inv_type: str) -> str:
    """Map item name to a category display name."""
    n = name.lower()
    # AC sub-categories
    m = re.match(r'ac\s*[-–]\s*(split|window|stand|floor ceiling|floor\s*ceiling)\s*[-–]', n)
    if m:
        ac_type = m.group(1).title().replace('  ', ' ')
        return f'AC - {ac_type}'
    # Products
    if 'water heater' in n and 'element' not in n:
        return 'Water Heaters'
    if 'water cooler' in n and 'stand' not in n and 'thermostat' not in n:
        return 'Water Coolers'
    if any(x in n for x in ['espa pump', 'grundfos pump', 'submersible pump',
                              'silent pump', 'slient pump', 'pump set', 'circulation pump']):
        return 'Water Pumps'
    if any(x in n for x in ['stainless steel water filter', 'shower water filter',
                              'cck ro filter', 'alkawther kitchen filter', 'cck jumbo filter',
                              'alfapure 20', 'alfapure 30']):
        return 'Water Filtration Systems'
    # Consumables
    if any(n.startswith(p) for p in ['cto ', 'pp ', 'udf ', 'membrane', 'stainless pp']):
        return 'Filter Cartridges'
    if 'shower filter cartridge' in n or 'cartridge' in n:
        return 'Filter Cartridges'
    if any(x in n for x in ['drainage cleaner', 'electric wire', 'magic hose', 'fuse 1', '3-pin top']):
        return 'Chemicals & Materials'
    # Tools
    if 'air deflector' in n:
        return 'Air Deflectors'
    if 'aluminium air filter' in n:
        return 'HVAC Accessories'
    if 'pump stand' in n or 'water cooler steel stand' in n or 'water circulator' in n:
        return 'Equipment & Accessories'
    # Spare parts
    if any(x in n for x in ['capacitor', 'relay', 'contactor', 'sensor', 'thermostat']):
        return 'AC Components'
    if any(x in n for x in ['socket', 'switch', 'mcb', 'elcb', 'timer', 'outlet',
                              'isolator', 'led', 'lamp', 'fuse', '3-pin', 'wire']):
        return 'Electrical Parts'
    if any(x in n for x in ['valve', 'pressure', 'float', 'shattaf', 'hose', 'waste',
                              'water valve', 'angle valve', 'non-return']):
        return 'Plumbing Parts'
    if 'heating element' in n:
        return 'Water Heater Parts'
    return 'General Spare Parts'


# ─── AC item parser ────────────────────────────────────────────────────────────

def parse_ac(name: str):
    """Return (ac_type, brand, spec) for AC items, or None."""
    clean = name.replace(EN_DASH, '-')
    # Split on ' - ' allowing optional spaces
    parts = [p.strip() for p in re.split(r'\s*-\s*', clean) if p.strip()]
    if len(parts) >= 4 and parts[0].upper() == 'AC':
        # parts[1] could be 'Floor Ceiling' already as single token or split
        # Rejoin 'Floor' + 'Ceiling' if split
        if parts[1].lower() == 'floor' and len(parts) > 2 and parts[2].lower() == 'ceiling':
            ac_type = 'Floor Ceiling'
            brand = parts[3] if len(parts) > 3 else 'Generic'
            spec = ' - '.join(parts[4:]) if len(parts) > 4 else 'Unknown'
        else:
            ac_type = parts[1]
            brand = parts[2]
            spec = ' - '.join(parts[3:])
        return ac_type, brand, spec
    return None


def extract_brand_from_name(name: str):
    """Return (item_name, brand) splitting on en-dash or special patterns."""
    if EN_DASH in name:
        idx = name.rfind(EN_DASH)
        item_name = name[:idx].strip()
        brand = name[idx + 1:].strip()
        # Clean up secondary brand qualifiers like "Eaton - Malaysia" → brand = "Eaton - Malaysia"
        return item_name, brand
    # Bracket pattern: "Slient Pump- [DAB KI-30/90] 1 HP" → brand = "DAB"
    m = re.search(r'\[([A-Z]{2,})', name)
    if m:
        brand = m.group(1)
        return name, brand
    return name, 'Generic'


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('Reading Excel…')
    df = pd.read_excel(EXCEL_PATH)
    print(f'  {len(df)} rows loaded')

    # ── Step 1: clear existing inventory data ──────────────────────────────────
    print('\nClearing existing inventory data…')
    delete_all('cogs_entries')
    delete_all('inventory_stock_movements')
    delete_all('service_inventory')
    delete_all('fifo_cost_layers')
    # Null out nullable FKs before deleting variants
    rest('PATCH', 'receival_items',
         {'brand_variant_id': None},
         '?brand_variant_id=not.is.null')
    print('  ✓ nulled receival_items.brand_variant_id')
    rest('PATCH', 'sale_order_lines',
         {'brand_variant_id': None},
         '?brand_variant_id=not.is.null')
    print('  ✓ nulled sale_order_lines.brand_variant_id')
    delete_all('inventory_brand_variants')
    delete_all('inventory_items')
    delete_all('inventory_categories')

    # ── Step 2: parse Excel ────────────────────────────────────────────────────
    print('\nParsing inventory…')

    groups = df[df['IsGroup'] == True].copy()
    children = df[df['InventoryItemGroupId'].notna()].copy()
    standalones = df[(df['IsGroup'] == False) & (df['InventoryItemGroupId'].isna())].copy()

    # Build map: original_id → group row for children lookup
    group_map = {int(row['ID']): row for _, row in groups.iterrows()}

    # Collect: {cat_name: {'type': ..., 'items': {item_name: {'brand_variants': [(brand, cost)]}}}}
    cats: dict[str, dict] = {}

    def ensure_cat(cat_name, inv_type):
        if cat_name not in cats:
            cats[cat_name] = {'type': inv_type, 'items': {}}
        return cats[cat_name]

    def add_variant(cat_name, inv_type, item_name, brand, cost, item_name_ar=None):
        cat = ensure_cat(cat_name, inv_type)
        if item_name not in cat['items']:
            cat['items'][item_name] = {'name_ar': item_name_ar, 'variants': []}
        cat['items'][item_name]['variants'].append({'brand': brand, 'cost': float(cost) if cost else 0.0})

    # ── Process AC standalone items ────────────────────────────────────────────
    ac_rows = standalones[standalones['Name'].str.match(r'(?i)^ac\s*[-–]', na=False)]
    non_ac_rows = standalones[~standalones.index.isin(ac_rows.index)]

    for _, row in ac_rows.iterrows():
        name = str(row['Name'])
        parsed = parse_ac(name)
        if parsed:
            ac_type, brand, spec = parsed
            cat_name = f'AC - {ac_type}'
            add_variant(cat_name, 'products', spec, brand, row.get('Cost', 0))
        else:
            # Fallback: treat as standalone
            item_name, brand = extract_brand_from_name(name)
            inv_type = get_inv_type(name)
            cat_name = get_category_name(name, inv_type)
            add_variant(cat_name, inv_type, item_name, brand, row.get('Cost', 0))

    # ── Process non-AC standalone items ───────────────────────────────────────
    for _, row in non_ac_rows.iterrows():
        name = str(row['Name'])
        name_ar = str(row['ArabicName']) if pd.notna(row.get('ArabicName')) else None
        if name_ar == name:
            name_ar = None  # same as EN, skip
        inv_type = get_inv_type(name)
        cat_name = get_category_name(name, inv_type)
        item_name, brand = extract_brand_from_name(name)
        add_variant(cat_name, inv_type, item_name, brand, row.get('Cost', 0), name_ar)

    # ── Process group items (group → item, children → brand_variants) ─────────
    for _, grow in groups.iterrows():
        gname = str(grow['Name'])
        gname_ar = str(grow['ArabicName']) if pd.notna(grow.get('ArabicName')) else None
        if gname_ar == gname:
            gname_ar = None
        inv_type = get_inv_type(gname)
        cat_name = get_category_name(gname, inv_type)
        cat = ensure_cat(cat_name, inv_type)
        gid = int(grow['ID'])

        child_rows = children[children['InventoryItemGroupId'] == gid]
        if gname not in cat['items']:
            cat['items'][gname] = {'name_ar': gname_ar, 'variants': []}

        if len(child_rows) > 0:
            for _, crow in child_rows.iterrows():
                brand = str(crow['Name']).strip() or 'Generic'
                cost = float(crow['Cost']) if pd.notna(crow.get('Cost')) else 0.0
                cat['items'][gname]['variants'].append({'brand': brand, 'cost': cost})
        else:
            cat['items'][gname]['variants'].append({'brand': 'Generic', 'cost': 0.0})

    # ── Step 3: insert into DB ──────────────────────────────────────────────────
    print('\nInserting categories, items, brand_variants…')

    cat_rows = []
    item_rows = []
    variant_rows = []

    cat_id_map = {}   # cat_name → uuid
    item_sku_counter = [1]

    for cat_name, cat_data in sorted(cats.items()):
        cid = str(uuid.uuid4())
        cat_id_map[cat_name] = cid
        cat_rows.append({
            'id':      cid,
            'name_en': cat_name,
            'type':    cat_data['type'],
        })

        for item_name, item_data in cat_data['items'].items():
            iid = str(uuid.uuid4())
            sku = f'INV-{item_sku_counter[0]:04d}'
            item_sku_counter[0] += 1

            # cost_price = average of variants
            costs = [v['cost'] for v in item_data['variants'] if v['cost'] > 0]
            avg_cost = sum(costs) / len(costs) if costs else 0.0

            item_rows.append({
                'id':          iid,
                'category_id': cid,
                'name_en':     item_name,
                'name_ar':     item_data.get('name_ar'),
                'sku':         sku,
                'unit':        'Unit',
                'cost_price':  round(avg_cost, 2),
            })

            for v in item_data['variants']:
                variant_rows.append({
                    'id':         str(uuid.uuid4()),
                    'item_id':    iid,
                    'brand':      v['brand'],
                    'cost_price': v['cost'],
                })

    insert_batch('inventory_categories', cat_rows)
    insert_batch('inventory_items', item_rows)
    insert_batch('inventory_brand_variants', variant_rows)

    print(f'\n✅ Done!')
    print(f'   Categories: {len(cat_rows)}')
    print(f'   Items:      {len(item_rows)}')
    print(f'   Variants:   {len(variant_rows)}')

    # Summary by type
    from collections import Counter
    type_counts = Counter(c['type'] for c in cat_rows)
    for t, n in sorted(type_counts.items()):
        print(f'   {t}: {n} categories')


if __name__ == '__main__':
    main()
