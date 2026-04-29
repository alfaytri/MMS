# Multi-Company Division Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope purchase orders and sale orders to company divisions so that regular users see only their assigned divisions while owners/accountants see everything.

**Architecture:** JWT Auth Hook injects `user_type` and `division_ids` into every Supabase access token at sign-in; RLS reads those claims synchronously with zero table joins. A shared `useUserDivisionScope()` hook drives the division picker on create forms and the `<DivisionFilter />` on list pages.

**Tech Stack:** PostgreSQL RLS, Supabase Auth Hook (custom access token), Next.js 15, TanStack Query v5, shadcn/ui Select + Popover/Command

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260428200001_division_isolation.sql` | Create — JWT hook, helper fn, columns, RLS |
| `supabase/migrations/20260428200002_fix_backfill_division_id.sql` | Create — deterministic backfill fix |
| `supabase/migrations/20260428200003_division_isolation_hardening.sql` | Create — index, REVOKE PUBLIC, full re-backfill |
| `supabase/migrations/20260428200004_so_rpc_add_division_id.sql` | Create — update create_sale_order RPC |
| `src/hooks/useUserDivisionScope.ts` | Create — shared scope hook |
| `src/components/shared/DivisionFilter.tsx` | Create — Company + Division filter dropdowns |
| `src/hooks/usePurchaseOrders.ts` | Modify — add divisionId/divisionIds to POFilters, division_id to CreatePOPayload |
| `src/hooks/useSaleOrders.ts` | Modify — add divisionId/divisionIds to SOFilters, division_id to CreateSOPayload |
| `src/app/(dashboard)/purchase/orders/page.tsx` | Modify — wire DivisionFilter |
| `src/app/(dashboard)/sales/orders/page.tsx` | Modify — wire DivisionFilter |
| `src/app/(dashboard)/purchase/create-po/page.tsx` | Modify — division picker for multi-division users |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify — division picker for multi-division users |
| `src/components/master-data/EditUserDialog.tsx` | Modify — division assignment section |

---

## Task 1: DB Migration — Columns, JWT Hook, Helper, RLS

**Files:**
- Create: `supabase/migrations/20260427200001_division_isolation.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260427200001_division_isolation.sql

-- ─── 0. Extend approval_role enum ────────────────────────────────────────────
-- 'employee' is for users with no approval function — gives the JWT hook a
-- non-null user_type to inject so is_division_visible falls into the scoped path.
ALTER TYPE approval_role ADD VALUE IF NOT EXISTS 'employee';

-- ─── 1. Add division_id to order tables ────────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

-- ─── 2. Backfill from creator's primary division ───────────────────────────────
-- purchase_orders.created_by is UUID FK → profiles(id) (NOT auth_user_id text)
UPDATE purchase_orders po
SET    division_id = ud.division_id
FROM   user_divisions ud
WHERE  ud.profile_id = po.created_by
  AND  po.division_id IS NULL;

UPDATE sale_orders so
SET    division_id = ud.division_id
FROM   user_divisions ud
WHERE  ud.profile_id = so.created_by
  AND  so.division_id IS NULL;

-- ─── 3. JWT Auth Hook ──────────────────────────────────────────────────────────
-- Register this in Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- user_type is derived from approval_role_assignments (not profiles.user_type):
--   owner/accountant  → super-viewer (bypasses division filter in is_division_visible)
--   purchase_manager / employee / no role → scoped to their assigned divisions
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  SELECT
    CASE
      WHEN bool_or(ara.role = 'owner')   THEN 'owner'
      WHEN bool_or(ara.role = 'accountant') THEN 'accountant'
      WHEN bool_or(ara.role = 'purchase_manager') THEN 'purchase_manager'
      WHEN bool_or(ara.role = 'employee') THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN approval_role_assignments ara
         ON ara.profile_id = p.id AND ara.deleted_at IS NULL
  LEFT JOIN user_divisions ud ON ud.profile_id = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ─── 4. Shared RLS helper ──────────────────────────────────────────────────────
-- NULL division_id: NULL = ANY(...) evaluates to NULL (falsy) — regular users
-- cannot see unassigned rows. Owners/accountants bypass via the first OR clause.
-- This is intentional: legacy rows with no division are owner/accountant-only
-- until explicitly backfilled.
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    row_division_id = ANY(
      ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    )
  );
$$;

-- ─── 5. RLS policies — purchase_orders ────────────────────────────────────────
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "division_scope_select" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_insert" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_update" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_delete" ON purchase_orders;

-- Drop old permissive policies (names may vary — adjust if yours differ)
DROP POLICY IF EXISTS "Enable read access for all users" ON purchase_orders;
DROP POLICY IF EXISTS "Allow all" ON purchase_orders;

CREATE POLICY "division_scope_select" ON purchase_orders
  FOR SELECT USING (is_division_visible(division_id));

CREATE POLICY "division_scope_insert" ON purchase_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

CREATE POLICY "division_scope_update" ON purchase_orders
  FOR UPDATE USING (is_division_visible(division_id));

CREATE POLICY "division_scope_delete" ON purchase_orders
  FOR DELETE USING (is_division_visible(division_id));

-- ─── 6. RLS policies — sale_orders ────────────────────────────────────────────
ALTER TABLE sale_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "division_scope_select" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_insert" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_update" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_delete" ON sale_orders;

DROP POLICY IF EXISTS "Enable read access for all users" ON sale_orders;
DROP POLICY IF EXISTS "Allow all" ON sale_orders;

CREATE POLICY "division_scope_select" ON sale_orders
  FOR SELECT USING (is_division_visible(division_id));

CREATE POLICY "division_scope_insert" ON sale_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

CREATE POLICY "division_scope_update" ON sale_orders
  FOR UPDATE USING (is_division_visible(division_id));

CREATE POLICY "division_scope_delete" ON sale_orders
  FOR DELETE USING (is_division_visible(division_id));
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: migration applied with no errors. If `purchase_orders` or `sale_orders` already has RLS enabled and policies with different names, adjust the `DROP POLICY` names above to match. Run `\d+ purchase_orders` in psql to list existing policy names.

- [ ] **Step 3: Register Auth Hook (manual — Supabase Dashboard)**

Go to **Supabase Dashboard → Authentication → Hooks → Custom Access Token**, enter the function name `public.custom_access_token_hook`, and save.

> This is a one-time manual step per environment (local + production). Without this, `auth.jwt()` won't contain `user_type` or `division_ids` and all RLS policies will deny access for regular users.

> **Local dev note:** If you ever add `supabase start` local development, you must also register the hook in `supabase/config.toml`:
> ```toml
> [auth.hook.custom_access_token]
> enabled = true
> uri = "pg-functions://postgres/public/custom_access_token_hook"
> ```
> This project currently uses cloud-only (`supabase db push`) so the Dashboard step above is sufficient.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427200001_division_isolation.sql
git commit -m "feat(db): add division_id columns, JWT hook, RLS for PO and SO isolation"
```

---

## Task 2: Update create_sale_order RPC to Accept division_id

The `create_sale_order` RPC inserts into `sale_orders`. Once the INSERT policy is live, the insert must include a valid `division_id`.

**Files:**
- Create: `supabase/migrations/20260427200002_so_rpc_add_division_id.sql`

- [ ] **Step 1: Find the current create_sale_order signature**

Run in psql / Supabase SQL editor:
```sql
SELECT pg_get_functiondef(oid)
FROM   pg_proc
WHERE  proname = 'create_sale_order';
```

Copy the full function body — you will need it in the next step.

- [ ] **Step 2: Write migration that replaces the function**

Open the output from Step 1. Add `p_division_id UUID DEFAULT NULL` to the parameter list. In the `INSERT INTO sale_orders` statement, add `division_id` to the column list and `p_division_id` to the values. Save the full replacement as:

```sql
-- supabase/migrations/20260427200002_so_rpc_add_division_id.sql
-- Replace the existing create_sale_order with a version that accepts division_id.
-- Paste the full current function body here with the changes described above:

CREATE OR REPLACE FUNCTION public.create_sale_order(
  -- ... all existing params ...
  p_division_id UUID DEFAULT NULL
)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ... existing body, but add division_id to the INSERT statement:
  INSERT INTO sale_orders (
    -- existing columns ...,
    division_id
  ) VALUES (
    -- existing values ...,
    p_division_id
  );
  -- ... rest of body unchanged ...
END;
$$;
```

- [ ] **Step 3: Apply migration**

```bash
supabase db push
```

Expected: no errors. The function now accepts an optional `p_division_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427200002_so_rpc_add_division_id.sql
git commit -m "feat(db): add p_division_id param to create_sale_order RPC"
```

---

## Task 3: useUserDivisionScope Hook

**Files:**
- Create: `src/hooks/useUserDivisionScope.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useUserDivisionScope.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useDivisions, type Division } from '@/hooks/useDivisions'

interface UserDivisionScope {
  isSuperViewer:   boolean
  userDivisionIds: string[]
  companies:       Company[]
  divisions:       Division[]
}

function parseJwtClaims(token: string): { user_type?: string; division_ids?: string[] } {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

export function useUserDivisionScope(): UserDivisionScope {
  const { data: allCompanies = [] } = useCompanies()
  const { data: allDivisions = [] } = useDivisions()

  const { data: claims } = useQuery({
    queryKey: ['jwt-claims'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return { userType: '', divisionIds: [] as string[] }
      const payload = parseJwtClaims(session.access_token)
      return {
        userType:    (payload.user_type    ?? '') as string,
        divisionIds: (payload.division_ids ?? []) as string[],
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const userType      = claims?.userType    ?? ''
  const divisionIds   = claims?.divisionIds ?? []
  const isSuperViewer = userType === 'owner' || userType === 'accountant'

  const companies = isSuperViewer
    ? allCompanies
    : allCompanies.filter((c) =>
        allDivisions.some((d) => d.company_id === c.id && divisionIds.includes(d.id))
      )

  const divisions = isSuperViewer
    ? allDivisions
    : allDivisions.filter((d) => divisionIds.includes(d.id))

  return { isSuperViewer, userDivisionIds: divisionIds, companies, divisions }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `useUserDivisionScope.ts`. Ignore unrelated pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUserDivisionScope.ts
git commit -m "feat(hooks): add useUserDivisionScope — reads JWT claims for isSuperViewer and division list"
```

---

## Task 4: DivisionFilter Component

**Files:**
- Create: `src/components/shared/DivisionFilter.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/DivisionFilter.tsx
'use client'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'

export interface DivisionFilterValue {
  companyId:  string | null
  divisionId: string | null
}

interface Props {
  value:    DivisionFilterValue
  onChange: (v: DivisionFilterValue) => void
}

export function DivisionFilter({ value, onChange }: Props) {
  const { isSuperViewer, companies, divisions } = useUserDivisionScope()

  if (!isSuperViewer) return null

  const filteredDivisions = value.companyId
    ? divisions.filter((d) => d.company_id === value.companyId)
    : divisions

  function handleCompanyChange(companyId: string) {
    const resolvedCompany = companyId === '__all__' ? null : companyId
    onChange({ companyId: resolvedCompany, divisionId: null })
  }

  function handleDivisionChange(divisionId: string) {
    onChange({ ...value, divisionId: divisionId === '__all__' ? null : divisionId })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={value.companyId ?? '__all__'}
        onValueChange={handleCompanyChange}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="All Companies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Companies</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.divisionId ?? '__all__'}
        onValueChange={handleDivisionChange}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="All Divisions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Divisions</SelectItem>
          {filteredDivisions.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/DivisionFilter.tsx
git commit -m "feat(ui): add DivisionFilter component — Company + Division dropdowns for super viewers"
```

---

## Task 5: Wire DivisionFilter into PO List Page

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts` — extend `POFilters`
- Modify: `src/app/(dashboard)/purchase/orders/page.tsx` — add DivisionFilter UI + state

- [ ] **Step 1: Extend POFilters and update usePurchaseOrders**

In `src/hooks/usePurchaseOrders.ts`, find `POFilters` (line ~219) and add two optional fields:

```ts
export interface POFilters {
  search?:      string
  status?:      POStatus | ''
  dateFrom?:    string
  dateTo?:      string
  divisionId?:  string | null   // add
  divisionIds?: string[]         // add — used when filtering by company
}
```

In the `usePurchaseOrders` query function, after the existing filters, add:

```ts
if (filters.divisionId) {
  query = query.eq('division_id', filters.divisionId)
} else if (filters.divisionIds && filters.divisionIds.length > 0) {
  query = query.in('division_id', filters.divisionIds)
}
```

- [ ] **Step 2: Wire DivisionFilter into the PO list page**

In `src/app/(dashboard)/purchase/orders/page.tsx`, add these imports at the top:

```tsx
import { DivisionFilter, type DivisionFilterValue } from '@/components/shared/DivisionFilter'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
```

Inside `CreatePOPage` (or whatever the default export function is named), add state:

```tsx
const { isSuperViewer, divisions } = useUserDivisionScope()
const [divisionFilter, setDivisionFilter] = useState<DivisionFilterValue>({ companyId: null, divisionId: null })
```

Derive the filter values to pass to `usePurchaseOrders`:

```tsx
const divisionQueryProps = (() => {
  if (!isSuperViewer) return {}
  if (divisionFilter.divisionId) return { divisionId: divisionFilter.divisionId }
  if (divisionFilter.companyId) {
    return {
      divisionIds: divisions
        .filter((d) => d.company_id === divisionFilter.companyId)
        .map((d) => d.id),
    }
  }
  return {}
})()
```

Update the `usePurchaseOrders` call to include these:

```tsx
const { data: orders, isLoading } = usePurchaseOrders({
  search:    debouncedSearch,
  status:    statusFilter,
  dateFrom:  dateFrom || undefined,
  dateTo:    dateTo || undefined,
  ...divisionQueryProps,
})
```

In the JSX, find the filter bar (the area with search + status dropdowns) and add `<DivisionFilter>` alongside:

```tsx
{/* Add next to the existing filter controls */}
<DivisionFilter value={divisionFilter} onChange={setDivisionFilter} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts src/app/(dashboard)/purchase/orders/page.tsx
git commit -m "feat(ui): wire DivisionFilter into PO list page"
```

---

## Task 6: Wire DivisionFilter into SO List Page

**Files:**
- Modify: `src/hooks/useSaleOrders.ts` — extend `SOFilters`
- Modify: `src/app/(dashboard)/sales/orders/page.tsx` — add DivisionFilter UI + state

- [ ] **Step 1: Extend SOFilters and update useSaleOrders**

In `src/hooks/useSaleOrders.ts`, find `SOFilters` (line ~155) and add:

```ts
export interface SOFilters {
  search?:      string
  status?:      SOStatus | ''
  dateFrom?:    string
  dateTo?:      string
  divisionId?:  string | null   // add
  divisionIds?: string[]         // add
}
```

In the `useSaleOrders` query function, after the existing filters, add:

```ts
if (filters.divisionId) {
  q = q.eq('division_id', filters.divisionId)
} else if (filters.divisionIds && filters.divisionIds.length > 0) {
  q = q.in('division_id', filters.divisionIds)
}
```

- [ ] **Step 2: Wire DivisionFilter into the SO list page**

In `src/app/(dashboard)/sales/orders/page.tsx`, add imports:

```tsx
import { DivisionFilter, type DivisionFilterValue } from '@/components/shared/DivisionFilter'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
```

Inside `SaleOrdersPage`, add state:

```tsx
const { isSuperViewer, divisions } = useUserDivisionScope()
const [divisionFilter, setDivisionFilter] = useState<DivisionFilterValue>({ companyId: null, divisionId: null })
```

Derive query props (same pattern as Task 5):

```tsx
const divisionQueryProps = (() => {
  if (!isSuperViewer) return {}
  if (divisionFilter.divisionId) return { divisionId: divisionFilter.divisionId }
  if (divisionFilter.companyId) {
    return {
      divisionIds: divisions
        .filter((d) => d.company_id === divisionFilter.companyId)
        .map((d) => d.id),
    }
  }
  return {}
})()
```

Update the `useSaleOrders` call:

```tsx
const { data: orders, isLoading } = useSaleOrders({
  search:    debouncedSearch,
  status:    statusFilter,
  dateFrom:  dateFrom || undefined,
  dateTo:    dateTo || undefined,
  ...divisionQueryProps,
})
```

Add to the filter bar in JSX:

```tsx
<DivisionFilter value={divisionFilter} onChange={setDivisionFilter} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSaleOrders.ts src/app/(dashboard)/sales/orders/page.tsx
git commit -m "feat(ui): wire DivisionFilter into SO list page"
```

---

## Task 7: PO Create Form — Division Picker

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts` — add `division_id` to `CreatePOPayload` and `useCreatePO`
- Modify: `src/app/(dashboard)/purchase/create-po/page.tsx` — division picker

- [ ] **Step 1: Add division_id to CreatePOPayload**

In `src/hooks/usePurchaseOrders.ts`, find `CreatePOPayload` (line ~142) and add:

```ts
export type CreatePOPayload = {
  supplier_id:    string
  // ... existing fields ...
  division_id:    string | null   // add
}
```

Find `useCreatePO` mutation and add `division_id` to the insert object:

```ts
const { data, error } = await (supabase as any)
  .from('purchase_orders')
  .insert({
    // existing fields...,
    division_id: payload.division_id ?? null,
  })
  .select()
  .single()
```

- [ ] **Step 2: Add division picker to the create PO page**

In `src/app/(dashboard)/purchase/create-po/page.tsx`, add imports:

```tsx
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
```

Inside `CreatePOPage`, add state and derive values:

```tsx
const { userDivisionIds, divisions } = useUserDivisionScope()
const isMultiDivision = userDivisionIds.length > 1
const [divisionId, setDivisionId] = useState<string>(
  userDivisionIds.length === 1 ? userDivisionIds[0] : ''
)
```

Group divisions by company for the picker. Add a helper inside the component:

```tsx
const companiesWithDivisions = useMemo(() => {
  const map = new Map<string, { companyName: string; items: typeof divisions }>()
  for (const d of divisions) {
    if (!map.has(d.company_id)) {
      map.set(d.company_id, { companyName: d.company_id, items: [] })
    }
    map.get(d.company_id)!.items.push(d)
  }
  return Array.from(map.values())
}, [divisions])
```

To get company names, also use `useCompanies()`:

```tsx
import { useCompanies } from '@/hooks/useCompanies'
// ...
const { data: companies = [] } = useCompanies()
// then in the grouping helper:
companyName: companies.find((c) => c.id === d.company_id)?.name_en ?? d.company_id
```

Render the picker only when `isMultiDivision` is true. Place it at the top of the form, before the supplier picker:

```tsx
{isMultiDivision && (
  <div className="space-y-1.5">
    <label className="text-sm font-medium">Division <span className="text-destructive">*</span></label>
    <Select value={divisionId} onValueChange={setDivisionId}>
      <SelectTrigger>
        <SelectValue placeholder="Select division…" />
      </SelectTrigger>
      <SelectContent>
        {companiesWithDivisions.map((group) => (
          <SelectGroup key={group.companyName}>
            <SelectLabel>{group.companyName}</SelectLabel>
            {group.items.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

Also add `SelectGroup` and `SelectLabel` to the Select imports:

```tsx
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
```

Add validation — before submitting, require `divisionId` to be set:

```tsx
if (!divisionId) {
  toast.error('Select a division before creating the order.')
  return
}
```

Pass `division_id` in the createPO call:

```tsx
createPO.mutate({
  // existing fields...,
  division_id: divisionId || null,
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts src/app/(dashboard)/purchase/create-po/page.tsx
git commit -m "feat(ui): add division picker to PO create form"
```

---

## Task 8: SO Create Form — Division Picker

**Files:**
- Modify: `src/hooks/useSaleOrders.ts` — add `division_id` to `CreateSOPayload`
- Modify: `src/app/(dashboard)/sales/create-so/page.tsx` — division picker

- [ ] **Step 1: Add division_id to CreateSOPayload**

In `src/hooks/useSaleOrders.ts`, find `CreateSOPayload` (line ~124) and add:

```ts
export type CreateSOPayload = {
  customer_id:           string
  // ... existing fields ...
  division_id:           string | null   // add
}
```

Find `useCreateSO` (or wherever `create_sale_order` RPC is called) and add `p_division_id` to the RPC call:

```ts
const { data, error } = await (supabase as any).rpc('create_sale_order', {
  // existing params...,
  p_division_id: payload.division_id ?? null,
})
```

- [ ] **Step 2: Add division picker to the create SO page**

In `src/app/(dashboard)/sales/create-so/page.tsx`, add imports:

```tsx
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCompanies } from '@/hooks/useCompanies'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
```

Inside the page component, add:

```tsx
const { userDivisionIds, divisions } = useUserDivisionScope()
const { data: companies = [] } = useCompanies()
const isMultiDivision = userDivisionIds.length > 1
const [divisionId, setDivisionId] = useState<string>(
  userDivisionIds.length === 1 ? userDivisionIds[0] : ''
)

const companiesWithDivisions = useMemo(() => {
  const map = new Map<string, { companyName: string; items: typeof divisions }>()
  for (const d of divisions) {
    if (!map.has(d.company_id)) {
      const co = companies.find((c) => c.id === d.company_id)
      map.set(d.company_id, { companyName: co?.name_en ?? d.company_id, items: [] })
    }
    map.get(d.company_id)!.items.push(d)
  }
  return Array.from(map.values())
}, [divisions, companies])
```

Add the division picker JSX at the top of the form (before the customer selector), gated on `isMultiDivision`:

```tsx
{isMultiDivision && (
  <div className="space-y-1.5">
    <label className="text-sm font-medium">Division <span className="text-destructive">*</span></label>
    <Select value={divisionId} onValueChange={setDivisionId}>
      <SelectTrigger>
        <SelectValue placeholder="Select division…" />
      </SelectTrigger>
      <SelectContent>
        {companiesWithDivisions.map((group) => (
          <SelectGroup key={group.companyName}>
            <SelectLabel>{group.companyName}</SelectLabel>
            {group.items.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

Find the `validate()` function (or validation block before submit) and add:

```tsx
if (isMultiDivision && !divisionId) {
  toast.error('Select a division before creating the order.')
  return
}
```

Find `buildPayload()` (or the payload construction block) and add:

```ts
division_id: divisionId || null,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSaleOrders.ts src/app/(dashboard)/sales/create-so/page.tsx
git commit -m "feat(ui): add division picker to SO create form"
```

---

## Task 9: User Management — Division Assignment UI

Add a Divisions section to `EditUserDialog.tsx` so admins can assign/remove divisions per user.

**Files:**
- Modify: `src/components/master-data/EditUserDialog.tsx`

- [ ] **Step 1: Import hooks and components needed**

Add to the existing imports in `EditUserDialog.tsx`:

```tsx
import { useDivisions } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import { useUserDivisions, useAssignDivision, useRemoveDivision } from '@/hooks/useProfiles'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
```

- [ ] **Step 2: Add division state and data inside the dialog**

Inside `EditUserDialog`, below the existing hooks, add:

```tsx
const { data: allDivisions = [] } = useDivisions()
const { data: companies = [] }    = useCompanies()
const { data: userDivisions = [] } = useUserDivisions(profile?.id ?? null)
const assignDivision  = useAssignDivision()
const removeDivision  = useRemoveDivision()
const [divisionPickValue, setDivisionPickValue] = useState('')

const assignedDivisionIds = new Set(userDivisions.map((ud) => ud.division_id))

const companiesWithUnassigned = useMemo(() => {
  const map = new Map<string, { companyName: string; items: typeof allDivisions }>()
  for (const d of allDivisions) {
    if (assignedDivisionIds.has(d.id)) continue
    if (!map.has(d.company_id)) {
      const co = companies.find((c) => c.id === d.company_id)
      map.set(d.company_id, { companyName: co?.name_en ?? d.company_id, items: [] })
    }
    map.get(d.company_id)!.items.push(d)
  }
  return Array.from(map.values()).filter((g) => g.items.length > 0)
}, [allDivisions, companies, assignedDivisionIds])

function handleAssignDivision(divisionId: string) {
  if (!profile?.id || !divisionId) return
  assignDivision.mutate(
    { profile_id: profile.id, division_id: divisionId },
    {
      onSuccess: () => {
        setDivisionPickValue('')
        toast.success('Division assigned.')
      },
      onError: (err) => toast.error(err.message),
    }
  )
}

function handleRemoveDivision(id: string) {
  if (!profile?.id) return
  removeDivision.mutate(
    { id, profileId: profile.id },
    {
      onSuccess: () => toast.success('Division removed.'),
      onError:   (err) => toast.error(err.message),
    }
  )
}
```

- [ ] **Step 3: Add Divisions section to dialog JSX**

Inside the `<DialogContent>`, below the existing form fields (after the roles section, before `<DialogFooter>`), add:

```tsx
{/* ── Divisions ── */}
<div className="space-y-2 pt-2">
  <p className="text-sm font-semibold">Divisions</p>

  {/* Assigned badges */}
  <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
    {userDivisions.length === 0 && (
      <p className="text-xs text-muted-foreground">No divisions assigned — user cannot create orders.</p>
    )}
    {userDivisions.map((ud) => (
      <Badge key={ud.id} variant="secondary" className="gap-1 pr-1">
        {ud.divisions?.name ?? ud.division_id}
        <button
          type="button"
          className="rounded-full hover:bg-muted p-0.5"
          onClick={() => handleRemoveDivision(ud.id)}
          disabled={removeDivision.isPending}
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    ))}
  </div>

  {/* Assign picker */}
  {companiesWithUnassigned.length > 0 && (
    <Select value={divisionPickValue} onValueChange={(v) => { setDivisionPickValue(v); handleAssignDivision(v) }}>
      <SelectTrigger className="w-64 h-8 text-xs">
        <SelectValue placeholder="Add division…" />
      </SelectTrigger>
      <SelectContent>
        {companiesWithUnassigned.map((group) => (
          <SelectGroup key={group.companyName}>
            <SelectLabel>{group.companyName}</SelectLabel>
            {group.items.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )}
</div>
```

- [ ] **Step 4: After saving a user's divisions, trigger session refresh**

The dialog currently calls `updateUser.mutate(...)` on submit. After a successful update — or after any division assignment/removal — the admin may need to trigger a client-side session refresh so the affected user's JWT gets new claims on their next login. Since the admin is editing a *different* user's profile, we cannot call `refreshSession()` for them — the user must sign out and back in, or the admin should note that the change takes effect on the user's next login.

Add a note toast after division assignment to communicate this:

```tsx
onSuccess: () => {
  setDivisionPickValue('')
  toast.success('Division assigned. Changes take effect on the user\'s next login.')
},
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/master-data/EditUserDialog.tsx
git commit -m "feat(ui): add division assignment section to EditUserDialog"
```

---

## Task 10: Expandability Checklist Verification

This task is a manual check — no code written.

- [ ] **Step 1: Verify expandability for a future table (e.g. `contracts`)**

Adding `contracts` to the isolation system requires only:
```sql
ALTER TABLE contracts
  ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

CREATE POLICY "division_scope" ON contracts
  FOR ALL USING (is_division_visible(division_id));
```

On the frontend:
- Call `useUserDivisionScope()` in the contracts list page hook
- Drop `<DivisionFilter>` into the contracts list page header
- Add division picker to the contracts create form (same pattern as Task 7/8)

Confirm these four hooks/components exist and are generic:
- `is_division_visible()` — ✅ DB function, no table-specific logic
- `useUserDivisionScope()` — ✅ `src/hooks/useUserDivisionScope.ts`
- `<DivisionFilter />` — ✅ `src/components/shared/DivisionFilter.tsx`
- Division picker pattern — ✅ documented in Task 7/8

- [ ] **Step 2: Final TypeScript build check**

```bash
npx tsc --noEmit
```

Expected: clean (zero new errors introduced by this feature).

- [ ] **Step 3: Update PROGRESS.md**

Add a completion entry for the multi-company division isolation feature.

---

## Edge Case Notes

| Case | Where handled |
|---|---|
| User has no divisions | `useUserDivisionScope` returns empty arrays; create form blocks submit with toast |
| `division_id = NULL` on legacy rows | `is_division_visible(NULL)` returns false for regular users — they won't see it. Owners/accountants see it. |
| Super viewer logs in with stale JWT | Re-login triggers the auth hook and refreshes claims |
| Admin assigns a division to another user | User must re-login for new JWT claims to take effect (communicated via toast) |
| Division hard-delete attempted while orders reference it | `ON DELETE RESTRICT` raises FK error; PostgREST surfaces a `23503` error code — catch and show "This division has active orders and cannot be deleted" |
