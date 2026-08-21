-- B5 (go-live blocker): stop a customer's credit ceiling being raised without
-- approval.
--
-- Before: useUpdateCustomer wrote customers.credit_group_id directly and there
-- was NO guard trigger on customers, so anyone with the customer-edit screen
-- (or a raw PostgREST call) could set credit_group_id to a higher-limit group
-- and instantly raise the ceiling — skipping submit_credit_group_change's
-- required CR + Establishment ID + signed form + approval chain.
--
-- The credit-group workflow already draws the line at a NON-ZERO limit:
-- submit_credit_group_change refuses zero-limit groups ("Assign this group
-- directly."). So the only change that must go through approval is assigning a
-- group WITH a non-zero credit_limit. This guard enforces exactly that: an
-- authenticated (non-DEFINER) direct change of credit_group_id to a group whose
-- credit_limit > 0 is refused. It still allows:
--   * clearing to cash (credit_group_id -> NULL),
--   * assigning a zero-limit group directly (the workflow's own rule),
--   * the SECURITY DEFINER RPCs submit/approve/force_approve_credit_group_change
--     (they run as the owner role, so current_user is not authenticated/anon),
--   * INSERT (new-customer creation is unaffected; only credit_group_id CHANGES
--     on UPDATE are guarded).
--
-- No frontend change is needed: CustomerDialog already routes a non-zero-limit
-- group change through submit_credit_group_change and keeps the old group on
-- the direct patch until approval lands — this trigger is defense-in-depth
-- against out-of-band writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_credit_group()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default) so current_user reflects the real caller; the
-- credit-group workflow RPCs are SECURITY DEFINER and pass the current_user gate.
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_limit numeric;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_group_id IS DISTINCT FROM OLD.credit_group_id
     AND NEW.credit_group_id IS NOT NULL THEN
    SELECT credit_limit INTO v_new_limit
    FROM credit_groups WHERE id = NEW.credit_group_id;

    IF COALESCE(v_new_limit, 0) > 0 THEN
      RAISE EXCEPTION 'A credit group with a limit can only be assigned through the credit-group approval workflow (submit_credit_group_change), not a direct update.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_customer_credit_group ON public.customers;
CREATE TRIGGER trg_guard_customer_credit_group
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.guard_customer_credit_group();

NOTIFY pgrst, 'reload schema';

COMMIT;
