# SO Credit Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `credit_groups` master-data entity, link customers to a credit group, and surface the credit group assignment on the create-SO customer selector.

**Architecture:** Single migration creates the table and backfills all existing customers to a default "Standard" group (preventing day-one breakage). A CRUD hook + management page in Master Data let the owner rename groups, set limits, and reassign customers. The customer FK is exposed in `useCustomers` so the create-SO page can gate on a missing credit group.

**Tech Stack:** Next.js 15 App Router · Supabase (postgres + rls) · TanStack React Query v5 · shadcn/ui

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260427000001_credit_groups.sql` | Create |
| `src/hooks/useCreditGroups.ts` | Create |
| `src/app/(dashboard)/master-data/credit-groups/page.tsx` | Create |
| `src/components/layout/nav-config.ts` | Modify — add Credit Groups nav item |
| `src/hooks/useSaleOrders.ts` | Modify — extend `Customer` type + `useCustomers` select |

---

### Task 1: Database migration — credit_groups table + backfill

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

-- Seed a default group so all existing customers get assigned immediately
INSERT INTO credit_groups (name, credit_limit)
VALUES ('Standard', 50000);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_group_id UUID REFERENCES credit_groups(id);

-- Backfill every existing customer to the default group
UPDATE customers
SET    credit_group_id = (SELECT id FROM credit_groups WHERE name = 'Standard')
WHERE  credit_group_id IS NULL;

COMMIT;
```

- [ ] **Step 2: Push migration to Supabase**

```bash
npx supabase db push --linked
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Verify in Supabase dashboard**

Open the Table Editor → `credit_groups`. Confirm 1 row ("Standard", 50000). Open `customers` table → confirm `credit_group_id` column exists and every row has a non-null value.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427000001_credit_groups.sql
git commit -m "feat(db): add credit_groups table with Standard seed and backfill all customers"
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
  customer_count?: number
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
    },
  })
}

// Returns number of customers assigned to each credit group
export function useCreditGroupCustomerCounts() {
  return useQuery({
    queryKey: ['credit-group-customer-counts'],
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('credit_group_id')
        .is('deleted_at', null)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? [])) {
        if (row.credit_group_id) {
          counts[row.credit_group_id] = (counts[row.credit_group_id] ?? 0) + 1
        }
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "useCreditGroups"
```

Expected: no errors mentioning `useCreditGroups`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreditGroups.ts
git commit -m "feat(hooks): add useCreditGroups CRUD hooks"
```

---

### Task 3: Credit Groups management page

**Files:**
- Create: `src/app/(dashboard)/master-data/credit-groups/page.tsx`

- [ ] **Step 1: Create the page directory and file**

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
  const { data: counts = {} } = useCreditGroupCustomerCounts()
  const create = useCreateCreditGroup()
  const update = useUpdateCreditGroup()
  const remove = useDeleteCreditGroup()

  // Add-row state
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState('')
  const [newLimit, setNewLimit]     = useState('')

  // Inline-edit state
  const [editId, setEditId]         = useState<string | null>(null)
  const [editName, setEditName]     = useState('')
  const [editLimit, setEditLimit]   = useState('')

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<CreditGroup | null>(null)

  function startEdit(g: CreditGroup) {
    setEditId(g.id)
    setEditName(g.name)
    setEditLimit(String(g.credit_limit))
  }

  function cancelEdit() {
    setEditId(null)
  }

  function submitEdit() {
    if (!editId) return
    const limit = parseFloat(editLimit)
    if (!editName.trim() || isNaN(limit) || limit < 0) {
      toast.error('Enter a valid name and credit limit')
      return
    }
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
    if (!newName.trim() || isNaN(limit) || limit < 0) {
      toast.error('Enter a valid name and credit limit')
      return
    }
    create.mutate(
      { name: newName.trim(), credit_limit: limit },
      {
        onSuccess: () => {
          toast.success('Credit group added')
          setNewName('')
          setNewLimit('')
          setAdding(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDelete(g: CreditGroup) {
    const customerCount = counts[g.id] ?? 0
    if (customerCount > 0) {
      toast.error(`Cannot delete — ${customerCount} customer(s) are assigned to this group`)
      return
    }
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
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={editLimit}
                          onChange={(e) => setEditLimit(e.target.value)}
                          className="h-8 text-sm text-right"
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {counts[g.id] ?? 0}
                      </TableCell>
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
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(g.credit_limit, 'QAR')}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {counts[g.id] ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(g)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive/60 hover:text-destructive"
                            onClick={() => handleDelete(g)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}

            {/* Add row */}
            {adding && (
              <TableRow>
                <TableCell>
                  <Input
                    placeholder="Group name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    placeholder="50000"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="h-8 text-sm text-right"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') setAdding(false) }}
                  />
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
            <AlertDialogDescription>
              This cannot be undone. The group must have zero customers assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "credit-groups"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/master-data/credit-groups/page.tsx
git commit -m "feat(ui): add Credit Groups management page"
```

---

### Task 4: Wire Credit Groups into the nav + extend Customer type

**Files:**
- Modify: `src/components/layout/nav-config.ts` (line 26 — Master Data group items)
- Modify: `src/hooks/useSaleOrders.ts` (Customer type + useCustomers select)

- [ ] **Step 1: Add Credit Groups to nav-config**

In `src/components/layout/nav-config.ts`, add the new item to the first Master Data group:

```ts
// Existing first group under Master Data — add 'Customers' and 'Credit Groups'
{
  items: [
    { label: 'Suppliers',          href: '/master-data/suppliers' },
    { label: 'Customers',          href: '/master-data/customers' },
    { label: 'Credit Groups',      href: '/master-data/credit-groups' },
    { label: 'Warehouses',         href: '/purchase/warehouses' },
    { label: 'Users & Roles',      href: '/master-data/users' },
    { label: 'Audit Trail',        href: '/master-data/audit-trail' },
    { label: 'Admin',              href: '/master-data/admin' },
    { label: 'Approval Settings',  href: '/purchase/approval-settings' },
  ],
},
```

- [ ] **Step 2: Extend `Customer` type and `useCustomers` select in useSaleOrders.ts**

In `src/hooks/useSaleOrders.ts`, update the `Customer` type (around line 85) and the `useCustomers` queryFn:

```ts
// Replace the existing Customer type
export type Customer = {
  id:              string
  name:            string
  phone:           string | null
  email:           string | null
  customer_number: string | null
  customer_type:   string | null
  is_blocked:      boolean
  credit_group_id: string | null
  // joined from credit_groups
  credit_group_name?:  string | null
  credit_group_limit?: number | null
}
```

In `useCustomers` queryFn, update the select string:

```ts
let q = (supabase as any)
  .from('customers')
  .select('id, name, phone, email, customer_number, customer_type, is_blocked, credit_group_id, credit_groups(name, credit_limit)')
  .is('deleted_at', null)
  .order('name')
  .limit(50)
```

And update the return mapping after the `await q`:

```ts
return (data ?? []).map((row: any) => ({
  ...row,
  credit_group_name:  row.credit_groups?.name  ?? null,
  credit_group_limit: row.credit_groups?.credit_limit ?? null,
})) as Customer[]
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "useSaleOrders|nav-config" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-config.ts src/hooks/useSaleOrders.ts
git commit -m "feat: add Credit Groups to nav; extend Customer type with credit_group fields"
```

---

### Task 5: Customers management page (assign credit groups)

**Files:**
- Create: `src/app/(dashboard)/master-data/customers/page.tsx`

This page lists customers and lets the owner reassign credit groups. It doesn't replace any existing customer flow — it's a new page at the nav link we just added.

- [ ] **Step 1: Write the page**

```tsx
// src/app/(dashboard)/master-data/customers/page.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCustomers } from '@/hooks/useSaleOrders'
import { useCreditGroups } from '@/hooks/useCreditGroups'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

export default function CustomersPage() {
  const [search, setSearch]             = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const queryClient = useQueryClient()

  const searchRef = useState<ReturnType<typeof setTimeout> | null>(null)
  function handleSearch(val: string) {
    setSearch(val)
    if (searchRef[0]) clearTimeout(searchRef[0])
    searchRef[1](setTimeout(() => setDebouncedSearch(val), 300))
  }

  const { data: customers = [], isLoading } = useCustomers(debouncedSearch || undefined)
  const { data: groups = [] } = useCreditGroups()

  async function assignGroup(customerId: string, groupId: string) {
    const supabase = createClient()
    const { error } = await (supabase as any)
      .from('customers')
      .update({ credit_group_id: groupId || null })
      .eq('id', customerId)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Credit group updated')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    }
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        description="Assign credit groups to customers — required before creating a sales order"
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
              ? Array.from({ length: 8 }).map((_, i) => (
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
                        <Badge variant="outline" className="text-[9px] border-destructive text-destructive mt-0.5">
                          Blocked
                        </Badge>
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
                        onValueChange={(val) => assignGroup(c.id, val)}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Assign group…" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </PageWrapper>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "master-data/customers" | head -10
```

Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

Start dev server (`npm run dev`). Navigate to Master Data → Customers. Confirm the table loads, credit group dropdowns show the "Standard" group, and changing a dropdown fires a toast.

Navigate to Master Data → Credit Groups. Confirm the page loads with the Standard group. Add a new group (e.g., "Premium", 100000) — it should appear in the list. Edit the credit limit inline. Attempt to delete Standard (should be blocked — customers assigned). Delete the new Premium group — should succeed.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/master-data/customers/page.tsx
git commit -m "feat(ui): add Customers page with credit group assignment"
```
