# Admin UI Restructure + Users & Roles Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Companies & Warehouses inside the Admin layout, redesign division cards + form, and fully redesign the Users & Roles page with accordion permissions and role cards.

**Architecture:** Pages are moved to `/master-data/admin/*` so Next.js layout nesting automatically gives them the Admin sidebar. The `permissions.ts` lib is enhanced with labels/descriptions/icons; this drives both the Permissions accordion and the redesigned RoleFormDialog. All UI components are updated in-place — no new shared components needed.

**Tech Stack:** Next.js 15 App Router, shadcn/ui (Base UI under the hood), Tailwind CSS, TanStack Query v5, Zod v4, Supabase JS v2, Vitest

**Branch:** `develop` — commit after every task.

---

## File Map

| File | Action | Task |
|---|---|---|
| `supabase/migrations/20260418160000_division_assets_bucket.sql` | Create | 1 |
| `supabase/migrations/20260418160001_divisions_name_ar.sql` | Create | 1 |
| `src/types/database.types.ts` | Modify — add `name_ar` to divisions Row/Insert/Update | 1 |
| `src/components/layout/nav-config.ts` | Modify — update Companies & Warehouses hrefs | 2 |
| `src/components/master-data/AdminSidebar.tsx` | Modify — update hrefs + rename label | 2 |
| `src/app/(dashboard)/master-data/admin/companies/page.tsx` | Create (then replace in Task 5) | 2 |
| `src/app/(dashboard)/master-data/admin/warehouses/page.tsx` | Create | 2 |
| `src/app/(dashboard)/master-data/companies/page.tsx` | Delete | 2 |
| `src/app/(dashboard)/master-data/warehouses/page.tsx` | Delete | 2 |
| `src/hooks/useDivisions.ts` | Modify — add `useAllDivisions`, `useDeleteDivision` | 3 |
| `src/lib/permissions.ts` | Modify — full rewrite with icons, labels, descriptions, `roleColor` | 4 |
| `src/lib/permissions.test.ts` | Create | 4 |
| `src/components/master-data/DivisionFormDialog.tsx` | Modify — full redesign | 5 |
| `src/app/(dashboard)/master-data/admin/companies/page.tsx` | Modify — division cards redesign | 6 |
| `src/components/master-data/RoleFormDialog.tsx` | Modify — accordion redesign | 7 |
| `src/app/(dashboard)/master-data/users/page.tsx` | Modify — full redesign | 8 |

---

## Task 1: DB Migrations + Type Update

**Files:**
- Create: `supabase/migrations/20260418160000_division_assets_bucket.sql`
- Create: `supabase/migrations/20260418160001_divisions_name_ar.sql`
- Modify: `src/types/database.types.ts` lines ~699–766

- [ ] **Step 1: Create the Storage bucket migration**

```sql
-- supabase/migrations/20260418160000_division_assets_bucket.sql
insert into storage.buckets (id, name, public)
values ('division-assets', 'division-assets', true)
on conflict (id) do nothing;

create policy "Public can read division assets"
  on storage.objects for select
  to public
  using (bucket_id = 'division-assets');

create policy "Authenticated users can upload division assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'division-assets');

create policy "Authenticated users can update division assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'division-assets');
```

- [ ] **Step 2: Create the name_ar column migration**

```sql
-- supabase/migrations/20260418160001_divisions_name_ar.sql
alter table public.divisions
  add column if not exists name_ar text null;
```

- [ ] **Step 3: Apply migrations via Supabase dashboard**

Go to the Supabase dashboard → SQL Editor, paste and run each migration file in order (bucket first, then name_ar). Both must succeed with no errors.

- [ ] **Step 4: Update database.types.ts — add name_ar to divisions Row, Insert, Update**

In `src/types/database.types.ts`, find the `divisions` table definition (around line 698) and add `name_ar` in three places:

```ts
// Row (add after "name: string"):
name_ar: string | null

// Insert (add after "name: string"):
name_ar?: string | null

// Update (add after "name?: string"):
name_ar?: string | null
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd D:/MMS && git add supabase/migrations/ src/types/database.types.ts
git commit -m "feat(db): add divisions.name_ar column + division-assets storage bucket"
```

---

## Task 2: Route Migration + Link Updates

**Files:**
- Create: `src/app/(dashboard)/master-data/admin/companies/page.tsx`
- Create: `src/app/(dashboard)/master-data/admin/warehouses/page.tsx`
- Delete: `src/app/(dashboard)/master-data/companies/page.tsx`
- Delete: `src/app/(dashboard)/master-data/warehouses/page.tsx`
- Modify: `src/components/layout/nav-config.ts`
- Modify: `src/components/master-data/AdminSidebar.tsx`

- [ ] **Step 1: Create admin/companies/page.tsx (temporary copy)**

Create `src/app/(dashboard)/master-data/admin/companies/page.tsx` with the exact same content as the current `src/app/(dashboard)/master-data/companies/page.tsx`. This is a temporary copy — Task 6 will replace it with the card-grid redesign.

- [ ] **Step 2: Create admin/warehouses/page.tsx**

Create `src/app/(dashboard)/master-data/admin/warehouses/page.tsx` with the exact same content as `src/app/(dashboard)/master-data/warehouses/page.tsx`.

- [ ] **Step 3: Delete the old standalone pages**

```bash
cd D:/MMS
rm src/app/\(dashboard\)/master-data/companies/page.tsx
rm src/app/\(dashboard\)/master-data/warehouses/page.tsx
```

(The parent `companies/` and `warehouses/` directories will be empty after deletion — they can be left or removed; Next.js ignores empty route directories.)

- [ ] **Step 4: Update nav-config.ts**

In `src/components/layout/nav-config.ts`, update the two hrefs:

```ts
{ label: 'Companies & Divisions', href: '/master-data/admin/companies' },
{ label: 'Warehouses', href: '/master-data/admin/warehouses' },
```

- [ ] **Step 5: Update AdminSidebar.tsx**

In `src/components/master-data/AdminSidebar.tsx`, update the Organization section:

```ts
const ADMIN_SECTIONS: SidebarSection[] = [
  {
    label: 'Organization',
    items: [
      { label: 'Companies & Divisions', href: '/master-data/admin/companies', icon: Users },
      { label: 'Warehouses', href: '/master-data/admin/warehouses', icon: Warehouse },
      { label: 'Work Schedule', href: '/master-data/admin/work-schedule', icon: Clock, comingSoon: true },
    ],
  },
  // ... rest unchanged
]
```

- [ ] **Step 6: Verify build**

```bash
cd D:/MMS && npm run build
```

Expected: build succeeds, no route errors.

- [ ] **Step 7: Commit**

```bash
cd D:/MMS && git add -A
git commit -m "feat(admin): move Companies & Warehouses pages inside Admin layout"
```

---

## Task 3: useDivisions Hook Updates

**Files:**
- Modify: `src/hooks/useDivisions.ts`

- [ ] **Step 1: Add useAllDivisions and useDeleteDivision**

Replace the entire contents of `src/hooks/useDivisions.ts` with:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Division = DBTable<'divisions'>
export type DivisionInsert = DBInsert<'divisions'>
export type DivisionUpdate = DBUpdate<'divisions'>

/** Active divisions only — used across the app for DivisionFilter, selectors, etc. */
export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** All divisions including inactive — used by admin Companies page. */
export function useAllDivisions() {
  return useQuery({
    queryKey: ['divisions', 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
  })
}

export function useDivisionsByCompany(companyId: string | null) {
  return useQuery({
    queryKey: ['divisions', 'company', companyId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('company_id', companyId!)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    enabled: !!companyId,
  })
}

export function useCreateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: DivisionInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}

export function useUpdateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: DivisionUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}

export function useDeleteDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('divisions')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/hooks/useDivisions.ts
git commit -m "feat(hooks): add useAllDivisions + useDeleteDivision to useDivisions"
```

---

## Task 4: permissions.ts Enhancement + Tests

**Files:**
- Modify: `src/lib/permissions.ts`
- Create: `src/lib/permissions.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PERMISSION_GROUPS, ALL_PERMISSIONS, roleColor } from './permissions'

describe('PERMISSION_GROUPS structure', () => {
  it('every group has module, icon, and permissions array', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(typeof group.module).toBe('string')
      expect(group.module.length).toBeGreaterThan(0)
      expect(typeof group.icon).toBe('function')
      expect(Array.isArray(group.permissions)).toBe(true)
      expect(group.permissions.length).toBeGreaterThan(0)
    }
  })

  it('every permission entry has key, label, and description', () => {
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) {
        expect(typeof p.key).toBe('string')
        expect(p.key.length).toBeGreaterThan(0)
        expect(typeof p.label).toBe('string')
        expect(p.label.length).toBeGreaterThan(0)
        expect(typeof p.description).toBe('string')
        expect(p.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('ALL_PERMISSIONS contains all keys from all groups', () => {
    const fromGroups = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))
    expect(ALL_PERMISSIONS).toEqual(fromGroups)
  })

  it('no duplicate permission keys', () => {
    const seen = new Set<string>()
    for (const key of ALL_PERMISSIONS) {
      expect(seen.has(key), `Duplicate key: ${key}`).toBe(false)
      seen.add(key)
    }
  })
})

describe('roleColor', () => {
  const VALID_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'rose', 'amber', 'indigo']

  it('returns a valid color string', () => {
    expect(VALID_COLORS).toContain(roleColor('Admin'))
    expect(VALID_COLORS).toContain(roleColor('Accountant'))
    expect(VALID_COLORS).toContain(roleColor(''))
  })

  it('is deterministic — same name always returns same color', () => {
    expect(roleColor('Manager')).toBe(roleColor('Manager'))
    expect(roleColor('Viewer')).toBe(roleColor('Viewer'))
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd D:/MMS && npx vitest run src/lib/permissions.test.ts
```

Expected: all tests FAIL (the current `permissions.ts` doesn't export `roleColor` and uses the old `keys` structure).

- [ ] **Step 3: Rewrite permissions.ts**

Replace `src/lib/permissions.ts` entirely:

```ts
import type { LucideIcon } from 'lucide-react'
import {
  Database, ShoppingCart, TrendingUp, ClipboardList,
  FileText, Receipt, Users, Settings2,
} from 'lucide-react'

export type PermissionEntry = {
  key: string
  label: string
  description: string
}

export type PermissionGroup = {
  module: string
  icon: LucideIcon
  permissions: PermissionEntry[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'Master Data',
    icon: Database,
    permissions: [
      { key: 'master_data.companies.view',   label: 'View Companies',        description: 'Access the companies list and details' },
      { key: 'master_data.companies.manage', label: 'Manage Companies',      description: 'Create, edit, and delete company records' },
      { key: 'master_data.divisions.view',   label: 'View Divisions',        description: 'Access the divisions list and details' },
      { key: 'master_data.divisions.manage', label: 'Manage Divisions',      description: 'Create, edit, and delete division records' },
      { key: 'master_data.warehouses.view',  label: 'View Warehouses',       description: 'Access the warehouses list and details' },
      { key: 'master_data.warehouses.manage',label: 'Manage Warehouses',     description: 'Create, edit, and delete warehouse records' },
      { key: 'master_data.inventory.view',   label: 'View Inventory',        description: 'Browse inventory items, categories, and brand variants' },
      { key: 'master_data.inventory.manage', label: 'Manage Inventory',      description: 'Create, edit, and delete inventory items and variants' },
      { key: 'master_data.suppliers.view',   label: 'View Suppliers',        description: 'Access the suppliers list and contact details' },
      { key: 'master_data.suppliers.manage', label: 'Manage Suppliers',      description: 'Create, edit, and delete supplier records' },
      { key: 'master_data.users.view',       label: 'View Users',            description: 'Access the users list and profile details' },
      { key: 'master_data.users.manage',     label: 'Manage Users',          description: 'Create, edit, deactivate, and reset passwords for users' },
      { key: 'master_data.roles.view',       label: 'View Roles',            description: 'Access the roles list and permission assignments' },
      { key: 'master_data.roles.manage',     label: 'Manage Roles',          description: 'Create, edit, and delete custom roles' },
      { key: 'master_data.audit.view',       label: 'View Audit Trail',      description: 'Access the activity log and audit history' },
      { key: 'master_data.admin.view',       label: 'View Admin Settings',   description: 'Access the admin settings panel' },
      { key: 'master_data.admin.manage',     label: 'Manage Admin Settings', description: 'Edit admin settings including brand groups and reason lists' },
    ],
  },
  {
    module: 'Purchase',
    icon: ShoppingCart,
    permissions: [
      { key: 'purchase.orders.view',          label: 'View Purchase Orders',       description: 'View all purchase orders and their details' },
      { key: 'purchase.orders.create',        label: 'Create Purchase Orders',     description: 'Create new purchase orders and save drafts' },
      { key: 'purchase.orders.edit',          label: 'Edit Purchase Orders',       description: 'Edit existing purchase order details and line items' },
      { key: 'purchase.approvals.view',       label: 'View Approvals Queue',       description: 'Access the purchase order approvals queue' },
      { key: 'purchase.approvals.manage',     label: 'Approve / Reject Orders',    description: 'Approve or reject pending purchase orders' },
      { key: 'purchase.shipments.view',       label: 'View Shipments',             description: 'Track shipment status and events' },
      { key: 'purchase.shipments.manage',     label: 'Manage Shipments',           description: 'Create shipments and update their tracking events' },
      { key: 'purchase.landed_costs.view',    label: 'View Landed Costs',          description: 'View landed cost records and allocations' },
      { key: 'purchase.landed_costs.manage',  label: 'Manage Landed Costs',        description: 'Create and void landed cost records' },
      { key: 'purchase.warehouses.view',      label: 'View Warehouse Operations',  description: 'Access stock levels, movements, and transfers' },
      { key: 'purchase.warehouses.manage',    label: 'Manage Warehouse Operations',description: 'Create transfers, adjustments, and inventory checks' },
      { key: 'purchase.returns.view',         label: 'View Purchase Returns',      description: 'Access purchase return records' },
      { key: 'purchase.returns.manage',       label: 'Manage Purchase Returns',    description: 'Create and process purchase return requests' },
      { key: 'purchase.dead_stock.view',      label: 'View Dead Stock Report',     description: 'Access the dead stock and slow-moving inventory report' },
    ],
  },
  {
    module: 'Sales',
    icon: TrendingUp,
    permissions: [
      { key: 'sales.orders.view',    label: 'View Sale Orders',    description: 'View all sale orders and quotations' },
      { key: 'sales.orders.create',  label: 'Create Sale Orders',  description: 'Create new sale orders and quotations' },
      { key: 'sales.orders.edit',    label: 'Edit Sale Orders',    description: 'Edit existing sale order details' },
      { key: 'sales.returns.view',   label: 'View Sale Returns',   description: 'Access sale return records' },
      { key: 'sales.returns.manage', label: 'Manage Sale Returns', description: 'Create and process sale return requests' },
    ],
  },
  {
    module: 'Orders',
    icon: ClipboardList,
    permissions: [
      { key: 'orders.view',   label: 'View Orders',   description: 'Access the orders list and details' },
      { key: 'orders.create', label: 'Create Orders', description: 'Create new service orders' },
      { key: 'orders.edit',   label: 'Edit Orders',   description: 'Edit existing order details' },
      { key: 'orders.assign', label: 'Assign Orders', description: 'Assign orders to teams and employees' },
    ],
  },
  {
    module: 'Contracts',
    icon: FileText,
    permissions: [
      { key: 'contracts.view',   label: 'View Contracts',   description: 'Access the contracts list and details' },
      { key: 'contracts.create', label: 'Create Contracts', description: 'Create new service contracts' },
      { key: 'contracts.edit',   label: 'Edit Contracts',   description: 'Edit existing contract details' },
    ],
  },
  {
    module: 'Invoices & Payments',
    icon: Receipt,
    permissions: [
      { key: 'invoices.view',    label: 'View Invoices',    description: 'Access the invoices list and details' },
      { key: 'invoices.create',  label: 'Create Invoices',  description: 'Generate new invoices' },
      { key: 'invoices.edit',    label: 'Edit Invoices',    description: 'Edit invoice details' },
      { key: 'payments.view',    label: 'View Payments',    description: 'Access payment records' },
      { key: 'payments.manage',  label: 'Manage Payments',  description: 'Record and manage payment transactions' },
    ],
  },
  {
    module: 'Teams',
    icon: Users,
    permissions: [
      { key: 'teams.view',      label: 'View Teams',      description: 'Access the teams list and details' },
      { key: 'teams.manage',    label: 'Manage Teams',    description: 'Create, edit, and delete teams' },
      { key: 'employees.view',  label: 'View Employees',  description: 'Access the employee directory' },
      { key: 'employees.manage',label: 'Manage Employees',description: 'Create, edit, and manage employee records' },
    ],
  },
  {
    module: 'System',
    icon: Settings2,
    permissions: [
      { key: 'system.admin',  label: 'System Administrator', description: 'Full system access including all admin functions' },
      { key: 'system.import', label: 'Import Data',          description: 'Access the CSV import tool for bulk data upload' },
      { key: 'system.export', label: 'Export Data',          description: 'Export data to CSV or PDF formats' },
    ],
  },
]

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))

const ROLE_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'rose', 'amber', 'indigo'] as const
export type RoleColor = (typeof ROLE_COLORS)[number]

/** Deterministic color derived from role name — no DB column needed. */
export function roleColor(name: string): RoleColor {
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % ROLE_COLORS.length
  return ROLE_COLORS[i]
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd D:/MMS && npx vitest run src/lib/permissions.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Verify TypeScript (RoleFormDialog imports PERMISSION_GROUPS — shape changed)**

```bash
cd D:/MMS && npx tsc --noEmit
```

The existing `RoleFormDialog.tsx` accesses `group.keys` which no longer exists. Expected: TypeScript errors on `group.keys`. These will be fixed in Task 7. For now, note the errors and proceed.

- [ ] **Step 6: Commit**

```bash
cd D:/MMS && git add src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "feat(permissions): enhance PERMISSION_GROUPS with icons, labels, descriptions + roleColor util"
```

---

## Task 5: DivisionFormDialog Overhaul

**Files:**
- Modify: `src/components/master-data/DivisionFormDialog.tsx`

- [ ] **Step 1: Replace DivisionFormDialog.tsx entirely**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ImageIcon, Upload } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateDivision, useUpdateDivision, type Division } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import { createClient } from '@/lib/supabase/client'

// ─── Color palette ────────────────────────────────────────────────────────────

const SWATCHES = [
  '#2563eb','#0ea5e9','#06b6d4',
  '#10b981','#22c55e','#84cc16',
  '#eab308','#f59e0b','#f97316',
  '#ef4444','#f43f5e','#ec4899',
  '#a855f7','#8b5cf6','#6366f1',
  '#64748b','#475569','#334155','#1e293b','#0f172a',
]

// ─── Schema ───────────────────────────────────────────────────────────────────

const divisionSchema = z.object({
  company_id:      z.string().uuid('Company is required'),
  name:            z.string().min(1, 'Name is required'),
  name_ar:         z.string().optional(),
  short_name:      z.string().optional(),
  slug:            z.string().min(1, 'Slug is required'),
  color:           z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),
  address_en:      z.string().optional(),
  address_ar:      z.string().optional(),
  footer_motto:    z.string().max(120, 'Max 120 characters').optional(),
  logo_url:        z.string().url().optional().or(z.literal('')),
  stamp_url:       z.string().url().optional().or(z.literal('')),
  default_currency:z.string().min(1),
  default_tax_rate:z.string(),
  sort_order:      z.string(),
})

type DivisionFormValues = z.infer<typeof divisionSchema>

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadAsset(file: File): Promise<string> {
  const supabase = createClient()
  const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
  const { error } = await supabase.storage.from('division-assets').upload(safeName, file)
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('division-assets').getPublicUrl(safeName)
  return publicUrl
}

// ─── Upload area sub-component ────────────────────────────────────────────────

function UploadArea({
  label,
  previewUrl,
  uploading,
  onFileSelect,
}: {
  label: string
  previewUrl: string
  uploading: boolean
  onFileSelect: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/30 p-4 text-muted-foreground hover:bg-muted/50 transition-colors min-h-[88px] disabled:opacity-50"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={label} className="max-h-16 max-w-full object-contain rounded" />
        ) : (
          <>
            {uploading ? (
              <span className="text-xs">Uploading…</span>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="text-xs">Upload {label}</span>
              </>
            )}
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelect(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface DivisionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  division?: Division | null
  companyId?: string
}

export function DivisionFormDialog({ open, onOpenChange, division, companyId }: DivisionFormDialogProps) {
  const isEditing = !!division
  const create = useCreateDivision()
  const update = useUpdateDivision()
  const { data: companies = [] } = useCompanies()
  const isPending = create.isPending || update.isPending
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingStamp, setUploadingStamp] = useState(false)

  const form = useForm<DivisionFormValues>({
    resolver: zodResolver(divisionSchema) as never,
    defaultValues: {
      company_id: companyId ?? '',
      name: '',
      name_ar: '',
      short_name: '',
      slug: '',
      color: '#2563eb',
      address_en: '',
      address_ar: '',
      footer_motto: '',
      logo_url: '',
      stamp_url: '',
      default_currency: 'QAR',
      default_tax_rate: '0',
      sort_order: '0',
    },
  })

  useEffect(() => {
    if (open && division) {
      form.reset({
        company_id:      division.company_id ?? '',
        name:            division.name,
        name_ar:         (division as Division & { name_ar?: string | null }).name_ar ?? '',
        short_name:      division.short_name ?? '',
        slug:            division.slug,
        color:           division.color,
        address_en:      division.address_en ?? '',
        address_ar:      division.address_ar ?? '',
        footer_motto:    division.footer_motto ?? '',
        logo_url:        division.logo_url ?? '',
        stamp_url:       division.stamp_url ?? '',
        default_currency:division.default_currency,
        default_tax_rate:String(division.default_tax_rate),
        sort_order:      String(division.sort_order),
      })
    } else if (open) {
      form.reset({ company_id: companyId ?? '', color: '#2563eb', default_currency: 'QAR', default_tax_rate: '0', sort_order: '0' })
    }
  }, [open, division, companyId, form])

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true)
    try {
      const url = await uploadAsset(file)
      form.setValue('logo_url', url)
    } catch { toast.error('Logo upload failed') }
    finally { setUploadingLogo(false) }
  }

  async function handleStampUpload(file: File) {
    setUploadingStamp(true)
    try {
      const url = await uploadAsset(file)
      form.setValue('stamp_url', url)
    } catch { toast.error('Stamp upload failed') }
    finally { setUploadingStamp(false) }
  }

  function onSubmit(values: DivisionFormValues) {
    const payload = {
      ...values,
      name_ar:         values.name_ar || null,
      short_name:      values.short_name || null,
      address_en:      values.address_en || null,
      address_ar:      values.address_ar || null,
      footer_motto:    values.footer_motto || null,
      logo_url:        values.logo_url || null,
      stamp_url:       values.stamp_url || null,
      default_tax_rate:parseFloat(values.default_tax_rate) || 0,
      sort_order:      parseInt(values.sort_order, 10) || 0,
    }
    if (isEditing && division) {
      update.mutate(
        { id: division.id, ...payload },
        {
          onSuccess: () => { toast.success('Division updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(payload as never, {
        onSuccess: () => { toast.success('Division created'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  const watchedColor = form.watch('color')
  const watchedLogo = form.watch('logo_url') ?? ''
  const watchedStamp = form.watch('stamp_url') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Division</DialogTitle>
          <p className="text-sm text-muted-foreground">Create a new division with branding assets.</p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* 1 — Company */}
            {isEditing ? (
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Company (Legal Entity)</span>
                <p className="text-sm text-foreground border rounded-md px-3 py-2 bg-muted/30">
                  {companies.find((c) => c.id === division?.company_id)?.name_en ?? '—'}
                </p>
              </div>
            ) : (
              <FormField control={form.control} name="company_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company (Legal Entity) *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* 2 — Division Name + Short Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Division Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Maintenance" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="short_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Short Name</FormLabel>
                  <FormControl><Input placeholder="e.g. AFM" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* 2b — Slug (hidden from primary view but required) */}
            <FormField control={form.control} name="slug" render={({ field }) => (
              <FormItem>
                <FormLabel>Slug *</FormLabel>
                <FormControl><Input placeholder="e.g. alfaytri-maintenance" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* 3 — Brand Color */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Brand Color</span>
              <div className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-md border border-border shrink-0"
                  style={{ backgroundColor: watchedColor }}
                />
                <FormField control={form.control} name="color" render={({ field }) => (
                  <FormItem className="flex-1 m-0">
                    <FormControl>
                      <Input
                        placeholder="#2563eb"
                        className="font-mono uppercase"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    onClick={() => form.setValue('color', hex, { shouldValidate: true })}
                    className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{
                      backgroundColor: hex,
                      borderColor: watchedColor === hex ? 'white' : 'transparent',
                      boxShadow: watchedColor === hex ? `0 0 0 2px ${hex}` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* 4 — Division Name (AR) */}
            <FormField control={form.control} name="name_ar" render={({ field }) => (
              <FormItem>
                <FormLabel>Division Name (AR)</FormLabel>
                <FormControl>
                  <Input dir="rtl" placeholder="e.g. صيانة الفايتري" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* 5 — Address EN + AR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="address_en" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (EN)</FormLabel>
                  <FormControl><Input placeholder="English address…" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (AR)</FormLabel>
                  <FormControl><Input dir="rtl" placeholder="العنوان بالعربية" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* 6 — Footer Motto */}
            <FormField control={form.control} name="footer_motto" render={({ field }) => (
              <FormItem>
                <FormLabel>Footer Motto <span className="text-muted-foreground text-xs">(Optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Quality Service Since 2010" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* 7 — Logo + Stamp upload */}
            <div className="grid grid-cols-2 gap-4">
              <UploadArea
                label="Logo"
                previewUrl={watchedLogo}
                uploading={uploadingLogo}
                onFileSelect={handleLogoUpload}
              />
              <UploadArea
                label="Stamp"
                previewUrl={watchedStamp}
                uploading={uploadingStamp}
                onFileSelect={handleStampUpload}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending || uploadingLogo || uploadingStamp}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || uploadingLogo || uploadingStamp}>
                {isPending ? 'Saving…' : isEditing ? 'Update Division' : 'Add Division'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors on this file (may still have errors in RoleFormDialog from Task 4 — that's OK).

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/master-data/DivisionFormDialog.tsx
git commit -m "feat(ui): overhaul DivisionFormDialog — color swatches, company dropdown, name_ar, file upload"
```

---

## Task 6: Companies Page — Division Card Grid

**Files:**
- Modify: `src/app/(dashboard)/master-data/admin/companies/page.tsx`

- [ ] **Step 1: Replace admin/companies/page.tsx with the card-grid design**

```tsx
'use client'

import { useState } from 'react'
import { Building2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CompanyFormDialog } from '@/components/master-data/CompanyFormDialog'
import { DivisionFormDialog } from '@/components/master-data/DivisionFormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useAllDivisions, useDeleteDivision, type Division } from '@/hooks/useDivisions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Division card ────────────────────────────────────────────────────────────

function DivisionCard({
  division,
  companyName,
  onEdit,
  onDelete,
}: {
  division: Division & { name_ar?: string | null }
  companyName: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="relative flex gap-3 rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden"
      style={{ borderLeftColor: division.color, borderLeftWidth: 4 }}
    >
      {/* Logo / icon area */}
      <div className="flex items-start justify-center pt-4 pl-3">
        {division.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={division.logo_url}
            alt={division.name}
            className="h-12 w-12 rounded-md object-contain bg-muted/30 border border-border"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted/40 border border-border shrink-0">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-3 pr-2">
        {/* Top row: name + badges + actions */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm truncate">{division.name}</span>
              {division.short_name && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">{division.short_name}</Badge>
              )}
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: division.is_active ? division.color : '#94a3b8' }}
                title={division.is_active ? 'Active' : 'Inactive'}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{companyName}</p>
            {division.address_en && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{division.address_en}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Stamp indicator */}
        <div className="mt-2">
          <Badge
            variant={division.stamp_url ? 'default' : 'outline'}
            className={`text-xs px-1.5 py-0 ${division.stamp_url ? 'bg-green-50 text-green-700 border-green-200' : ''}`}
          >
            {division.stamp_url ? 'Has stamp' : 'No stamp'}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies()
  const { data: divisions, isLoading: loadingDivisions } = useAllDivisions()
  const deleteDivision = useDeleteDivision()

  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null })
  const [divisionDialog, setDivisionDialog] = useState<{ open: boolean; division: Division | null; companyId: string }>({ open: false, division: null, companyId: '' })
  const [deleteTarget, setDeleteTarget] = useState<Division | null>(null)

  if (loadingCompanies || loadingDivisions) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Companies & Divisions"
        description="Manage company entities and their divisions"
        action={{ label: 'Add Company', onClick: () => setCompanyDialog({ open: true, company: null }) }}
      />

      {companies?.map((company) => {
        const companyDivisions = (divisions ?? []).filter((d) => d.company_id === company.id)
        return (
          <section key={company.id} className="space-y-3">
            {/* Company header */}
            <div className="flex items-center gap-3 pb-2 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">{company.name_en}</h2>
                  <StatusBadge variant={company.is_active ? 'active' : 'inactive'}>
                    {company.is_active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>
                {company.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{company.name_ar}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCompanyDialog({ open: true, company })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>

            {/* Division card grid */}
            {companyDivisions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {companyDivisions.map((div) => (
                  <DivisionCard
                    key={div.id}
                    division={div as Division & { name_ar?: string | null }}
                    companyName={company.name_en}
                    onEdit={() => setDivisionDialog({ open: true, division: div, companyId: company.id })}
                    onDelete={() => setDeleteTarget(div)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                No divisions yet.
              </p>
            )}

            {/* Add division button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDivisionDialog({ open: true, division: null, companyId: company.id })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Division
            </Button>
          </section>
        )
      })}

      <CompanyFormDialog
        open={companyDialog.open}
        onOpenChange={(open) => setCompanyDialog((s) => ({ ...s, open }))}
        company={companyDialog.company}
      />
      <DivisionFormDialog
        open={divisionDialog.open}
        onOpenChange={(open) => setDivisionDialog((s) => ({ ...s, open }))}
        division={divisionDialog.division}
        companyId={divisionDialog.companyId}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete division"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteDivision.isPending}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteDivision.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Division deleted'); setDeleteTarget(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors on this file.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/app/\(dashboard\)/master-data/admin/companies/page.tsx
git commit -m "feat(ui): redesign Companies page with division card grid"
```

---

## Task 7: RoleFormDialog Redesign

**Files:**
- Modify: `src/components/master-data/RoleFormDialog.tsx`

- [ ] **Step 1: Replace RoleFormDialog.tsx entirely**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useCreateRole, useUpdateRole, type CustomRole } from '@/hooks/useRoles'
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from '@/lib/permissions'

const roleSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).default([]),
})

type RoleFormValues = z.infer<typeof roleSchema>

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: CustomRole | null
}

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEditing = !!role
  const create = useCreateRole()
  const update = useUpdateRole()
  const isPending = create.isPending || update.isPending
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema) as never,
    defaultValues: { name: '', description: '', permissions: [] },
  })

  useEffect(() => {
    if (open && role) {
      form.reset({ name: role.name, description: role.description ?? '', permissions: (role.permissions as string[]) ?? [] })
      setExpandedModules(new Set())
    } else if (open) {
      form.reset()
      setExpandedModules(new Set())
    }
  }, [open, role, form])

  function toggleModule(module: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  const selectedPermissions = form.watch('permissions')
  const total = ALL_PERMISSIONS.length

  function selectAll() { form.setValue('permissions', [...ALL_PERMISSIONS]) }
  function clearAll()  { form.setValue('permissions', []) }

  function onSubmit(values: RoleFormValues) {
    const payload = { ...values, description: values.description || null }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: role!.id, ...payload })
      : () => create.mutateAsync(payload)
    mutation()
      .then(() => { toast.success(`Role ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Create'} Role</DialogTitle>
          <p className="text-sm text-muted-foreground">Configure role name, description, and permissions.</p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 gap-4">

            {/* Name + Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Senior Dispatcher" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea rows={1} placeholder="Brief description…" className="resize-none" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Permissions header */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                PERMISSIONS ({selectedPermissions.length} / {total})
              </span>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">Select All</button>
                <button type="button" onClick={clearAll}  className="text-xs text-primary hover:underline">Clear All</button>
              </div>
            </div>

            {/* Accordion permission list */}
            <div className="flex-1 overflow-y-auto border rounded-md divide-y divide-border">
              {PERMISSION_GROUPS.map((group) => {
                const groupKeys = group.permissions.map((p) => p.key)
                const selectedInGroup = groupKeys.filter((k) => selectedPermissions.includes(k))
                const allSelected = selectedInGroup.length === groupKeys.length
                const someSelected = selectedInGroup.length > 0 && !allSelected
                const isExpanded = expandedModules.has(group.module)
                const Icon = group.icon

                function toggleGroupAll() {
                  const current = form.getValues('permissions')
                  if (allSelected) {
                    form.setValue('permissions', current.filter((k) => !groupKeys.includes(k)))
                  } else {
                    form.setValue('permissions', Array.from(new Set([...current, ...groupKeys])))
                  }
                }

                return (
                  <div key={group.module}>
                    {/* Module row */}
                    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 cursor-pointer select-none">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleGroupAll}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => toggleModule(group.module)}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium flex-1">{group.module}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {selectedInGroup.length}/{groupKeys.length}
                        </span>
                      </button>
                    </div>

                    {/* Permission rows */}
                    {isExpanded && (
                      <div className="bg-muted/20 divide-y divide-border/50">
                        {group.permissions.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-start gap-3 px-8 py-2 cursor-pointer hover:bg-muted/40"
                          >
                            <Checkbox
                              className="mt-0.5 shrink-0"
                              checked={selectedPermissions.includes(perm.key)}
                              onCheckedChange={(checked) => {
                                const current = form.getValues('permissions')
                                form.setValue(
                                  'permissions',
                                  checked ? [...current, perm.key] : current.filter((k) => k !== perm.key)
                                )
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium block">{perm.label}</span>
                              <span className="text-xs text-muted-foreground">{perm.description}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending || !form.formState.isValid}>
                {isPending ? 'Saving…' : isEditing ? 'Update Role' : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/master-data/RoleFormDialog.tsx
git commit -m "feat(ui): redesign RoleFormDialog with accordion permissions + indeterminate checkboxes"
```

---

## Task 8: Users & Roles Page Redesign

**Files:**
- Modify: `src/app/(dashboard)/master-data/users/page.tsx`

- [ ] **Step 1: Replace users/page.tsx entirely**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, Lock, MoreHorizontal, Shield, UserPlus, AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { RoleFormDialog } from '@/components/master-data/RoleFormDialog'
import { AddUserDialog } from '@/components/master-data/AddUserDialog'
import { EditUserDialog } from '@/components/master-data/EditUserDialog'
import { ResetPasswordDialog } from '@/components/master-data/ResetPasswordDialog'
import { useRoles, useDeleteRole, type CustomRole } from '@/hooks/useRoles'
import {
  useProfiles, useCurrentUserProfile, useCreateMyProfile, type Profile,
} from '@/hooks/useProfiles'
import { PERMISSION_GROUPS, ALL_PERMISSIONS, roleColor } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Role color map (Tailwind classes) ───────────────────────────────────────

const ROLE_COLOR_CLASSES: Record<string, string> = {
  blue:   'bg-blue-50   text-blue-700   border-blue-200',
  green:  'bg-green-50  text-green-700  border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  teal:   'bg-teal-50   text-teal-700   border-teal-200',
  rose:   'bg-rose-50   text-rose-700   border-rose-200',
  amber:  'bg-amber-50  text-amber-700  border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({ role, onEdit, onDelete }: { role: CustomRole; onEdit: () => void; onDelete: () => void }) {
  const permissions = (role.permissions as string[]) ?? []
  const color = role.is_system ? 'blue' : roleColor(role.name)
  const colorClass = ROLE_COLOR_CLASSES[color] ?? ROLE_COLOR_CLASSES.blue

  const coverageChips = useMemo(() =>
    PERMISSION_GROUPS
      .map((g) => {
        const assigned = g.permissions.filter((p) => permissions.includes(p.key)).length
        if (assigned === 0) return null
        return { module: g.module, assigned, total: g.permissions.length }
      })
      .filter(Boolean) as Array<{ module: string; assigned: number; total: number }>,
    [permissions]
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
            {role.name}
          </span>
          {role.is_system && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">System</Badge>
          )}
        </div>
        {!role.is_system && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Description */}
      {role.description && (
        <p className="text-sm text-muted-foreground leading-snug">{role.description}</p>
      )}

      {/* Coverage chips */}
      {coverageChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {coverageChips.map((chip) => (
            <span
              key={chip.module}
              className="inline-flex items-center rounded border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
            >
              {chip.module} {chip.assigned}/{chip.total}
            </span>
          ))}
        </div>
      )}

      {/* Total count */}
      <p className="text-xs text-muted-foreground mt-auto">
        {permissions.length} / {ALL_PERMISSIONS.length} permissions
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersRolesPage() {
  const [activeTab, setActiveTab] = useState('permissions')
  const [roleSearch, setRoleSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: CustomRole | null }>({ open: false, role: null })
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<CustomRole | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editDialog, setEditDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
  const [resetDialog, setResetDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
  const [myName, setMyName] = useState('')

  const { data: roles, isLoading: loadingRoles } = useRoles()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()
  const { data: myProfile, isLoading: loadingMyProfile } = useCurrentUserProfile()
  const createMyProfile = useCreateMyProfile()
  const deleteRole = useDeleteRole()

  function handleCreateMyProfile() {
    const name = myName.trim()
    if (!name) { toast.error('Please enter your full name'); return }
    createMyProfile.mutate(
      { full_name: name },
      {
        onSuccess: () => { toast.success('Profile created'); setMyName('') },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function toggleModule(module: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module); else next.add(module)
      return next
    })
  }

  // Role search filter
  const filteredRoles = useMemo(() =>
    (roles ?? []).filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [roles, roleSearch]
  )

  // Permissions search filter
  const permSearch = roleSearch // reuse search state when on permissions tab

  const roleColumns = useMemo<ColumnDef<CustomRole>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-medium">{row.getValue('name')}</span>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.getValue('description') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'permissions',
      header: 'Permissions',
      cell: ({ row }) => {
        const perms = row.getValue('permissions') as string[]
        return <Badge variant="outline">{perms?.length ?? 0} permissions</Badge>
      },
    },
    {
      accessorKey: 'is_system',
      header: 'Type',
      cell: ({ row }) => row.getValue('is_system') ? <Badge>System</Badge> : <Badge variant="outline">Custom</Badge>,
    },
  ], [])

  const userColumns = useMemo<ColumnDef<Profile>[]>(() => [
    {
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.getValue('email') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'user_type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('user_type') as string}</Badge>,
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => {
        const userRoles = (row.original as Profile & { user_custom_roles?: Array<{ custom_roles: { name: string } | null }> }).user_custom_roles
        if (!userRoles?.length) return <span className="text-muted-foreground">None</span>
        return (
          <div className="flex gap-1 flex-wrap">
            {userRoles.slice(0, 2).map((ur, i) => (
              <Badge key={i} variant="outline" className="text-xs">{ur.custom_roles?.name}</Badge>
            ))}
            {userRoles.length > 2 && <Badge variant="outline" className="text-xs">+{userRoles.length - 2}</Badge>}
          </div>
        )
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge variant={row.getValue('is_active') ? 'active' : 'inactive'}>
          {row.getValue('is_active') ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setEditDialog({ open: true, profile: row.original })}>
                <Shield className="h-4 w-4 mr-2" />Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResetDialog({ open: true, profile: row.original })}>
                <Shield className="h-4 w-4 mr-2" />Reset Password
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  const moduleCount = PERMISSION_GROUPS.length
  const permCount   = ALL_PERMISSIONS.length
  const rolesCount  = roles?.length ?? 0
  const usersCount  = (profiles as Profile[] | undefined)?.length ?? 0

  return (
    <div className="space-y-6">
      {/* Custom header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Users &amp; Roles</h1>
            <p className="text-sm text-muted-foreground">
              {usersCount} users · {rolesCount} roles · {permCount} permissions
            </p>
          </div>
        </div>
        <SearchInput value={roleSearch} onChange={setRoleSearch} placeholder="Search…" className="sm:w-64" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="permissions" className="gap-1.5">
            Permissions <Badge variant="secondary" className="text-xs px-1.5 py-0">{permCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            Roles <Badge variant="secondary" className="text-xs px-1.5 py-0">{rolesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            Users <Badge variant="secondary" className="text-xs px-1.5 py-0">{usersCount}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Permissions tab ── */}
        <TabsContent value="permissions">
          <div className="space-y-3 mt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {permCount} permissions across {moduleCount} modules. Permissions are assigned to roles, not directly to users.
              </p>
              <div className="flex gap-3 shrink-0">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setExpandedModules(new Set(PERMISSION_GROUPS.map((g) => g.module)))}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setExpandedModules(new Set())}
                >
                  Collapse All
                </button>
              </div>
            </div>

            <div className="border rounded-md divide-y divide-border">
              {PERMISSION_GROUPS.map((group) => {
                const isExpanded = expandedModules.has(group.module)
                const Icon = group.icon
                const filtered = group.permissions.filter((p) =>
                  !permSearch ||
                  p.label.toLowerCase().includes(permSearch.toLowerCase()) ||
                  p.key.toLowerCase().includes(permSearch.toLowerCase())
                )
                if (permSearch && filtered.length === 0) return null

                return (
                  <div key={group.module}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 text-left"
                      onClick={() => toggleModule(group.module)}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm flex-1">{group.module}</span>
                      <Badge variant="outline" className="text-xs tabular-nums">{group.permissions.length}</Badge>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-border/50 bg-muted/10">
                        {filtered.map((perm) => (
                          <div key={perm.key} className="flex items-start gap-3 px-6 py-2.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-primary block">{perm.label}</span>
                              <span className="text-xs text-muted-foreground">{perm.description}</span>
                            </div>
                            <code className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:block">
                              {perm.key}
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Roles tab ── */}
        <TabsContent value="roles">
          <div className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => setRoleDialog({ open: true, role: null })}>
                + New Role
              </Button>
            </div>

            {loadingRoles ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map((i) => <div key={i} className="h-36 rounded-lg border border-border bg-muted/30 animate-pulse" />)}
              </div>
            ) : filteredRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No roles found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRoles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={() => setRoleDialog({ open: true, role })}
                    onDelete={() => setDeleteRoleTarget(role)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Users tab ── */}
        <TabsContent value="users">
          <div className="space-y-4 mt-4">
            {!loadingMyProfile && !myProfile && (
              <div className="rounded-md border border-warning bg-warning/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">You don&apos;t have a profile yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create your profile so you appear in the user list and can be assigned roles.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:pl-7">
                  <Input placeholder="Your full name" value={myName} onChange={(e) => setMyName(e.target.value)} className="flex-1" />
                  <Button onClick={handleCreateMyProfile} disabled={createMyProfile.isPending}>
                    {createMyProfile.isPending ? 'Creating…' : 'Create My Profile'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users…" />
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />Add User
              </Button>
            </div>

            <DataTable
              columns={userColumns}
              data={(profiles as Profile[] | undefined) ?? []}
              isLoading={loadingProfiles}
              globalFilter={userSearch}
            />
          </div>
        </TabsContent>
      </Tabs>

      <RoleFormDialog
        open={roleDialog.open}
        onOpenChange={(open) => setRoleDialog((s) => ({ ...s, open }))}
        role={roleDialog.role}
      />
      <ConfirmDialog
        open={!!deleteRoleTarget}
        title="Delete role"
        description={`Delete "${deleteRoleTarget?.name}"? This cannot be undone. Users with this role will lose its permissions.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteRole?.isPending ?? false}
        onConfirm={() => {
          if (!deleteRoleTarget) return
          deleteRole?.mutate(deleteRoleTarget.id, {
            onSuccess: () => { toast.success('Role deleted'); setDeleteRoleTarget(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        onOpenChange={(open) => { if (!open) setDeleteRoleTarget(null) }}
      />
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditUserDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        profile={editDialog.profile as (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null}
      />
      <ResetPasswordDialog
        open={resetDialog.open}
        onOpenChange={(open) => setResetDialog((s) => ({ ...s, open }))}
        profile={resetDialog.profile}
      />
    </div>
  )
}
```

- [ ] **Step 2: Add useDeleteRole to useRoles hook (required by Step 1)**

Open `src/hooks/useRoles.ts`. Add at the bottom:

```ts
export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('custom_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
cd D:/MMS && npx vitest run
```

Expected: all tests PASS (including the permissions.test.ts from Task 4).

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/app/\(dashboard\)/master-data/users/page.tsx src/hooks/useRoles.ts
git commit -m "feat(ui): redesign Users & Roles page — permissions accordion, role cards, dynamic header"
```

---

## Task 9: Integration Test + PROGRESS Update

- [ ] **Step 1: Full build**

```bash
cd D:/MMS && npm run build
```

Expected: build completes with 0 errors. All routes listed in output:
- `/master-data/admin/companies`
- `/master-data/admin/warehouses`
- `/master-data/users`
- `/master-data/admin/brand-groups`
- `/master-data/admin/reason-lists`

- [ ] **Step 2: Run all tests**

```bash
cd D:/MMS && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Verify old routes are gone**

```bash
ls "D:/MMS/src/app/(dashboard)/master-data/companies" 2>&1
ls "D:/MMS/src/app/(dashboard)/master-data/warehouses" 2>&1
```

Expected: "No such file or directory" (or empty directories if Next.js left the folder).

- [ ] **Step 4: Update PROGRESS.md**

Add to `## ✅ Completed`:

```
- [2026-04-18] **Admin UI Restructure Task 1: DB Migrations** — divisions.name_ar column, division-assets Storage bucket, database.types.ts updated
- [2026-04-18] **Admin UI Restructure Task 2: Route Migration** — Companies & Warehouses moved to admin/*, nav-config.ts + AdminSidebar updated
- [2026-04-18] **Admin UI Restructure Task 3: useDivisions** — useAllDivisions + useDeleteDivision added
- [2026-04-18] **Admin UI Restructure Task 4: permissions.ts** — full rewrite with icons, labels, descriptions, roleColor util, tests
- [2026-04-18] **Admin UI Restructure Task 5: DivisionFormDialog** — color swatches, company dropdown, name_ar, logo/stamp file upload
- [2026-04-18] **Admin UI Restructure Task 6: Companies page** — division card grid with colored left border, delete confirm
- [2026-04-18] **Admin UI Restructure Task 7: RoleFormDialog** — accordion with indeterminate checkboxes, expand/collapse per module
- [2026-04-18] **Admin UI Restructure Task 8: Users & Roles page** — dynamic header, tab badges, permissions accordion, role cards grid
```

Update `## 🔄 In Progress` to remove the admin UI restructure item and reflect next task.

- [ ] **Step 5: Commit PROGRESS.md**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Admin UI restructure complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Part 1 — Route migration: Task 2
- [x] Part 2 — Division cards: Task 6
- [x] Part 3 — DivisionFormDialog: Task 5 (schema, upload, swatches, company dropdown, name_ar)
- [x] Part 4a — Page header: Task 8
- [x] Part 4b — Tab badges: Task 8
- [x] Part 4c — Permissions accordion: Task 8
- [x] Part 4d — Role cards: Task 8
- [x] Part 4e — Create/Edit Role dialog: Task 7
- [x] DB migrations: Task 1
- [x] useDeleteDivision: Task 3
- [x] useDeleteRole: Task 8 Step 2
- [x] roleColor utility: Task 4

**Type consistency:**
- `useAllDivisions` defined in Task 3, used in Task 6 ✓
- `useDeleteDivision` defined in Task 3, used in Task 6 ✓
- `useDeleteRole` defined in Task 8 Step 2, used in Task 8 Step 1 ✓
- `PERMISSION_GROUPS[n].permissions[m].key/label/description` used consistently in Task 7 and Task 8 ✓
- `roleColor` exported in Task 4, imported in Task 8 ✓
- `Division & { name_ar?: string | null }` cast used in Tasks 5 and 6 ✓
