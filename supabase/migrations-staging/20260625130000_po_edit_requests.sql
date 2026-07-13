-- Phase D — edit request workflow. A non-Owner user files a request to
-- amend an approved/pending PO; any approval-slot role holder approves;
-- once approved, anyone with purchase access can submit ONE amendment,
-- which consumes the unlock.

CREATE TABLE public.po_edit_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES public.profiles(id),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'used')),
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,
  review_comment  text,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX po_edit_requests_po_idx
  ON public.po_edit_requests(po_id);

CREATE INDEX po_edit_requests_pending_idx
  ON public.po_edit_requests(po_id) WHERE status = 'pending';

-- At most one approved-unused request per PO at a time.
CREATE UNIQUE INDEX po_edit_requests_one_approved_per_po
  ON public.po_edit_requests(po_id) WHERE status = 'approved';

ALTER TABLE public.po_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_edit_requests_select
  ON public.po_edit_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY po_edit_requests_insert
  ON public.po_edit_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid()))
  );

CREATE POLICY po_edit_requests_update
  ON public.po_edit_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_custom_roles ucr
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      JOIN public.profiles p ON p.id = ucr.profile_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND cr.is_approval_slot = true
        AND cr.deleted_at IS NULL
    )
  );
