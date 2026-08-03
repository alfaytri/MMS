-- Warehouse Model v2 — Phase D.4.c hotfix
-- Two overloads of `save_inventory_check_item_count` are live:
--   (uuid, numeric, text)                              — legacy 3-arg
--   (uuid, numeric, text, uuid, uuid, text)            — current 6-arg
-- The client calls the 6-arg variant so the assignment can be idempotently
-- flipped pending → in_progress on the first save. When both overloads
-- coexist, PostgREST can't resolve the call cleanly and the network
-- request stalls (observed as "Saving…" stuck on the Inv Check dialog).
-- The 3-arg overload has no live caller — drop it.

DROP FUNCTION IF EXISTS public.save_inventory_check_item_count(
  uuid, numeric, text
);
