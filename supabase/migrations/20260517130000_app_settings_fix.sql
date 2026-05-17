-- Add anon read policy for app_settings so the contact-centre
-- provider check can be performed without an authenticated session.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'app_settings'
      and policyname = 'anon read'
  ) then
    execute 'create policy "anon read" on app_settings for select to anon using (true)';
  end if;
end $$;

-- Ensure the cc_provider row exists (insert idempotently).
-- value column is JSONB; store the string as a JSON string literal.
insert into app_settings (key, value)
values ('cc_provider', '"wati"'::jsonb)
on conflict (key) do nothing;
