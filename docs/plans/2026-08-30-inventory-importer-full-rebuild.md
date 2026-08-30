# Inventory Importer — Full Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Excel inventory importer consume real operator sheets and seed opening stock — accept a single `Category Path` column, an `Origin` column (→ `country_id`), lenient unit names, and a `Quantity` column that books opening stock (one row = one placement) via a SECURITY DEFINER RPC.

**Architecture:** The importer keeps its client-side catalog pipeline (categories → items → item-divisions → brands → variants) and gains: (1) parser support for a single `Category Path` column alongside `Category 1..N`; (2) an optional `Origin` column resolved to `country_id` via a country-name map in the ParseContext (mirrors the existing sub-container-label resolution); (3) lenient unit mapping to the canonical set; (4) an optional `Quantity` column that, for rows > 0, is collected into placements `{brand_variant_id, sub_container_id, qty, unit_cost}` and booked by a new `rpc_import_inventory_stock(jsonb)` (SECURITY DEFINER — the client can't insert `fifo_cost_layers` across divisions because of the RESTRICTIVE `is_sub_container_visible` policy). The RPC inserts `source_type='inventory_import'` FIFO layers (the `trg_fifo_stock_summary` / `trg_autostick_item_division` / `fn_refresh_warehouse_stats` triggers fire) and updates the variant/item caches the triggers don't touch.

**Tech Stack:** Next.js 15 + TS, `xlsx` (read) + `exceljs` (write), TanStack Query v5, shadcn/ui, Supabase (psql-applied migration + client RPC).

**Spec:** the approved design in-session — Category Path + Origin + units + normalized Quantity stock (row = placement); generic, not hardcoded to any operator's per-location columns.

## Global Constraints

- **Verification model:** no unit-test harness (project rule — NO vitest). Verify TS with `npx tsc --noEmit` (`0 errors`); verify the RPC with a **rolled-back** psql probe on **staging**; hand UI to the operator. Pure parser/validation changes are verified by `tsc` + a small inline Node smoke against a hand-built AOA only if trivial (no committed spec files).
- **Migrations:** write the RPC `.sql` to BOTH `supabase/migrations/` and `supabase/migrations-staging/`; apply with psycopg2 to **staging** (`mwvblpgbgxipvrevkeff`) + **new-prod** (`NEW_DB_URL`); record `schema_migrations`. Next free version after `20260831000500` → use `20260831000600`.
- **Backwards compatibility (HARD):** the existing template-based flow (separate `Category 1/2/3`, no Origin/Quantity) MUST keep working unchanged. New columns are OPTIONAL; a file without them imports exactly as today (catalog-only, zero stock).
- **Reuse the proven stock mechanic:** `source_type='inventory_import'` FIFO layers → triggers build `warehouse_stock_summary` (do NOT insert it manually) + auto-stick divisions; then set `variant.stock_level` / `variant.average_cost` (weighted, paid-layers only) + `inventory_items.total_stock` manually. Tools stay bulk (the tool-unit trigger only fires on `source_type='receival'`). See [[project_inventory_data_quality]].
- **Permissions:** the stock RPC is gated on the same permission that gates the importer surface (`inventory.catalog.manage`); REVOKE anon, GRANT authenticated.
- **Commits:** one local commit per task, BOTH co-author trailers. Do NOT push (operator batches).
- **Docs:** flows-registry entry + PROGRESS + EOD at the end.

---

### Task 1: `rpc_import_inventory_stock` RPC (migration)

**Files:** Create `supabase/migrations/20260831000600_rpc_import_inventory_stock.sql` (+ staging mirror).

**Interfaces:**
- Produces: `public.rpc_import_inventory_stock(p_rows jsonb) RETURNS jsonb` where `p_rows` = `[{ "brand_variant_id": uuid, "sub_container_id": uuid, "qty": int, "unit_cost": numeric }]`; returns `{ layers_created, units, value }`. Consumed by Task 5.

- [ ] **Step 1: Confirm live column facts** (already verified this session, re-confirm before writing): `fifo_cost_layers` NOT NULL = brand_variant_id, date, qty, unit_cost, total_unit_cost, remaining_qty, source_currency, source_exchange_rate, sub_container_id; the warehouse_id is derived from the sub-container; `refresh_stock_summary_row` is trigger-driven; the pricing guard is BEFORE UPDATE only (variant cache updates that don't touch cost_price/selling_price don't trip it).

- [ ] **Step 2: Write the migration.** Body outline (SECURITY DEFINER, search_path=public):
```sql
CREATE OR REPLACE FUNCTION public.rpc_import_inventory_stock(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id();
  v_row jsonb; v_bv uuid; v_sub uuid; v_qty int; v_cost numeric; v_wh uuid;
  v_layers int := 0; v_units bigint := 0; v_value numeric := 0;
  v_variants uuid[] := '{}'; v_items uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'You need to be signed in.' USING ERRCODE='42501'; END IF;
  IF NOT public._user_has_permission(v_uid, 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Missing permission: inventory.catalog.manage' USING ERRCODE='42501';
  END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) LOOP
    v_bv   := (v_row->>'brand_variant_id')::uuid;
    v_sub  := (v_row->>'sub_container_id')::uuid;
    v_qty  := (v_row->>'qty')::int;
    v_cost := coalesce((v_row->>'unit_cost')::numeric, 0);
    IF v_bv IS NULL OR v_sub IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    SELECT warehouse_id INTO v_wh FROM public.warehouse_sub_containers WHERE id = v_sub;
    IF v_wh IS NULL THEN RAISE EXCEPTION 'Unknown sub-container %', v_sub; END IF;
    INSERT INTO public.fifo_cost_layers
      (brand_variant_id, warehouse_id, sub_container_id, date, qty, remaining_qty,
       unit_cost, total_unit_cost, landed_cost_per_unit, source_type, source_currency, source_exchange_rate)
      VALUES (v_bv, v_wh, v_sub, CURRENT_DATE, v_qty, v_qty, v_cost, v_cost, 0,
              'inventory_import', 'QAR', 1);
    v_layers := v_layers + 1; v_units := v_units + v_qty; v_value := v_value + v_qty*v_cost;
    v_variants := array_append(v_variants, v_bv);
  END LOOP;
  -- caches the FIFO trigger does not maintain
  SELECT array_agg(DISTINCT x) INTO v_variants FROM unnest(v_variants) x;
  IF v_variants IS NOT NULL THEN
    UPDATE public.inventory_item_brand_variants bv SET
      stock_level = coalesce((SELECT sum(remaining_qty) FROM public.fifo_cost_layers l WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0),0),
      average_cost = coalesce((SELECT sum(l.remaining_qty*l.total_unit_cost) FILTER (WHERE l.total_unit_cost>0)
                               / NULLIF(sum(l.remaining_qty) FILTER (WHERE l.total_unit_cost>0),0)
                               FROM public.fifo_cost_layers l WHERE l.brand_variant_id=bv.id AND l.remaining_qty>0), bv.average_cost)
      WHERE bv.id = ANY(v_variants);
    UPDATE public.inventory_items ii SET total_stock = coalesce((
      SELECT sum(bv.stock_level) FROM public.inventory_item_brand_variants bv WHERE bv.item_id=ii.id),0)
      WHERE ii.id IN (SELECT item_id FROM public.inventory_item_brand_variants WHERE id = ANY(v_variants));
  END IF;
  RETURN jsonb_build_object('layers_created', v_layers, 'units', v_units, 'value', v_value);
END; $function$;
REVOKE ALL ON FUNCTION public.rpc_import_inventory_stock(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_inventory_stock(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply to staging + rolled-back probe.** Apply; then BEGIN…ROLLBACK: pick a real variant + a sub-container, call `rpc_import_inventory_stock('[{...qty:5...}]')`, assert a `fifo_cost_layers` row appeared, `warehouse_stock_summary` for (wh,variant,sub) got qty 5 (trigger-built), variant.stock_level updated; call as a no-perm user → raises 42501; ROLLBACK. (Simulate JWT as done in the Phase-2 probes.)
- [ ] **Step 4: Apply to new-prod. Step 5: Commit** (`feat(inventory): rpc_import_inventory_stock (opening stock for the importer)`).

---

### Task 2: Parser — Category Path column + Origin + Quantity + unit map (`src/lib/inventory-import.ts`)

**Files:** Modify `src/lib/inventory-import.ts`.

**Interfaces:**
- `ImportRow` gains `origin: string`, `countryId: number | null`, `quantity: number`.
- `ParseContext` gains `countryByName: Map<string, number>` (lowercased name → country_codes.id, incl. UAE/UK/USA/Scotland aliases pre-seeded by the builder).
- `buildParseContext(subContainers, countryByName)`.

- [ ] **Step 1: Constants + types.** Add `UNIT_ALIASES: Record<string,string>` mapping lowercased real units → canonical (`unit`/`pcs`/`piece`/`none`/`''`→`Piece`, `cartoon`/`carton`→`Box`, `roll`→`Roll`, `cylinder`/`can`/`gal (us)`/`packet`/`dzn`/anything-else→`Other`). Extend `ImportRow` + `ParseContext` per Interfaces. Add `ORIGIN_ALIASES` (`uae`→`united arab emirates`, `uk`/`scotland`→`united kingdom`, `usa`→`united states`).

- [ ] **Step 2: `parseExcelFile` — dual category + new columns.** After discovering `Category N` columns, ALSO detect a single header `category path`. Category segments = the `Category N` values if present, ELSE `String(row[catPathIdx]).split('>')` trimmed non-empty. Add `findCol('origin')`, `findCol('quantity')`. Populate `origin` (raw text), `countryId` = `ctx.countryByName.get(ORIGIN_ALIASES[o]??o)` (first token if comma-list), `quantity` = `toNumber` (blank→0). Keep every existing field. If NEITHER `Category N` NOR `Category Path` exists → the existing "No Category column" error.

- [ ] **Step 3: `buildParseContext`.** Accept `countryByName`; store it. Pre-apply aliases so the map has both canonical + alias keys.

- [ ] **Step 4: Typecheck.** `npx tsc --noEmit` → 0. Commit (`feat(inventory-import): parse Category Path / Origin / Quantity + lenient units`).

---

### Task 3: Validation + preview (`src/lib/inventory-import.ts`)

- [ ] **Step 1: `validateRows`.** Unit: map via `UNIT_ALIASES` (always resolvable — never error on unit; write the canonical back to `row.unit`). Origin: if `row.origin` non-empty AND `row.countryId` null → push a NON-fatal note but keep the row valid (unknown origin loads as null). Quantity: if `< 0` → error; blank/0 = catalog-only (valid). **Cost/Selling become optional** — blank → 0 (real sheets often have no selling price); only a NEGATIVE value errors (drop the current "must be a number"/"≥0"-on-blank hard errors; keep `< 0` as an error). Keep type/category/name/brand checks. **Warehouse—Sub-container is REQUIRED only when `quantity > 0`** (catalog-only rows need no location). Do this by normalizing blank cost/sell to 0 in the PARSER (`toNumber` blank → 0) so downstream stays numeric.
- [ ] **Step 2: `ImportPreview` + `buildPreview`.** Add `newUnits: number` (Σ quantity of valid rows) + keep category/item/variant diffs. 
- [ ] **Step 3: Typecheck + commit** (`feat(inventory-import): validate units/origin/quantity + stock preview`).

---

### Task 4: Template regen (`downloadTemplate` in `src/lib/inventory-import.ts`)

- [ ] **Step 1:** Insert `Origin` + `Quantity` into `FIXED_HEADERS` (after `Selling Price`, before `Warehouse — Sub-container`). Add an `Origin` data-validation dropdown sourced from a new `GenerateTemplateOptions.countryNames: string[]`; `Quantity` is free numeric. Update the example rows + column widths + the reference sheet note ("Quantity books opening stock into the picked Warehouse — Sub-container"). Keep `Category 1..N` in the template (the single `Category Path` is a READ convenience for external sheets).
- [ ] **Step 2: Typecheck + commit** (`feat(inventory-import): template gains Origin + Quantity columns`).

---

### Task 5: DB pipeline — country_id + stock RPC (`src/hooks/useInventoryImport.ts`)

**Files:** Modify `src/hooks/useInventoryImport.ts`.

- [ ] **Step 1: `useExistingInventoryLookup`** — also fetch `country_codes(id,name)`; return `countryByName: Map<string,number>` so the dialog can build the ParseContext. (Add to `ExistingInventoryLookup`.)
- [ ] **Step 2: Variant insert** — add `country_id: p.row.countryId ?? null` to both the batch and single-insert payloads. (Unique index is `(item_id, brand_id, country_id)`, so origin-distinct variants no longer collide — matches Task-2 keying.)
- [ ] **Step 3: Stock booking** — after variants exist, resolve each valid row's `brand_variant_id` (from the `resolvedItemId` + brand + country → re-query the just-inserted variants, or track ids as they're created), build placements `{brand_variant_id, sub_container_id: row.subContainer.sub_container_id, qty: row.quantity, unit_cost: row.costPrice}` for rows with `quantity>0`, and call `supabase.rpc('rpc_import_inventory_stock', { p_rows })` in chunks of ~500. Add `unitsSeeded` to `ImportResult`. Invalidate warehouse-stock query keys on success.
- [ ] **Step 4: Typecheck + commit** (`feat(inventory-import): set variant origin + book opening stock via rpc`).

---

### Task 6: Dialog preview + summary (`src/components/services/inventory/InventoryImportDialog.tsx`)

- [ ] **Step 1:** Build the ParseContext with `countryByName` (from the lookup). Pass `countryNames` to `downloadTemplate`. Add `Origin` + `Qty` columns to the preview table; add a `{preview.newUnits} units` badge. On success, include units in the toast.
- [ ] **Step 2: Typecheck + commit** (`feat(inventory): import dialog shows origin + quantity + stock summary`).
- [ ] **Step 3: Operator smoke (hand off)** — download the new template, fill 2–3 rows incl. Origin + Quantity + a single-`Category Path` variant, import on **staging**, confirm catalog + origin + stock land and the warehouse view shows the qty.

---

### Task 7: Docs

- [ ] flows-registry: extend the inventory-import flow entry (Origin + opening-stock via `rpc_import_inventory_stock`). PROGRESS `In Progress` + Security Audit Log row. EOD. Commit (`docs: importer full rebuild — origin + stock`).

## Self-Review

- **Coverage:** Category Path (T2), Origin→country_id (T2/T5), unit leniency (T2/T3), Quantity→opening stock via RPC (T1/T5), template (T4), preview (T3/T6), backwards-compat (optional columns, sub-container required only when qty>0 — T3). 
- **Types:** `countryByName` introduced T2, produced T5, consumed T6; `rpc_import_inventory_stock` defined T1, called T5; `newUnits`/`unitsSeeded` defined T3/T5, shown T6.
- **Risk:** the client must map each valid row → its created `brand_variant_id` for the placements (T5 Step 3) — the safest is to capture ids as variants are inserted (extend the existing insert loop to record `variantIdByKey`), not a re-query. Note this in T5.
