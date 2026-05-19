-- Insert cc_provider setting if not exists
insert into app_settings (key, value)
values ('cc_provider', '"wati"'::jsonb)
on conflict (key) do nothing;
