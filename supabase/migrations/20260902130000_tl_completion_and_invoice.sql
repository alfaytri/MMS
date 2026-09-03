-- 20260902130000_tl_completion_and_invoice.sql
-- C + E: decouple job-completion from invoicing, persist field data, server-author invoice money.
-- Applied to whole-app dev DB only (wkmvjxxmzstsvahuiwsz). NOT pushed to prod/staging.

-- ── E: persist field data ─────────────────────────────────────────────────
create table if not exists public.visit_completions (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null unique,           -- polymorphic assignment id (per team)
  source_id        uuid,
  source_type      text,                           -- 'order' | 'site_visit' | 'contract'
  team_id          uuid,
  completed_by     uuid references public.user_data(id) on delete set null,
  completed_at     timestamptz not null default now(),
  service_statuses jsonb not null default '{}'::jsonb,   -- {serviceId: 'done'|'skipped'|'issue'}
  damage_report    jsonb,                                -- {noted, description, photo_urls[]}
  notes            text,
  qc_scores        jsonb,
  added_services   jsonb,                                -- extra billable services captured at completion
  signature_url    text,
  photo_urls       text[] not null default '{}',
  created_at       timestamptz not null default now()
);
-- Additive for an already-created table.
alter table public.visit_completions add column if not exists added_services jsonb;

alter table public.visit_completions enable row level security;
-- Read for any authenticated user; writes go ONLY through the SECURITY DEFINER
-- rpc below (no write policy → direct client writes are blocked).
drop policy if exists p_visit_completions_read on public.visit_completions;
create policy p_visit_completions_read on public.visit_completions
  for select using (auth.role() = 'authenticated');

-- ── E + C decouple: complete a visit (persist + set status), no invoice ────
drop function if exists public.complete_visit(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb,text[],text,uuid);
drop function if exists public.complete_visit(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb,text[],text,uuid,jsonb);
create function public.complete_visit(
  p_visit_id         uuid,
  p_source_id        uuid,
  p_source_type      text,
  p_completed_by     uuid,
  p_service_statuses jsonb    default '{}'::jsonb,
  p_damage           jsonb    default null,
  p_notes            text     default null,
  p_qc_scores        jsonb    default null,
  p_photo_urls       text[]   default '{}',
  p_signature_url    text     default null,
  p_team_id          uuid     default null,
  p_added_services   jsonb    default null)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_updated int := 0; v_id uuid;
begin
  -- Optimistic-lock complete the source record (first completer wins).
  if p_source_type = 'order' then
    update public.orders
       set status='completed', completed_at=now(), completed_by=p_completed_by
     where id=p_source_id and status not in ('completed','customer-unavailable');
    get diagnostics v_updated = row_count;
  elsif p_source_type = 'site_visit' then
    update public.site_visits
       set status='completed', completed_at=now(), completed_by=p_completed_by
     where id=p_source_id and status not in ('completed','customer-unavailable');
    get diagnostics v_updated = row_count;
  elsif p_source_type = 'contract' then
    update public.contract_visits set completed=true
     where id=p_visit_id and completed=false;
    get diagnostics v_updated = row_count;
  else
    raise exception 'Unknown source_type %', p_source_type;
  end if;

  -- Already completed: allowed only when THIS visit already has a completion row
  -- (same team editing its own work); otherwise another team got there first.
  if v_updated = 0 and not exists (
    select 1 from public.visit_completions where visit_id = p_visit_id
  ) then
    raise exception 'already_completed';
  end if;

  insert into public.visit_completions (
    visit_id, source_id, source_type, team_id, completed_by,
    service_statuses, damage_report, notes, qc_scores, added_services, photo_urls, signature_url
  ) values (
    p_visit_id, p_source_id, p_source_type, p_team_id, p_completed_by,
    coalesce(p_service_statuses,'{}'::jsonb), p_damage, p_notes, p_qc_scores, p_added_services,
    coalesce(p_photo_urls,'{}'), p_signature_url
  )
  on conflict (visit_id) do update set
    service_statuses = excluded.service_statuses,
    damage_report    = excluded.damage_report,
    notes            = excluded.notes,
    qc_scores        = excluded.qc_scores,
    added_services   = excluded.added_services,
    photo_urls       = excluded.photo_urls,
    signature_url    = excluded.signature_url,
    completed_by     = excluded.completed_by,
    completed_at     = now()
  returning id into v_id;

  return v_id;
end;
$function$;

-- Repair: this dev DB was missing tl_invoice_seq + the BEFORE INSERT number
-- trigger (both defined in baseline_schema but not applied here), so ANY insert
-- into tl_invoices — old client path or the new RPC — hit a NOT NULL violation
-- on invoice_number. Recreate the intended infra (idempotent).
create sequence if not exists public.tl_invoice_seq;
drop trigger if exists tl_invoice_number_trigger on public.tl_invoices;
create trigger tl_invoice_number_trigger before insert on public.tl_invoices
  for each row execute function public.generate_tl_invoice_number();

-- ── C: server-authored TL invoice (money computed + validated server-side) ─
create or replace function public.create_tl_invoice(
  p_visit_id         uuid,
  p_order_id         text,
  p_customer_name    text,
  p_customer_phone   text,
  p_lines            jsonb,                 -- [{name, qty, unit_price}]
  p_discount         numeric default 0,
  p_payment_method_id uuid   default null,
  p_notes            text    default null,
  p_created_by       uuid    default null,
  p_mark_paid        boolean default false)
 returns table(id uuid, invoice_number text)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_subtotal numeric := 0; v_discount numeric; v_total numeric; v_id uuid;
  v_line jsonb; v_qty numeric; v_unit numeric;
begin
  if p_visit_id is null then raise exception 'visit_id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line required';
  end if;
  if exists (select 1 from public.tl_invoices where visit_id = p_visit_id) then
    raise exception 'invoice_exists';
  end if;

  -- Recompute the money on the server; never trust a client total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    v_unit := coalesce((v_line->>'unit_price')::numeric, 0);
    if v_qty  <= 0 then raise exception 'line qty must be > 0'; end if;
    if v_unit <  0 then raise exception 'line unit_price must be >= 0'; end if;
    v_subtotal := v_subtotal + (v_qty * v_unit);
  end loop;

  v_discount := least(greatest(coalesce(p_discount,0), 0), v_subtotal);
  v_total    := v_subtotal - v_discount;

  insert into public.tl_invoices (
    visit_id, order_id, customer_name, customer_phone,
    subtotal, discount_amount, total_amount, payment_method_id,
    payment_status, notes, created_by
  ) values (
    p_visit_id, p_order_id, p_customer_name, p_customer_phone,
    v_subtotal, v_discount, v_total, p_payment_method_id,
    case when p_mark_paid or v_total = 0 then 'paid' else 'unpaid' end,
    p_notes, p_created_by
  ) returning tl_invoices.id into v_id;

  insert into public.tl_invoice_lines (tl_invoice_id, name, qty, unit_price, total)
  select v_id, (l->>'name'),
         (l->>'qty')::numeric, (l->>'unit_price')::numeric,
         (l->>'qty')::numeric * (l->>'unit_price')::numeric
  from jsonb_array_elements(p_lines) l;

  return query select v_id, ti.invoice_number from public.tl_invoices ti where ti.id = v_id;
end;
$function$;

-- ── Grants (SECURITY DEFINER funcs: authenticated only) ────────────────────
revoke all on function public.complete_visit(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb,text[],text,uuid,jsonb) from public, anon;
revoke all on function public.create_tl_invoice(uuid,text,text,text,jsonb,numeric,uuid,text,uuid,boolean) from public, anon;
grant execute on function public.complete_visit(uuid,uuid,text,uuid,jsonb,jsonb,text,jsonb,text[],text,uuid,jsonb) to authenticated;
grant execute on function public.create_tl_invoice(uuid,text,text,text,jsonb,numeric,uuid,text,uuid,boolean) to authenticated;

-- ── E: storage bucket for completion photos + signature ────────────────────
insert into storage.buckets (id, name, public)
values ('visit-completions', 'visit-completions', true)
on conflict (id) do nothing;

drop policy if exists "visit_completions_insert" on storage.objects;
create policy "visit_completions_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'visit-completions');
drop policy if exists "visit_completions_read" on storage.objects;
create policy "visit_completions_read" on storage.objects
  for select to authenticated using (bucket_id = 'visit-completions');
