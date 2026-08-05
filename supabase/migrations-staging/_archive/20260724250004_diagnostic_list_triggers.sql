-- Diagnostic RPC: list every trigger on the tables involved in a receival.
-- Call from browser DevTools:
--   const { data } = await supabase.rpc('diag_list_receival_triggers')
--   console.table(data)
--
-- Also dumps every constraint on those tables so we can see any CHECK
-- expression that could compare uuid to text.

CREATE OR REPLACE FUNCTION public.diag_list_receival_triggers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_triggers jsonb;
  v_columns  jsonb;
  v_policies jsonb;
BEGIN
  -- All triggers on receival-related tables, with their function bodies
  SELECT jsonb_agg(jsonb_build_object(
    'table',       tgrelid::regclass::text,
    'trigger',     tgname,
    'enabled',     tgenabled,
    'function',    proname,
    'body_head',   substring(prosrc from 1 for 400)
  ) ORDER BY tgrelid::regclass::text, tgname)
  INTO v_triggers
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid IN (
    'public.receivals'::regclass,
    'public.receival_items'::regclass,
    'public.fifo_cost_layers'::regclass,
    'public.inventory_stock_movements'::regclass,
    'public.inventory_brand_variants'::regclass,
    'public.inventory_item_brand_variants'::regclass
  )
  AND NOT tgisinternal;

  -- Column types on the same tables — makes any text/uuid mismatch obvious
  SELECT jsonb_agg(jsonb_build_object(
    'table',    table_name,
    'column',   column_name,
    'type',     data_type,
    'nullable', is_nullable
  ) ORDER BY table_name, ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name  = 'receival_id'
    AND table_name IN ('receivals','receival_items','fifo_cost_layers',
                        'inventory_stock_movements','bills','shipments',
                        'invoices','receival_edit_requests','tool_asset_units');

  -- RLS policies on these tables (a bad policy could also throw)
  SELECT jsonb_agg(jsonb_build_object(
    'table',   tablename,
    'policy',  policyname,
    'cmd',     cmd,
    'expr',    substring(COALESCE(qual, with_check) from 1 for 400)
  ) ORDER BY tablename, policyname)
  INTO v_policies
  FROM pg_policies
  WHERE tablename IN ('receivals','receival_items','fifo_cost_layers',
                       'inventory_stock_movements','inventory_item_brand_variants',
                       'inventory_brand_variants');

  RETURN jsonb_build_object(
    'triggers', COALESCE(v_triggers, '[]'::jsonb),
    'receival_id_columns', COALESCE(v_columns, '[]'::jsonb),
    'policies', COALESCE(v_policies, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diag_list_receival_triggers() TO authenticated;

NOTIFY pgrst, 'reload schema';
