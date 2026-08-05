-- Phase 8 Sub-task 8.1b: Rename credit_note_status enum values to describe the
-- CN/DN return-resolution lifecycle rather than customer-visibility.
--
-- Old vocabulary was borrowed from invoice lifecycle:
--   draft / approved / issued / redeemed
-- New vocabulary is process-focused:
--   open (return unresolved) / in_progress (partial) / resolved (all lines
--   resolved) / void (cancelled).
--
-- Design decisions:
-- 1. Enum type name stays `credit_note_status` — renaming would touch every
--    SQL reference across migrations for zero end-user gain.
-- 2. Drop `redeemed` state entirely. Store-credit consumption is already
--    derived from the payments ledger; a separate flag was duplicated state.
-- 3. Both credit_notes and debit_notes share this enum type — both surfaces
--    speak the new vocabulary after this migration.
-- 4. `draft` and `approved` values remain in the enum type (Postgres does not
--    support dropping enum values). The next backfill migration reassigns any
--    rows still using them; once the app never writes them again they are
--    effectively dead vocabulary.
--
-- Postgres semantics:
--   ALTER TYPE ... RENAME VALUE is a catalog-only rename — instant, no row
--   rewrites. Every rowset column using the enum keeps pointing at the same
--   internal ordinal; only the label changes.
--   ALTER TYPE ... ADD VALUE is safe inside a transaction on PG12+ as long
--   as the new value is not consumed within the same transaction. Backfill
--   consumes the new values but runs in a subsequent migration, so this
--   restriction is satisfied.

alter type public.credit_note_status rename value 'issued'   to 'open';
alter type public.credit_note_status rename value 'redeemed' to 'resolved';

alter type public.credit_note_status add value if not exists 'in_progress' after 'open';
alter type public.credit_note_status add value if not exists 'void';

alter table public.credit_notes alter column status set default 'open';
alter table public.debit_notes  alter column status set default 'open';

comment on type public.credit_note_status is
  'CN/DN return-resolution lifecycle. open → in_progress → resolved, or void for cancellation. Type name is legacy (introduced when credit_notes existed alone); debit_notes reuses it so both surfaces speak the same vocabulary. Legacy values `draft` and `approved` remain in the type but are unused by application code as of Phase 8.1b.';
