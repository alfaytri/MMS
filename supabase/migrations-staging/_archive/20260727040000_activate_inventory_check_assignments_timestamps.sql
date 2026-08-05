-- Section 1.15 — Activate inventory_check_assignments.updated_at
--
-- Audit found updated_at had no BEFORE-UPDATE trigger, so it only moved
-- when a writer set it explicitly (currently only the 1.12
-- save_inventory_check_item_count RPC does). That caused drift:
-- useCompleteAssignment's UPDATE of status + completed_at didn't touch
-- updated_at. Wire the same set_updated_at() trigger that every other
-- table in the module (inventory_checks, inventory_check_items, etc.)
-- already uses.
--
-- (started_at also gets promoted from cached-but-unread to actively
-- displayed by the accompanying UI change — no schema work needed for
-- that side.)

CREATE TRIGGER set_inventory_check_assignments_updated_at
    BEFORE UPDATE ON public.inventory_check_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
