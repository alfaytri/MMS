-- ============================================================
-- Drop unused debit_note_lines.bill_line_id
--
-- Section 1.8 of docs/next-work-plan.md. The FK was scaffolded
-- in 20260721140000 to link a debit-note line back to the exact
-- bill line it credits, but no writer was ever wired up — every
-- row is NULL, no reader consults it, no downstream RPC joins on
-- it.
--
-- Note (not in this migration): the user's concern about "unit
-- cost when a return spans two receivals" is answered by the
-- existing inventory-side flow. debit_note_lines.unit_price is
-- the supplier-price snapshot at return time; the FIFO cost
-- (weighted across receivals) is computed by
-- rpc_process_po_return_dispatch → deduct_fifo_layers and stored
-- on inventory_stock_movements.unit_cost. Two different concepts,
-- both correctly maintained.
-- ============================================================

ALTER TABLE public.debit_note_lines
  DROP CONSTRAINT IF EXISTS debit_note_lines_bill_line_id_fkey;

ALTER TABLE public.debit_note_lines
  DROP COLUMN IF EXISTS bill_line_id;

NOTIFY pgrst, 'reload schema';
