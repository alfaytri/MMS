-- 20260918000000_team_item_flag.sql
-- Team-item routing flag for the "Service vs Team" consumption split.
--
-- Marks multi-use, team-held consumables (refrigerant, plastic rolls, ...) so a
-- team consumes them under the "Team item consumption" tab, while every other
-- item stays under "Service item consumption". Both tabs post through the SAME
-- rpc_post_consumption — this flag is a UI routing attribute only, with NO
-- effect on stock, FIFO, valuation, or COGS.
--
-- Two levels (operator decision — "per item is clean and category is good too"):
--   * inventory_categories.is_team_item  — category default, applies to items
--     filed directly under the category.
--   * inventory_items.is_team_item       — per-item override:
--         NULL  = inherit the category (default)
--         TRUE  = force team item
--         FALSE = opt this item OUT of a team category
--   Effective value used everywhere:
--       COALESCE(item.is_team_item, category.is_team_item, false)
--   (v1 reads the item's DIRECT category; category.parent_id inheritance is a
--    possible future refinement, mirroring how tool_tracking_mode is read.)
--
-- consumption_entries.is_team_item stamps each posted entry (derived
-- server-side in rpc_post_consumption from the consumed items, in a later
-- migration) so the two history lists are a cheap, stable filter and past
-- entries never retro-reclassify when a flag changes.
--
-- All three tables already have RLS enabled; these additive columns inherit the
-- existing policies — no new policy required. Idempotent (IF NOT EXISTS).

alter table public.inventory_categories
  add column if not exists is_team_item boolean not null default false;

alter table public.inventory_items
  add column if not exists is_team_item boolean;   -- NULL = inherit category

alter table public.consumption_entries
  add column if not exists is_team_item boolean not null default false;

comment on column public.inventory_categories.is_team_item is
  'Team-item default for items filed directly under this category. Routes them to the Team consumption tab. See migration 20260918000000.';
comment on column public.inventory_items.is_team_item is
  'Per-item team-item override. NULL=inherit category, TRUE/FALSE force. Effective = COALESCE(item, category, false). See migration 20260918000000.';
comment on column public.consumption_entries.is_team_item is
  'Routes the entry to the Team (true) vs Service (false) consumption history. Derived at post time from the consumed items. See migration 20260918000000.';
