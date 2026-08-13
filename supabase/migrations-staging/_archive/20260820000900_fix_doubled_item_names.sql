-- Fix self-duplicated item names ("X — X") — an import artifact that stored the
-- item name concatenated with itself in inventory_items.name_en (e.g. "MOTOR —
-- MOTOR", "Electrical Control Components — Electrical Control Components"). It
-- surfaced as a doubled label on the consumption confirm, custody cards, the
-- accept dialog, and the movements tab because those read the (faithful) copies.
--
-- Dedupe to the first half, but ONLY where the string splits into EXACTLY two
-- " — " parts that are byte-equal after trim — so a legitimately hyphenated name
-- ("A — B", "A — B — C") is never touched. name_ar is already clean. Idempotent:
-- re-running matches nothing. Fixes the source of truth AND every denormalised
-- display snapshot the UI reads.

-- 1. Source of truth.
update public.inventory_items
   set name_en    = btrim(split_part(name_en, ' — ', 1)),
       updated_at = now()
 where name_en like '% — %'
   and btrim(split_part(name_en, ' — ', 1)) = btrim(split_part(name_en, ' — ', 2))
   and array_length(string_to_array(name_en, ' — '), 1) = 2;

-- 2. Stock-summary cache (read by warehouse_stock_view → custody cards + consumption).
update public.warehouse_stock_summary
   set item_name  = btrim(split_part(item_name, ' — ', 1)),
       updated_at = now()
 where item_name like '% — %'
   and btrim(split_part(item_name, ' — ', 1)) = btrim(split_part(item_name, ' — ', 2))
   and array_length(string_to_array(item_name, ' — '), 1) = 2;

-- 3. Transfer-line snapshot (read by the custody Accept / Dispatch dialogs).
update public.warehouse_transfer_items
   set item_name = btrim(split_part(item_name, ' — ', 1))
 where item_name like '% — %'
   and btrim(split_part(item_name, ' — ', 1)) = btrim(split_part(item_name, ' — ', 2))
   and array_length(string_to_array(item_name, ' — '), 1) = 2;

-- 4. Movement snapshot (read by the Movements tab).
update public.inventory_stock_movements
   set item_name = btrim(split_part(item_name, ' — ', 1))
 where item_name like '% — %'
   and btrim(split_part(item_name, ' — ', 1)) = btrim(split_part(item_name, ' — ', 2))
   and array_length(string_to_array(item_name, ' — '), 1) = 2;
