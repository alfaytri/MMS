# Plan — Warranty Module, Phase 1 (Policies + Records + Certificate)

**Owner:** Mohamed Ismail
**Branch target:** new feature branch off `deploy/warehouse-shipping`
**Scope:** Phase 1 only — policies, records, printed certificate. Claims are Phase 2.
**Approach:** Category-default policy with per-item override. No serial numbers. No paid extensions.

---

## Goal

Every customer who buys from Alfaytri walks out with a printed warranty certificate. The company controls the terms (there is no supplier-side warranty). Terms are defined once per category, overridden per item where needed, and captured on the delivery as an immutable snapshot per line item.

---

## Non-goals (Phase 1)

- **Serial-number tracking.** Warranty is per invoice line only — the customer proves via receipt.
- **Claims workflow.** Claims are Phase 2 — a separate table + a page that wraps existing repair / replacement / credit-note flows.
- **Paid extensions.** Not in scope. Every warranty is bundled, free, driven by policy.
- **Automatic email / WhatsApp delivery.** Certificate is printed at handover. Digital delivery can be layered on later.
- **Void enforcement in software.** Void is a manual judgment call by the tech team — no UI gates.

---

## Data model (staging first, prod cutover with the branch)

### 1. `warranty_policies` (new)

Reusable templates. Admins define these once and reuse them.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL UNIQUE | e.g. "Standard 12 months", "AC Compressor 24 months" |
| `duration_months` | integer NOT NULL CHECK (>= 0) | 0 = explicit "no warranty" policy |
| `coverage_type` | text NOT NULL | enum-checked: `none` / `parts_only` / `parts_and_labor` / `replacement_only` |
| `starts_from` | text NOT NULL DEFAULT `'delivery_date'` | `delivery_date` / `invoice_date` (skip `installation_date` — no installation flow yet) |
| `terms_en` | text | Long-form terms — printed on the certificate |
| `terms_ar` | text | Arabic mirror |
| `void_conditions` | text[] NOT NULL DEFAULT `'{}'` | Free-text list: "physical damage", "unauthorized repair", "misuse", "water/liquid damage" |
| `is_active` | boolean NOT NULL DEFAULT true | Soft archive — inactive can't be picked on new items but stays valid on old records |
| `created_at` / `updated_at` | timestamptz | trigger-maintained |
| `created_by` | uuid FK user_data | |

RLS: all authenticated can `SELECT`. Only admin roles (Owner / Accountant / Ops Manager) can `INSERT` / `UPDATE` — mirror the existing reason-lists pattern in `useReasonLists`.

Seed migration inserts 3 defaults so the app has something to work with day one:
- `"Standard 12 months"` — parts_only, delivery_date, generic terms
- `"AC / Large Appliance 24 months"` — parts_and_labor, delivery_date
- `"No Warranty"` — duration_months 0, coverage_type `none`

### 2. `inventory_categories` (extend)

```sql
ALTER TABLE public.inventory_categories
  ADD COLUMN default_warranty_policy_id uuid
  REFERENCES public.warranty_policies(id) ON DELETE SET NULL;
```

Nullable. Categories with no default → items inherit from parent category (recursive walk).

### 3. `inventory_items` (extend)

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN warranty_policy_id uuid
  REFERENCES public.warranty_policies(id) ON DELETE SET NULL;
```

Nullable. NULL means "inherit from my category chain".

### 4. `get_effective_warranty_policy(p_item_id uuid)` (new function)

**Precedence (confirmed 2026-08-05 by operator):**

```
1. inventory_items.warranty_policy_id       ← per-item override wins
2. Nearest ancestor category with a policy  ← walk up parent_id from item's category
3. NULL (no warranty)                       ← nothing found in the whole chain
```

**Walk direction — leaf UP toward root, first hit stops.** Given a category tree `AC → Split → Piston` and an item in `Piston`:

- If `Piston` has a policy → use it. Stop.
- Else if `Split` has a policy → use it. Stop.
- Else if `AC` has a policy → use it. Stop.
- Else return NULL — no auto-record created at delivery, certificate silently omits that line.

There is NO global "fallback to some default warranty for orphans". If no category in the chain has a policy AND the item has no override, the item is uninsured. This is intentional — matches "if that item has no warranty policy we don't give warranty for that item" from the design conversation.

**Implementation:** recursive CTE walking `inventory_categories.parent_id`, ordered by depth ascending, `LIMIT 1` on the first non-null `default_warranty_policy_id`. STABLE, security_invoker.

### 5. `warranty_records` (new)

The actual coverage. One row per sold delivery line at delivery time.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `warranty_number` | text UNIQUE | `WAR-00001` — seq via `warranty_number_seq` |
| `sale_delivery_line_id` | uuid FK sale_delivery_lines(id) ON DELETE CASCADE | one warranty per delivered line |
| `sale_order_id` | uuid FK sale_orders(id) | denorm — quick lookup |
| `customer_id` | uuid FK customers(id) | denorm |
| `division_id` | uuid FK company_divisions(id) | denorm for RLS |
| `brand_variant_id` | uuid FK inventory_item_brand_variants(id) | denorm for reporting |
| `item_name` | text | snapshot |
| `sku` | text | snapshot |
| `qty` | integer NOT NULL | from delivery line |
| `policy_id` | uuid FK warranty_policies(id) ON DELETE RESTRICT | which policy applied |
| `policy_name_snapshot` | text NOT NULL | admin can rename policy later — this stays |
| `coverage_type_snapshot` | text NOT NULL | |
| `duration_months_snapshot` | integer NOT NULL | |
| `terms_en_snapshot` | text | |
| `terms_ar_snapshot` | text | |
| `start_date` | date NOT NULL | delivery.date or invoice.issued_date per policy.starts_from |
| `end_date` | date NOT NULL | computed: `start_date + duration_months` |
| `created_at` | timestamptz | |

**Unique constraint:** `(sale_delivery_line_id)` — one warranty per line.

**Indexes:**
- `(customer_id, end_date DESC)` — for future customer-facing lookups
- `(end_date)` — future expiry-notification reports
- `(division_id)` — RLS join

**RLS:** `is_division_visible(division_id)` restrictive — same pattern as the security-invoker sweep we just landed.

**Status is computed, not stored:** `end_date >= CURRENT_DATE → active`, else `expired`. Optionally expose via a view or a computed column in the query; no need for a scheduled job.

---

## Auto-creation flow

When a `sale_deliveries` row transitions to `status = 'delivered'`:

1. For each `sale_delivery_line` in the delivery
2. Call `get_effective_warranty_policy(line.item_id)`
3. If policy exists AND `policy.duration_months > 0`:
   - Compute `start_date` per `policy.starts_from`
   - Compute `end_date = start_date + policy.duration_months`
   - INSERT into `warranty_records` with snapshots
4. Skip lines with no policy or duration 0 (silent — matches the "no warranty" case)

**Where to hook this:** modify the existing `complete_delivery_inventory` RPC to create warranty records in the same transaction that stamps the delivery as delivered. Rationale — if warranty creation fails, the delivery must roll back too; we don't want a delivered-without-warranty inconsistency.

If the RPC body is large, an alternative is a new `create_warranty_records_for_delivery(p_delivery_id uuid)` RPC that `complete_delivery_inventory` calls as a subroutine. Cleaner separation, one more function to maintain. **Choose based on how invasive the edit to `complete_delivery_inventory` turns out to be.**

Idempotency: the UNIQUE constraint on `sale_delivery_line_id` guards against double-insert if the RPC is retried.

---

## PDF certificate

New generator: `src/lib/sales/generate-warranty-certificate-pdf.ts` — mirror the shape of `generate-delivery-note-pdf.ts` (same libs, same layout primitives).

**Contents per certificate:**
- Company header (logo + name from `companies.name_en`)
- Customer name + phone
- Delivery number + date
- Table of covered items:
  - `WAR-*` number
  - Item name + SKU + qty
  - Policy name
  - Start / end dates
  - Coverage type label ("Parts & Labor", etc.)
- Terms section (grouped by policy — if all items share one, one block; if mixed, one block per policy)
- Void conditions section
- Signature line + date
- Bilingual (EN + AR) — Arabic column right-aligned

**Delivery mechanism:** button on the Delivery detail page — "Print Warranty Certificate". Opens PDF in new tab; operator prints.

**Storage:** don't store the PDF file. Regenerate on demand from the records — that way, if terms are corrected (via snapshot edit — see "Escape hatch" below) or company logo changes, the reprint reflects it.

---

## UI

### 1. Master Data → Warranty Policies (new page)

Route: `/master-data/warranty-policies`

Standard master-data pattern (steal shape from `/master-data/reason-lists`):
- Stat strip (Total, Active, Inactive)
- Searchable list
- New / Edit dialog — all policy fields
- Row actions: edit / toggle active
- No delete — policies are `ON DELETE RESTRICT` from records, and even a fully-unused policy is worth keeping as a template

### 2. Master Data → Categories — extend edit dialog

Add a select field: **"Default Warranty Policy"** with a "(inherit from parent)" option. Nullable.

### 3. Master Data → Items — extend edit dialog

Add a select field: **"Warranty Policy Override"** with a "(use category default)" option. Nullable.

Under the select, render a small resolver preview: **"Effective policy: Standard 12 months (from category Split AC → Air Conditioners)"** — shows the operator which policy will actually apply after inheritance. Read via `useEffectiveWarranty(item_id)` hook.

### 4. Sales Order line editor — show warranty badge

Next to each SO line, render a small badge: **"12mo warranty"** or **"No warranty"** — sourced from the effective-policy resolver. Read-only. Reassures the salesperson and lets them explain to the customer at quote time.

### 5. Delivery detail — Print Certificate button

Add a **"Print Warranty Certificate"** button next to the existing "Delivery Note" button. Only visible when the delivery is `delivered` AND has at least one `warranty_records` row.

### 6. Invoice detail — same button

Same button on the invoice detail, since the certificate is often handed with the invoice.

---

## Tasks (implementation order)

1. **Migration 1** — `warranty_policies` table + RLS + seq for warranty_number + seed 3 default policies
2. **Migration 2** — `inventory_categories.default_warranty_policy_id` FK
3. **Migration 3** — `inventory_items.warranty_policy_id` FK
4. **Migration 4** — `get_effective_warranty_policy(p_item_id)` function
5. **Migration 5** — `warranty_records` table + RLS + indexes
6. **Migration 6** — modify `complete_delivery_inventory` (or add helper RPC) to auto-create records
7. Regenerate `database.types.ts` + re-append the DBTable/DBInsert/DBUpdate/AllTables helper aliases
8. **Hook** — `useWarrantyPolicies` (list, detail, create, update, toggle-active)
9. **Hook** — `useEffectiveWarranty(item_id)` — calls `get_effective_warranty_policy`
10. **Hook** — `useWarrantyRecordsForDelivery(delivery_id)`
11. **Page** — `/master-data/warranty-policies` list + dialog
12. **Extend** — category edit dialog with policy picker
13. **Extend** — item edit dialog with policy override + effective-policy preview
14. **Extend** — SO line editor with warranty badge
15. **PDF generator** — `generate-warranty-certificate-pdf.ts`
16. **Extend** — delivery detail + invoice detail with "Print Certificate" button
17. **Flow registry** — add `docs/flows-registry.md` entry for the warranty auto-creation flow
18. **Security audit** — 5-point check per AGENTS.md before merge

---

## Escape hatch — snapshot edit

Because we snapshot policy terms onto the record, there's no way to correct a typo in a shipped policy for existing records without touching the DB. That's intentional (immutability = legal safety). If a customer disputes: manually `UPDATE warranty_records SET terms_en_snapshot = ...` in a controlled admin action, or issue a courtesy new-policy record. Not building an in-app snapshot editor in Phase 1.

---

## Phase 2 preview (out of scope here)

- `warranty_claims` table + list page
- Assessment (covered / void / rejected) + resolution router into existing modules
- Photos upload (bucket + RLS like the damaged-stock ones)
- Contact-centre integration — a claim opened via WhatsApp creates a task
- Expiry notification — 30/60 days before end_date, ping customer via WhatsApp

---

## Metric of success (Phase 1 done)

1. Operator creates 3 policies via master data.
2. Operator sets a default on `Split AC` category.
3. Salesperson creates SO with a Split AC line → sees "12mo warranty" badge on the line.
4. Delivery clerk completes delivery → `warranty_records` row appears with `WAR-*` number, correct start/end dates.
5. Print button on delivery detail produces a bilingual PDF listing the covered item and terms.
6. Ops re-prints later → same certificate, same numbers.
7. Security audit clean.

Ready for hand-off to Phase 2 (claims) whenever operator wants.
