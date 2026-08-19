-- Custody → custody transfers: a per-custody-warehouse capability flag.
--
-- When true, the custody LOCATIONS under this warehouse may hand out stock to
-- OTHER custody locations from the Custody page (e.g. a project pool → a team).
-- Regular team warehouses leave this false, so teams can only RECEIVE, never
-- initiate a hand-out. Enforced server-side in rpc_create_custody_transfer and
-- surfaced as the "Transfer" action on the custody card only where it is true.
alter table public.warehouses
  add column if not exists can_transfer_custody boolean not null default false;

comment on column public.warehouses.can_transfer_custody is
  'Custody warehouses only: when true, locations here may transfer stock to other custody locations (Custody page -> Transfer). Teams / receive-only warehouses stay false.';
