-- Section 9 (release checklist) — enforce money-math invariants at the DB.
-- No CHECK constraints existed on line-item tables; a malicious or buggy
-- writer could insert qty=0 or negative unit_price and downstream math
-- would silently accept it.

-- Existing rows verified clean before this migration (0 violations across
-- po_line_items, bill_line_items, sale_order_lines, invoice_line_items).

ALTER TABLE public.po_line_items
  ADD CONSTRAINT po_line_items_qty_positive        CHECK (qty > 0),
  ADD CONSTRAINT po_line_items_unit_price_non_neg  CHECK (unit_price >= 0);

ALTER TABLE public.bill_line_items
  ADD CONSTRAINT bill_line_items_qty_positive       CHECK (qty > 0),
  ADD CONSTRAINT bill_line_items_unit_price_non_neg CHECK (unit_price >= 0);

ALTER TABLE public.sale_order_lines
  ADD CONSTRAINT sale_order_lines_qty_positive       CHECK (qty > 0),
  ADD CONSTRAINT sale_order_lines_unit_price_non_neg CHECK (unit_price >= 0);

ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT invoice_line_items_qty_positive       CHECK (qty > 0),
  ADD CONSTRAINT invoice_line_items_unit_price_non_neg CHECK (unit_price >= 0);
