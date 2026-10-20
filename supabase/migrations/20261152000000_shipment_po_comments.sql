-- 20261152000000_shipment_po_comments.sql
-- Per-PO comment log on a shipment. Each row is ONE card (text + who + when) shown
-- under its PO in the shipment detail dialog and printed on the Shipment Report PDF,
-- so whoever receives the PDF sees what's going on with that PO. Append-only log;
-- the author may delete their own card.
--
-- Access reuses the recursion-safe is_shipment_visible() helper (migration 20261065)
-- — the same gate shipment_line_items / shipment_schedule_revisions use — so a
-- comment is readable/addable by anyone who can see the shipment, with no new
-- division logic. DELETE is author-only (created_by = auth.uid()) so a card can be
-- retracted by the person who wrote it, never by someone else.
-- created_by_name is denormalised (like shipments.events[].by) so the pure,
-- DB-less PDF builder can print the author without a user_data join.
BEGIN;

CREATE TABLE IF NOT EXISTS public.shipment_po_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_by uuid DEFAULT auth.uid(),  -- no FK: this project links profiles via user_data.auth_user_id, not id
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipment_po_comments_ship_po
  ON public.shipment_po_comments(shipment_id, po_id, created_at);

ALTER TABLE public.shipment_po_comments ENABLE ROW LEVEL SECURITY;

-- Readable + addable by anyone who can see the shipment; deletable only by the author.
CREATE POLICY spc_select ON public.shipment_po_comments
  FOR SELECT TO authenticated
  USING (public.is_shipment_visible(shipment_id));
CREATE POLICY spc_insert ON public.shipment_po_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_shipment_visible(shipment_id) AND created_by = auth.uid());
CREATE POLICY spc_delete ON public.shipment_po_comments
  FOR DELETE TO authenticated
  USING (public.is_shipment_visible(shipment_id) AND created_by = auth.uid());

REVOKE ALL ON public.shipment_po_comments FROM anon;
GRANT SELECT, INSERT, DELETE ON public.shipment_po_comments TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
