-- Map 3CX extension number to MMS profile so we can attribute calls to agents.

alter table public.profiles
  add column if not exists threecx_extension text;

create unique index if not exists profiles_threecx_extension_uq
  on public.profiles(threecx_extension)
  where threecx_extension is not null;
