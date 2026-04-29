# Credit Groups Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `payment_methods` and `max_days` columns to `credit_groups`, then replace the inline add-row form on the Credit Groups page with a Dialog modal matching the provided screenshot.

**Architecture:** One migration extends the table. The hook type and create payload are updated. A new colocated `AddCreditGroupDialog` component handles the modal. The page removes the inline add-row, opens the dialog on button click, and gains two new read-only columns in the table (Methods, Max Days). Edit stays as the current inline row.

**Tech Stack:** Next.js 15 App Router · Supabase · TanStack Query v5 · shadcn/ui (Base UI) · TypeScript

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260428000001_credit_groups_payment_methods.sql` | Create |
| `src/hooks/useCreditGroups.ts` | Modify — type + create payload |
| `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx` | Create |
| `src/app/(dashboard)/master-data/credit-groups/page.tsx` | Modify — remove inline add, add dialog + new columns |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260428000001_credit_groups_payment_methods.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260428000001_credit_groups_payment_methods.sql
BEGIN;

ALTER TABLE credit_groups
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_days        INTEGER;

COMMIT;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428000001_credit_groups_payment_methods.sql
git commit -m "feat(db): add payment_methods and max_days to credit_groups"
```

---

### Task 2: Update hook types and create payload

**Files:**
- Modify: `src/hooks/useCreditGroups.ts`

- [ ] **Step 1: Update `CreditGroup` type**

Replace the `CreditGroup` type at the top of `src/hooks/useCreditGroups.ts`:

```ts
export type CreditGroup = {
  id:               string
  name:             string
  credit_limit:     number
  payment_methods:  string[]
  max_days:         number | null
  created_at:       string
  updated_at:       string
}
```

- [ ] **Step 2: Add the PAYMENT_METHODS constant**

After the `CreditGroup` type, add:

```ts
export const PAYMENT_METHODS = [
  { key: 'cash',          label: 'Cash' },
  { key: 'online',        label: 'Online' },
  { key: 'pay_later',     label: 'Pay Later' },
  { key: 'fawran',        label: 'Fawran' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cdc',           label: 'CDC (Current-Dated Cheque)' },
  { key: 'pdc',           label: 'PDC (Post-Dated Cheque)' },
  { key: 'pos',           label: 'POS' },
] as const

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]['key']
```

- [ ] **Step 3: Update `useCreateCreditGroup` payload type**

Replace the `mutationFn` signature in `useCreateCreditGroup`:

```ts
export function useCreateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name:             string
      credit_limit:     number
      payment_methods:  string[]
      max_days:         number | null
    }) => {
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
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "useCreditGroups" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreditGroups.ts
git commit -m "feat(hooks): add payment_methods + max_days to CreditGroup type and PAYMENT_METHODS constant"
```

---

### Task 3: Create AddCreditGroupDialog component

**Files:**
- Create: `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useCreateCreditGroup,
  PAYMENT_METHODS,
} from '@/hooks/useCreditGroups'

interface AddCreditGroupDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
}

export function AddCreditGroupDialog({ open, onOpenChange }: AddCreditGroupDialogProps) {
  const create = useCreateCreditGroup()

  const [name, setName]                       = useState('')
  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const [maxAmount, setMaxAmount]             = useState('')
  const [maxDays, setMaxDays]                 = useState('')

  function resetForm() {
    setName(''); setSelectedMethods([]); setMaxAmount(''); setMaxDays('')
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm()
    onOpenChange(next)
  }

  function toggleMethod(key: string) {
    setSelectedMethods((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    const credit_limit = maxAmount !== '' ? parseFloat(maxAmount) : 0
    if (isNaN(credit_limit) || credit_limit < 0) { toast.error('Enter a valid max amount'); return }
    const max_days = maxDays !== '' ? parseInt(maxDays, 10) : null
    if (max_days !== null && (isNaN(max_days) || max_days < 1)) { toast.error('Enter a valid number of days'); return }

    create.mutate(
      { name: name.trim(), credit_limit, payment_methods: selectedMethods, max_days },
      {
        onSuccess: () => { toast.success('Credit group added'); handleOpenChange(false) },
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Add Credit Group</DialogTitle>
          <p className="text-sm text-muted-foreground">Create a new credit group.</p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input
              placeholder="e.g. Premium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {/* Payment Methods */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Payment Methods</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(({ key, label }) => {
                const selected = selectedMethods.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleMethod(key)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                      selected
                        ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-input bg-background hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className={selected ? '' : 'ml-5'}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Max Amount + Max Days */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Amount (QAR)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Days</label>
              <Input
                type="number"
                min="1"
                placeholder="—"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "AddCreditGroupDialog" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx"
git commit -m "feat(ui): add AddCreditGroupDialog — payment methods toggle grid, max amount, max days"
```

---

### Task 4: Update Credit Groups page

**Files:**
- Modify: `src/app/(dashboard)/master-data/credit-groups/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire file content with:

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
  useUpdateCreditGroup,
  useDeleteCreditGroup,
  useCreditGroupCustomerCounts,
  PAYMENT_METHODS,
  type CreditGroup,
} from '@/hooks/useCreditGroups'
import { formatCurrency } from '@/lib/utils/formatters'
import { AddCreditGroupDialog } from './AddCreditGroupDialog'

function resolveMethodLabels(keys: string[]): string {
  if (!keys || keys.length === 0) return '—'
  return keys
    .map((k) => PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k)
    .join(', ')
}

export default function CreditGroupsPage() {
  const { data: groups = [], isLoading } = useCreditGroups()
  const { data: counts = {} }            = useCreditGroupCustomerCounts()
  const update = useUpdateCreditGroup()
  const remove = useDeleteCreditGroup()

  const [dialogOpen, setDialogOpen]         = useState(false)
  const [editId, setEditId]                 = useState<string | null>(null)
  const [editName, setEditName]             = useState('')
  const [editLimit, setEditLimit]           = useState('')
  const [deleteTarget, setDeleteTarget]     = useState<CreditGroup | null>(null)

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
        onError:   (err) => toast.error(err.message),
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
      onError:   (err) => { toast.error(err.message); setDeleteTarget(null) },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Groups"
        description="Define credit tiers — each customer must be assigned a group before creating a sales order"
      />

      <div className="rounded-md border overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group Name</TableHead>
              <TableHead className="text-right">Credit Limit (QAR)</TableHead>
              <TableHead className="hidden md:table-cell">Methods</TableHead>
              <TableHead className="hidden md:table-cell text-right">Max Days</TableHead>
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
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
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
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {resolveMethodLabels(g.payment_methods)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                        {g.max_days ?? '—'}
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
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {resolveMethodLabels(g.payment_methods)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                        {g.max_days ?? '—'}
                      </TableCell>
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
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4" /> Add Credit Group
      </Button>

      <AddCreditGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} />

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

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "credit-groups|AddCreditGroup|useCreditGroups" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/master-data/credit-groups/page.tsx"
git commit -m "feat(ui): credit-groups page — Add dialog, Methods + Max Days columns, remove inline add-row"
```

---

### Task 5: Final build check and PROGRESS.md

- [ ] **Step 1: Production build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`, no errors.

- [ ] **Step 2: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-26] **[Credit Groups Dialog] Tasks 1–4** — `supabase/migrations/20260428000001_credit_groups_payment_methods.sql`, `src/hooks/useCreditGroups.ts`, `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx`, `src/app/(dashboard)/master-data/credit-groups/page.tsx` — payment_methods + max_days migration; PAYMENT_METHODS constant; modal dialog with toggle grid; table shows Methods + Max Days columns
```

- [ ] **Step 3: Commit PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Credit Groups Dialog complete"
```
