-- DIAGNOSTIC: temporarily disable every trigger added today to isolate
-- the source of "column receival_id is of type uuid but expression is
-- of type text". If the receival succeeds with these disabled, one of
-- these triggers is the culprit. If it still fails, the error lives in
-- the existing RPC / app code and predates this session's work.
--
-- To re-enable after diagnosis:
--   ALTER TABLE <table> ENABLE TRIGGER <name>;

BEGIN;

ALTER TABLE public.fifo_cost_layers          DISABLE TRIGGER trg_create_tool_units_on_receival;
ALTER TABLE public.fifo_cost_layers          DISABLE TRIGGER trg_remove_tool_placeholders_on_layer_delete;
ALTER TABLE public.receivals                 DISABLE TRIGGER trg_receivals_set_division;
ALTER TABLE public.receival_items            DISABLE TRIGGER trg_receival_items_set_division;
ALTER TABLE public.fifo_cost_layers          DISABLE TRIGGER trg_fifo_cost_layers_set_division;
ALTER TABLE public.inventory_stock_movements DISABLE TRIGGER trg_inventory_stock_movements_set_division;
ALTER TABLE public.cogs_entries              DISABLE TRIGGER trg_cogs_entries_set_division;
ALTER TABLE public.warehouse_transfers       DISABLE TRIGGER trg_warehouse_transfers_set_division;

COMMIT;
