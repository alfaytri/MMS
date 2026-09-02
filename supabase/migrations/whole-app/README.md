# whole-app — clean schema (warehouse + field-service modules)

**Status: DONE (from a real backup). UNVERIFIED (not test-applied). Read before use.**

## What this is
`schema.sql` — a clean, consolidated schema for the **full application**: the warehouse
domain **plus** the field-service modules. Extracted from a real database backup, so unlike a
guess it reflects the actual tables/columns as they existed — renames, added columns, dropped
columns and all.

- **Source:** `db_cluster-23-08-2026@10-59-22.backup.gz` — a `pg_dumpall` cluster dump dated
  **2026-08-23** (the day the module import work happened). Read directly (plain SQL); no
  running database or Docker needed.
- **Scope:** `public` schema + extensions only. Supabase-managed schemas (`auth`, `storage`,
  `realtime`, `vault`, …) were dropped — a Supabase project already has those.
- **Cleaned:** roles, ownership (`OWNER TO`), session `SET`s, `\restrict`, and `setval` data
  removed. **RLS policies and grants kept.**

## Contents
**186 tables · 400 functions · 369 policies · 245 indexes · 135 triggers · 19 views · 74 enums · 5 extensions.**
The 186 public tables = the 114 in `../warehouse/` **plus ~72 module tables**, e.g.:
`contracts`, `contract_services`, `contract_milestones`, `contract_visits`, `contract_payments`;
`orders`, `order_services`, `order_quotations`, `order_quotation_line_items`, `order_visit_dates`,
`order_team_assignments`; `quotations`; `tl_invoices`, `tl_invoice_lines`, `tl_payment_batches`;
`qc_checklists`, `qc_inspection_results`, `qc_schedule`; `employees`, `employee_services`;
`chat_conversations`, `chat_messages`, `call_records`; `promotion_campaigns`, `promotion_rules`;
`customer_addresses`, `customer_subscriptions`, `installed_products`, `follow_up_requests`, …

## ⚠️ Two things to know
1. **Snapshot date.** This is the schema as of **2026-08-23**. The *warehouse* part here is
   ~2 weeks behind the current `../warehouse/` (which was pulled live). A diff of the two showed
   the current warehouse has only **1** extra table (`inventory_category_divisions`) — so the
   warehouse portion is nearly current, but treat `../warehouse/` as the source of truth for the
   warehouse domain and this file as the source for the **module** layer.
2. **Not test-applied.** Reconstructed cleanly but not yet run against a fresh DB. To verify:
   `supabase start`, apply `schema.sql` on an empty DB, resolve any ordering/extension gaps.
   (Docker/`supabase start` would let this be verified — offered but not needed for extraction.)

## Compared to the paused live DB `wkmvjxxmzstsvahuiwsz`
That project is the current whole-app DB but was paused (free-tier 2-DB limit). If you unpause it
later, I can pull its **current** schema the same way and diff it against this Aug-23 baseline to
show exactly what changed since.
