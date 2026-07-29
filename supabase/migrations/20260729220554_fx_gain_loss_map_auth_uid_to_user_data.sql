-- Second hotfix for Task 2 (20260729214428_fx_gain_loss_rpcs_triggers.sql):
--
-- BUG: rpc_update_document_initial_rate stored auth.uid() (the auth user id)
-- into columns that FK to public.user_data(id). Those two ids are distinct
-- in this project — user_data.id is the profile id and user_data.auth_user_id
-- is the auth user's uid. The FK insert would fail on real callers.
--
-- FIX: look up user_data.id from auth.uid() inside the RPC and store that.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_document_initial_rate(
  p_document_type text,
  p_document_id   uuid,
  p_new_rate      numeric,
  p_reason        text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_rate    numeric;
  v_auth_uid    uuid := auth.uid();
  v_user_data_id uuid;
BEGIN
  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'new_rate must be positive';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason must be at least 5 characters';
  END IF;
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be called by an authenticated user';
  END IF;

  SELECT id INTO v_user_data_id
    FROM public.user_data
   WHERE auth_user_id = v_auth_uid
   LIMIT 1;

  IF v_user_data_id IS NULL THEN
    RAISE EXCEPTION 'no user_data row for auth user %', v_auth_uid;
  END IF;

  IF p_document_type = 'po' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.purchase_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO % not found', p_document_id; END IF;

    UPDATE public.purchase_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.sale_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SO % not found', p_document_id; END IF;

    UPDATE public.sale_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;

  INSERT INTO public.exchange_rate_change_log
    (document_type, document_id, old_rate, new_rate, reason, changed_by)
  VALUES (p_document_type, p_document_id, v_old_rate, p_new_rate, p_reason, v_user_data_id);

  PERFORM public.rpc_recompute_document_fx(p_document_type, p_document_id);
END $$;

COMMIT;
