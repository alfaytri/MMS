# MMS — Production Database Audit (2026-08-26)

**Target:** new-prod `optishfnnctrhffpoywg` (`alfaytriinventory.vercel.app`)
**Engine:** PostgreSQL 17.6 · **Size:** 31 MB · **Method:** read-only `psql` over the
system catalogs + a live anon-key REST probe to confirm exposure. No writes to prod.
**Rubric:** `docs/DB Audits/Audit requirement/rules.md` (security → indexing → column
types → schema integrity → essential queries).
**Prior audit:** `docs/performance/2026-08-20-db-audit.md` (deltas noted below).

---

## Verdict — **B+ / "healthy foundations, four anon holes to close"**

The schema is professionally built and the performance foundations are excellent: 100%
of `SECURITY DEFINER` functions pin `search_path`, every table has a primary key, every
timestamp is `timestamptz`, bloat is negligible, and **no application query is slow**
(all < 60 ms average). A genuine **division-scoped RESTRICTIVE RLS layer** (110 policies
over ~28 core business tables) is doing real authorization work — this is better than a
catalog glance suggests.

The prior audit's #1 finding (two anon-readable data functions) **has been fixed**. But
the schema has grown since (111 → 114 tables, 354 → 377 functions) and **four new
public-facing gaps slipped in** — objects the `anon`/publishable key can reach because
they were **missed by the division-scope hardening**. Two leak data *right now*; two are
wide-open but currently empty. None is a performance fire; all are quick, reversible
hardening fixes.

### Scorecard against the rubric

| Rubric area | Result | Grade |
|---|---|---|
| RLS coverage (every public table) | 113 / 114 — **`warranty_claim_counters` has RLS OFF** | ⚠️ |
| Policy granularity (no blind `USING(true)` on sensitive data) | 129 permissive `USING(true)`, but **110 RESTRICTIVE division policies** backstop the sensitive ones; **4 tables have no backstop** | ⚠️ |
| Function exec context (`SECURITY DEFINER` + pinned `search_path`) | 292 / 292 pin `search_path` — **zero injection surface** | ✅ |
| Views respect RLS (`security_invoker`) | 12 / 13 — **`warehouse_sub_container_totals` bypasses RLS, anon-readable** | ⚠️ |
| FK indexes | ~140 FK columns unindexed (no impact at current scale) | 🟡 |
| Duplicate / unused indexes | 16 dup groups; 139 zero-scan (**pre-traffic — do NOT prune yet**) | 🟡 |
| Column types (enum vs check vs FK) | 64 enums + 85 checks; heavy enum use on churny statuses; `status` is text on some tables, enum on others | 🟡 |
| Primary keys | 0 tables without a PK | ✅ |
| `timestamptz` everywhere | 0 naive `timestamp` columns | ✅ |
| Cascade rules explicit | 154 / 342 FKs left at `NO ACTION` (safe default, not explicit) | 🟡 |
| Bloat / maintenance | max 47 dead tuples; autovacuum healthy | ✅ |
| Slow queries (`pg_stat_statements`) | no app query > 60 ms avg | ✅ |

---

## What changed since the 2026-08-20 audit

| Item | Then | Now |
|---|---|---|
| Anon-readable data functions `get_custody_master_list`, `get_category_stock_aggregates` | leaking PII / stock | ✅ **Fixed** (no longer anon-executable) |
| Anon-executable `SECURITY DEFINER` funcs | 29 | **20** (mostly triggers/guards now) |
| Public tables / functions | 111 / 354 | 114 / 377 (growth) |
| `warranty_claim_counters` | did not exist | ⚠️ **new table, RLS never enabled** |
| `warehouse_sub_container_totals` view anon leak | not flagged | ⚠️ **confirmed anon-readable (53 rows)** |
| `landed_cost_lines` / `_item_allocations` / `sale_delivery_lines` / `notifications` | — | ⚠️ **wide-open `{public}` policies, no division backstop** |
| Unindexed FKs | 140 | ~140 (hot-path indexes still not added) |

---

## Findings by severity

### 🔴 Critical — anon (publishable key) can reach these

Every finding below was **confirmed with a live REST call using the prod publishable
key** (`sb_publishable_EM2…`), not merely inferred from the catalog.

**C1 — `warehouse_sub_container_totals` view bypasses RLS and is anon-readable.**
The view is `security_invoker = false`, so it runs as its owner and ignores the
RESTRICTIVE `sub_container_scope` policies on the base table. Proof: with the anon key,
the **base table** `warehouse_sub_containers` returns `*/0` (blocked), but the **view**
returns **53 rows** of per-sub-container stock totals. Anyone with the public key (it
ships in the browser bundle) can read warehouse stock levels.
_Fix:_
```sql
alter view public.warehouse_sub_container_totals set (security_invoker = true);
revoke select on public.warehouse_sub_container_totals from anon;
```

**C2 — `warranty_claim_counters` has Row Level Security disabled.** It is the **only**
public table without RLS, yet `anon` holds full table privileges. RLS-off means the grant
is fully live: anon can read *and write* the warranty-claim numbering counter (integrity
risk — duplicate/forged claim numbers). Empty today, so nothing has leaked yet. Its
siblings `warranty_number_counters` and `consumption_number_counters` correctly use
"RLS on, no policy" (deny-all except `SECURITY DEFINER` RPCs).
_Fix (match the siblings):_
```sql
alter table public.warranty_claim_counters enable row level security;
-- intentionally no policy: reachable only via SECURITY DEFINER RPCs / service_role
revoke all on public.warranty_claim_counters from anon;   -- defense in depth
```

**C3 — Four tables have `{public}` `USING(true)` policies with no RESTRICTIVE backstop.**
`landed_cost_lines`, `landed_cost_item_allocations`, `sale_delivery_lines`, and
`notifications` carry permissive `ALL`/`SELECT` policies for the `public` role
(`= anon + authenticated`) and — unlike their siblings — have **no** `division_scope`
RESTRICTIVE policy. So anon can **read and write every row**.
- `notifications` → **31 rows readable by anon right now** (and `allow_all_notifications`
  `ALL {public}` lets anon insert/delete/tamper).
- The three financial/logistics tables are **empty today**, so nothing has leaked — but the
  policy leaves them fully open to anon read+write the instant they hold data.

These are exactly the tables the division-scope RLS remediation missed. _Fix:_ move them
off `{public}` and give them the same restrictive treatment as their siblings, e.g.:
```sql
-- minimum: kick anon out
alter policy allow_all_notifications on public.notifications to authenticated;
-- landed_cost_lines / landed_cost_item_allocations / sale_delivery_lines:
--   route through the existing division_scope remediation (add the *_scope_*_r
--   RESTRICTIVE policies their siblings already have) instead of {public} USING(true)
```

### 🟠 High

**H1 — Confirm the RESTRICTIVE division layer covers every sensitive table.** The good
news is the layer exists and works (110 policies; anon is correctly blocked on
`return_lines`, `sale_orders`, `bills`, `payments`, `credit_notes`, `so_invoices`,
`po_line_items`, `cogs_entries`, `consumption_entries`, `receivals`, `shipments`,
`warehouse_transfers`, `stock_adjustments`, …). C1–C3 are precisely the rows that fell
*outside* it. Action: treat "does this table have a `*_scope_*_r` policy?" as a checklist
item whenever a new business table is added, so the next `warranty_claim_counters` /
`landed_cost_lines` can't recur.

### 🟡 Medium

**M1 — `WITH CHECK` is technically absent on 26 UPDATE/ALL policies, but mostly benign.**
The rubric flags missing `WITH CHECK`. In practice Postgres falls back to the `USING`
expression as the `WITH CHECK`, and the division-scope UPDATE policies reference the
scoped column (`is_division_visible(division_id)`), so a user **cannot** move a row into a
division they don't own. The only real exposure is the un-backstopped `{public} USING(true)`
tables in **C3** (there the fallback check is `true`). Add explicit `WITH CHECK` when you
fix C3; elsewhere it's a best-practice/explicitness nit, not a hole.

**M2 — 20 anon-executable `SECURITY DEFINER` functions (defense-in-depth).** Down from 29,
and the two real data-leakers are gone. Of the remaining 20: most are **trigger functions**
(`trg_*`, `guard_*`, `_sale_orders_block_*`, `brands_propagate_name_fn`, …) that can't be
invoked as RPCs; `resolve_login_email` is **intentionally** anon (pre-auth username→email
lookup — keep it). The handful worth revoking from `anon` are the boolean predicate
helpers that accept a uid/array and would answer for *any* user:
`_user_can_create_catalog`, `_user_can_edit_catalog`, `_user_can_write_catalog`,
`_auth_can_create_catalog`, `_auth_can_write_catalog`, `is_any_division_visible`.
```sql
revoke execute on function
  public._user_can_create_catalog(uuid), public._user_can_edit_catalog(uuid),
  public._user_can_write_catalog(uuid), public._auth_can_create_catalog(),
  public._auth_can_write_catalog(), public.is_any_division_visible(uuid[])
from anon, public;
```

**M3 — ~140 foreign keys without a covering index.** ✅ **DONE 2026-08-26** — rather than
just the hot-path subset, all **133 public-schema** unindexed FKs were indexed in one pass
(migration `20261012000000_index_foreign_keys.sql`), applied to staging + new-prod
(uncovered public FKs 133 → 0 on both). Done now deliberately, while the tables are
near-empty, so `CREATE INDEX` was instant and non-blocking; post-launch it would have
needed `CONCURRENTLY`. The auth.*/storage.* FKs are left to Supabase. Original note kept
below for context.

Postgres does not auto-index FK columns. Zero measurable impact today (largest table is
1,044 rows) — but add the hot-path ones **before** transaction volume grows, so joins and
cascade-delete checks don't fall to seq scans:
```sql
create index on public.fifo_cost_layers (sub_container_id);
create index on public.inventory_stock_movements (sub_container_id);   -- (+ warehouse_id)
create index on public.consumption_entries (created_by, posted_by);
create index on public.so_po_returns (division_id, restock_warehouse_id);
create index on public.stock_adjustments (sub_container_id, warehouse_id, brand_variant_id);
create index on public.sale_deliveries (sale_order_id, warehouse_id);
```
The many `created_by` / `reviewed_by` / `uploaded_by` audit FKs are **low priority** —
index only if an audit-by-user report gets slow.

### 🟢 Low / housekeeping

- **L1 — 5–6 truly redundant duplicate indexes** (a plain index duplicating a UNIQUE on the
  same column): `idx_customer_phones_phone`, `idx_approval_chains_division`,
  `idx_bills_purchase_order_id`, `idx_invoices_sale_order_id`, and one of
  `idx_cogs_delivery` / `idx_cogs_entries_sale_delivery_id`. Drop the plain twin (minor
  write-amplification win). Leave the `auth.*`/`storage.*` pairs (Supabase-managed).
- **L2 — Do NOT prune the 139 "unused" indexes.** Stats were reset 2026-07-24 and prod has
  near-zero transactions, so "zero scans" mostly means "feature not exercised yet"
  (division-scope and reporting indexes waiting for real traffic). Re-run this check ~30
  days after go-live before dropping anything — applying the rubric's "drop unused index"
  rule now would delete anticipatory indexes.
- **L3 — 154 / 342 FKs are `ON DELETE NO ACTION`** (the implicit default). It's safe (blocks
  orphaning) but not the "explicit cascade rule" the rubric asks for. Deletes are rare in
  this ERP; review parent-delete intent opportunistically, not urgently.
- **L4 — Column-type consistency.** 64 enums is heavy. Stable domains (`payment_direction`,
  `customer_entity_type`, `address_type`) are perfect for enums. Churny workflow states
  (`sale_order_status` 9 vals, `return_status` 11, `po_status` 7, `stock_movement_type` 19)
  are the ones the rubric would put in `TEXT + CHECK` — adding a value needs
  `ALTER TYPE … ADD VALUE`, and removing/reordering means recreating the type. Also `status`
  is `text` on some tables and an enum on others — pick one convention going forward. And a
  legacy `division` enum (`maintenance, cleaning, kitchen, pest-control`) coexists with the
  dynamic `company_divisions` table — verify nothing still binds to the enum, since new
  divisions can't be enum values. No retroactive migration needed; this is guidance for new
  columns. Several enums (`promotion_rule_type`, `voucher_type`, `qc_*`, `order_status`,
  `tl_order_type`, `message_source`, …) belong to modules pruned from this build — harmless
  orphan types, optional cleanup.
- **L5 — Auth config lints are not visible via SQL.** Check **Dashboard → Advisors** and
  **Authentication → Policies/Settings** for leaked-password protection, MFA options, OTP
  expiry, and minimum password length (`config.toml` shows a local `minimum_password_length
  = 6`, which is weak if it mirrors prod).

---

## Performance — how prod is doing

**Healthy, and comfortably pre-traffic.** 31 MB total; ~5,700 live rows across all schemas;
largest table `inventory_item_brand_variants` at 1,044 rows / 1.4 MB.

- **No slow application queries.** In `pg_stat_statements` (since 2026-07-24), the top
  entries by total time are Supabase **dashboard/PostgREST schema-introspection** queries
  (`pg_timezone_names`, domain/base-type recursion, extension listing) — infrastructure
  noise, not app load. The heaviest *app* queries are `warehouse_sub_container_totals`
  (≈24 ms avg, 663 calls) and `rpc_financial_dashboard` (≈56 ms avg, 276 calls) — both fine.
- **Seq scans are optimal, not a problem.** Tables showing high seq-scan % (`user_data`,
  `warehouses`, `inventory_categories`) are tiny; Postgres correctly prefers a seq scan over
  an index for a 60-row table. Revisit once tables cross ~10k rows.
- **Maintenance is clean.** Max 47 dead tuples; autovacuum/autoanalyze running recently on
  active tables.

The practical performance takeaway: the DB will be fast at go-live. The one thing that
turns into a real cost *later* is M3 (FK indexes) once transaction tables start filling —
cheap to add now, painful to diagnose under load.

---

## What else is needed — prioritized

1. **Ship a hardening migration for C1–C3** (the four anon gaps + the M2 predicate-helper
   revokes). Small, reversible, no app-code change. This is the only pre-live blocker.
2. **Add the M1 explicit `WITH CHECK`** clauses while touching C3's policies.
3. **Add the M3 hot-path FK indexes** (separate small migration) before real volume.
4. **Cross-check the RESTRICTIVE division layer (H1)** and make "has a `*_scope_*_r`
   policy?" a checklist item for every new business table.
5. **Review Dashboard → Advisors + auth settings (L5)**, and re-confirm the
   `custom_access_token_hook` is enabled on `optishfnnctrhffpoywg` (division switcher /
   financials depend on it).
6. **Defer** duplicate-index cleanup (L1) and unused-index pruning (L2 — wait ~30 days
   post-traffic). Treat enum/cascade items (L3–L4) as forward-looking conventions.

---

## Reproduce

```bash
# read-only, direct connection (IPv6); never touches the CLI link
psql "postgresql://postgres:<pw>@db.optishfnnctrhffpoywg.supabase.co:5432/postgres?sslmode=require" \
  -f docs/DB\ Audits/prod_audit.sql
```
Full query set and captured output are in the scratchpad (`prod_audit.sql`,
`prod_audit_out.txt`); the live anon probes used the prod publishable key against
`/rest/v1/<object>?select=*` with `Prefer: count=exact`.
