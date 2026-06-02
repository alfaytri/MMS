-- =============================================================
-- Service Approval Workflow — RPC Functions
-- =============================================================

-- Helper: check if a profile has a specific permission via custom_roles
CREATE OR REPLACE FUNCTION _user_has_permission(p_profile_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE ucr.profile_id = p_profile_id
      AND (cr.is_system = true OR p_permission = ANY(cr.permissions))
  );
$$;

-- =============================================================
-- 1. submit_service_change
--    Unified entry point — checks permissions, either applies
--    directly (approver/no-approval-needed) or creates a
--    service_change_requests row (non-approver).
-- =============================================================
CREATE OR REPLACE FUNCTION submit_service_change(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id     UUID;
  v_has_approve    BOOLEAN;
  v_has_manage     BOOLEAN;
  v_service_id     UUID;
  v_change_type    service_change_type;
  v_changes        JSONB;
  v_division       TEXT[];
  v_tree_type      TEXT;
  v_parent_id      UUID;
  v_has_pending    BOOLEAN;
  v_new_id         UUID;
  v_needs_approval BOOLEAN := false;
  v_key            TEXT;
  v_approval_fields TEXT[] := ARRAY['name_en', 'name_ar', 'price', 'emergency_price', 'status'];
BEGIN
  -- Resolve profile_id from the authenticated auth user
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  v_has_approve := _user_has_permission(v_profile_id, 'master_data.services.approve');
  v_has_manage  := _user_has_permission(v_profile_id, 'master_data.services.manage');

  IF NOT v_has_manage THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.manage required';
  END IF;

  v_service_id  := (p_payload->>'service_id')::UUID;
  v_change_type := (p_payload->>'change_type')::service_change_type;
  v_changes     := p_payload->'changes';
  v_tree_type   := p_payload->>'tree_type';
  v_parent_id   := (p_payload->>'parent_id')::UUID;

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
          CASE WHEN v_changes ? 'category' AND v_changes->'category'->>'new' IS NOT NULL
               THEN (v_changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_changes ? 'service_type' AND v_changes->'service_type'->>'new' IS NOT NULL
               THEN (v_changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_changes ? 'contract_type' AND v_changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
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
          CASE WHEN v_changes ? 'inventory_items'     THEN v_changes->'inventory_items'->'new'     ELSE NULL END,
          CASE WHEN v_changes ? 'components'          THEN v_changes->'components'->'new'          ELSE NULL END,
          CASE WHEN v_changes ? 'qc_items'            THEN v_changes->'qc_items'->'new'            ELSE NULL END
        );
        v_service_id := v_new_id;

      WHEN 'edit' THEN
        UPDATE services SET
          name_en           = CASE WHEN v_changes ? 'name_en'           THEN v_changes->'name_en'->>'new'                    ELSE name_en           END,
          name_ar           = CASE WHEN v_changes ? 'name_ar'           THEN v_changes->'name_ar'->>'new'                    ELSE name_ar           END,
          code              = CASE WHEN v_changes ? 'code'              THEN v_changes->'code'->>'new'                       ELSE code              END,
          legacy_service_id = CASE WHEN v_changes ? 'legacy_service_id' THEN v_changes->'legacy_service_id'->>'new'          ELSE legacy_service_id END,
          price             = CASE WHEN v_changes ? 'price'             THEN (v_changes->'price'->>'new')::NUMERIC            ELSE price             END,
          emergency_price   = CASE WHEN v_changes ? 'emergency_price'   THEN (v_changes->'emergency_price'->>'new')::NUMERIC  ELSE emergency_price   END,
          discount          = CASE WHEN v_changes ? 'discount'          THEN (v_changes->'discount'->>'new')::NUMERIC         ELSE discount          END,
          price_unit        = CASE WHEN v_changes ? 'price_unit'        THEN v_changes->'price_unit'->>'new'                  ELSE price_unit        END,
          duration          = CASE WHEN v_changes ? 'duration'          THEN (v_changes->'duration'->>'new')::INT             ELSE duration          END,
          warranty          = CASE WHEN v_changes ? 'warranty'          THEN (v_changes->'warranty'->>'new')::INT             ELSE warranty          END,
          status            = CASE WHEN v_changes ? 'status'            THEN (v_changes->'status'->>'new')::service_status    ELSE status            END,
          service_type      = CASE WHEN v_changes ? 'service_type'      THEN (v_changes->'service_type'->>'new')::service_type ELSE service_type     END,
          invoice_text_en   = CASE WHEN v_changes ? 'invoice_text_en'   THEN v_changes->'invoice_text_en'->>'new'             ELSE invoice_text_en   END,
          invoice_text_ar   = CASE WHEN v_changes ? 'invoice_text_ar'   THEN v_changes->'invoice_text_ar'->>'new'             ELSE invoice_text_ar   END,
          photo_requirement = CASE WHEN v_changes ? 'photo_requirement' THEN v_changes->'photo_requirement'->>'new'           ELSE photo_requirement END,
          catalog_image_url = CASE WHEN v_changes ? 'catalog_image_url' THEN v_changes->'catalog_image_url'->>'new'           ELSE catalog_image_url END,
          brands_supported  = CASE WHEN v_changes ? 'brands_supported'  THEN (v_changes->'brands_supported'->>'new')::BOOLEAN  ELSE brands_supported  END,
          includes_notes    = CASE WHEN v_changes ? 'includes_notes'    THEN (v_changes->'includes_notes'->>'new')::BOOLEAN    ELSE includes_notes    END,
          spare_parts       = CASE WHEN v_changes ? 'spare_parts'       THEN (v_changes->'spare_parts'->>'new')::BOOLEAN       ELSE spare_parts       END,
          qc_checklist      = CASE WHEN v_changes ? 'qc_checklist'      THEN (v_changes->'qc_checklist'->>'new')::BOOLEAN      ELSE qc_checklist      END,
          instructions      = CASE WHEN v_changes ? 'instructions'      THEN (v_changes->'instructions'->>'new')::BOOLEAN      ELSE instructions      END,
          reminder_days     = CASE WHEN v_changes ? 'reminder_days'     THEN (v_changes->'reminder_days'->>'new')::INT         ELSE reminder_days     END,
          updated_at        = now()
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
        UPDATE services
        SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

    END CASE;

    -- Activity log (no profile_id column on activity_log)
    INSERT INTO activity_log (action, module, entity_type, entity_id, details)
    VALUES (
      'services/service-' || v_change_type || 'd',
      'services',
      'service',
      v_service_id,
      jsonb_build_object('change_type', v_change_type, 'applied_by', v_profile_id)::TEXT
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
    VALUES (v_service_id, v_division, v_change_type, v_changes, v_profile_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('action', 'pending', 'id', v_new_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_service_change(JSONB) TO authenticated;

-- =============================================================
-- 2. approve_service_change
--    Approves a pending request with stale-data check.
-- =============================================================
CREATE OR REPLACE FUNCTION approve_service_change(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id    UUID;
  v_req           RECORD;
  v_live          RECORD;
  v_key           TEXT;
  v_old_val       TEXT;
  v_live_val      TEXT;
  v_new_service_id UUID;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  CASE v_req.change_type
    WHEN 'edit' THEN
      -- Stale data check: verify old values still match live data
      SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Service no longer exists'; END IF;

      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
        IF v_old_val IS DISTINCT FROM v_live_val THEN
          RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
            v_key, v_old_val, v_live_val;
        END IF;
      END LOOP;

      -- Apply edits
      UPDATE services SET
        name_en           = CASE WHEN v_req.changes ? 'name_en'           THEN v_req.changes->'name_en'->>'new'                   ELSE name_en           END,
        name_ar           = CASE WHEN v_req.changes ? 'name_ar'           THEN v_req.changes->'name_ar'->>'new'                   ELSE name_ar           END,
        code              = CASE WHEN v_req.changes ? 'code'              THEN v_req.changes->'code'->>'new'                      ELSE code              END,
        price             = CASE WHEN v_req.changes ? 'price'             THEN (v_req.changes->'price'->>'new')::NUMERIC           ELSE price             END,
        emergency_price   = CASE WHEN v_req.changes ? 'emergency_price'   THEN (v_req.changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price   END,
        discount          = CASE WHEN v_req.changes ? 'discount'          THEN (v_req.changes->'discount'->>'new')::NUMERIC        ELSE discount          END,
        duration          = CASE WHEN v_req.changes ? 'duration'          THEN (v_req.changes->'duration'->>'new')::INT            ELSE duration          END,
        warranty          = CASE WHEN v_req.changes ? 'warranty'          THEN (v_req.changes->'warranty'->>'new')::INT            ELSE warranty          END,
        status            = CASE WHEN v_req.changes ? 'status'            THEN (v_req.changes->'status'->>'new')::service_status   ELSE status            END,
        invoice_text_en   = CASE WHEN v_req.changes ? 'invoice_text_en'   THEN v_req.changes->'invoice_text_en'->>'new'            ELSE invoice_text_en   END,
        invoice_text_ar   = CASE WHEN v_req.changes ? 'invoice_text_ar'   THEN v_req.changes->'invoice_text_ar'->>'new'            ELSE invoice_text_ar   END,
        catalog_image_url = CASE WHEN v_req.changes ? 'catalog_image_url' THEN v_req.changes->'catalog_image_url'->>'new'          ELSE catalog_image_url END,
        updated_at        = now()
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
          0,
          v_req.division,
          v_req.changes->'name_en'->>'new',
          v_req.changes->'name_ar'->>'new',
          v_req.changes->'code'->>'new',
          (v_req.changes->'price'->>'new')::NUMERIC,
          (v_req.changes->'emergency_price'->>'new')::NUMERIC,
          (v_req.changes->'duration'->>'new')::INT,
          (v_req.changes->'warranty'->>'new')::INT,
          COALESCE(v_req.changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_req.changes ? 'category' AND v_req.changes->'category'->>'new' IS NOT NULL
               THEN (v_req.changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'service_type' AND v_req.changes->'service_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'contract_type' AND v_req.changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
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
      -- Safety check: no active orders
      IF EXISTS (
        SELECT 1 FROM order_services os
        JOIN orders o ON o.id = os.order_id
        WHERE os.service_id = v_req.service_id
          AND o.status NOT IN ('completed', 'cancelled')
          AND o.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot delete: service has active orders. Reject this request instead.';
      END IF;
      UPDATE services
      SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
      WHERE id = v_req.service_id;

  END CASE;

  -- Mark approved
  UPDATE service_change_requests
  SET status = 'approved', reviewed_by = v_profile_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'service_id', COALESCE(v_new_service_id, v_req.service_id));
END;
$$;

GRANT EXECUTE ON FUNCTION approve_service_change(UUID) TO authenticated;

-- =============================================================
-- 3. reject_service_change
--    Rejects a pending request with a mandatory reason.
-- =============================================================
CREATE OR REPLACE FUNCTION reject_service_change(p_request_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE service_change_requests
  SET
    status           = 'rejected',
    reviewed_by      = v_profile_id,
    reviewed_at      = now(),
    rejection_reason = trim(p_reason),
    updated_at       = now()
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
--    Requester can withdraw their own pending request.
-- =============================================================
CREATE OR REPLACE FUNCTION withdraw_service_change(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  DELETE FROM service_change_requests WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_service_change(UUID) TO authenticated;

-- =============================================================
-- 5. update_pending_service_change
--    Requester can update the changes payload on a pending request.
-- =============================================================
CREATE OR REPLACE FUNCTION update_pending_service_change(p_request_id UUID, p_new_changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can update this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  UPDATE service_change_requests
  SET changes = p_new_changes, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION update_pending_service_change(UUID, JSONB) TO authenticated;
