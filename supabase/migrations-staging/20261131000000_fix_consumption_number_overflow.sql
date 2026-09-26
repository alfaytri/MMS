-- Fix: generate_consumption_number truncated the sequence once a monthly series
-- passed 99. lpad(v_seq::text, 2, '0') TRUNCATES to 2 chars when v_seq >= 100
-- (Postgres lpad shortens over-long strings), so seq 100 -> '10', colliding with
-- the existing CE-...-10 and raising duplicate key on consumption_entries_ce_number_key.
-- Fix: pad to a MINIMUM of 2 digits without ever truncating.
CREATE OR REPLACE FUNCTION public.generate_consumption_number(p_consumer_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type   text := lower(coalesce(p_consumer_type, 'internal'));
  v_period text := to_char(current_date, 'YYYY-MM');
  v_seq    int;
begin
  -- custody | internal only; anything not 'internal' books to the custody series.
  if v_type <> 'internal' then
    v_type := 'custody';
  end if;

  insert into public.consumption_number_counters (consumer_type, period, last_seq)
  values (v_type, v_period, 1)
  on conflict (consumer_type, period)
  do update set last_seq   = public.consumption_number_counters.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  -- e.g. CE-Custody-2026-08-01 / CE-Internal-2026-08-01. Minimum 2 digits, and
  -- grows past 99 WITHOUT truncation (greatest(2, len) never shrinks the number).
  return 'CE-' || initcap(v_type) || '-' || v_period || '-'
         || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
end;
$function$;
