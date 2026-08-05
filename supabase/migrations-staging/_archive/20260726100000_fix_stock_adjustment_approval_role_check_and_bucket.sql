-- Fix two runtime bugs that surfaced when submitting a Stock Adjustment:
--
-- 1) stock_adjustment_approvals_role_chk hardcoded a 5-value whitelist
--    (accounting_manager, inventory_manager, responsible_person,
--     brand_manager, owner). But the flexible role system + workflow
--    admin (ApprovalChainConfig / add_workflow_step) lets orgs seed any
--    role slug (admin, purchase_manager, accountant, custom roles …).
--    The chain-builder in create_stock_adjustment_v2 copies step_key
--    directly into stock_adjustment_approvals.step_role, so any role
--    outside the hardcoded five throws:
--       new row for relation "stock_adjustment_approvals" violates
--       check constraint "stock_adjustment_approvals_role_chk"
--    The workflow_steps table is the source of truth for valid roles;
--    the standalone whitelist has drifted and must go.
--
-- 2) Storage bucket "adjustment-photos" (referenced by WhAdjustmentDialog
--    for photo uploads) doesn't exist on staging, causing "Bucket not
--    found" on any Stock Adjustment with attached photos. Create it as
--    a private bucket — the app uses signed URLs, so it must not be
--    public.

BEGIN;

-- ── 1. Drop the stale role whitelist ────────────────────────────────────────

ALTER TABLE public.stock_adjustment_approvals
  DROP CONSTRAINT IF EXISTS stock_adjustment_approvals_role_chk;

-- ── 2. Ensure the adjustment-photos bucket exists ───────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('adjustment-photos', 'adjustment-photos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: any authenticated user can upload/read their own adjustment photos.
-- Signed URLs are minted server-side, so read-through the bucket only needs
-- authenticated access.
DO $$ BEGIN
  CREATE POLICY "authenticated can upload adjustment-photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'adjustment-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated can read adjustment-photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'adjustment-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
