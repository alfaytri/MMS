-- Allow authenticated users to delete sale_order_lines.
-- The useUpdateSO hook does delete + reinsert when editing quotation-status SOs.
-- Without this policy, the delete silently removed 0 rows (RLS block) and the
-- insert created duplicate line items.
CREATE POLICY "Authenticated can delete sale_order_lines"
  ON public.sale_order_lines
  FOR DELETE
  TO authenticated
  USING (true);
