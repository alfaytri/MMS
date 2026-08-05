-- PR #1 — Division scope RLS backfill
--
-- Extends is_division_visible() enforcement to every table with a division_id
-- column (11 directly-gated tables) plus the high-value child tables that
-- leak money/customer data (16 children via EXISTS-subquery on their parent).
--
-- Strategy: RESTRICTIVE policies. RESTRICTIVE policies AND with existing
-- permissive policies, so we do NOT need to drop existing `USING (true)`
-- rules — they become no-ops and role-based checks (e.g. so_invoices'
-- Accountant-void rule) stay intact.
--
-- Related design doc: docs/superpowers/specs/2026-07-30-division-switcher-design.md
--
-- Deferred to a follow-up (workflow/config-only tables, no money leak):
--   po_approval_chain_tiers, po_approvals, po_edit_requests, po_rfq_quotes,
--   po_versions, receival_edit_requests, inventory_checks,
--   warehouse_reorder_points, warehouse_responsible_persons,
--   tool_asset_units, return_line_inventory_dispositions

-- =============================================================================
-- 1. Directly-gated tables (own division_id column)
-- =============================================================================

-- bills
CREATE POLICY division_scope_select_r ON public.bills AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.bills AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.bills AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.bills AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- cogs_entries
CREATE POLICY division_scope_select_r ON public.cogs_entries AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.cogs_entries AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.cogs_entries AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.cogs_entries AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- fifo_cost_layers
CREATE POLICY division_scope_select_r ON public.fifo_cost_layers AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.fifo_cost_layers AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.fifo_cost_layers AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.fifo_cost_layers AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- inventory_stock_movements
CREATE POLICY division_scope_select_r ON public.inventory_stock_movements AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.inventory_stock_movements AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.inventory_stock_movements AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.inventory_stock_movements AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- po_approval_chains
CREATE POLICY division_scope_select_r ON public.po_approval_chains AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.po_approval_chains AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.po_approval_chains AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.po_approval_chains AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- receival_items
CREATE POLICY division_scope_select_r ON public.receival_items AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.receival_items AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.receival_items AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.receival_items AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- receivals
CREATE POLICY division_scope_select_r ON public.receivals AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.receivals AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.receivals AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.receivals AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- so_invoices — preserves existing "Accountant can void" rule via RESTRICTIVE layering
CREATE POLICY division_scope_select_r ON public.so_invoices AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.so_invoices AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.so_invoices AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.so_invoices AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- so_po_returns
CREATE POLICY division_scope_select_r ON public.so_po_returns AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.so_po_returns AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.so_po_returns AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.so_po_returns AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- warehouse_transfers
CREATE POLICY division_scope_select_r ON public.warehouse_transfers AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.warehouse_transfers AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.warehouse_transfers AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.warehouse_transfers AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));

-- warehouses (division_id NOT NULL)
CREATE POLICY division_scope_select_r ON public.warehouses AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.warehouses AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.warehouses AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));
CREATE POLICY division_scope_delete_r ON public.warehouses AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


-- =============================================================================
-- 2. Child tables via EXISTS-subquery on parent (money / customer data leaks)
-- =============================================================================

-- bill_line_items → bills.division_id
CREATE POLICY division_scope_select_r ON public.bill_line_items AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_line_items.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_insert_r ON public.bill_line_items AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_line_items.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_update_r ON public.bill_line_items AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_line_items.bill_id AND public.is_division_visible(b.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_line_items.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_delete_r ON public.bill_line_items AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_line_items.bill_id AND public.is_division_visible(b.division_id)));

-- invoice_line_items → so_invoices.division_id
CREATE POLICY division_scope_select_r ON public.invoice_line_items AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_insert_r ON public.invoice_line_items AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_update_r ON public.invoice_line_items AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_division_visible(i.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_delete_r ON public.invoice_line_items AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_division_visible(i.division_id)));

-- po_line_items → purchase_orders.division_id
CREATE POLICY division_scope_select_r ON public.po_line_items AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_line_items.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_insert_r ON public.po_line_items AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_line_items.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_update_r ON public.po_line_items AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_line_items.po_id AND public.is_division_visible(po.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_line_items.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_delete_r ON public.po_line_items AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_line_items.po_id AND public.is_division_visible(po.division_id)));

-- sale_order_lines → sale_orders.division_id
CREATE POLICY division_scope_select_r ON public.sale_order_lines AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_order_lines.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_insert_r ON public.sale_order_lines AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_order_lines.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_update_r ON public.sale_order_lines AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_order_lines.sale_order_id AND public.is_division_visible(so.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_order_lines.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_delete_r ON public.sale_order_lines AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_order_lines.sale_order_id AND public.is_division_visible(so.division_id)));

-- return_lines → so_po_returns.division_id
CREATE POLICY division_scope_select_r ON public.return_lines AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.so_po_returns r WHERE r.id = return_lines.return_id AND public.is_division_visible(r.division_id)));
CREATE POLICY division_scope_insert_r ON public.return_lines AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.so_po_returns r WHERE r.id = return_lines.return_id AND public.is_division_visible(r.division_id)));
CREATE POLICY division_scope_update_r ON public.return_lines AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.so_po_returns r WHERE r.id = return_lines.return_id AND public.is_division_visible(r.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.so_po_returns r WHERE r.id = return_lines.return_id AND public.is_division_visible(r.division_id)));
CREATE POLICY division_scope_delete_r ON public.return_lines AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.so_po_returns r WHERE r.id = return_lines.return_id AND public.is_division_visible(r.division_id)));

-- payments → four valid parent shapes:
--   bill_id (AP dual pointer) OR invoice_id (AR dual pointer)
--   OR source_type='purchase_order' + source_id → purchase_orders
--   OR source_type='sale_order'     + source_id → sale_orders
-- Orphan payments (no parent match) become invisible — intentional, they shouldn't exist.
CREATE POLICY division_scope_select_r ON public.payments AS RESTRICTIVE FOR SELECT USING (
     (payments.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills           b  WHERE b.id  = payments.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payments.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices     i  WHERE i.id  = payments.invoice_id AND public.is_division_visible(i.division_id)))
  OR (payments.source_type = 'purchase_order' AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = payments.source_id AND public.is_division_visible(po.division_id)))
  OR (payments.source_type = 'sale_order'     AND EXISTS (SELECT 1 FROM public.sale_orders     so WHERE so.id = payments.source_id AND public.is_division_visible(so.division_id)))
);
CREATE POLICY division_scope_insert_r ON public.payments AS RESTRICTIVE FOR INSERT WITH CHECK (
     (payments.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills           b  WHERE b.id  = payments.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payments.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices     i  WHERE i.id  = payments.invoice_id AND public.is_division_visible(i.division_id)))
  OR (payments.source_type = 'purchase_order' AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = payments.source_id AND public.is_division_visible(po.division_id)))
  OR (payments.source_type = 'sale_order'     AND EXISTS (SELECT 1 FROM public.sale_orders     so WHERE so.id = payments.source_id AND public.is_division_visible(so.division_id)))
);
CREATE POLICY division_scope_update_r ON public.payments AS RESTRICTIVE FOR UPDATE USING (
     (payments.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills           b  WHERE b.id  = payments.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payments.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices     i  WHERE i.id  = payments.invoice_id AND public.is_division_visible(i.division_id)))
  OR (payments.source_type = 'purchase_order' AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = payments.source_id AND public.is_division_visible(po.division_id)))
  OR (payments.source_type = 'sale_order'     AND EXISTS (SELECT 1 FROM public.sale_orders     so WHERE so.id = payments.source_id AND public.is_division_visible(so.division_id)))
) WITH CHECK (
     (payments.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills           b  WHERE b.id  = payments.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payments.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices     i  WHERE i.id  = payments.invoice_id AND public.is_division_visible(i.division_id)))
  OR (payments.source_type = 'purchase_order' AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = payments.source_id AND public.is_division_visible(po.division_id)))
  OR (payments.source_type = 'sale_order'     AND EXISTS (SELECT 1 FROM public.sale_orders     so WHERE so.id = payments.source_id AND public.is_division_visible(so.division_id)))
);
CREATE POLICY division_scope_delete_r ON public.payments AS RESTRICTIVE FOR DELETE USING (
     (payments.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills           b  WHERE b.id  = payments.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payments.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices     i  WHERE i.id  = payments.invoice_id AND public.is_division_visible(i.division_id)))
  OR (payments.source_type = 'purchase_order' AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = payments.source_id AND public.is_division_visible(po.division_id)))
  OR (payments.source_type = 'sale_order'     AND EXISTS (SELECT 1 FROM public.sale_orders     so WHERE so.id = payments.source_id AND public.is_division_visible(so.division_id)))
);

-- payment_plans → dual parent (bill_id OR invoice_id)
CREATE POLICY division_scope_select_r ON public.payment_plans AS RESTRICTIVE FOR SELECT USING (
  (payment_plans.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills       b WHERE b.id = payment_plans.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payment_plans.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = payment_plans.invoice_id AND public.is_division_visible(i.division_id)))
);
CREATE POLICY division_scope_insert_r ON public.payment_plans AS RESTRICTIVE FOR INSERT WITH CHECK (
  (payment_plans.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills       b WHERE b.id = payment_plans.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payment_plans.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = payment_plans.invoice_id AND public.is_division_visible(i.division_id)))
);
CREATE POLICY division_scope_update_r ON public.payment_plans AS RESTRICTIVE FOR UPDATE USING (
  (payment_plans.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills       b WHERE b.id = payment_plans.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payment_plans.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = payment_plans.invoice_id AND public.is_division_visible(i.division_id)))
) WITH CHECK (
  (payment_plans.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills       b WHERE b.id = payment_plans.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payment_plans.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = payment_plans.invoice_id AND public.is_division_visible(i.division_id)))
);
CREATE POLICY division_scope_delete_r ON public.payment_plans AS RESTRICTIVE FOR DELETE USING (
  (payment_plans.bill_id    IS NOT NULL AND EXISTS (SELECT 1 FROM public.bills       b WHERE b.id = payment_plans.bill_id    AND public.is_division_visible(b.division_id)))
  OR (payment_plans.invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = payment_plans.invoice_id AND public.is_division_visible(i.division_id)))
);

-- payment_bill_allocations → bills.division_id
CREATE POLICY division_scope_select_r ON public.payment_bill_allocations AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = payment_bill_allocations.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_insert_r ON public.payment_bill_allocations AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = payment_bill_allocations.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_update_r ON public.payment_bill_allocations AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = payment_bill_allocations.bill_id AND public.is_division_visible(b.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = payment_bill_allocations.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_delete_r ON public.payment_bill_allocations AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = payment_bill_allocations.bill_id AND public.is_division_visible(b.division_id)));

-- credit_notes → so_invoices.division_id (primary parent; source_return_id is secondary)
CREATE POLICY division_scope_select_r ON public.credit_notes AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = credit_notes.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_insert_r ON public.credit_notes AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = credit_notes.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_update_r ON public.credit_notes AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = credit_notes.invoice_id AND public.is_division_visible(i.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = credit_notes.invoice_id AND public.is_division_visible(i.division_id)));
CREATE POLICY division_scope_delete_r ON public.credit_notes AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.so_invoices i WHERE i.id = credit_notes.invoice_id AND public.is_division_visible(i.division_id)));

-- debit_notes → bills.division_id (primary parent)
CREATE POLICY division_scope_select_r ON public.debit_notes AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = debit_notes.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_insert_r ON public.debit_notes AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = debit_notes.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_update_r ON public.debit_notes AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = debit_notes.bill_id AND public.is_division_visible(b.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = debit_notes.bill_id AND public.is_division_visible(b.division_id)));
CREATE POLICY division_scope_delete_r ON public.debit_notes AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = debit_notes.bill_id AND public.is_division_visible(b.division_id)));

-- sale_deliveries → sale_orders.division_id (primary parent; return_id and warehouse_id secondary)
CREATE POLICY division_scope_select_r ON public.sale_deliveries AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_deliveries.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_insert_r ON public.sale_deliveries AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_deliveries.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_update_r ON public.sale_deliveries AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_deliveries.sale_order_id AND public.is_division_visible(so.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_deliveries.sale_order_id AND public.is_division_visible(so.division_id)));
CREATE POLICY division_scope_delete_r ON public.sale_deliveries AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.sale_orders so WHERE so.id = sale_deliveries.sale_order_id AND public.is_division_visible(so.division_id)));

-- stock_adjustments → warehouses.division_id
CREATE POLICY division_scope_select_r ON public.stock_adjustments AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = stock_adjustments.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_insert_r ON public.stock_adjustments AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = stock_adjustments.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_update_r ON public.stock_adjustments AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = stock_adjustments.warehouse_id AND public.is_division_visible(w.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = stock_adjustments.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_delete_r ON public.stock_adjustments AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = stock_adjustments.warehouse_id AND public.is_division_visible(w.division_id)));

-- warehouse_transfer_items → warehouse_transfers.division_id
CREATE POLICY division_scope_select_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = warehouse_transfer_items.transfer_id AND public.is_division_visible(t.division_id)));
CREATE POLICY division_scope_insert_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = warehouse_transfer_items.transfer_id AND public.is_division_visible(t.division_id)));
CREATE POLICY division_scope_update_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = warehouse_transfer_items.transfer_id AND public.is_division_visible(t.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = warehouse_transfer_items.transfer_id AND public.is_division_visible(t.division_id)));
CREATE POLICY division_scope_delete_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = warehouse_transfer_items.transfer_id AND public.is_division_visible(t.division_id)));

-- shipments → purchase_orders.division_id (primary parent; receival_id secondary)
CREATE POLICY division_scope_select_r ON public.shipments AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = shipments.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_insert_r ON public.shipments AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = shipments.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_update_r ON public.shipments AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = shipments.po_id AND public.is_division_visible(po.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = shipments.po_id AND public.is_division_visible(po.division_id)));
CREATE POLICY division_scope_delete_r ON public.shipments AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = shipments.po_id AND public.is_division_visible(po.division_id)));

-- warehouse_stock_allocations → warehouses.division_id
CREATE POLICY division_scope_select_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_stock_allocations.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_insert_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_stock_allocations.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_update_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR UPDATE USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_stock_allocations.warehouse_id AND public.is_division_visible(w.division_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_stock_allocations.warehouse_id AND public.is_division_visible(w.division_id)));
CREATE POLICY division_scope_delete_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR DELETE USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_stock_allocations.warehouse_id AND public.is_division_visible(w.division_id)));
