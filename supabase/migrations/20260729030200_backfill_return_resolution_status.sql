-- Phase 3 (cont.): backfill so_po_returns.status for returns whose credit
-- notes were already resolved under the old model (before the new
-- resolved_* enum values existed).
--
-- Without this, the unresolved-banner (which now filters on
-- so_po_returns.status = 'restocked') would show for returns whose credit
-- notes were long-since resolved as 'refund' / 'replacement' / 'store_credit'.
--
-- Pre-migration state captured 2026-07-28 on staging:
--   SR-00001: CN resolution_type NULL       -> keep 'restocked'
--   SR-00002: CN resolution_type 'store_credit' -> advance to 'resolved_credit'
--   SR-00003: CN resolution_type 'replacement'  -> advance to 'resolved_replacement'
--   SR-00004: CN resolution_type NULL       -> keep 'restocked'

update public.so_po_returns r
set status = case cn.resolution_type
    when 'refund'       then 'resolved_credit'::public.return_status
    when 'store_credit' then 'resolved_credit'::public.return_status
    when 'replacement'  then 'resolved_replacement'::public.return_status
  end,
  updated_at = now()
from public.credit_notes cn
where r.credit_note_id = cn.id
  and r.status = 'restocked'
  and r.source_type = 'sale_order'
  and cn.resolution_type in ('refund', 'store_credit', 'replacement');
