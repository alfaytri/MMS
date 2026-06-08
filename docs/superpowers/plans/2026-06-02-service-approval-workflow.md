# Service Approval Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-owner users propose service changes (add, edit name/price, delete, toggle status) that go to an owner for review. Owners see a dedicated approval page and approve/reject with mandatory reasons.

**Architecture:** Single SECURITY DEFINER Postgres RPC (`submit_service_change`) routes all service mutations — checks caller permissions and either applies directly (approver) or creates a `service_change_requests` row (non-approver). Trigger-managed boolean `has_pending_change` on `services` prevents concurrent proposals. Approval/reject RPCs handle stale-data checks and safety validations.

**Tech Stack:** Supabase (Postgres RPCs, RLS, triggers), React Query mutations, shadcn/ui components, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-06-02-service-approval-workflow-design.md`

---

## File Structure

**Create:**
| File | Purpose |
|---|---|
| `supabase/migrations/20260602000001_service_approval_schema.sql` | Enums, table, column, indexes, constraints, triggers, RLS |
| `supabase/migrations/20260602000002_service_approval_rpcs.sql` | All SECURITY DEFINER RPC functions |
| `src/hooks/useServiceChangeRequests.ts` | All React Query hooks for change requests |
| `src/components/services/ServiceChangeHistoryDialog.tsx` | Change history dialog (info icon) |
| `src/app/(dashboard)/master-data/services/approvals/page.tsx` | Dedicated approval page |

**Modify:**
| File | Change |
|---|---|
| `src/lib/permissions.ts` | Add `master_data.services.approve` permission |
| `src/components/services/ServiceEditDialog.tsx` | Route submit through RPC, handle pending response |
| `src/components/services/ServiceTreeRow.tsx` | Add info icon, route archive through RPC, pending badge |
| `src/app/(dashboard)/master-data/services/page.tsx` | Add pending indicators, link to approvals tab |

---

## Task 1: Database Migration — Schema & Triggers

**Files:**
- Create: `supabase/migrations/20260602000001_service_approval_schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- =============================================================
-- Service Approval Workflow — Schema, Triggers, RLS
-- =============================================================

-- 1. Enums
CREATE TYPE service_change_type AS ENUM ('add', 'edit', 'delete');
CREATE TYPE service_change_status AS ENUM ('pending', 'approved', 'rejected');

-- 2. Table
CREATE TABLE service_change_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID REFERENCES services(id),
  division         TEXT[],
  change_type      service_change_type NOT NULL,
  changes          JSONB NOT NULL,
  status           service_change_status NOT NULL DEFAULT 'pending',
  requested_by     UUID NOT NULL REFERENCES profiles(id),
  reviewed_by      UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT scr_rejection_reason_required
    CHECK (status != 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT scr_add_no_service_id
    CHECK (change_type != 'add' OR service_id IS NULL),
  CONSTRAINT scr_edit_delete_require_service_id
    CHECK (change_type = 'add' OR service_id IS NOT NULL)
);

-- 3. Indexes
CREATE INDEX idx_scr_service_id_status ON service_change_requests(service_id, status);
CREATE INDEX idx_scr_status ON service_change_requests(status);
CREATE INDEX idx_scr_requested_by ON service_change_requests(requested_by);
CREATE INDEX idx_scr_division_status ON service_change_requests USING GIN (division) WHERE status = 'pending';

-- 4. Add pending flag to services (trigger-managed only)
ALTER TABLE services ADD COLUMN IF NOT EXISTS has_pending_change BOOLEAN NOT NULL DEFAULT false;

-- 5. Trigger: keep has_pending_change in sync
CREATE OR REPLACE FUNCTION sync_service_pending_lock()
RETURNS TRIGGER AS $$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_change_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_service_pending
AFTER INSERT OR UPDATE OF status OR DELETE ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION sync_service_pending_lock();

-- 6. Trigger: auto-reject pending when service soft-deleted
CREATE OR REPLACE FUNCTION auto_reject_pending_on_service_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_change_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now(),
        updated_at = now()
    WHERE service_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reject_on_service_delete
AFTER UPDATE OF deleted_at ON services
FOR EACH ROW EXECUTE FUNCTION auto_reject_pending_on_service_delete();

-- 7. RLS
ALTER TABLE service_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY scr_select ON service_change_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = auth.uid()
      AND cr.deleted_at IS NULL
      AND (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
  )
);

CREATE POLICY scr_no_direct_insert ON service_change_requests FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY scr_no_direct_update ON service_change_requests FOR UPDATE TO authenticated
USING (false);

CREATE POLICY scr_no_direct_delete ON service_change_requests FOR DELETE TO authenticated
USING (false);

-- 8. Updated_at trigger
CREATE TRIGGER trg_scr_updated_at
BEFORE UPDATE ON service_change_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

Expected: Migration applies successfully. Verify with: `npx supabase db push --dry-run` returns "Remote database is up to date."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602000001_service_approval_schema.sql
git commit -m "feat(db): service approval workflow schema, triggers, and RLS"
```

---

## Task 2: Database Migration — RPC Functions

**Files:**
- Create: `supabase/migrations/20260602000002_service_approval_rpcs.sql`

- [ ] **Step 1: Write the RPC migration**

```sql
-- =============================================================
-- Service Approval Workflow — RPC Functions
-- =============================================================

-- Helper: check if user has a specific permission
CREATE OR REPLACE FUNCTION _user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE ucr.profile_id = p_user_id
      AND (cr.is_system = true OR p_permission = ANY(cr.permissions))
  );
$$;

-- =============================================================
-- 1. submit_service_change
-- =============================================================
CREATE OR REPLACE FUNCTION submit_service_change(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_has_approve BOOLEAN;
  v_has_manage BOOLEAN;
  v_service_id UUID;
  v_change_type service_change_type;
  v_changes JSONB;
  v_division TEXT[];
  v_tree_type TEXT;
  v_parent_id UUID;
  v_has_pending BOOLEAN;
  v_new_id UUID;
  v_needs_approval BOOLEAN := false;
  v_key TEXT;
  v_approval_fields TEXT[] := ARRAY['name_en', 'name_ar', 'price', 'emergency_price', 'status'];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_has_approve := _user_has_permission(v_user_id, 'master_data.services.approve');
  v_has_manage := _user_has_permission(v_user_id, 'master_data.services.manage');

  IF NOT v_has_manage THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.manage required';
  END IF;

  v_service_id := (p_payload->>'service_id')::UUID;
  v_change_type := (p_payload->>'change_type')::service_change_type;
  v_changes := p_payload->'changes';
  v_tree_type := p_payload->>'tree_type';
  v_parent_id := (p_payload->>'parent_id')::UUID;

  -- Parse division array from JSONB
  SELECT COALESCE(array_agg(elem::TEXT), '{}')
  INTO v_division
  FROM jsonb_array_elements_text(p_payload->'division') AS elem;

  -- Determine if approval is needed
  IF v_change_type IN ('add', 'delete') THEN
    v_needs_approval := true;
  ELSIF v_change_type = 'edit' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
      IF v_key = ANY(v_approval_fields) THEN
        v_needs_approval := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- ===== DIRECT APPLY PATH =====
  IF v_has_approve OR NOT v_needs_approval THEN
    CASE v_change_type
      WHEN 'add' THEN
        v_new_id := gen_random_uuid();
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code, legacy_service_id,
          price, emergency_price, discount, price_unit,
          duration, warranty, status, category, service_type, contract_type,
          invoice_text_en, invoice_text_ar, photo_requirement,
          catalog_image_url, brands_supported, includes_notes,
          spare_parts, qc_checklist, instructions, reminder_days,
          booking_time_matrix, inventory_items, components, qc_items
        ) VALUES (
          v_new_id, v_parent_id, v_tree_type, 0, v_division,
          v_changes->'name_en'->>'new',
          v_changes->'name_ar'->>'new',
          v_changes->'code'->>'new',
          v_changes->'legacy_service_id'->>'new',
          (v_changes->'price'->>'new')::NUMERIC,
          (v_changes->'emergency_price'->>'new')::NUMERIC,
          (v_changes->'discount'->>'new')::NUMERIC,
          v_changes->'price_unit'->>'new',
          (v_changes->'duration'->>'new')::INT,
          (v_changes->'warranty'->>'new')::INT,
          COALESCE(v_changes->'status'->>'new', 'active')::service_status,
          (v_changes->'category'->>'new')::service_category,
          (v_changes->'service_type'->>'new')::service_type,
          (v_changes->'contract_type'->>'new')::contract_type,
          v_changes->'invoice_text_en'->>'new',
          v_changes->'invoice_text_ar'->>'new',
          v_changes->'photo_requirement'->>'new',
          v_changes->'catalog_image_url'->>'new',
          COALESCE((v_changes->'brands_supported'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'includes_notes'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'spare_parts'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'qc_checklist'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'instructions'->>'new')::BOOLEAN, false),
          (v_changes->'reminder_days'->>'new')::INT,
          CASE WHEN v_changes ? 'booking_time_matrix' THEN v_changes->'booking_time_matrix'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'inventory_items' THEN v_changes->'inventory_items'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'components' THEN v_changes->'components'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'qc_items' THEN v_changes->'qc_items'->'new' ELSE NULL END
        );
        v_service_id := v_new_id;

      WHEN 'edit' THEN
        UPDATE services SET
          name_en = CASE WHEN v_changes ? 'name_en' THEN v_changes->'name_en'->>'new' ELSE name_en END,
          name_ar = CASE WHEN v_changes ? 'name_ar' THEN v_changes->'name_ar'->>'new' ELSE name_ar END,
          code = CASE WHEN v_changes ? 'code' THEN v_changes->'code'->>'new' ELSE code END,
          legacy_service_id = CASE WHEN v_changes ? 'legacy_service_id' THEN v_changes->'legacy_service_id'->>'new' ELSE legacy_service_id END,
          price = CASE WHEN v_changes ? 'price' THEN (v_changes->'price'->>'new')::NUMERIC ELSE price END,
          emergency_price = CASE WHEN v_changes ? 'emergency_price' THEN (v_changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price END,
          discount = CASE WHEN v_changes ? 'discount' THEN (v_changes->'discount'->>'new')::NUMERIC ELSE discount END,
          price_unit = CASE WHEN v_changes ? 'price_unit' THEN v_changes->'price_unit'->>'new' ELSE price_unit END,
          duration = CASE WHEN v_changes ? 'duration' THEN (v_changes->'duration'->>'new')::INT ELSE duration END,
          warranty = CASE WHEN v_changes ? 'warranty' THEN (v_changes->'warranty'->>'new')::INT ELSE warranty END,
          status = CASE WHEN v_changes ? 'status' THEN (v_changes->'status'->>'new')::service_status ELSE status END,
          service_type = CASE WHEN v_changes ? 'service_type' THEN (v_changes->'service_type'->>'new')::service_type ELSE service_type END,
          invoice_text_en = CASE WHEN v_changes ? 'invoice_text_en' THEN v_changes->'invoice_text_en'->>'new' ELSE invoice_text_en END,
          invoice_text_ar = CASE WHEN v_changes ? 'invoice_text_ar' THEN v_changes->'invoice_text_ar'->>'new' ELSE invoice_text_ar END,
          photo_requirement = CASE WHEN v_changes ? 'photo_requirement' THEN v_changes->'photo_requirement'->>'new' ELSE photo_requirement END,
          catalog_image_url = CASE WHEN v_changes ? 'catalog_image_url' THEN v_changes->'catalog_image_url'->>'new' ELSE catalog_image_url END,
          brands_supported = CASE WHEN v_changes ? 'brands_supported' THEN (v_changes->'brands_supported'->>'new')::BOOLEAN ELSE brands_supported END,
          includes_notes = CASE WHEN v_changes ? 'includes_notes' THEN (v_changes->'includes_notes'->>'new')::BOOLEAN ELSE includes_notes END,
          spare_parts = CASE WHEN v_changes ? 'spare_parts' THEN (v_changes->'spare_parts'->>'new')::BOOLEAN ELSE spare_parts END,
          qc_checklist = CASE WHEN v_changes ? 'qc_checklist' THEN (v_changes->'qc_checklist'->>'new')::BOOLEAN ELSE qc_checklist END,
          instructions = CASE WHEN v_changes ? 'instructions' THEN (v_changes->'instructions'->>'new')::BOOLEAN ELSE instructions END,
          reminder_days = CASE WHEN v_changes ? 'reminder_days' THEN (v_changes->'reminder_days'->>'new')::INT ELSE reminder_days END,
          updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

      WHEN 'delete' THEN
        IF EXISTS (
          SELECT 1 FROM order_services os
          JOIN orders o ON o.id = os.order_id
          WHERE os.service_id = v_service_id
            AND o.status NOT IN ('completed', 'cancelled')
            AND o.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Cannot delete: service has active orders';
        END IF;
        UPDATE services SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;
    END CASE;

    -- Activity log
    INSERT INTO activity_log (action, module, entity_type, entity_id, details)
    VALUES (
      'services/service-' || v_change_type || 'd',
      'services', 'service', v_service_id,
      jsonb_build_object('change_type', v_change_type, 'applied_by', v_user_id)::TEXT
    );

    RETURN jsonb_build_object('action', 'applied', 'id', v_service_id);

  -- ===== CHANGE REQUEST PATH =====
  ELSE
    IF v_service_id IS NOT NULL THEN
      SELECT has_pending_change INTO v_has_pending FROM services WHERE id = v_service_id;
      IF v_has_pending THEN
        RAISE EXCEPTION 'This service already has a pending change awaiting approval';
      END IF;
    END IF;

    INSERT INTO service_change_requests (service_id, division, change_type, changes, requested_by)
    VALUES (v_service_id, v_division, v_change_type, v_changes, v_user_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('action', 'pending', 'id', v_new_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_service_change(JSONB) TO authenticated;

-- =============================================================
-- 2. approve_service_change
-- =============================================================
CREATE OR REPLACE FUNCTION approve_service_change(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req RECORD;
  v_live RECORD;
  v_key TEXT;
  v_old_val TEXT;
  v_live_val TEXT;
  v_new_service_id UUID;
BEGIN
  IF NOT _user_has_permission(v_user_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status != 'pending' THEN RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status; END IF;

  CASE v_req.change_type
    WHEN 'edit' THEN
      -- Stale data check: verify old values still match live data
      SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Service no longer exists'; END IF;

      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
        IF v_old_val IS DISTINCT FROM v_live_val THEN
          RAISE EXCEPTION 'Stale data: "%" has changed since this request (expected "%" but found "%"). Reject this request and ask for a new one.', v_key, v_old_val, v_live_val;
        END IF;
      END LOOP;

      -- Apply changes
      UPDATE services SET
        name_en = CASE WHEN v_req.changes ? 'name_en' THEN v_req.changes->'name_en'->>'new' ELSE name_en END,
        name_ar = CASE WHEN v_req.changes ? 'name_ar' THEN v_req.changes->'name_ar'->>'new' ELSE name_ar END,
        code = CASE WHEN v_req.changes ? 'code' THEN v_req.changes->'code'->>'new' ELSE code END,
        price = CASE WHEN v_req.changes ? 'price' THEN (v_req.changes->'price'->>'new')::NUMERIC ELSE price END,
        emergency_price = CASE WHEN v_req.changes ? 'emergency_price' THEN (v_req.changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price END,
        discount = CASE WHEN v_req.changes ? 'discount' THEN (v_req.changes->'discount'->>'new')::NUMERIC ELSE discount END,
        duration = CASE WHEN v_req.changes ? 'duration' THEN (v_req.changes->'duration'->>'new')::INT ELSE duration END,
        warranty = CASE WHEN v_req.changes ? 'warranty' THEN (v_req.changes->'warranty'->>'new')::INT ELSE warranty END,
        status = CASE WHEN v_req.changes ? 'status' THEN (v_req.changes->'status'->>'new')::service_status ELSE status END,
        invoice_text_en = CASE WHEN v_req.changes ? 'invoice_text_en' THEN v_req.changes->'invoice_text_en'->>'new' ELSE invoice_text_en END,
        invoice_text_ar = CASE WHEN v_req.changes ? 'invoice_text_ar' THEN v_req.changes->'invoice_text_ar'->>'new' ELSE invoice_text_ar END,
        catalog_image_url = CASE WHEN v_req.changes ? 'catalog_image_url' THEN v_req.changes->'catalog_image_url'->>'new' ELSE catalog_image_url END,
        updated_at = now()
      WHERE id = v_req.service_id;

    WHEN 'add' THEN
      v_new_service_id := gen_random_uuid();
      BEGIN
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code,
          price, emergency_price, duration, warranty,
          status, category, service_type, contract_type,
          invoice_text_en, invoice_text_ar, photo_requirement
        ) VALUES (
          v_new_service_id,
          (v_req.changes->'parent_id'->>'new')::UUID,
          v_req.changes->'tree_type'->>'new',
          0, v_req.division,
          v_req.changes->'name_en'->>'new',
          v_req.changes->'name_ar'->>'new',
          v_req.changes->'code'->>'new',
          (v_req.changes->'price'->>'new')::NUMERIC,
          (v_req.changes->'emergency_price'->>'new')::NUMERIC,
          (v_req.changes->'duration'->>'new')::INT,
          (v_req.changes->'warranty'->>'new')::INT,
          COALESCE(v_req.changes->'status'->>'new', 'active')::service_status,
          (v_req.changes->'category'->>'new')::service_category,
          (v_req.changes->'service_type'->>'new')::service_type,
          (v_req.changes->'contract_type'->>'new')::contract_type,
          v_req.changes->'invoice_text_en'->>'new',
          v_req.changes->'invoice_text_ar'->>'new',
          v_req.changes->'photo_requirement'->>'new'
        );
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'A service with this name already exists in this division. Reject this request instead.';
      END;
      -- Link the request to the newly created service
      UPDATE service_change_requests SET service_id = v_new_service_id WHERE id = p_request_id;

    WHEN 'delete' THEN
      -- Safety checks
      IF EXISTS (
        SELECT 1 FROM order_services os
        JOIN orders o ON o.id = os.order_id
        WHERE os.service_id = v_req.service_id
          AND o.status NOT IN ('completed', 'cancelled')
          AND o.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot delete: service has active orders. Reject this request instead.';
      END IF;
      UPDATE services SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
      WHERE id = v_req.service_id;
  END CASE;

  -- Mark approved
  UPDATE service_change_requests
  SET status = 'approved', reviewed_by = v_user_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'service_id', COALESCE(v_new_service_id, v_req.service_id));
END;
$$;

GRANT EXECUTE ON FUNCTION approve_service_change(UUID) TO authenticated;

-- =============================================================
-- 3. reject_service_change
-- =============================================================
CREATE OR REPLACE FUNCTION reject_service_change(p_request_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF NOT _user_has_permission(v_user_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE service_change_requests
  SET status = 'rejected', reviewed_by = v_user_id, reviewed_at = now(),
      rejection_reason = trim(p_reason), updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_service_change(UUID, TEXT) TO authenticated;

-- =============================================================
-- 4. withdraw_service_change
-- =============================================================
CREATE OR REPLACE FUNCTION withdraw_service_change(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_user_id THEN RAISE EXCEPTION 'Only the requester can withdraw'; END IF;
  IF v_req.status != 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  DELETE FROM service_change_requests WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_service_change(UUID) TO authenticated;

-- =============================================================
-- 5. update_pending_service_change
-- =============================================================
CREATE OR REPLACE FUNCTION update_pending_service_change(p_request_id UUID, p_new_changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_user_id THEN RAISE EXCEPTION 'Only the requester can update'; END IF;
  IF v_req.status != 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  UPDATE service_change_requests
  SET changes = p_new_changes, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_pending_service_change(UUID, JSONB) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

Expected: All 5 functions created successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260602000002_service_approval_rpcs.sql
git commit -m "feat(db): service approval workflow RPC functions"
```

---

## Task 3: Permission Definition

**Files:**
- Modify: `src/lib/permissions.ts:46-47`

- [ ] **Step 1: Add the approve permission**

In `src/lib/permissions.ts`, after the existing `master_data.services.manage` entry (line 47), add:

```typescript
{ key: 'master_data.services.approve', label: 'Approve Service Changes', description: 'Review and approve/reject service change requests' },
```

- [ ] **Step 2: Verify in browser**

Navigate to the Roles management page → edit a role → confirm "Approve Service Changes" appears under Master Data permissions.

- [ ] **Step 3: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat(permissions): add master_data.services.approve permission"
```

---

## Task 4: React Hooks for Change Requests

**Files:**
- Create: `src/hooks/useServiceChangeRequests.ts`

- [ ] **Step 1: Write the hooks file**

```typescript
// src/hooks/useServiceChangeRequests.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ServiceChangeRequest = {
  id: string
  service_id: string | null
  division: string[]
  change_type: 'add' | 'edit' | 'delete'
  changes: Record<string, { old: unknown; new: unknown }>
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string
  reviewed_by: string | null
  rejection_reason: string | null
  requested_at: string
  reviewed_at: string | null
  created_at: string
  updated_at: string
  // Joined fields
  requester?: { full_name: string; avatar_url: string | null }
  reviewer?: { full_name: string; avatar_url: string | null }
  service?: { name_en: string; name_ar: string | null }
}

export function useServiceChangeRequests(filters?: {
  status?: string
  division?: string
}) {
  return useQuery({
    queryKey: ['service-change-requests', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url),
          reviewer:profiles!service_change_requests_reviewed_by_fkey(full_name, avatar_url),
          service:services!service_change_requests_service_id_fkey(name_en, name_ar)
        `)
        .order('requested_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.division) {
        query = query.contains('division', [filters.division])
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 30 * 1000,
  })
}

export function useServiceChangeHistory(serviceId: string | null) {
  return useQuery({
    queryKey: ['service-change-history', serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url),
          reviewer:profiles!service_change_requests_reviewed_by_fkey(full_name, avatar_url)
        `)
        .eq('service_id', serviceId)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 60 * 1000,
  })
}

export function usePendingAddRequests() {
  return useQuery({
    queryKey: ['service-change-requests', 'pending-adds'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url)
        `)
        .eq('change_type', 'add')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 30 * 1000,
  })
}

export function useSubmitServiceChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      service_id?: string | null
      change_type: 'add' | 'edit' | 'delete'
      changes: Record<string, { old: unknown; new: unknown }>
      division: string[]
      tree_type: string
      parent_id: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('submit_service_change', {
        p_payload: payload,
      })
      if (error) throw error
      return data as { action: 'applied' | 'pending'; id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-requests'] })
    },
  })
}

export function useApproveChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('approve_service_change', {
        p_request_id: requestId,
      })
      if (error) throw error
      return data as { ok: boolean; service_id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-history'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useRejectChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('reject_service_change', {
        p_request_id: requestId,
        p_reason: reason,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-history'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useWithdrawChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('withdraw_service_change', {
        p_request_id: requestId,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-history'] })
    },
  })
}

export function useUpdatePendingChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, changes }: {
      requestId: string
      changes: Record<string, { old: unknown; new: unknown }>
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('update_pending_service_change', {
        p_request_id: requestId,
        p_new_changes: changes,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-change-requests'] })
      queryClient.invalidateQueries({ queryKey: ['service-change-history'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useServiceChangeRequests.ts
git commit -m "feat(hooks): service change request hooks"
```

---

## Task 5: ServiceEditDialog — Route Through RPC

**Files:**
- Modify: `src/components/services/ServiceEditDialog.tsx`

- [ ] **Step 1: Update imports**

Add at the top of ServiceEditDialog.tsx:

```typescript
import { useSubmitServiceChange } from '@/hooks/useServiceChangeRequests'
import { useHasPermission } from '@/hooks/usePermissions'
```

- [ ] **Step 2: Add hooks inside the component**

After the existing `createService` and `updateService` hooks (lines 55-56), add:

```typescript
const submitChange = useSubmitServiceChange()
const canApprove = useHasPermission('master_data.services.approve')
```

- [ ] **Step 3: Add helper to build unified diff**

Add this function inside the component, before `onSubmit`:

```typescript
function buildChangesDiff(
  payload: Record<string, unknown>,
  existing: Service | null,
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const [key, newVal] of Object.entries(payload)) {
    if (key === 'treeType' || key === 'id' || key === 'sort_order') continue
    const oldVal = existing ? (existing as Record<string, unknown>)[key] ?? null : null
    diff[key] = { old: oldVal, new: newVal }
  }
  return diff
}
```

- [ ] **Step 4: Replace the onSubmit function**

Replace the entire `onSubmit` function (lines 109-173) with:

```typescript
async function onSubmit(values: ServiceFormValues) {
  try {
    const supabase = createClient()
    const serviceId = mode === 'edit' && node ? node.id : crypto.randomUUID()

    let catalogImageUrl: string | undefined
    if (pendingFile) {
      const ext = pendingFile.name.split('.').pop() ?? 'jpg'
      const path = `catalog/${serviceId}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('service-photos')
        .upload(path, pendingFile, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage
        .from('service-photos')
        .getPublicUrl(path)
      catalogImageUrl = publicUrl
    }

    const payload: Record<string, unknown> = {
      name_en: values.name_en,
      name_ar: values.name_ar || null,
      code: values.code || null,
      legacy_service_id: values.legacy_service_id || null,
      status: values.status,
      division: values.division,
      parent_id: values.parent_id,
      tree_type: type,
      price: values.price,
      emergency_price: type !== 'contract' ? values.emergency_price : null,
      discount: type === 'contract' ? values.discount : null,
      price_unit: values.contract_type === 'area' ? values.price_unit : null,
      contract_type: type === 'contract' ? values.contract_type : null,
      duration: values.duration,
      warranty: values.warranty,
      invoice_text_en: type !== 'contract' ? values.invoice_text_en || null : null,
      invoice_text_ar: type !== 'contract' ? values.invoice_text_ar || null : null,
      photo_requirement: type !== 'contract' ? values.photo_requirement : null,
      instructions: false,
      reminder_days: values.has_reminders ? values.reminder_days : null,
      inventory_items: values.has_inventory ? values.inventory_items_list : null,
      qc_checklist: type !== 'contract' ? values.qc_checklist : null,
      spare_parts: type !== 'contract' ? values.spare_parts : null,
      service_type: type !== 'contract' ? values.service_type : null,
      components: values.service_type === 'configurable' ? values.component_service_ids : null,
      qc_items: type !== 'contract' && values.qc_items.length > 0 ? values.qc_items : null,
      ...(catalogImageUrl !== undefined && { catalog_image_url: catalogImageUrl }),
    }

    const changes = buildChangesDiff(payload, mode === 'edit' ? node : null)

    const result = await submitChange.mutateAsync({
      service_id: mode === 'edit' && node ? node.id : null,
      change_type: mode === 'new' ? 'add' : 'edit',
      changes,
      division: Array.isArray(values.division) ? values.division : [values.division].filter(Boolean),
      tree_type: type,
      parent_id: values.parent_id,
    })

    if (result.action === 'applied') {
      toast.success('Service saved')
    } else {
      toast.success('Change submitted for approval')
    }
    onOpenChange(false)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save service'
    toast.error(msg)
    console.error(err)
  }
}
```

- [ ] **Step 5: Update the isSaving indicator**

Replace the `isSaving` line (line 176) with:

```typescript
const isSaving = createService.isPending || updateService.isPending || submitChange.isPending
```

- [ ] **Step 6: Verify in browser**

1. Log in as a user WITH `services.approve` → edit a service → confirm direct save works as before
2. Log in as a user WITHOUT `services.approve` but WITH `services.manage` → edit a service price → confirm "Change submitted for approval" toast
3. Verify the service's live price is unchanged
4. Check `service_change_requests` table in Supabase dashboard — confirm row was created

- [ ] **Step 7: Commit**

```bash
git add src/components/services/ServiceEditDialog.tsx
git commit -m "feat(services): route edit dialog through approval RPC"
```

---

## Task 6: ServiceTreeRow — Info Icon, Archive Routing & Pending Badge

**Files:**
- Modify: `src/components/services/ServiceTreeRow.tsx`

- [ ] **Step 1: Update imports**

Add to imports:

```typescript
import { Info } from 'lucide-react'
import { useSubmitServiceChange } from '@/hooks/useServiceChangeRequests'
import { useHasPermission } from '@/hooks/usePermissions'
```

- [ ] **Step 2: Add onShowHistory callback to props**

Add to `ServiceTreeRowProps` interface:

```typescript
onShowHistory: (serviceId: string) => void
```

- [ ] **Step 3: Add approval-aware archive handler**

Inside the component, after the existing hooks, add:

```typescript
const submitChange = useSubmitServiceChange()
const canApprove = useHasPermission('master_data.services.approve')
```

Replace `handleArchiveConfirm` function with:

```typescript
function handleArchiveConfirm() {
  if (canApprove) {
    submitChange.mutate(
      {
        service_id: service.id,
        change_type: 'delete',
        changes: { deleted: { old: false, new: true } },
        division: Array.isArray(service.division) ? service.division : [],
        tree_type: treeType,
        parent_id: service.parent_id ?? null,
      },
      {
        onSuccess: (result) => {
          toast.success(result.action === 'applied' ? `"${service.name_en}" archived` : 'Archive request submitted for approval')
          setArchiveOpen(false)
        },
        onError: (e) => {
          toast.error(e.message || 'Failed to archive service')
          setArchiveOpen(false)
        },
      },
    )
  } else {
    submitChange.mutate(
      {
        service_id: service.id,
        change_type: 'delete',
        changes: { deleted: { old: false, new: true } },
        division: Array.isArray(service.division) ? service.division : [],
        tree_type: treeType,
        parent_id: service.parent_id ?? null,
      },
      {
        onSuccess: (result) => {
          toast.success(result.action === 'applied' ? `"${service.name_en}" archived` : 'Archive request submitted for approval')
          setArchiveOpen(false)
        },
        onError: (e) => {
          toast.error(e.message || 'Failed to submit archive request')
          setArchiveOpen(false)
        },
      },
    )
  }
}
```

- [ ] **Step 4: Add pending badge to service name area**

In the service name `<div>` (around line 211-221), add the orange dot after the service name:

```tsx
<div className="min-w-0 flex-1">
  <div className={cn(
    'text-sm truncate text-foreground leading-tight flex items-center gap-1',
    isBranch ? 'font-semibold' : 'font-medium',
  )}>
    {service.name_en}
    {(service as any).has_pending_change && (
      <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" title="Change pending approval" />
    )}
  </div>
  {service.name_ar && (
    <div className="text-xs truncate text-muted-foreground leading-tight">{service.name_ar}</div>
  )}
</div>
```

- [ ] **Step 5: Add info icon to actions column**

In the actions div (line 336), add the info icon button before the eye icon:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-5 w-5"
  aria-label="Change history"
  onClick={(e) => { e.stopPropagation(); onShowHistory(service.id) }}
>
  <Info className="h-3.5 w-3.5 text-orange-500" />
</Button>
```

Update the actions container width from `w-[96px]` to `w-[116px]` to fit the extra button.

- [ ] **Step 6: Commit**

```bash
git add src/components/services/ServiceTreeRow.tsx
git commit -m "feat(services): add info icon, pending badge, and approval-aware archive"
```

---

## Task 7: Change History Dialog

**Files:**
- Create: `src/components/services/ServiceChangeHistoryDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/services/ServiceChangeHistoryDialog.tsx
'use client'

import { formatDistanceToNow } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useServiceChangeHistory, type ServiceChangeRequest } from '@/hooks/useServiceChangeRequests'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 border-red-200' },
}

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  add: { label: 'Add', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  edit: { label: 'Edit', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  delete: { label: 'Delete', className: 'bg-red-100 text-red-700 border-red-200' },
}

const FIELD_LABELS: Record<string, string> = {
  name_en: 'Name (EN)',
  name_ar: 'Name (AR)',
  price: 'Price',
  emergency_price: 'Emergency Price',
  status: 'Status',
  duration: 'Duration',
  warranty: 'Warranty',
  code: 'Code',
  division: 'Division',
  discount: 'Discount',
  invoice_text_en: 'Invoice Text (EN)',
  invoice_text_ar: 'Invoice Text (AR)',
}

function DiffLines({ changes, changeType }: { changes: Record<string, { old: unknown; new: unknown }>; changeType: string }) {
  if (changeType === 'delete') {
    return <p className="text-sm text-muted-foreground italic">Requested deletion of this service</p>
  }

  const entries = Object.entries(changes).filter(([key]) =>
    !['tree_type', 'sort_order', 'parent_id', 'inventory_items', 'components', 'qc_items', 'booking_time_matrix'].includes(key)
  )

  if (entries.length === 0) return <p className="text-sm text-muted-foreground italic">No visible changes</p>

  return (
    <div className="space-y-0.5">
      {entries.map(([key, { old: oldVal, new: newVal }]) => (
        <div key={key} className="text-xs">
          <span className="font-medium text-muted-foreground">{FIELD_LABELS[key] ?? key}:</span>{' '}
          <span className="text-red-600 line-through">{oldVal == null ? '—' : String(oldVal)}</span>
          {' → '}
          <span className="text-green-700 font-medium">{newVal == null ? '—' : String(newVal)}</span>
        </div>
      ))}
    </div>
  )
}

function HistoryEntry({ req }: { req: ServiceChangeRequest }) {
  const statusBadge = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending
  const typeBadge = TYPE_BADGE[req.change_type] ?? TYPE_BADGE.edit

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={statusBadge.className}>{statusBadge.label}</Badge>
        <Badge variant="outline" className={typeBadge.className}>{typeBadge.label}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
        </span>
      </div>

      <DiffLines changes={req.changes} changeType={req.change_type} />

      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>Requested by: <span className="font-medium text-foreground">{req.requester?.full_name ?? 'Unknown'}</span></div>
        {req.reviewed_by && (
          <div>
            {req.status === 'approved' ? 'Approved' : 'Rejected'} by:{' '}
            <span className="font-medium text-foreground">{req.reviewer?.full_name ?? 'Unknown'}</span>
            {req.reviewed_at && ` — ${formatDistanceToNow(new Date(req.reviewed_at), { addSuffix: true })}`}
          </div>
        )}
      </div>

      {req.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
          <span className="font-medium">Rejection reason:</span> {req.rejection_reason}
        </div>
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceId: string | null
  serviceName: string
}

export function ServiceChangeHistoryDialog({ open, onOpenChange, serviceId, serviceName }: Props) {
  const { data: history = [], isLoading } = useServiceChangeHistory(serviceId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[80vh] flex flex-col sm:rounded-lg rounded-none">
        <DialogHeader>
          <DialogTitle>Change History — {serviceName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No change history for this service.</p>
          ) : (
            <div className="space-y-3 pb-2">
              {history.map((req) => (
                <HistoryEntry key={req.id} req={req} />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire it up in ServiceTableView or services page**

In the services page (`src/app/(dashboard)/master-data/services/page.tsx`), add state and pass `onShowHistory` to ServiceTreeRow:

```typescript
const [historyDialog, setHistoryDialog] = useState<{ serviceId: string; name: string } | null>(null)
```

Pass to each ServiceTreeRow:
```typescript
onShowHistory={(id) => {
  const svc = treeData.find(s => s.id === id)
  setHistoryDialog({ serviceId: id, name: svc?.name_en ?? 'Service' })
}}
```

Add the dialog at the bottom of the page:
```tsx
<ServiceChangeHistoryDialog
  open={!!historyDialog}
  onOpenChange={(open) => { if (!open) setHistoryDialog(null) }}
  serviceId={historyDialog?.serviceId ?? null}
  serviceName={historyDialog?.name ?? ''}
/>
```

- [ ] **Step 3: Verify in browser**

Click the info icon on any service → dialog opens → shows history (or "No change history" if none).

- [ ] **Step 4: Commit**

```bash
git add src/components/services/ServiceChangeHistoryDialog.tsx src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): change history dialog with diff view"
```

---

## Task 8: Approval Page

**Files:**
- Create: `src/app/(dashboard)/master-data/services/approvals/page.tsx`

- [ ] **Step 1: Write the approval page**

```tsx
// src/app/(dashboard)/master-data/services/approvals/page.tsx
'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, XCircle, Clock, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useServiceChangeRequests,
  useApproveChangeRequest,
  useRejectChangeRequest,
  type ServiceChangeRequest,
} from '@/hooks/useServiceChangeRequests'
import { useHasPermission } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'

const STATUS_TABS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
] as const

const TYPE_COLORS: Record<string, string> = {
  add: 'bg-blue-100 text-blue-700 border-blue-200',
  edit: 'bg-orange-100 text-orange-700 border-orange-200',
  delete: 'bg-red-100 text-red-700 border-red-200',
}

const FIELD_LABELS: Record<string, string> = {
  name_en: 'Name (EN)', name_ar: 'Name (AR)', price: 'Price',
  emergency_price: 'Emergency Price', status: 'Status', duration: 'Duration',
  warranty: 'Warranty', discount: 'Discount',
}

function ChangeSummary({ req }: { req: ServiceChangeRequest }) {
  if (req.change_type === 'delete') return <span className="text-xs italic">Delete service</span>

  const lines = Object.entries(req.changes)
    .filter(([key]) => FIELD_LABELS[key])
    .map(([key, { old: o, new: n }]) => `${FIELD_LABELS[key]}: ${o ?? '—'} → ${n ?? '—'}`)

  if (lines.length === 0) return <span className="text-xs italic">Non-field changes</span>
  return <div className="text-xs space-y-0.5">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
}

export default function ServiceApprovalsPage() {
  const canApprove = useHasPermission('master_data.services.approve')
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const { data: requests = [], isLoading } = useServiceChangeRequests({ status: tab })
  const approveReq = useApproveChangeRequest()
  const rejectReq = useRejectChangeRequest()

  const [approveTarget, setApproveTarget] = useState<ServiceChangeRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ServiceChangeRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function handleApprove() {
    if (!approveTarget) return
    try {
      const result = await approveReq.mutateAsync(approveTarget.id)
      // Notify requester
      const supabase = createClient()
      await (supabase as any).from('notifications').insert({
        profile_id: approveTarget.requested_by,
        type: 'service_change_approved',
        title: `Your service change has been approved`,
        body: `Change to "${approveTarget.service?.name_en ?? 'New Service'}" was approved.`,
        related_id: result.service_id,
        related_type: 'service',
      })
      toast.success('Change approved')
      setApproveTarget(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return
    try {
      await rejectReq.mutateAsync({ requestId: rejectTarget.id, reason: rejectReason.trim() })
      // Notify requester
      const supabase = createClient()
      await (supabase as any).from('notifications').insert({
        profile_id: rejectTarget.requested_by,
        type: 'service_change_rejected',
        title: `Your service change was rejected`,
        body: `Change to "${rejectTarget.service?.name_en ?? 'New Service'}" was rejected: ${rejectReason.trim()}`,
        related_id: rejectTarget.service_id ?? rejectTarget.id,
        related_type: 'service',
      })
      toast.success('Change rejected')
      setRejectTarget(null)
      setRejectReason('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    }
  }

  if (!canApprove) {
    return <div className="p-8 text-center text-muted-foreground">You do not have permission to view this page.</div>
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Service Change Approvals</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No {tab} requests.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Service</th>
                <th className="text-left px-3 py-2 font-medium w-[80px]">Type</th>
                <th className="text-left px-3 py-2 font-medium">Changes</th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">Requested By</th>
                <th className="text-left px-3 py-2 font-medium w-[100px]">When</th>
                {tab === 'pending' && <th className="text-right px-3 py-2 font-medium w-[160px]">Actions</th>}
                {tab === 'rejected' && <th className="text-left px-3 py-2 font-medium">Reason</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    {req.change_type === 'add'
                      ? `New: ${req.changes.name_en?.new ?? 'Unnamed'}`
                      : req.service?.name_en ?? 'Unknown Service'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={TYPE_COLORS[req.change_type]}>
                      {req.change_type.charAt(0).toUpperCase() + req.change_type.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2"><ChangeSummary req={req} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs">{req.requester?.full_name ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                  </td>
                  {tab === 'pending' && (
                    <td className="px-3 py-2 text-right space-x-1">
                      <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => setApproveTarget(req)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                        onClick={() => { setRejectTarget(req); setRejectReason('') }}>
                        Reject
                      </Button>
                    </td>
                  )}
                  {tab === 'rejected' && (
                    <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                      {req.rejection_reason}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve confirmation */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Change</AlertDialogTitle>
            <AlertDialogDescription>
              Apply these changes to &ldquo;{approveTarget?.service?.name_en ?? 'New Service'}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {approveTarget && <ChangeSummary req={approveTarget} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              disabled={approveReq.isPending}
              onClick={handleApprove}
            >
              {approveReq.isPending ? 'Approving…' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Change</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a reason for rejecting this change to &ldquo;{rejectTarget?.service?.name_en ?? 'New Service'}&rdquo;.
          </p>
          <Textarea
            placeholder="Rejection reason (required)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectReq.isPending}
              onClick={handleReject}
            >
              {rejectReq.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Add navigation link**

In the services page (`src/app/(dashboard)/master-data/services/page.tsx`), add a link to the approvals page visible only to users with `services.approve`:

```tsx
{canApprove && (
  <Link href="/master-data/services/approvals">
    <Button variant="outline" size="sm" className="gap-1.5">
      <CheckCircle2 className="h-4 w-4" />
      Approvals
    </Button>
  </Link>
)}
```

- [ ] **Step 3: Verify in browser**

1. Navigate to `/master-data/services/approvals` as an approver
2. Verify pending tab shows submitted requests
3. Approve one → confirm service values update, toast shows
4. Reject one → confirm reason dialog works, reason is stored
5. Check notification bell → requester sees approval/rejection notification

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/master-data/services/approvals/page.tsx src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): dedicated approval page with approve/reject workflow"
```

---

## Task 9: Pending Add Indicators on Services Page

**Files:**
- Modify: `src/app/(dashboard)/master-data/services/page.tsx`

- [ ] **Step 1: Import and fetch pending adds**

Add to the services page:

```typescript
import { usePendingAddRequests } from '@/hooks/useServiceChangeRequests'
```

Inside the component:
```typescript
const { data: pendingAdds = [] } = usePendingAddRequests()
```

- [ ] **Step 2: Render pending adds section**

Before the service tree table, add a section for pending new services:

```tsx
{pendingAdds.length > 0 && (
  <div className="border border-dashed border-orange-300 rounded-lg p-3 bg-orange-50/50 space-y-2">
    <div className="text-xs font-medium text-orange-700 flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5" />
      Pending New Services ({pendingAdds.length})
    </div>
    {pendingAdds.map((req) => (
      <div key={req.id} className="flex items-center justify-between text-sm bg-white/60 rounded px-3 py-1.5">
        <div>
          <span className="font-medium">{String(req.changes.name_en?.new ?? 'Unnamed')}</span>
          {req.changes.name_ar?.new && (
            <span className="text-muted-foreground ml-2 text-xs">{String(req.changes.name_ar.new)}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          by {req.requester?.full_name ?? 'Unknown'} — {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

1. Submit an "add new service" request as a non-approver
2. Navigate to services page → confirm the pending section appears with dashed orange border
3. Approve it from the approvals page → confirm it disappears from pending and appears in the tree

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): pending new service indicators on services page"
```

---

## Integration Verification

After all tasks are complete, run through these end-to-end scenarios:

1. **Non-approver edits price** → toast "Change submitted for approval" → orange dot on service → approval page shows request → approve → price updates → notification sent
2. **Non-approver adds service** → pending section shows on services page → approve → service appears in tree
3. **Non-approver deletes service** → approval page shows delete request → reject with reason → service stays, requester sees rejection notification
4. **Approver edits price** → direct save, no change request created
5. **Stale data** → Non-approver submits price change → approver directly edits the same service → tries to approve the pending request → gets stale data error
6. **Concurrent guard** → Non-approver submits change → same service already has pending change → error toast
7. **Service soft-deleted while pending** → trigger auto-rejects the pending request
8. **Withdraw** → Non-approver submits → withdraws their own request → pending lock cleared
