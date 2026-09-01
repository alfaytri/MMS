# whole-app — clean schema (warehouse + field-service modules)

**Status: PARTIAL. Read this before using.** Generated autonomously overnight 2026-09-02.

## What "whole-app" means here
The full application = the **warehouse** domain **plus** the field-service modules
(team-leader + TL invoices, orders, contracts, quotations, contact-centre, calendar/map)
that live in the code on `full-build/admin-misc` but are **not deployed to any database**.

## Why this folder is only partial (honest status)
1. **Warehouse part — DONE & authoritative.** It is identical to the sibling `../warehouse/`
   files, which were reconstructed from the **live (staging) database catalog**. Use those as
   the whole-app base. (Do not duplicate them — the whole-app schema = `../warehouse/` + the
   module layer below.)
2. **Module part — NOT auto-generated (deliberately).** The module tables (`tl_invoices`,
   `tl_invoice_lines`, `tl_payment_batches`, `contracts`, `quotations`, `tl_visits`, the
   `contact_center*` tables, …) are **not present in any live database** (verified: 0 module
   tables in staging). Their only definitions are:
   - the old **`../20240101000000_baseline_schema.sql`** snapshot (predates the current module
     code — likely stale), plus
   - scattered later migrations,
   and the module *code* on this branch expects an *evolved* version of that schema that was
   never captured as a clean, deployable set.

   Because there is no live/deployable module DB to dump, and the naming overlaps with
   warehouse/sales objects (e.g. `sale_order`, `so_invoice`, `order_quotation` are **warehouse**
   features, not modules), auto-reconstructing a clean module schema here would be a **guess**
   that could silently diverge from what the module code needs. I chose not to ship a guess.

## Recommended way to finish whole-app (needs a scratch DB — Docker was unavailable here)
1. `supabase start` (spins up a local Postgres) **or** create a throwaway Supabase project.
2. Apply the **existing** `../*.sql` migrations in order against it (`supabase db reset` /
   `supabase migration up`). That replays the real, correct history and yields the true
   *current* schema the app expects.
3. `supabase db dump --schema public -f whole-app/full_schema.sql` → the authoritative clean
   whole-app baseline.
4. Split module-vs-warehouse from that dump if you still want two files, or diff it against
   `../warehouse/` to isolate exactly the module delta.

That path is correct-by-construction; the catalog reconstruction I did for `../warehouse/`
was only necessary because Docker/dump wasn't available in this session.

## Candidate module migrations (raw material, for reference)
See `../REBUILD-README.md` and the scratch list of module-touching migrations. Treat that list
as fuzzy — verify against the module code before trusting any single file as the source of truth.
