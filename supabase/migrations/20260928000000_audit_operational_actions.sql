-- Audit logging for all operational mutations.
--
-- The audit trail was app-layer only (explicit logActivity() calls) and covered
-- just master-data edits + the purchase/sale order lifecycle. The Operations
-- flows (consumption, transfers, adjustments, tools & assets, custody moves,
-- inventory checks, damaged stock, projects) mutate through RPCs that never
-- logged, so those pages had NO audit entries at all.
--
-- This adds one generic AFTER trigger — log_activity_change() — attached to the
-- operation *header* tables (deliberately NOT the high-churn ledger detail like
-- inventory_stock_movements / cogs_entries / fifo_cost_layers), so every
-- insert/update/delete is recorded automatically and no code path can forget.
--
--   * Best-effort: the trigger never raises, so a failed audit can never abort
--     the real operation (mirrors the app-layer logActivity() try/catch).
--   * Performer: resolved from auth.uid() -> user_data.full_name. This survives
--     SECURITY DEFINER RPCs (they change the role, not the JWT claims), so the
--     real caller is captured; a service-role write logs a NULL performer.
--   * Detail: money/stock/approval tables capture full before/after JSONB
--     ('full'); the rest capture who/what/when only ('lean') to keep the
--     activity_log table compact (Supabase budget rule).

CREATE OR REPLACE FUNCTION public.log_activity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module    text := TG_ARGV[0];
  v_mode      text := COALESCE(TG_ARGV[1], 'lean');
  v_verb      text := CASE TG_OP
                        WHEN 'INSERT' THEN 'created'
                        WHEN 'UPDATE' THEN 'updated'
                        WHEN 'DELETE' THEN 'deleted'
                        ELSE lower(TG_OP)
                      END;
  v_entity    uuid;
  v_performer text;
  v_old       jsonb;
  v_new       jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity := OLD.id;
  ELSE
    v_entity := NEW.id;
  END IF;

  -- Resolve the acting user; never let a lookup failure block the write.
  BEGIN
    SELECT full_name INTO v_performer
    FROM public.user_data
    WHERE auth_user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_performer := NULL;
  END;

  IF v_mode = 'full' THEN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  END IF;

  INSERT INTO public.activity_log
    (action, module, entity_id, entity_type, performer_name, old_data, new_data, severity)
  VALUES
    (v_module || '.' || v_verb, v_module, v_entity, v_module, v_performer, v_old, v_new, 'info');

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Audit is best-effort; a logging failure must never abort the operation.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.log_activity_change() FROM PUBLIC, anon;

-- ── Full before/after diffs (money / stock / approval) ───────────────────────
DROP TRIGGER IF EXISTS trg_audit_consumption_entries ON public.consumption_entries;
CREATE TRIGGER trg_audit_consumption_entries AFTER INSERT OR UPDATE OR DELETE ON public.consumption_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('consumption', 'full');

DROP TRIGGER IF EXISTS trg_audit_warehouse_transfers ON public.warehouse_transfers;
CREATE TRIGGER trg_audit_warehouse_transfers AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('transfers', 'full');

DROP TRIGGER IF EXISTS trg_audit_stock_adjustments ON public.stock_adjustments;
CREATE TRIGGER trg_audit_stock_adjustments AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('adjustments', 'full');

DROP TRIGGER IF EXISTS trg_audit_stock_adjustment_approvals ON public.stock_adjustment_approvals;
CREATE TRIGGER trg_audit_stock_adjustment_approvals AFTER INSERT OR UPDATE OR DELETE ON public.stock_adjustment_approvals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('adjustments', 'full');

DROP TRIGGER IF EXISTS trg_audit_inventory_damaged_movements ON public.inventory_damaged_movements;
CREATE TRIGGER trg_audit_inventory_damaged_movements AFTER INSERT OR UPDATE OR DELETE ON public.inventory_damaged_movements
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('damaged_stock', 'full');

DROP TRIGGER IF EXISTS trg_audit_inventory_check_approvals ON public.inventory_check_approvals;
CREATE TRIGGER trg_audit_inventory_check_approvals AFTER INSERT OR UPDATE OR DELETE ON public.inventory_check_approvals
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('inventory_checks', 'full');

-- ── Lean (who / what / when) ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_tool_unit_assignments ON public.tool_unit_assignments;
CREATE TRIGGER trg_audit_tool_unit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.tool_unit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('tools_assets', 'lean');

DROP TRIGGER IF EXISTS trg_audit_tool_unit_inspections ON public.tool_unit_inspections;
CREATE TRIGGER trg_audit_tool_unit_inspections AFTER INSERT OR UPDATE OR DELETE ON public.tool_unit_inspections
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('tools_assets', 'lean');

DROP TRIGGER IF EXISTS trg_audit_tool_check_sessions ON public.tool_check_sessions;
CREATE TRIGGER trg_audit_tool_check_sessions AFTER INSERT OR UPDATE OR DELETE ON public.tool_check_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('tools_assets', 'lean');

DROP TRIGGER IF EXISTS trg_audit_tool_asset_units ON public.tool_asset_units;
CREATE TRIGGER trg_audit_tool_asset_units AFTER INSERT OR UPDATE OR DELETE ON public.tool_asset_units
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('tools_assets', 'lean');

DROP TRIGGER IF EXISTS trg_audit_inventory_checks ON public.inventory_checks;
CREATE TRIGGER trg_audit_inventory_checks AFTER INSERT OR UPDATE OR DELETE ON public.inventory_checks
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('inventory_checks', 'lean');

DROP TRIGGER IF EXISTS trg_audit_projects ON public.projects;
CREATE TRIGGER trg_audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('projects', 'lean');

DROP TRIGGER IF EXISTS trg_audit_project_milestones ON public.project_milestones;
CREATE TRIGGER trg_audit_project_milestones AFTER INSERT OR UPDATE OR DELETE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('projects', 'lean');

DROP TRIGGER IF EXISTS trg_audit_project_disciplines ON public.project_disciplines;
CREATE TRIGGER trg_audit_project_disciplines AFTER INSERT OR UPDATE OR DELETE ON public.project_disciplines
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('projects', 'lean');

DROP TRIGGER IF EXISTS trg_audit_consumption_edit_requests ON public.consumption_edit_requests;
CREATE TRIGGER trg_audit_consumption_edit_requests AFTER INSERT OR UPDATE OR DELETE ON public.consumption_edit_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_change('consumption', 'lean');
