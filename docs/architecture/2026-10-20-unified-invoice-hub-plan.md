# Unified Invoice Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `invoices` the single hub that holds every customer-facing invoice, kept in sync from the per-type tables by triggers, with automatic PDF + Dibsy pay-link + WhatsApp (WATI) send on create, and a settlement webhook that marks the hub paid.

**Architecture:** Per-type detail tables (`so_invoices`, `tl_invoices`, `contract_invoices`) stay as-is and remain canonical for accounting. An `AFTER INSERT/UPDATE` trigger on each upserts one row into the `invoices` hub (polymorphic `invoice_type` + `source` + `source_id`) and marks it `dispatch_status='pending'`. A cron worker picks up pending rows and runs one generic dispatch (PDF via a type registry → Dibsy link → WATI template linking to `/pay/{hubId}`), generalizing the existing `create-tl-invoice` route. The Dibsy webhook resolves payments to the hub row, marks it paid, and syncs status back to the detail table.

**Tech Stack:** Next.js 15 (app router) API routes, Supabase Postgres (triggers, RLS, SQL migrations), TanStack Query, vitest. Existing: `src/lib/dibsy.ts`, WATI v2 `sendTemplateMessage`, per-type PDF generators, `/pay/[invoiceId]`.

**Spec:** `docs/architecture/2026-10-20-unified-invoice-hub-design.md`

## Global Constraints

- Full-build / whole-app only. DEV-only; never deploy to warehouse prod. Migrations apply to the full-build dev DB `wkmvjxxmzstsvahuiwsz` and go in BOTH `supabase/migrations/` and `supabase/migrations-staging/`.
- Migration numbering continues after `20261152`: use `20261153`, `20261154`, `20261155`.
- `so_invoices` stays canonical for AR accounting — no accounting read repoints in this plan.
- Hub sync is one-directional (detail → hub) via trigger. Never write the detail from the hub except the webhook's paid-status sync.
- Scope for this phase: `so_invoices` (sales), `tl_invoices` (all service, incl. emergency), `contract_invoices`. Supplier/AP invoices (`direction='in'` / purchase) are excluded from dispatch. Subscriptions are in scope per the spec but keep their existing Dibsy activation path here (no PDF invoice); they fold into the hub later via the extension contract — a deliberate v1 deferral to keep this plan tractable.
- Dispatch is idempotent: a hub row dispatches once. A Dibsy link is created once and reused (never duplicated). Zero-balance invoices are skipped.
- Reuse, do not reinvent: `createDibsyPayment` (`src/lib/dibsy.ts`), the WATI v2 `sendTemplateMessage` pattern from `create-tl-invoice/route.ts`, the per-type PDF generators, and the `/pay/[invoiceId]` page.
- Currency QAR; amounts `toFixed(2)`.
- Do not break the existing `tl_invoices` / `contract_invoices` / `customer_subscriptions` Dibsy paths while the hub path lands.

## Review Focus

- **Zero-balance / already-paid invoice:** dispatch must skip it — no Dibsy link, no WhatsApp (Task 5 test).
- **Missing customer phone:** PDF + Dibsy link still produced; WhatsApp skipped and logged; dispatch still counts as sent, not failed (Task 5 test).
- **Dibsy or WATI failure mid-dispatch:** hub row left `dispatch_status='failed'` with the error, no partial double-send; the cron retries it (Task 5 + Task 6 tests).
- **Double dispatch (cron fires twice, or a fast-path + cron overlap):** idempotent — one link, one send; the second call is a no-op (Task 5 test).
- **Detail row amount changes after dispatch but before payment:** the hub row updates; the unpaid Dibsy link is regenerated for the new amount (Task 2 + Task 5 test).

---

### Task 1: Hub hardening + dispatch columns migration

**Files:**
- Create: `supabase/migrations/20261153000000_invoice_hub_harden.sql`
- Create: `supabase/migrations-staging/20261153000000_invoice_hub_harden.sql` (identical)

**Interfaces:**
- Produces: table `public.invoices` with a PRIMARY KEY on `id` (named `invoices_hub_pkey` — `so_invoices` already owns `invoices_pkey`), indexes (`idx_invoices_hub_*`) on `customer_id, invoice_type, payment_status, dibsy_payment_id, sale_order_id, division, created_at`, new columns `sent_at timestamptz`, `dispatch_status text NOT NULL DEFAULT 'pending'` (CHECK in `('pending','sent','failed','skipped')`), `dispatch_error text`, `customer_name text`, `customer_phone text`, `detail_table text`, `detail_id uuid`, a UNIQUE INDEX on `(detail_table, detail_id)` (the hub's detail key), and RLS enabled with an authenticated-only policy. NOTE: the pre-existing `invoice_type` (enum `cash`/`credit` = payment type) and `source` (enum `sale_order`/`contract`/`quotation` = source document) are legacy columns and are NOT the hub key; the business-line kind is derived from `detail_table` in code. The legacy `source`/`source_id`/`invoice_type` are made nullable (DROP NOT NULL) so hub rows need not carry them, and a CHECK `invoices_hub_detail_both` enforces that `(detail_table, detail_id)` are both-null or both-set.

- [ ] **Step 1: Write the migration**

PK + unique + the audit indexes + the dispatch columns + RLS baseline. `ADD PRIMARY KEY (id)` is safe only if `id` is unique — it is (`gen_random_uuid()` default, and the table is empty on dev). Guard with `IF NOT EXISTS` on indexes/columns. RLS: `ENABLE ROW LEVEL SECURITY` + one `FOR ALL TO authenticated USING (true) WITH CHECK (true)` policy + `REVOKE ALL FROM anon` (division-scoped RLS is deferred per the spec).

- [ ] **Step 2: Apply to the dev DB and verify**

Run: `npx supabase db query --linked --project-ref wkmvjxxmzstsvahuiwsz --file supabase/migrations/20261153000000_invoice_hub_harden.sql`
Expected: empty rows (DDL ok). Then a verify query returns `has_pk=true`, the new columns present, `rls=true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261153000000_invoice_hub_harden.sql supabase/migrations-staging/20261153000000_invoice_hub_harden.sql
git commit -m "feat(invoices): hub hardening — PK, indexes, RLS, dispatch columns"
```

---

### Task 2: Detail → hub sync triggers

**Files:**
- Create: `supabase/migrations/20261154000000_invoice_hub_sync_triggers.sql` (+ identical staging copy)

**Interfaces:**
- Consumes: the hub columns from Task 1.
- Produces: trigger function `public.sync_invoice_hub()` and `AFTER INSERT OR UPDATE` triggers on `so_invoices`, `tl_invoices`, `contract_invoices`. Each upserts one `invoices` row keyed by `(detail_table, detail_id)` — `detail_table` = the per-type table name, `detail_id` = `NEW.id` — via `ON CONFLICT (detail_table, detail_id)`. It sets `direction='ar'`; `customer_name` + `customer_phone` (for `so_invoices`: resolve from `customer_id` via `customer_phones`; for `tl_`/`contract_invoices`: copy their `customer_name`/`customer_phone` text columns); `subtotal/discount_amount/total_amount/paid_amount`, `payment_status`, `pdf_url`, `invoice_id`/number, `division`; and copies `dibsy_payment_id`/`dibsy_checkout_url` from the detail row when present (`tl_`/`contract_invoices` have them) so the hub reuses an existing link rather than minting a second one. It explicitly sets the legacy `source`/`source_id`/`invoice_type` columns to NULL (so the `invoice_type` default `'credit'` never leaks onto a hub row), and the function raises an exception if `detail_table` or `detail_id` would be NULL (the key must always be set). On a NEW row it sets `dispatch_status='pending'`; on UPDATE it leaves `dispatch_status` unless `total_amount` changed and the row is unpaid, in which case it clears `dibsy_payment_id`/`dibsy_checkout_url` and re-sets `dispatch_status='pending'`. The function is `SECURITY DEFINER` with `SET search_path = public`. This migration ALSO tightens the hub RLS (safe now that the DEFINER trigger does the writes): drop Task 1's `invoices_rw FOR ALL` policy, add `invoices_hub_select FOR SELECT TO authenticated USING (true)`, and `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.invoices FROM authenticated` — hub writes now come only from the SECURITY DEFINER trigger and service-role callers (webhook/cron/pay page). This is the write-access gate the Task 1 review flagged, and it must be in place before Task 6's cron is enabled.

- [ ] **Step 1: Write the failing test (SQL, rolled back)**

A `DO` block that inserts one `tl_invoices` row, then `RAISE EXCEPTION 'CHECK %', (select jsonb_build_object('dt', detail_table, 'total', total_amount, 'dir', direction, 'dispatch', dispatch_status) from invoices where detail_table='tl_invoices' and detail_id = <new id>)` to capture the synced hub row while rolling back. Expected captured: `dt='tl_invoices'`, `total` equal to the detail's `total_amount`, `dir='ar'`, `dispatch='pending'`.

- [ ] **Step 2: Run it against the dev DB to verify the hub row is missing**

Run the DO block before creating the trigger. Expected: the SELECT finds no hub row (the capture is null) — proving the sync isn't there yet.

- [ ] **Step 3: Write the trigger function + triggers**

The per-table column mapping is the decision — include the full `sync_invoice_hub()` body with a branch per `TG_TABLE_NAME` mapping that table's columns into the hub's common columns, setting `detail_table = TG_TABLE_NAME`, `detail_id = NEW.id`, `direction = 'ar'`, plus the three `CREATE TRIGGER` statements. The business-line kind (sales/service/contract) is NOT stored — it is derived from `detail_table` in code (Task 4). Do not set the legacy `invoice_type`/`source` enums.

- [ ] **Step 4: Apply and re-run the capture**

Run the migration, then the Step-1 DO block. Expected: captured `dt='tl_invoices'`, matching total, `dir='ar'`, `dispatch='pending'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261154000000_invoice_hub_sync_triggers.sql supabase/migrations-staging/20261154000000_invoice_hub_sync_triggers.sql
git commit -m "feat(invoices): detail->hub sync triggers"
```

---

### Task 3: Backfill existing invoices into the hub

**Files:**
- Create: `supabase/migrations/20261155000000_invoice_hub_backfill.sql` (+ identical staging copy)

**Interfaces:**
- Consumes: the triggers/columns from Tasks 1–2.
- Produces: one hub row per existing `so_invoices`/`tl_invoices`/`contract_invoices` row not already present, `dispatch_status='sent'` (historical rows are not re-dispatched).

- [ ] **Step 1: Write the backfill**

Three `INSERT INTO invoices (...) SELECT ... FROM <detail> d WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.detail_table='<detail>' AND i.detail_id=d.id)`, using the same column mapping as the trigger (sets `detail_table`, `detail_id`, `direction='ar'`), with `dispatch_status='sent'`.

- [ ] **Step 2: Apply and verify counts**

Run the migration. Verify: `select count(*) from invoices` equals the sum of the three detail-table counts. (On the clean dev DB this is 0 = 0; the query proves the backfill is wired.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261155000000_invoice_hub_backfill.sql supabase/migrations-staging/20261155000000_invoice_hub_backfill.sql
git commit -m "feat(invoices): backfill hub from existing detail tables"
```

---

### Task 4: PDF renderer registry

**Files:**
- Create: `src/lib/invoices/types.ts`
- Create: `src/lib/invoices/pdf-registry.ts`
- Test: `src/lib/invoices/__tests__/pdf-registry.test.ts`

**Interfaces:**
- Produces (in `types.ts`): `type InvoiceType = 'sales' | 'service' | 'contract'`; `kindForDetailTable(detailTable: string): InvoiceType` mapping `so_invoices→'sales'`, `tl_invoices→'service'`, `contract_invoices→'contract'` (throws `Error('unknown detail_table <x>')` otherwise — this is how the hub's business-line kind is derived, since it is not stored). In `pdf-registry.ts`: `pdfRendererFor(type: InvoiceType): (detailId: string) => Promise<string>` returning the stored `pdf_url`, dispatching to the existing generators (`generate-invoice-pdf` for sales, `generate-tl-invoice-pdf` for service, `generate-contract-invoice-pdf` for contract). Unknown type throws `Error('no PDF renderer for <type>')`. First regenerate `src/types/database.types.ts` from the dev DB (the hub columns changed) and verify the generators' real signatures, adapting the wrappers to `(detailId) => Promise<pdf_url>`. (Subscriptions are deferred from the hub this phase — see Global Constraints — not an `InvoiceType` here; they fold in later via the extension contract: a `customer_subscriptions` trigger + a renderer.)

- [ ] **Step 1: Write the failing test**

`pdfRendererFor('service')` returns a function; `pdfRendererFor('x' as InvoiceType)` throws `no PDF renderer`. Mock the three generator modules; assert the service branch calls the TL generator with the given id.

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run src/lib/invoices` → FAIL (module not found).

- [ ] **Step 3: Implement `pdfRendererFor` in `src/lib/invoices/pdf-registry.ts`**

A `Record<InvoiceType, renderer>` mapping to the existing generators; throw on a missing key.

- [ ] **Step 4: Run it to verify it passes** — `npx vitest run src/lib/invoices` → PASS.

- [ ] **Step 5: Commit** — `feat(invoices): PDF renderer registry`.

---

### Task 5: Dispatch orchestrator

**Files:**
- Create: `src/lib/invoices/dispatch.ts`
- Test: `src/lib/invoices/__tests__/dispatch.test.ts`

**Interfaces:**
- Consumes: `pdfRendererFor` (Task 4); `createDibsyPayment` (`src/lib/dibsy.ts`); the hub columns (Task 1).
- Produces: `dispatchInvoice(hubId: string): Promise<{ status: 'sent' | 'skipped' | 'failed'; checkoutUrl?: string; error?: string }>`. Loads the hub row via the admin client. **Skip** (`dispatch_status='skipped'`) if `total_amount - paid_amount <= 0`. **No-op** returning `sent` if already `dispatch_status='sent'`. Otherwise: ensure `pdf_url` (if null, call `pdfRendererFor(kindForDetailTable(row.detail_table))(row.detail_id)` and store the returned url); ensure the Dibsy link (reuse `dibsy_checkout_url` if present and the amount is unchanged, else `createDibsyPayment` with `metadata.hub_invoice_id=hubId`, `redirectUrl=/pay/{hubId}`, `webhookUrl=/api/payments/dibsy/webhook`, store `dibsy_payment_id`+`dibsy_checkout_url`); send the WATI template to the hub row's `customer_phone` (reusing the `create-tl-invoice` send + `chat_messages` log pattern) — if no phone, skip the WhatsApp and log; set `dispatch_status='sent'`, `sent_at=now()`. On any thrown error set `dispatch_status='failed'`, `dispatch_error=<msg>`, and return `failed`.

- [ ] **Step 1: Write the failing tests**

With the Supabase admin client, `createDibsyPayment`, and the WATI `fetch` mocked: (a) a pending hub row with a positive balance and a phone → returns `sent`, Dibsy called once, hub marked `sent` with `sent_at`; (b) calling it again → returns `sent`, Dibsy NOT called again (idempotent); (c) zero balance → returns `skipped`, Dibsy not called; (d) no phone → returns `sent`, Dibsy called, WATI fetch not called; (e) `createDibsyPayment` throws → returns `failed`, hub `dispatch_status='failed'`, no WATI send.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/invoices/__tests__/dispatch.test.ts` → FAIL.

- [ ] **Step 3: Implement `dispatchInvoice`** in `src/lib/invoices/dispatch.ts`, generalizing `create-tl-invoice/route.ts` (Dibsy create → store → WATI template → chat_messages log) to operate on the hub row.

- [ ] **Step 4: Run to verify pass** — same command → PASS (all five).

- [ ] **Step 5: Commit** — `feat(invoices): idempotent dispatch orchestrator`.

---

### Task 6: Dispatch cron + enqueue path

**Files:**
- Create: `src/app/api/cron/dispatch-invoices/route.ts`
- Modify: `vercel.json` (register the cron) — check the existing cron block first.
- Test: `src/app/api/cron/dispatch-invoices/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `dispatchInvoice` (Task 5).
- Produces: `GET`/`POST` handler that selects hub rows with `dispatch_status='pending'` and `detail_table IS NOT NULL` (hub-managed customer-facing rows only), calls `dispatchInvoice` for each, and returns `{ processed, sent, skipped, failed }`. Auth: the project's existing cron-secret guard (match the other `/api/cron/*` routes).

- [ ] **Step 1: Write the failing test** — with `dispatchInvoice` mocked and two pending rows, the handler returns `processed: 2` and calls `dispatchInvoice` with each id.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/app/api/cron/dispatch-invoices` → FAIL.

- [ ] **Step 3: Implement the route** + register it in `vercel.json` following the existing cron entries (reuse the existing reminders cron's auth pattern).

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit** — `feat(invoices): cron dispatch of pending hub invoices`.

---

### Task 7: Webhook → hub settlement

**Files:**
- Modify: `src/app/api/payments/dibsy/webhook/route.ts`
- Test: `src/app/api/payments/dibsy/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: the hub columns (Task 1).
- Produces: a new webhook branch — when `payment.metadata.hub_invoice_id` is present and `payment.status='paid'`, update the hub row's `paid_amount` and `payment_status` (`paid` when `paid_amount >= total_amount`, else `partially_paid`), then sync the paid status to the detail row named by `detail_table`/`detail_id` (and, for `detail_table='so_invoices'`, call the existing AR payment-status RPC so accounting stays correct). The existing `tl_invoice_id` / `batch_id` / `subscription_id` / `invoice_id` branches stay for back-compat.

- [ ] **Step 1: Write the failing test** — a `paid` webhook with `metadata.hub_invoice_id` for a hub row (total 100) → hub `payment_status='paid'`, `paid_amount=100`, and the detail row's `payment_status` updated. Mock `getDibsyPayment` + the admin client.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/app/api/payments/dibsy/__tests__/webhook.test.ts` → FAIL.

- [ ] **Step 3: Implement the hub branch** near the top of the metadata router in `webhook/route.ts`.

- [ ] **Step 4: Run to verify pass** — PASS; existing webhook tests still green.

- [ ] **Step 5: Commit** — `feat(invoices): webhook settles the hub and syncs detail`.

---

### Task 8: All-Invoices page + hook

**Files:**
- Create: `src/hooks/useAllInvoices.ts`
- Create: `src/app/(dashboard)/invoices/page.tsx`
- Modify: `src/lib/nav-config.ts`, `src/lib/route-permissions.ts` (add the `/invoices` entry, permission `invoices.view`)
- Test: `src/hooks/__tests__/useAllInvoices.test.ts`

**Interfaces:**
- Consumes: the hub table.
- Produces: `useAllInvoices(filters: { type?: InvoiceType; status?: string; q?: string })` returning hub rows (`invoice_id`, `detail_table`, customer, `total_amount`, `paid_amount`, `payment_status`, `dibsy_checkout_url`, `pdf_url`, `sent_at`); the `type` filter maps to `detail_table` via a reverse of `kindForDetailTable` (service→`tl_invoices`, sales→`so_invoices`, contract→`contract_invoices`), and the page derives the displayed kind via `kindForDetailTable(row.detail_table)`. A page listing them with type/status filters and search, each row linking to its pay link + PDF.

- [ ] **Step 1: Write the failing test** — `useAllInvoices({ type: 'service' })` issues a select on `invoices` filtered to `detail_table='tl_invoices'`. Mock the Supabase client; assert the query shape.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/hooks/__tests__/useAllInvoices.test.ts` → FAIL.

- [ ] **Step 3: Implement the hook**, then the page (table + filters, following an existing list page like the shipments report for layout), and register nav + route permission.

- [ ] **Step 4: Run to verify pass** + `npx tsc --noEmit` + `npx next build` green.

- [ ] **Step 5: Commit** — `feat(invoices): all-invoices hub page`.

---

### Task 9: End-to-end verification on the dev DB

**Files:** none (verification task).

- [ ] **Step 1:** Seed one `tl_invoices` row (service) with a phone and positive total on the dev DB; confirm a hub row appeared `dispatch_status='pending'`.
- [ ] **Step 2:** Run the dispatch cron route locally (WATI mocked / test number) and confirm the hub row flips to `sent`, with `dibsy_checkout_url` + `sent_at` populated and a `chat_messages` log row.
- [ ] **Step 3:** POST a simulated `paid` webhook with `metadata.hub_invoice_id`; confirm the hub + the `tl_invoices` row both read `paid`.
- [ ] **Step 4:** Repeat Steps 1–3 for a `so_invoices` row; confirm accounting (`so_invoices.payment_status`) also updated.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx eslint` on changed files, `npx vitest run`, `npx next build` — all green. Commit a short `docs/` note of the E2E result.

---

## Rollout

Phased on full-build dev: Tasks 1–3 (hub + sync + backfill — read-only, nothing breaks) → Tasks 4–7 (dispatch + webhook, cron off / behind the cron-secret so it only runs when invoked) → Task 8 (page) → Task 9 (enable + verify). The existing TL/contract/subscription Dibsy paths keep working the whole time.
