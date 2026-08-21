# Stage 2 — Warranty registry (under Sales) + origin snapshot

> Read the folder [README.md](README.md) first — Global Constraints + Live-verified facts apply. Do Stage 1 first (records must exist).

**Deliverables:** country-of-origin captured immutably on each warranty record + shown on the certificate; a division-scoped **Warranties → Records** list/search under Sales with drill-in, gated by a new `sales.warranties.view` permission.

---

### Task 1: Origin snapshot on `warranty_records` + certificate

**Files:**
- Create: `supabase/migrations/20261002000100_warranty_origin_snapshot.sql` (+ mirror in `migrations-staging/`)
- Modify (live-sourced body): `create_warranty_records_for_delivery`
- Modify: `src/lib/sales/generate-warranty-certificate-pdf.ts`, `src/lib/sales/warranty-certificate-pdf-html.ts`

**Interfaces:**
- Produces: `warranty_records.origin_country_id uuid`, `warranty_records.origin_name_snapshot text` (populated at record creation; read by the certificate + Stage 2 Task 3 registry).

- [ ] **Step 1: Confirm the origin source columns (live)**

Run:
```bash
npx supabase db query --linked "select 'countries='||coalesce(to_regclass('public.countries')::text,'MISSING'); select column_name from information_schema.columns where table_schema='public' and table_name='countries' and (column_name='name' or column_name ilike '%name%') order by 1;"
```
Expected: `countries` exists; note its display column (`name` vs `name_en`). Use that column name below wherever this plan writes `countries.name`.

- [ ] **Step 2: Migration — add the two columns**

Create the migration:
```sql
BEGIN;
ALTER TABLE public.warranty_records
  ADD COLUMN IF NOT EXISTS origin_country_id   uuid REFERENCES public.countries(id),
  ADD COLUMN IF NOT EXISTS origin_name_snapshot text;
COMMENT ON COLUMN public.warranty_records.origin_name_snapshot IS
  'Country-of-origin name snapshotted at issuance for legal immutability.';
COMMIT;
```
Mirror to `migrations-staging/`.

- [ ] **Step 3: Extend `create_warranty_records_for_delivery` to populate origin (live-sourced)**

Fetch the current body (`pg_get_functiondef`, as in Stage 1 Task 1). In the record INSERT, add the two columns; source them by joining the delivered line's `brand_variant_id` → `inventory_item_brand_variants.country_id` → `countries`. Add to the SELECT/INSERT:
```sql
-- in the column list:
        origin_country_id, origin_name_snapshot,
-- in the values (per delivered line, joining biv + countries on the line's brand_variant_id):
        biv.country_id,
        c.name,          -- use the display column confirmed in Step 1
```
…with `LEFT JOIN inventory_item_brand_variants biv ON biv.id = <line>.brand_variant_id LEFT JOIN countries c ON c.id = biv.country_id` added to the line-source query. Re-issue as `CREATE OR REPLACE` in the same migration (post-dated). Keep everything else in the body byte-identical.

- [ ] **Step 4: Apply to staging + verify**

```bash
printf 'y\n' | npx supabase db push
npx supabase db query --linked "select column_name from information_schema.columns where table_schema='public' and table_name='warranty_records' and column_name like 'origin%'; select position('origin_name_snapshot' in pg_get_functiondef('public.create_warranty_records_for_delivery'::regproc)) as fn_has_origin;"
```
Expected: both `origin_*` columns present; `fn_has_origin` > 0.

- [ ] **Step 5: Show origin on the certificate**

In `warranty-certificate-pdf-html.ts`, add an "Origin" field to the certificate details block (next to item/policy). In `generate-warranty-certificate-pdf.ts`, ensure the record query selects `origin_name_snapshot` and passes it to the template. Show only when non-null.

- [ ] **Step 6: Verify + commit**

```bash
npx tsc --noEmit
```
Expected: exit 0. Then commit the migration (+ mirror) + the 2 lib files together, HEREDOC with both trailers. Update the `docs/flows-registry.md` warranty issuance entry to note origin snapshot in the same commit.

---

### Task 2: `useWarrantyRecords` hook (division-scoped list/search)

**Files:**
- Create: `src/hooks/useWarrantyRecords.ts`
- Modify: `src/lib/queryKeys.ts` (add `warranty.records(filters)` key under the existing `warranty` group)

**Interfaces:**
- Produces: `useWarrantyRecords(filters: { search?: string; divisionId?: string })` → `WarrantyRecordRow[]` (typed with explicit columns).

- [ ] **Step 1: Add the query key**

In `src/lib/queryKeys.ts`, under the existing `warranty` group (around `:544-550`), add:
```ts
    records: (filters?: { search?: string; divisionId?: string }) =>
      ['warranty', 'records', filters ?? {}] as const,
```

- [ ] **Step 2: Write the hook (explicit columns, `.limit`, search)**

```ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WarrantyRecordRow = {
  id: string
  warranty_number: string
  item_name: string
  sku: string | null
  qty: number
  customer_id: string | null
  division_id: string | null
  policy_name_snapshot: string | null
  coverage_type_snapshot: string | null
  start_date: string | null
  end_date: string | null
  origin_name_snapshot: string | null
  source_type: string
  sale_order_id: string | null
  sale_delivery_line_id: string | null
  created_at: string | null
}

export function useWarrantyRecords(filters: { search?: string; divisionId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.warranty.records(filters),
    queryFn: async (): Promise<WarrantyRecordRow[]> => {
      const supabase = createClient()
      let q = supabase
        .from('warranty_records')
        .select('id, warranty_number, item_name, sku, qty, customer_id, division_id, policy_name_snapshot, coverage_type_snapshot, start_date, end_date, origin_name_snapshot, source_type, sale_order_id, sale_delivery_line_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.divisionId) q = q.eq('division_id', filters.divisionId)
      if (filters.search) {
        const s = `%${filters.search}%`
        q = q.or(`warranty_number.ilike.${s},item_name.ilike.${s},sku.ilike.${s}`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarrantyRecordRow[]
    },
    staleTime: 60_000,
  })
}
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
```
Expected: exit 0. Commit the hook + queryKeys change.

---

### Task 3: Warranties page under Sales (Records tab) + nav + permission

**Files:**
- Create: `src/app/(dashboard)/sales/warranties/page.tsx`
- Modify: `src/components/layout/nav-config.ts` (add to the SALES group)
- Modify: `src/lib/route-permissions.ts` (add the route guard)
- Modify: `src/components/master-data/PermissionTree.tsx` (add `sales.warranties.view` to NAV_TREE so it's grantable)

**Interfaces:**
- Consumes: `useWarrantyRecords` (Task 2). Customer display via the existing customers lookup (never render a raw UUID — resolve `customer_id` → name).
- Produces: a page at `/sales/warranties` with a tab container (`Records` now; `Claims` added in Stage 3).

- [ ] **Step 1: Add the permission key to the catalog**

In `PermissionTree.tsx` NAV_TREE, under the Sales section, add a grantable leaf `sales.warranties.view` (label "Warranties"). Follow the exact shape of a sibling Sales key (e.g. `sales.returns.view`).

- [ ] **Step 2: Add the route guard**

In `src/lib/route-permissions.ts`, add:
```ts
  { pathPrefix: '/sales/warranties', permission: 'sales.warranties.view' },
```

- [ ] **Step 3: Add the nav entry (SALES group)**

In `src/components/layout/nav-config.ts`, inside the `SALES` group's `items` array, add (place near Returns/Credit Notes):
```ts
          { label: 'Warranties', href: '/sales/warranties', icon: 'ShieldCheck', permission: 'sales.warranties.view' },
```
(Use an icon already imported by the nav renderer; `ShieldCheck` is already used for Sales → Approvals.)

- [ ] **Step 4: Build the page (Records list + drill-in)**

Create `sales/warranties/page.tsx` following the existing list-page pattern (mirror `src/app/(dashboard)/sales/returns/page.tsx` for structure: page shell, search input, a tabbed container, `DataTable`, loading/empty/**error** states). For this stage, render one tab "Records" backed by `useWarrantyRecords`. Columns: Warranty #, Item, SKU, Qty, Customer (resolved to name — use the customers hook, never the UUID), Coverage, Start, End, Origin, Source type. Row click → a detail dialog (or a drawer) showing the full record + a link to the source delivery + the **Warranty Certificate** button (reuse the certificate route already used in `DeliveryDetailDialog.tsx`). Leave a `Claims` tab stub wired to render in Stage 3 (an empty `TabsContent` placeholder is fine, clearly marked). Respect responsive + `.limit` already in the hook.

- [ ] **Step 5: Grant the new key to the roles that should see warranties**

Warranty visibility should follow sales visibility. In the app's role editor (or a seed migration if that's how keys are granted), grant `sales.warranties.view` to the roles that already hold `sales.returns.view`/`sales.invoices.view`. (If keys are seeded via migration, add a post-dated migration; if granted via UI, note it as an operator step.)

- [ ] **Step 6: Verify + commit**

```bash
npx tsc --noEmit
```
Expected: exit 0 (+ eslint clean). Manual: the page loads for a permitted user, lists records, search works, a row opens the detail + prints the certificate; a user without `sales.warranties.view` sees no nav entry and is blocked from `/sales/warranties`. Commit the page + nav + route-permissions + PermissionTree together.

---

### Stage 2 wrap-up

- [ ] Update PROGRESS.md (Completed + Security Audit Log: new columns on existing RLS table, read-only registry gated by permission, no secrets) — docs-only commit.
- [ ] Append to `EOD/EOD-YYYY-MM-DD.md`.
- [ ] Deploy gate: operator staging smoke (origin shows on a new certificate; the Records page works + is permission-gated) → apply the 2 migrations to new-prod (guarded psql; the origin ALTER + the re-issued function) → one push.
