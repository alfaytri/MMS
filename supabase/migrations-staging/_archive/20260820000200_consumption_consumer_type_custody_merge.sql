-- Virtual Warehouses — Migration 2 of 4: consumer_type → custody|internal + consumer column merge
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- With teams+places collapsed to one 'custody' behavior, consumption no longer needs
-- to distinguish team vs place: consumer_type becomes custody|internal and the two
-- parallel FK columns consumer_team_sub_id / consumer_place_sub_id merge into one
-- consumer_sub_container_id.
--
-- Live pre-check (staging 2026-08-12):
--   consumer_type CHECK on 3 tables: consumption_entries, consumption_number_counters,
--     cogs_entries — all ARRAY['team','place','internal'] (cogs allows NULL).
--   Only rpc_post_consumption reads consumer_team_sub_id / consumer_place_sub_id; only it
--     + generate_consumption_number read consumer_type. NO view / report RPC reads them,
--     so the merge does not ripple into reports. consumption_number_counters is EMPTY.
--   rpc_post_consumption is rewritten for the new shape in migration 3 (applied together).

-- ── A. Drop the three consumer_type CHECKs, migrate data, re-add as custody|internal ──
alter table public.consumption_entries        drop constraint if exists consumption_entries_consumer_type_check;
alter table public.consumption_number_counters drop constraint if exists consumption_number_counters_consumer_type_check;
alter table public.cogs_entries               drop constraint if exists cogs_entries_consumer_type_check;

update public.consumption_entries        set consumer_type = 'custody' where consumer_type in ('team','place');
update public.cogs_entries               set consumer_type = 'custody' where consumer_type in ('team','place');
update public.consumption_number_counters set consumer_type = 'custody' where consumer_type in ('team','place');

alter table public.consumption_entries
  add constraint consumption_entries_consumer_type_check
  check (consumer_type in ('custody','internal'));
alter table public.consumption_number_counters
  add constraint consumption_number_counters_consumer_type_check
  check (consumer_type in ('custody','internal'));
alter table public.cogs_entries
  add constraint cogs_entries_consumer_type_check
  check (consumer_type is null or consumer_type in ('custody','internal'));

-- ── B. consumption_entries: merge consumer_team_sub_id + consumer_place_sub_id → consumer_sub_container_id ──
alter table public.consumption_entries add column if not exists consumer_sub_container_id uuid;
update public.consumption_entries
   set consumer_sub_container_id = coalesce(consumer_team_sub_id, consumer_place_sub_id)
 where consumer_sub_container_id is null
   and coalesce(consumer_team_sub_id, consumer_place_sub_id) is not null;

alter table public.consumption_entries
  drop constraint if exists consumption_entries_consumer_team_sub_id_fkey,
  drop constraint if exists consumption_entries_consumer_place_sub_id_fkey;
alter table public.consumption_entries
  add constraint consumption_entries_consumer_sub_container_id_fkey
  foreign key (consumer_sub_container_id) references public.warehouse_sub_containers(id) on delete set null;
alter table public.consumption_entries
  drop column if exists consumer_team_sub_id,
  drop column if exists consumer_place_sub_id;

-- ── C. cogs_entries: same merge ──
alter table public.cogs_entries add column if not exists consumer_sub_container_id uuid;
update public.cogs_entries
   set consumer_sub_container_id = coalesce(consumer_team_sub_id, consumer_place_sub_id)
 where consumer_sub_container_id is null
   and coalesce(consumer_team_sub_id, consumer_place_sub_id) is not null;

alter table public.cogs_entries
  drop constraint if exists cogs_entries_consumer_team_sub_id_fkey,
  drop constraint if exists cogs_entries_consumer_place_sub_id_fkey;
alter table public.cogs_entries
  add constraint cogs_entries_consumer_sub_container_id_fkey
  foreign key (consumer_sub_container_id) references public.warehouse_sub_containers(id) on delete set null;
alter table public.cogs_entries
  drop column if exists consumer_team_sub_id,
  drop column if exists consumer_place_sub_id;

comment on column public.consumption_entries.consumer_sub_container_id is
'The custody sub-container (team / project / site) the consumption was booked to, when
 consumer_type=''custody''. NULL for consumer_type=''internal''. Replaces the former
 consumer_team_sub_id / consumer_place_sub_id split (Virtual Warehouses 2026-08-12).';
comment on column public.cogs_entries.consumer_sub_container_id is
'Custody sub-container the COGS was booked to (consumer_type=''custody''); NULL for internal.
 Replaces consumer_team_sub_id / consumer_place_sub_id (Virtual Warehouses 2026-08-12).';
