-- Inventory Check → Stock Adjustment auto-generation (Option B, two-stage)
--
-- After a check clears its own approval chain, we no longer mutate FIFO or
-- write stock movements directly. Instead, each non-zero-variance line
-- becomes its own Stock Adjustment (pending_approval), joins the SA
-- approval chain, and only mutates stock on its own final approval.
--
-- Rationale: keeps the "no stock moves without an approved SA" invariant.
-- Every physical adjustment ends up as an auditable SA regardless of
-- whether it was raised manually or generated from a check.
--
-- Rejection behaviour (design decision B): rejecting an auto-generated
-- SA does NOT reopen the parent check. Only that SA gets the "retry"
-- treatment — the requester can edit qty/type and resubmit through the
-- normal SA flow. Other SAs from the same check are untouched.
--
-- Backfill: existing checks that were already approved under the old
-- direct-mutation path stay as they are — no historical rewrite.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trace fields on stock_adjustments
-- ---------------------------------------------------------------------------

ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS source_check_id      uuid REFERENCES public.inventory_checks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_check_item_id uuid REFERENCES public.inventory_check_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_adjustments_source_check_id_idx
  ON public.stock_adjustments(source_check_id)
  WHERE source_check_id IS NOT NULL;

COMMENT ON COLUMN public.stock_adjustments.source_check_id IS
  'When set, this SA was auto-generated from that inventory check on its final approval. NULL for manually-raised SAs.';
COMMENT ON COLUMN public.stock_adjustments.source_check_item_id IS
  'The specific check line whose variance this SA covers. Used to link back and to compute the reconciled qty.';

-- ---------------------------------------------------------------------------
-- 2. Rewrite apply_inventory_check_adjustments — no more direct stock mutation
-- ---------------------------------------------------------------------------
--
-- Called from useApproveCheckStep (client) once the check's own approval
-- chain finalises as 'approved'. Previously: mutated FIFO layers directly.
-- Now: freezes system_qty_at_close, then generates one pending_approval
-- SA per non-zero variance line + builds each SA's approval chain from
-- approval_workflow_steps (workflow='stock_adj').

CREATE OR REPLACE FUNCTION public.apply_inventory_check_adjustments(p_check_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_check          RECORD;
  v_item           RECORD;
  v_variance       NUMERIC;
  v_adj_type       text;
  v_adj_qty        NUMERIC;
  v_check_number   text;
  v_approver_id    uuid;
  v_approver_name  text;
  v_new_adj_id     uuid;
  v_step           RECORD;
  v_ord            INT;
BEGIN
  -- ── Lock and validate the check ────────────────────────────────────────────
  SELECT id, warehouse_id, status, check_number
  INTO v_check
  FROM inventory_checks
  WHERE id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  v_check_number := v_check.check_number;

  -- ── Freeze system_qty_at_close (still needed for the audit trail) ─────────
  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  -- ── Pick the check's final approver as the SA requester ──────────────────
  -- (whoever approved the last step of the check chain — most accurate
  --  human to attribute the generated SAs to)
  SELECT profile_id, profile_name
  INTO v_approver_id, v_approver_name
  FROM inventory_check_approvals
  WHERE check_id = p_check_id
    AND status = 'approved'
  ORDER BY step_order DESC
  LIMIT 1;

  v_approver_name := COALESCE(v_approver_name, 'System (check ' || v_check_number || ')');

  -- ── Generate one SA per non-zero variance line ────────────────────────────
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty,
           variance, variance_type
    FROM inventory_check_items
    WHERE check_id = p_check_id
      AND is_counted = true
      AND variance IS NOT NULL
      AND variance <> 0
  LOOP
    v_variance := v_item.variance;
    v_adj_qty  := ABS(v_variance);

    -- Map variance → SA adjustment_type
    --   positive variance (found extra)   → increase
    --   negative + variance_type='damage' → damage
    --   negative + variance_type='write_off' → write_off
    --   negative otherwise                → decrease
    IF v_variance > 0 THEN
      v_adj_type := 'increase';
    ELSIF v_item.variance_type IN ('damage', 'write_off') THEN
      v_adj_type := v_item.variance_type;
    ELSE
      v_adj_type := 'decrease';
    END IF;

    -- Insert the SA row (pending approval)
    INSERT INTO public.stock_adjustments (
      warehouse_id, brand_variant_id, adjustment_type, qty,
      reason, notes, photo_urls, status,
      requested_by, requested_by_name, created_by,
      source_check_id, source_check_item_id
    ) VALUES (
      v_check.warehouse_id,
      v_item.brand_variant_id,
      v_adj_type::public.stock_adjustment_type,
      v_adj_qty,
      'Auto-generated from inventory check ' || v_check_number,
      'Counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
        || ' (variance ' || v_variance || ')',
      '{}'::text[],
      'pending_approval',
      v_approver_id,
      v_approver_name,
      v_approver_id,
      p_check_id,
      v_item.id
    )
    RETURNING id INTO v_new_adj_id;

    -- Build the SA's approval chain from approval_workflow_steps
    v_ord := 0;
    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   approval_workflow_steps
      WHERE  workflow = 'stock_adj'
        AND  is_active = true
        AND  archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT (v_adj_type = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;

      v_ord := v_ord + 1;
      INSERT INTO stock_adjustment_approvals (
        adjustment_id, step_order, step_role, step_label
      ) VALUES (
        v_new_adj_id, v_ord, v_step.step_key, v_step.step_label
      );
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow — cannot auto-generate SA from check %', v_check_number;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
