-- Projects Option B — collapse each project's per-discipline buckets into ONE
-- stock pool. NON-DESTRUCTIVE: surplus buckets are DEACTIVATED (kept for
-- history), disciplines become tags (project_disciplines), and milestones +
-- any consumption/COGS history are re-pointed onto the pool with their
-- discipline stamped first. Aborts if any project bucket still holds stock.
DO $mig$
DECLARE
  v_proj record;
  v_pool uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouse_sub_container_totals t ON t.sub_container_id = sc.id
    WHERE sc.project_id IS NOT NULL AND COALESCE(t.total_qty, 0) <> 0
  ) THEN
    RAISE EXCEPTION 'Project buckets still hold stock — consolidate to one pool manually before this migration';
  END IF;

  FOR v_proj IN SELECT id, project_number FROM public.projects LOOP
    -- 1. Record disciplines (tags) from the existing buckets.
    INSERT INTO public.project_disciplines (project_id, discipline_id, created_by)
    SELECT DISTINCT v_proj.id, sc.discipline_id, sc.created_by
      FROM public.warehouse_sub_containers sc
     WHERE sc.project_id = v_proj.id AND sc.discipline_id IS NOT NULL
    ON CONFLICT (project_id, discipline_id) DO NOTHING;

    -- 2. Choose the pool: an already-disciplineless bucket if present, else the oldest.
    SELECT id INTO v_pool FROM public.warehouse_sub_containers
     WHERE project_id = v_proj.id AND discipline_id IS NULL
     ORDER BY created_at LIMIT 1;
    IF v_pool IS NULL THEN
      SELECT id INTO v_pool FROM public.warehouse_sub_containers
       WHERE project_id = v_proj.id ORDER BY created_at LIMIT 1;
    END IF;
    IF v_pool IS NULL THEN CONTINUE; END IF;

    -- 3. Stamp discipline on this project's milestones + spend history from their
    --    bucket, BEFORE clearing/moving anything.
    UPDATE public.project_milestones pm
       SET discipline_id = COALESCE(pm.discipline_id, sc.discipline_id), updated_at = now()
      FROM public.warehouse_sub_containers sc
     WHERE pm.sub_container_id = sc.id AND sc.project_id = v_proj.id AND sc.discipline_id IS NOT NULL;
    UPDATE public.cogs_entries c
       SET discipline_id = COALESCE(c.discipline_id, sc.discipline_id)
      FROM public.warehouse_sub_containers sc
     WHERE c.consumer_sub_container_id = sc.id AND sc.project_id = v_proj.id AND sc.discipline_id IS NOT NULL;
    UPDATE public.consumption_entries ce
       SET discipline_id = COALESCE(ce.discipline_id, sc.discipline_id)
      FROM public.warehouse_sub_containers sc
     WHERE ce.consumer_sub_container_id = sc.id AND sc.project_id = v_proj.id AND sc.discipline_id IS NOT NULL;

    -- 4. Re-point milestones + spend history from the non-pool buckets onto the pool.
    UPDATE public.project_milestones
       SET sub_container_id = v_pool, updated_at = now()
     WHERE sub_container_id IN (
       SELECT id FROM public.warehouse_sub_containers WHERE project_id = v_proj.id AND id <> v_pool);
    UPDATE public.cogs_entries
       SET consumer_sub_container_id = v_pool
     WHERE consumer_sub_container_id IN (
       SELECT id FROM public.warehouse_sub_containers WHERE project_id = v_proj.id AND id <> v_pool);
    UPDATE public.consumption_entries
       SET consumer_sub_container_id = v_pool
     WHERE consumer_sub_container_id IN (
       SELECT id FROM public.warehouse_sub_containers WHERE project_id = v_proj.id AND id <> v_pool);

    -- 5. Make it the pool: rename to the project number, clear its discipline.
    UPDATE public.warehouse_sub_containers
       SET name = v_proj.project_number, discipline_id = NULL, is_active = true, updated_at = now()
     WHERE id = v_pool;

    -- 6. Deactivate the surplus discipline buckets (kept for history).
    UPDATE public.warehouse_sub_containers
       SET is_active = false, updated_at = now()
     WHERE project_id = v_proj.id AND id <> v_pool;

    RAISE NOTICE 'project % → pool %', v_proj.project_number, v_pool;
  END LOOP;
END $mig$;

NOTIFY pgrst, 'reload schema';
