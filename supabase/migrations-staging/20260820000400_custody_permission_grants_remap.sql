-- Virtual Warehouses — Migration 4 of 4: remap custody + consumption permission grants
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- Permissions live in custom_roles.permissions (text[]). With the custody model
-- unified + per-warehouse grants introduced, remap each role's grants:
--   custody.teams.view          -> custody.view + custody.<Teams-id>.view
--   custody.teams.edit|manage   -> custody.<Teams-id>.view + .edit (+ custody.view)
--   custody.places.view         -> custody.view + custody.<Projects-id>.view
--   custody.places.edit|manage  -> custody.<Projects-id>.view + .edit (+ custody.view)
--   consumption.create.team|place -> consumption.create.custody
-- Everything else is preserved. Warehouse ids are resolved by name (Teams /
-- Projects) so the migration is portable across staging + prod. Idempotent: once
-- the old keys are gone a re-run is a no-op.

do $$
declare
  v_teams_id    text;
  v_projects_id text;
  r             record;
  v_new         text[];
  v_key         text;
begin
  select id::text into v_teams_id    from public.warehouses where warehouse_kind = 'custody' and name = 'Teams'    limit 1;
  select id::text into v_projects_id from public.warehouses where warehouse_kind = 'custody' and name = 'Projects' limit 1;

  for r in select id, permissions from public.custom_roles loop
    v_new := '{}';
    foreach v_key in array coalesce(r.permissions, '{}'::text[]) loop
      if v_key = 'custody.teams.view' then
        v_new := v_new || 'custody.view'::text;
        if v_teams_id is not null then v_new := v_new || ('custody.' || v_teams_id || '.view'); end if;

      elsif v_key in ('custody.teams.edit', 'custody.teams.manage') then
        v_new := v_new || 'custody.view'::text;
        if v_teams_id is not null then
          v_new := v_new || ('custody.' || v_teams_id || '.view') || ('custody.' || v_teams_id || '.edit');
        end if;

      elsif v_key = 'custody.places.view' then
        v_new := v_new || 'custody.view'::text;
        if v_projects_id is not null then v_new := v_new || ('custody.' || v_projects_id || '.view'); end if;

      elsif v_key in ('custody.places.edit', 'custody.places.manage') then
        v_new := v_new || 'custody.view'::text;
        if v_projects_id is not null then
          v_new := v_new || ('custody.' || v_projects_id || '.view') || ('custody.' || v_projects_id || '.edit');
        end if;

      elsif v_key in ('consumption.create.team', 'consumption.create.place') then
        v_new := v_new || 'consumption.create.custody'::text;

      else
        v_new := v_new || v_key;
      end if;
    end loop;

    -- Dedupe (order in a permission set is irrelevant) and write back only on change.
    v_new := (select array_agg(distinct k) from unnest(v_new) k);
    update public.custom_roles
       set permissions = coalesce(v_new, '{}'::text[])
     where id = r.id
       and permissions is distinct from coalesce(v_new, '{}'::text[]);
  end loop;
end $$;
