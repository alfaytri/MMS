BEGIN;

CREATE OR REPLACE FUNCTION build_inv_check_approval_chain(
  p_has_damage_or_writeoff BOOLEAN DEFAULT false,
  p_has_variance           BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_steps JSONB;
BEGIN
  IF NOT p_has_variance THEN
    SELECT jsonb_agg(jsonb_build_object(
      'step_order', 1,
      'step_role',  step_key,
      'step_label', step_label
    ))
    INTO v_steps
    FROM workflow_approval_steps
    WHERE workflow = 'inv_check'
      AND step_key = 'inventory_manager'
      AND is_active = true
      AND archived_at IS NULL;

    RETURN COALESCE(v_steps, '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'step_order', rn,
      'step_role',  step_key,
      'step_label', step_label
    ) ORDER BY rn
  )
  INTO v_steps
  FROM (
    SELECT step_key, step_label,
           ROW_NUMBER() OVER (ORDER BY step_order) AS rn
    FROM   workflow_approval_steps
    WHERE  workflow = 'inv_check'
      AND  is_active = true
      AND  archived_at IS NULL
      AND  (
        NOT is_conditional
        OR (is_conditional AND p_has_damage_or_writeoff)
      )
  ) sub;

  RETURN COALESCE(v_steps, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION build_inv_check_approval_chain TO authenticated;

COMMIT;
