insert into storage.buckets (id, name, public)
values ('division-assets', 'division-assets', true)
on conflict (id) do nothing;

create policy "Public can read division assets"
  on storage.objects for select
  to public
  using (bucket_id = 'division-assets');

create policy "Authenticated users can upload division assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'division-assets');

create policy "Authenticated users can update division assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'division-assets');

create policy "Authenticated users can delete division assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'division-assets');
