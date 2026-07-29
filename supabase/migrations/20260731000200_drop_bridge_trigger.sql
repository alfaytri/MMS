-- Phase 8 Sub-task 8.3: Retire the Phase 7 interim bridge trigger.
--
-- trg_bridge_legacy_resolution_to_dual_ledger was created in
-- 20260730000150_bridge_legacy_resolution_to_dual_ledger.sql as a safety net
-- during the 7.1 → 7.2 transition window — it mirrored any INSERT on the
-- legacy return_line_resolutions table into the new-ledger tables
-- (return_line_customer_resolutions or return_line_inventory_dispositions).
--
-- The Phase 7.2 rewrites moved all app-side write paths off the legacy table.
-- The 7.7 section G verification confirmed the bridge has been inert since —
-- zero legacy inserts observed post-7.2 across every walked scenario. 8.1
-- grep of src/ likewise found zero remaining callers.
--
-- The trigger and function are safe to drop now; 8.5 will drop the underlying
-- table itself.

drop trigger if exists trg_bridge_legacy_resolution_to_dual_ledger
  on public.return_line_resolutions;

drop function if exists public._bridge_legacy_resolution_to_dual_ledger();
