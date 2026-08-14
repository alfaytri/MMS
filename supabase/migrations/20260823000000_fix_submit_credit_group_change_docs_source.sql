-- Fix: submit_credit_group_change reads credit docs from the wrong table.
--
-- The credit-doc columns (cr_url, establishment_id_url, signed_credit_form_url)
-- were moved OFF the `customers` table into the wide `customer_credit_docs`
-- table (migrations 20260815010600 + 20260815010800). This function was missed
-- by that refactor and still SELECTs those columns FROM customers, so the whole
-- SELECT is invalid and EVERY credit-group submission fails with
--   ERROR: column "cr_url" does not exist
-- for both individual and business customers.
--
-- Fix: read the doc columns from customer_credit_docs via a LEFT JOIN. LEFT (not
-- INNER) so a customer with no docs row yields NULL doc urls — the existing NULL
-- checks then raise the correct "upload docs" messages instead of the row
-- silently vanishing. Nothing else in the function changes.
--
-- Body sourced from the live staging definition (pg_get_functiondef); only the
-- customer lookup (the SELECT ... INTO v_customer block) is altered.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_credit_group_change(p_customer_id uuid, p_requested_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer        RECORD;
  v_new_group       RECORD;
  v_profile_id      uuid;
  v_request_id      uuid;
  v_step            RECORD;
  v_step_count      integer := 0;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  -- Credit docs live in customer_credit_docs (wide, one row per customer), NOT
  -- on customers. LEFT JOIN so a customer with no docs row still returns, with
  -- NULL doc urls, and the required-docs checks below fire correctly.
  SELECT c.id, c.credit_group_id, c.entity_type,
         d.cr_url,
         d.establishment_id_url,
         d.signed_credit_form_url
    INTO v_customer
  FROM customers c
  LEFT JOIN customer_credit_docs d ON d.customer_id = c.id
  WHERE c.id = p_customer_id;
  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT id, name, credit_limit INTO v_new_group
  FROM credit_groups WHERE id = p_requested_group_id;
  IF v_new_group.id IS NULL THEN
    RAISE EXCEPTION 'Credit group not found';
  END IF;

  IF COALESCE(v_new_group.credit_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Approval only required for credit groups with a non-zero limit. Assign this group directly.';
  END IF;

  IF v_customer.credit_group_id = p_requested_group_id THEN
    RAISE EXCEPTION 'Customer is already on this credit group';
  END IF;

  IF COALESCE(v_customer.entity_type::text, 'individual') = 'business' THEN
    IF v_customer.cr_url IS NULL
       OR v_customer.establishment_id_url IS NULL
       OR v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload all 3 required docs (CR, Establishment ID, Signed Credit Form) for business customers'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload the Signed Credit Form before requesting a credit group'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_requests
    WHERE customer_id = p_customer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending credit-group change for this customer';
  END IF;

  INSERT INTO customer_credit_group_requests (
    customer_id, requested_group_id, previous_group_id, status, requested_by
  ) VALUES (
    p_customer_id, p_requested_group_id, v_customer.credit_group_id, 'pending', v_profile_id
  )
  RETURNING id INTO v_request_id;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles            cr ON cr.id = was.role_id
    WHERE  was.workflow    = 'credit_group'
      AND  was.is_active   = true
      AND  was.archived_at IS NULL
    ORDER BY was.step_order
  LOOP
    INSERT INTO customer_credit_group_approvals (
      request_id, step_role, step_order, status, is_active, iteration
    ) VALUES (
      v_request_id, v_step.role_name, v_step.step_order, 'pending', true, 1
    );
    v_step_count := v_step_count + 1;
  END LOOP;

  IF v_step_count = 0 THEN
    -- No steps configured → auto-approve
    UPDATE customers
       SET credit_group_id = p_requested_group_id,
           block_reason    = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM user_data WHERE id = v_profile_id),
    'info',
    jsonb_build_object(
      'request_id',       v_request_id,
      'requested_group',  v_new_group.name,
      'previous_group_id',v_customer.credit_group_id,
      'auto_approved',    v_step_count = 0
    )::text
  );

  RETURN jsonb_build_object(
    'request_id',  v_request_id,
    'step_count',  v_step_count,
    'status',      CASE WHEN v_step_count = 0 THEN 'approved' ELSE 'pending' END
  );
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
