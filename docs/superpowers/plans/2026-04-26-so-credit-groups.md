# SO Credit Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `credit_groups` master-data entity, link customers to a credit group, and surface the credit group assignment on the create-SO customer selector.

**Architecture:** Single migration creates the table, a DB view for server-side customer counts (never downloads the full customer table to the browser), and backfills all existing customers to a default "Standard" group. A CRUD hook + management page in Master Data let the owner rename groups, set limits, and reassign customers. The customers admin page uses a paginated hook separate from the combobox hook so the 50-row combobox limit never blocks admin access.

**Tech Stack:** Next.js 15 App Router · Supabase (postgres + rls) · TanStack React Query v5 · shadcn/ui

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260427000001_credit_groups.sql` | Create |
| `src/hooks/useCreditGroups.ts` | Create |
| `src/app/(dashboard)/master-data/credit-groups/page.tsx` | Create |
| `src/components/layout/nav-config.ts` | Modify — add Credit Groups + Customers nav items |
| `src/hooks/useSaleOrders.ts` | Modify — extend `Customer` type + `useCustomers` select + `useAllCustomers` |
| `src/app/(dashboard)/master-data/customers/page.tsx` | Create |

---

### Task 1: Database migration — credit_groups table, view, backfill

**Files:**
- Create: `supabase/migrations/20260427000001_credit_groups.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260427000001_credit_groups.sql
BEGIN;

CREATE TABLE credit_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read credit_groups"
  ON credit_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert credit_groups"
  ON credit_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update credit_groups"
  ON credit_groups FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated can delete credit_groups"
  ON credit_groups FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_credit_groups
  BEFORE UPDATE ON credit_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a default group — existing customers are backfilled below
INSERT INTO credit_groups (name, credit_limit)
VALUES ('Standard', 50000);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_group_id UUID REFERENCES credit_groups(id);

-- Backfill every existing customer to the default group atomically
UPDATE customers
SET    credit_group_id = (SELECT id FROM credit_groups WHERE name = 'Standard')
WHERE  credit_group_id IS NULL;

-- Server-side count view: never download the whole customer table to the browser
-- just to count group membership.
CREATE VIEW credit_group_customer_counts AS
  SELECT
    credit_group_id,
    COUNT(*)::INT AS customer_count
  FROM   customers
  WHERE  credit_group_id IS NOT NULL
  GROUP  BY credit_group_id;

GRANT SELECT ON credit_group_customer_counts TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push migration to Supabase**

```bash
npx supabase db push --linked
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Verify in Supabase dashboard**

Open Table Editor → `credit_groups`. Confirm 1 row ("Standard", 50000). Open `customers` — confirm `credit_group_id` column exists and every row has a non-null value.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427000001_credit_groups.sql
git commit -m "feat(db): add credit_groups table, customer FK, count view, backfill all customers"
```

---

### Task 2: useCreditGroups hook

**Files:**
- Create: `src/hooks/useCreditGroups.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useCreditGroups.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditGroup = {
  id:           string
  name:         string
  credit_limit: number
  created_at:   string
  updated_at:   string
}

export function useCreditGroups() {
  return useQuery({
    queryKey: ['credit-groups'],
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_groups')
        .select('*')
        .order('name')
      if (error) throw error
      return data as CreditGroup[]
    },
    staleTime: 60 * 1000,
  })
}

export function useCreateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; credit_limit: number }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_groups')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as CreditGroup
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}

export function useUpdateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CreditGroup> & { id: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('credit_groups')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
    },
  })
}

export function useDeleteCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('credit_groups')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}

// Uses the DB view — aggregation done on the server, not the browser.
export function useCreditGroupCustomerCounts() {
  return useQuery({
    queryKey: ['credit-group-counts'],
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_group_customer_counts')
        .select('credit_group_id, customer_count')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? [])) {
        counts[row.credit_group_id] = Number(row.customer_count)
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}

// Assign a customer to a credit group via React Query mutation (not raw supabase call).
export function useAssignCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, groupId }: { customerId: string; groupId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('customers')
        .update({ credit_group_id: groupId })
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['all-customers'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "useCreditGroups"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreditGroups.ts
git commit -m "feat(hooks): add useCreditGroups CRUD hooks with server-side count view"
```

---

### Task 3: Credit Groups management page

**Files:**
- Create: `src/app/(dashboard)/master-data/credit-groups/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p "D:/MMS/src/app/(dashboard)/master-data/credit-groups"
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(dashboard)/master-data/credit-groups/page.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useCreditGroups,
  useCreateCreditGroup,
  useUpdateCreditGroup,
  useDeleteCreditGroup,
  useCreditGroupCustomerCounts,
  type CreditGroup,
} from '@/hooks/useCreditGroups'
import { formatCurrency } from '@/lib/utils/formatters'

export default function CreditGroupsPage() {
  const { data: groups = [], isLoading } = useCreditGroups()
  const { data: counts = {} }            = useCreditGroupCustomerCounts()
  const create = useCreateCreditGroup()
  const update = useUpdateCreditGroup()
  const remove = useDeleteCreditGroup()

  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')
  const [newLimit, setNewLimit]     = useState('')
  const [editId, setEditId]         = useState<string | null>(null)
  const [editName, setEditName]     = useState('')
  const [editLimit, setEditLimit]   = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CreditGroup | null>(null)

  function startEdit(g: CreditGroup) {
    setEditId(g.id); setEditName(g.name); setEditLimit(String(g.credit_limit))
  }
  function cancelEdit() { setEditId(null) }

  function submitEdit() {
    if (!editId) return
    const limit = parseFloat(editLimit)
    if (!editName.trim() || isNaN(limit) || limit < 0) { toast.error('Enter a valid name and credit limit'); return }
    update.mutate(
      { id: editId, name: editName.trim(), credit_limit: limit },
      {
        onSuccess: () => { toast.success('Updated'); setEditId(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function submitAdd() {
    const limit = parseFloat(newLimit)
    if (!newName.trim() || isNaN(limit) || limit < 0) { toast.error('Enter a valid name and credit limit'); return }
    create.mutate(
      { name: newName.trim(), credit_limit: limit },
      {
        onSuccess: () => { toast.success('Credit group added'); setNewName(''); setNewLimit(''); setAdding(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDelete(g: CreditGroup) {
    const n = counts[g.id] ?? 0
    if (n > 0) { toast.error(`Cannot delete — ${n} customer(s) assigned`); return }
    setDeleteTarget(g)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    remove.mutate(deleteTarget.id, {
      onSuccess: () => { toast.success('Deleted'); setDeleteTarget(null) },
      onError: (err) => { toast.error(err.message); setDeleteTarget(null) },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Groups"
        description="Define credit tiers — each customer must be assigned a group before creating a sales order"
      />

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group Name</TableHead>
              <TableHead className="text-right">Credit Limit (QAR)</TableHead>
              <TableHead className="text-right">Customers</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              : groups.map((g) =>
                  editId === g.id ? (
                    <TableRow key={g.id}>
                      <TableCell>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="h-8 text-sm text-right"
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{counts[g.id] ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={submitEdit} disabled={update.isPending}>
                            <Check className="h-3.5 w-3.5 text-success" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(g.credit_limit, 'QAR')}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{counts[g.id] ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(g)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(g)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}

            {adding && (
              <TableRow>
                <TableCell>
                  <Input placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }} />
                </TableCell>
                <TableCell>
                  <Input type="number" min={0} placeholder="50000" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} className="h-8 text-sm text-right"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }} />
                </TableCell>
                <TableCell />
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={submitAdd} disabled={create.isPending}>
                      <Check className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!adding && (
        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add Credit Group
        </Button>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. The group must have zero customers assigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "credit-groups" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/master-data/credit-groups/page.tsx
git commit -m "feat(ui): add Credit Groups management page"
```

---

### Task 4: Nav wiring + extend Customer type

**Files:**
- Modify: `src/components/layout/nav-config.ts`
- Modify: `src/hooks/useSaleOrders.ts`

- [ ] **Step 1: Add Credit Groups and Customers to nav**

In `src/components/layout/nav-config.ts`, replace the first Master Data items array:

```ts
{
  items: [
    { label: 'Suppliers',         href: '/master-data/suppliers' },
    { label: 'Customers',         href: '/master-data/customers' },
    { label: 'Credit Groups',     href: '/master-data/credit-groups' },
    { label: 'Warehouses',        href: '/purchase/warehouses' },
    { label: 'Users & Roles',     href: '/master-data/users' },
    { label: 'Audit Trail',       href: '/master-data/audit-trail' },
    { label: 'Admin',             href: '/master-data/admin' },
    { label: 'Approval Settings', href: '/purchase/approval-settings' },
  ],
},
```

- [ ] **Step 2: Extend Customer type in useSaleOrders.ts**

Replace the `Customer` type (around line 85):

```ts
export type Customer = {
  id:                  string
  name:                string
  phone:               string | null
  email:               string | null
  customer_number:     string | null
  customer_type:       string | null
  is_blocked:          boolean
  credit_group_id:     string | null
  credit_group_name?:  string | null
  credit_group_limit?: number | null
}
```

- [ ] **Step 3: Update useCustomers select (combobox hook — keeps limit 50)**

In `useCustomers`, update the queryFn select string and return mapping:

```ts
// select string
.select('id, name, phone, email, customer_number, customer_type, is_blocked, credit_group_id, credit_groups(name, credit_limit)')
.is('deleted_at', null)  // remove this line if customers table has no deleted_at — check your schema
.order('name')
.limit(50)

// return mapping
return (data ?? []).map((row: any) => ({
  ...row,
  credit_group_name:  row.credit_groups?.name         ?? null,
  credit_group_limit: row.credit_groups?.credit_limit ?? null,
})) as Customer[]
```

**Note:** If `customers` has no `deleted_at` column, remove the `.is('deleted_at', null)` line. Check `supabase/migrations/20260416120736_initial_schema.sql` — the customers table definition does not include `deleted_at`, so remove it.

- [ ] **Step 4: Add useAllCustomers hook for the admin Customers page**

Add this hook after `useCustomers` in `src/hooks/useSaleOrders.ts`. It uses page-based pagination (no hard limit) so the admin page can see all customers:

```ts
const CUSTOMERS_PAGE_SIZE = 50

export function useAllCustomers(search: string, page: number) {
  return useQuery({
    queryKey: ['all-customers', search, page],
    queryFn:  async () => {
      const supabase = createClient()
      const from = page * CUSTOMERS_PAGE_SIZE
      const to   = from + CUSTOMERS_PAGE_SIZE - 1
      let q = (supabase as any)
        .from('customers')
        .select('id, name, phone, email, customer_type, is_blocked, credit_group_id, credit_groups(name, credit_limit)', { count: 'exact' })
        .order('name')
        .range(from, to)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.ilike('name', `%${safe}%`)
      }
      const { data, count, error } = await q
      if (error) throw error
      return {
        customers: (data ?? []).map((row: any) => ({
          ...row,
          credit_group_name:  row.credit_groups?.name         ?? null,
          credit_group_limit: row.credit_groups?.credit_limit ?? null,
        })) as Customer[],
        total: count ?? 0,
      }
    },
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "useSaleOrders|nav-config" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/nav-config.ts src/hooks/useSaleOrders.ts
git commit -m "feat: add Credit Groups/Customers to nav; extend Customer type; add useAllCustomers paginated hook"
```

---

### Task 5: Customers management page

**Files:**
- Create: `src/app/(dashboard)/master-data/customers/page.tsx`

Key fixes applied here vs. the original draft:
- `useRef` (not `useState`) for the debounce timer — prevents re-render on every keystroke
- `useAssignCreditGroup` mutation (not raw supabase) — proper React Query lifecycle
- `useAllCustomers` with page-based pagination — no 50-customer hard cutoff

- [ ] **Step 1: Create the directory if needed**

```bash
mkdir -p "D:/MMS/src/app/(dashboard)/master-data/customers"
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(dashboard)/master-data/customers/page.tsx
'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAllCustomers } from '@/hooks/useSaleOrders'
import { useCreditGroups, useAssignCreditGroup } from '@/hooks/useCreditGroups'

const PAGE_SIZE = 50

export default function CustomersPage() {
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage]               = useState(0)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
    // useRef — does NOT trigger a re-render, unlike useState
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const { data, isLoading }  = useAllCustomers(debouncedSearch, page)
  const customers             = data?.customers ?? []
  const total                 = data?.total ?? 0
  const totalPages            = Math.ceil(total / PAGE_SIZE)

  const { data: groups = [] } = useCreditGroups()
  const assignGroup           = useAssignCreditGroup()

  function handleAssign(customerId: string, groupId: string) {
    assignGroup.mutate(
      { customerId, groupId },
      {
        onSuccess: () => toast.success('Credit group updated'),
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        description="Assign credit groups — required before creating a sales order"
      />

      <SearchInput value={search} onChange={handleSearch} placeholder="Search by name…" />

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Phone</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead>Credit Group</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                  </TableRow>
                ))
              : customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.is_blocked && (
                        <Badge variant="outline" className="text-[9px] border-destructive text-destructive mt-0.5">Blocked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {c.phone ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground capitalize">
                      {c.customer_type ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.credit_group_id ?? ''}
                        onValueChange={(val) => handleAssign(c.id, val)}
                        disabled={assignGroup.isPending}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Assign group…" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} customers · page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "master-data/customers" | head -10
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

Start dev server (`npm run dev`). Navigate to Master Data → Customers. Confirm:
- Table loads with pagination controls
- Debounced search filters correctly
- Credit Group dropdown updates immediately (optimistic via React Query)
- Navigate to Master Data → Credit Groups — add "Premium" (100,000) — confirm it appears in the Customers page dropdown

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/master-data/customers/page.tsx
git commit -m "feat(ui): add Customers page — paginated, useRef debounce, mutation-based credit group assign"
```
