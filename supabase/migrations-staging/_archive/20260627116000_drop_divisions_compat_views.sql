-- ─────────────────────────────────────────────────────────────────────────────
-- Retire the divisions / user_divisions compatibility views from
-- 20260627115000.
--
-- Only 3 PL/pgSQL functions still reference the old names in their bodies
-- (everything else was either app code we already updated, or other
-- views/functions that are OID-bound to the renamed underlying tables and
-- therefore unaffected). Recreate the 3 with the new names, then drop the
-- two compat views.
--
--   custom_access_token_hook     — Supabase Auth claims hook
--   get_customer_pending_balances — pending-payments RPC
--   is_contract_visible          — contracts RLS helper
--
-- The dependent views (calendar_visits, v_team_monthly_overtime) keep working
-- because PostgreSQL stores view dependencies by OID, not by name: when we
-- renamed `divisions` → `company_divisions`, the OID was preserved, so
-- existing views' SELECTs still resolve to the same table.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. custom_access_token_hook ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles           cr  ON cr.id          = ucr.role_id
                                       AND cr.is_approval_slot = true
                                       AND cr.deleted_at IS NULL
  LEFT JOIN user_company_divisions ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- ── 2. get_customer_pending_balances ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_pending_balances()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(grouped))
  INTO result
  FROM (
    SELECT
      c.id                                        AS customer_id,
      c.name                                      AS customer_name,
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at ASC
                 ),
                 '[]'::jsonb
               )
        FROM   customer_phones cp
        WHERE  cp.customer_id = c.id
      )                                           AS phones,
      i.division_id,
      d.name                                      AS division_name,
      SUM(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0))
                                                  AS total_pending,
      COUNT(i.id)                                 AS invoice_count,
      COUNT(i.id) FILTER (WHERE i.payment_status = 'overdue')
                                                  AS overdue_count,
      jsonb_agg(
        jsonb_build_object(
          'id',             i.id,
          'invoice_id',     i.invoice_id,
          'phone_id',       i.phone_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  i.direction = 'ar'
      AND  i.status NOT IN ('void', 'cancelled')
      AND  i.payment_status NOT IN ('paid')
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── 3. is_contract_visible ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    -- (a) System Admin role
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      WHERE p.auth_user_id = auth.uid()
        AND cr.is_system = true
    )
    OR
    -- (b) Super-viewer (owner / accountant) via JWT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- (c) Has any contracts permission AND division overlap
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
      JOIN custom_roles           cr  ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      JOIN user_company_divisions ud  ON ud.profile_id = p.id
      JOIN company_divisions      d   ON d.id = ud.division_id
      WHERE c.id = p_contract_id
        AND d.slug = ANY(c.divisions)
        AND (
          'contracts.quotations.view'   = ANY(cr.permissions) OR
          'contracts.quotations.manage' = ANY(cr.permissions) OR
          'contracts.live.view'         = ANY(cr.permissions) OR
          'contracts.live.manage'       = ANY(cr.permissions) OR
          'contracts.activate'          = ANY(cr.permissions)
        )
    )
    OR
    -- (d) Legacy JWT-based division match
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN company_divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$$;

-- ── 4. Drop the compatibility views ─────────────────────────────────────────
DROP VIEW IF EXISTS public.user_divisions;
DROP VIEW IF EXISTS public.divisions;

NOTIFY pgrst, 'reload schema';

COMMIT;
