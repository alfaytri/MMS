-- Phase 3: formalize return resolution status.
--
-- Before: "is this return resolved?" was inferred from
-- credit_notes.resolution_type IS NULL, which is fragile — a restocked
-- return with no credit note yet was invisible to the unresolved-banner,
-- and any code path that closed a return without going through
-- useCreateReplacementDelivery left the banner lit.
--
-- After: so_po_returns.status has explicit resolved_* values, and a single
-- RPC (rpc_close_return) is the only path that flips a return to a
-- resolved state. It also stamps credit_notes.resolution_type in the same
-- statement so the two stay in lockstep.
--
-- Enum values must be added in their own transaction before any code
-- references them; the RPC lives in a separate migration file
-- (20260729030100) that runs after commit.

alter type public.return_status add value if not exists 'resolved_credit';
alter type public.return_status add value if not exists 'resolved_replacement';
alter type public.return_status add value if not exists 'resolved_partial';
