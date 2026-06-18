-- =============================================================
-- Fix: approve_service_change stale data check
-- Problem 1: EXECUTE USING record can't resolve column names
-- Problem 2: Numeric format mismatch — JSON '150' ≠ Postgres '150.00'
-- Problem 3: Stale check ran on unchanged fields (old = new)
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
  v_service_id    UUID;
  v_key           TEXT;
  v_old_val       TEXT;
  v_new_val       TEXT;
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
      v_service_id := v_req.service_id;

      -- Verify service still exists
      IF NOT EXISTS (SELECT 1 FROM services WHERE id = v_service_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Service no longer exists';
      END IF;

      -- Stale data check: only for fields that actually changed (old ≠ new)
      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        v_new_val := v_req.changes->v_key->>'new';

        -- Skip fields that aren't actually changing
        IF v_old_val IS NOT DISTINCT FROM v_new_val THEN
          CONTINUE;
        END IF;

        -- Only check columns that exist on the services table
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'services' AND column_name = v_key
        ) THEN
          CONTINUE;
        END IF;

        -- Query the live value directly from the table (avoids record-type issues)
        EXECUTE format('SELECT %I::TEXT FROM services WHERE id = $1', v_key)
          INTO v_live_val USING v_service_id;

        -- Normalize numeric values before comparing (150 vs 150.00)
        IF v_old_val IS NOT NULL AND v_old_val ~ '^-?\d+\.?\d*$'
           AND v_live_val IS NOT NULL AND v_live_val ~ '^-?\d+\.?\d*$' THEN
          IF v_old_val::NUMERIC IS DISTINCT FROM v_live_val::NUMERIC THEN
            RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
              v_key, v_old_val, v_live_val;
          END IF;
        ELSE
          IF v_old_val IS DISTINCT FROM v_live_val THEN
            RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
              v_key, v_old_val, v_live_val;
          END IF;
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
