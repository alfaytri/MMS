DO $test$
DECLARE
  v_req RECORD;
  v_live RECORD;
  v_key TEXT;
  v_old_val TEXT;
  v_new_val TEXT;
  v_live_val TEXT;
BEGIN
  SELECT * INTO v_req FROM service_change_requests WHERE id = '2b1bfb82-d0aa-4827-808e-c9900b028106';
  SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
  FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
    v_old_val := v_req.changes->v_key->>'old';
    v_new_val := v_req.changes->v_key->>'new';
    IF v_old_val IS NOT DISTINCT FROM v_new_val THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
    IF v_old_val IS NOT NULL AND v_old_val ~ '^-?\d+\.?\d*$' AND v_live_val IS NOT NULL AND v_live_val ~ '^-?\d+\.?\d*$' THEN
      IF v_old_val::NUMERIC IS DISTINCT FROM v_live_val::NUMERIC THEN
        RAISE EXCEPTION 'FAIL NUMERIC: % expected=% found=%', v_key, v_old_val, v_live_val;
      END IF;
    ELSE
      IF v_old_val IS DISTINCT FROM v_live_val THEN
        RAISE EXCEPTION 'FAIL TEXT: % expected=[%] found=[%]', v_key, v_old_val, v_live_val;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'ALL CHECKS PASSED';
END;
$test$;
