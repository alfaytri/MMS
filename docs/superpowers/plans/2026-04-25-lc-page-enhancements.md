# Landed Cost Page Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three missing features to the Landed Costs page: per-line bill document uploads stored in a private bucket, an expandable receival items preview (with remaining FIFO qty) inside the receival selector, and a full attached-receivals breakdown (with item rows and remaining qty) plus an attached-POs section inside the LC detail dialog. The Apply to Inventory confirm dialog also gains a pre-flight validation table.

**Architecture:** Two new DB migrations (private `lc-bills` bucket with role-based RLS; `validate_lc_allocation` read-only RPC). Two shared hooks added to `src/hooks/useReceivals.ts` (`useReceivalsForLcSelector`, `useReceivalItemsWithFifo`). Three additions to `src/hooks/useLandedCosts.ts` (`bill_path` field, `useValidateLcAllocation`, `useBillSignedUrls`). The LC page itself replaces its local receival query with the shared hooks, adds `decimal.js`-accurate totals, `useRef`-based file inputs, and expands both the Create and Detail dialogs.

**Tech Stack:** Supabase Storage (private bucket, signed URLs), TanStack Query v5, shadcn/ui Dialog + Table + Badge, `decimal.js`, React `useRef`, Next.js `Link`, TypeScript

**Branch:** Work on `feature/purchase-module`. **Before starting any task, run `git merge develop`** to pull in the exchange-rate UI, `useApplyLandedCost`, and all the RPC migrations (000060–000066) that are already on `develop`.

**Known state after merge:**
- `useLandedCosts.ts` has `exchange_rate: number` on `LandedCostLine`, `applied_at` on `LandedCost`, `useApplyLandedCost`, `useCreateLandedCost` via RPC
- LC page has Apply to Inventory button, exchange-rate per-line inputs, `statusBadge` variable
- LC page still has a local `useReceivals()` with a hardcoded `.limit(100)` — **this gets replaced in Task 6**

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260425000200_lc_bills_bucket.sql` | Create | Private `lc-bills` bucket + role-based RLS helper + 4 policies |
| `supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql` | Create | Read-only pre-flight RPC returning per-item remaining qty |
| `src/hooks/useReceivals.ts` | Modify | Add `useReceivalsForLcSelector` + `useReceivalItemsWithFifo` |
| `src/hooks/useLandedCosts.ts` | Modify | Add `bill_path` to `LandedCostLine`, `useValidateLcAllocation`, `useBillSignedUrls` |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Modify | All UI enhancements — dialogs, bill upload, expand, breakdown |

---

### Task 0: Setup — merge develop

**Files:** none

- [ ] **Step 1: Merge develop**

```bash
cd D:/MMS
git merge develop
```

Expected: fast-forward or merge commit. Resolve conflicts if any (`settings.local.json` only — keep current branch version).

- [ ] **Step 2: Verify develop changes are present**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors. The `useApplyLandedCost` export and `exchange_rate` field are now available.

---

### Task 1: DB Migration — private `lc-bills` storage bucket

**Files:**
- Create: `supabase/migrations/20260425000200_lc_bills_bucket.sql`

The bucket must be **private** (no public URLs). All read access goes through Supabase signed URLs (1-hour tokens). Write access (INSERT, UPDATE, DELETE) is restricted to users who have the `purchase.landed_costs.manage` permission or are system admins. A `SECURITY DEFINER` helper function performs the role check without exposing the internals to RLS callers.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260425000200_lc_bills_bucket.sql
BEGIN;

-- Private bucket — no direct public URL access
INSERT INTO storage.buckets (id, name, public)
VALUES ('lc-bills', 'lc-bills', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: does the calling auth user hold LC management permission?
CREATE OR REPLACE FUNCTION storage_lc_bills_write_allowed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$$;

-- Read: any authenticated user (downloads require signed URL anyway)
CREATE POLICY "lc_bills_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lc-bills');

-- Write: LC managers and system admins only
CREATE POLICY "lc_bills_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

CREATE POLICY "lc_bills_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed())
  WITH CHECK (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

CREATE POLICY "lc_bills_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING  (bucket_id = 'lc-bills' AND storage_lc_bills_write_allowed());

COMMIT;
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected: migration applied. Verify in Supabase dashboard → Storage → `lc-bills` bucket exists and is marked private.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000200_lc_bills_bucket.sql
git commit -m "feat(db): add private lc-bills bucket with role-based RLS"
```

---

### Task 2: DB Migration — `validate_lc_allocation` pre-flight RPC

**Files:**
- Create: `supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql`

This is a **read-only** function. It runs the same eligibility query as `allocate_landed_cost` but makes no writes. The Detail dialog calls it when the user clicks "Apply to Inventory" so they see exactly which items are affected and how many units remain in FIFO layers before confirming.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql
BEGIN;

CREATE OR REPLACE FUNCTION validate_lc_allocation(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lc RECORD;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already applied on %', v_lc.applied_at;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost is voided and cannot be applied';
  END IF;

  -- Return per brand_variant summary identical to what allocate_landed_cost would process
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ri.brand_variant_id::TEXT                     AS brand_variant_id,
        MAX(ri.item_name)                              AS item_name,
        MAX(ri.sku)                                    AS sku,
        SUM(ri.qty_received)                           AS qty_received,
        COALESCE((
          SELECT SUM(fl.remaining_qty)
          FROM   fifo_cost_layers fl
          WHERE  fl.brand_variant_id = ri.brand_variant_id
            AND  fl.remaining_qty > 0
        ), 0)                                          AS qty_remaining_in_layers,
        CASE
          WHEN COALESCE((
            SELECT SUM(fl.remaining_qty)
            FROM   fifo_cost_layers fl
            WHERE  fl.brand_variant_id = ri.brand_variant_id
              AND  fl.remaining_qty > 0
          ), 0) = 0
          THEN 'All units already sold — LC cost not applicable to this item'
          ELSE NULL
        END                                            AS warning
      FROM receival_items ri
      JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
      WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
        AND ri.is_free = false
        AND ri.brand_variant_id IS NOT NULL
      GROUP BY ri.brand_variant_id
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_lc_allocation(UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected: `validate_lc_allocation` function visible in Supabase dashboard → Database → Functions.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql
git commit -m "feat(db): add validate_lc_allocation read-only pre-flight RPC"
```

---

### Task 3: Install `decimal.js`

**Files:** `package.json` (auto-updated)

The UI total calculation currently uses native JS `number` arithmetic (`amount * exchange_rate`). With floating-point amounts and exchange rates this drifts. `decimal.js` fixes that without touching the server-side NUMERIC calculation.

- [ ] **Step 1: Install package**

```bash
npm install decimal.js
```

- [ ] **Step 2: Verify TypeScript can find types**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors. (`decimal.js` ships its own `.d.ts`.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add decimal.js for LC total precision"
```

---

### Task 4: Shared hooks — `useReceivalsForLcSelector` + `useReceivalItemsWithFifo`

**Files:**
- Modify: `src/hooks/useReceivals.ts`

Two new exported hooks go at the **end** of the file. They replace the local `useReceivals()` + local `ReceivalSummary` type currently embedded in the LC page.

`useReceivalsForLcSelector` is search-enabled with no hardcoded limit. `useReceivalItemsWithFifo` is lazy (only fetches when `receivalId` is non-null) and merges receival items with their current FIFO remaining qty via two parallel queries — no new RPC needed.

Note: `fifo_cost_layers.receival_id` is stored as `TEXT` (see initial schema). The query uses `.eq('receival_id', receivalId)` which sends the UUID string and Postgres compares it as text — this matches how `allocate_landed_cost` reads the layers.

- [ ] **Step 1: Add `useReceivalsForLcSelector` at end of `src/hooks/useReceivals.ts`**

Open the file and append after the last export:

```typescript
// ─── LC Selector hooks ────────────────────────────────────────────────────────

export type ReceivalForLcSelector = {
  id: string
  receival_number: string
  po_id: string
  date: string
  status: string
  po_number: string | null
  supplier_name: string | null
}

export function useReceivalsForLcSelector({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: ['receivals-lc-selector', { search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select('id, receival_number, po_id, date, status, purchase_orders!receivals_po_id_fkey(po_number, supplier_name)')
        .order('date', { ascending: false })
      if (search) {
        q = q.or(`receival_number.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        receival_number: r.receival_number as string,
        po_id: r.po_id as string,
        date: r.date as string,
        status: r.status as string,
        po_number: r.purchase_orders?.po_number ?? null,
        supplier_name: r.purchase_orders?.supplier_name ?? null,
      })) as ReceivalForLcSelector[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type ReceivalItemWithFifo = {
  id: string
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
  brand_variant_id: string | null
  remaining_qty: number
}

export function useReceivalItemsWithFifo(receivalId: string | null) {
  return useQuery({
    queryKey: ['receival-items-fifo', receivalId],
    enabled: !!receivalId,
    queryFn: async () => {
      const supabase = createClient()
      const [{ data: items, error: iErr }, { data: layers, error: lErr }] = await Promise.all([
        (supabase as any)
          .from('receival_items')
          .select('id, item_name, sku, qty_received, unit_cost, brand_variant_id')
          .eq('receival_id', receivalId!)
          .eq('is_free', false),
        (supabase as any)
          .from('fifo_cost_layers')
          .select('brand_variant_id, remaining_qty')
          .eq('receival_id', receivalId!)
          .gt('remaining_qty', 0),
      ])
      if (iErr) throw iErr
      if (lErr) throw lErr
      // Sum remaining_qty across all layers for each brand_variant
      const remainingMap = new Map<string, number>()
      for (const l of layers ?? []) {
        remainingMap.set(l.brand_variant_id, (remainingMap.get(l.brand_variant_id) ?? 0) + l.remaining_qty)
      }
      return (items ?? []).map((item: any) => ({
        ...item,
        remaining_qty: remainingMap.get(item.brand_variant_id) ?? 0,
      })) as ReceivalItemWithFifo[]
    },
    staleTime: 2 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReceivals.ts
git commit -m "feat(hooks): add useReceivalsForLcSelector + useReceivalItemsWithFifo"
```

---

### Task 5: `useLandedCosts` — add `bill_path`, `useValidateLcAllocation`, `useBillSignedUrls`

**Files:**
- Modify: `src/hooks/useLandedCosts.ts`

Three changes:
1. `bill_path?: string | null` added to `LandedCostLine` — stored in the JSONB `lines` column, no DB migration needed.
2. `LcValidationItem` type + `useValidateLcAllocation(lcId, enabled)` query — calls the RPC from Task 2.
3. `useBillSignedUrls(paths)` query — fetches 1-hour signed URLs for all bill paths in a detail dialog. `staleTime: 50 * 60 * 1000` so tokens are refreshed before they expire.

- [ ] **Step 1: Update `LandedCostLine` type**

In `src/hooks/useLandedCosts.ts`, find the `LandedCostLine` type and replace:

```typescript
export type LandedCostLine = {
  description: string
  amount: number
  currency: string
  exchange_rate: number   // default 1; used for non-QAR lines
  bill_path?: string | null
}
```

- [ ] **Step 2: Add `LcValidationItem` type and `useValidateLcAllocation` at end of file**

Append after `useApplyLandedCost`:

```typescript
export type LcValidationItem = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  qty_remaining_in_layers: number
  warning: string | null
}

export function useValidateLcAllocation(lcId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['validate-lc-allocation', lcId],
    enabled: !!lcId && enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('validate_lc_allocation', { p_lc_id: lcId })
      if (error) throw error
      return (data ?? []) as LcValidationItem[]
    },
    staleTime: 0, // always fresh — called right before a destructive action
  })
}

export function useBillSignedUrls(paths: (string | null | undefined)[]) {
  const validPaths = (paths.filter(Boolean) as string[]).slice().sort()
  return useQuery({
    queryKey: ['bill-signed-urls', validPaths],
    enabled: validPaths.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const result: Record<string, string> = {}
      await Promise.all(
        validPaths.map(async (path) => {
          const { data } = await supabase.storage.from('lc-bills').createSignedUrl(path, 3600)
          if (data?.signedUrl) result[path] = data.signedUrl
        })
      )
      return result
    },
    staleTime: 50 * 60 * 1000, // tokens last 60 min; refresh at 50 min
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLandedCosts.ts
git commit -m "feat(hooks): bill_path on LandedCostLine + useValidateLcAllocation + useBillSignedUrls"
```

---

### Task 6: `CreateLcDialog` — bill upload, expandable items, decimal total, search

**Files:**
- Modify: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

This task replaces the local `ReceivalSummary` type and `useReceivals()` function with shared hooks, adds a search input to the receival selector, adds expandable item rows (showing remaining FIFO qty), wires per-line bill upload with proper storage hygiene, uses `decimal.js` for the total, and guards the submit button during upload.

**All changes happen within `CreateLcDialog` and the file-level imports/types. The `LcDetailDialog` is not touched here.**

- [ ] **Step 1: Update imports at top of file**

Replace the existing import block at the top of `src/app/(dashboard)/purchase/landed-costs/page.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'
import Decimal from 'decimal.js'
import Link from 'next/link'
import { toast } from 'sonner'
import { Eye, Plus, Trash2, Paperclip, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost, useApplyLandedCost,
  useValidateLcAllocation, useBillSignedUrls,
  type LandedCost, type LandedCostLine,
} from '@/hooks/useLandedCosts'
import {
  useReceivalsForLcSelector, useReceivalItemsWithFifo,
} from '@/hooks/useReceivals'
import type { ColumnDef } from '@tanstack/react-table'
```

- [ ] **Step 2: Delete the local type and hook**

Remove the entire block between `// ─── Local receival hook ───` and the first blank line after `}` — specifically:

```typescript
// ─── Local receival hook ───────────────────────────────────────────────────────

type ReceivalSummary = {
  id: string
  receival_number: string
  po_id: string
  date: string
  status: string
  purchase_orders: { po_number: string; supplier_name: string } | null
}

function useReceivals() {
  return useQuery({
    queryKey: ['receivals_list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('id, receival_number, po_id, date, status, purchase_orders(po_number, supplier_name)')
        .order('date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ReceivalSummary[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

Also remove the now-unused `import { useQuery } from '@tanstack/react-query'` if it's in the imports (it was previously needed for the local hook; the shared hooks import it internally).

- [ ] **Step 3: Replace `CreateLcDialog` state block**

Find inside `function CreateLcDialog`:

```typescript
  const createLc = useCreateLandedCost()
  const { data: receivals } = useReceivals()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])
```

Replace with:

```typescript
  const createLc = useCreateLandedCost()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])
  const [receivalSearch, setReceivalSearch] = useState('')
  const [expandedReceivalId, setExpandedReceivalId] = useState<string | null>(null)
  const [uploadingLines, setUploadingLines] = useState<Set<number>>(new Set())
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const { data: receivals } = useReceivalsForLcSelector({ search: receivalSearch })
  const { data: expandedItems, isLoading: loadingExpanded } = useReceivalItemsWithFifo(expandedReceivalId)
```

- [ ] **Step 4: Replace the `total` calculation and add `handleBillUpload`**

Find:

```typescript
  const total = lines.reduce((s, l) => s + Number(l.amount) * Number(l.exchange_rate || 1), 0)
```

Replace with:

```typescript
  const total = lines
    .reduce(
      (s, l) => s.plus(new Decimal(l.amount || 0).times(l.exchange_rate || 1)),
      new Decimal(0),
    )
    .toNumber()
```

Then, after `toggleReceival`, add `handleBillUpload`:

```typescript
  async function handleBillUpload(lineIndex: number, file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large — maximum 5 MB')
      return
    }
    setUploadingLines((prev) => new Set(prev).add(lineIndex))
    try {
      const supabase = createClient()
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${year}/${month}/${Date.now()}-${sanitized}`
      // Delete old file before uploading replacement
      const oldPath = lines[lineIndex]?.bill_path
      if (oldPath) {
        await supabase.storage.from('lc-bills').remove([oldPath])
      }
      const { error } = await supabase.storage.from('lc-bills').upload(path, file)
      if (error) throw error
      setLines((l) =>
        l.map((line, idx) => (idx === lineIndex ? { ...line, bill_path: path } : line)),
      )
    } catch (err: unknown) {
      toast.error(`Upload failed: ${(err as Error).message}`)
    } finally {
      setUploadingLines((prev) => {
        const s = new Set(prev)
        s.delete(lineIndex)
        return s
      })
    }
  }
```

- [ ] **Step 5: Replace the submit guard inside `handleSubmit`**

Find:

```typescript
    createLc.mutate(
```

Insert before it (guard already has `if (!date)` and `if (lines.some)` — add the upload check after those):

```typescript
    if (uploadingLines.size > 0) { toast.error('Wait for all bill uploads to finish'); return }
    createLc.mutate(
```

Also find the reset inside `onSuccess`:

```typescript
          setLines([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
          setSelectedReceivalIds([])
```

Replace with:

```typescript
          setLines([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
          setSelectedReceivalIds([])
          setReceivalSearch('')
          setExpandedReceivalId(null)
          setUploadingLines(new Set())
```

- [ ] **Step 6: Replace the cost line rows JSX to add Paperclip button**

Find the `{lines.map((line, i) => (` block inside `CreateLcDialog` and replace the **entire** map with:

```tsx
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <Input
                    placeholder="Description (e.g. Air freight)"
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number" min={0} step="0.01"
                    placeholder="Amount"
                    value={line.amount}
                    onChange={(e) => updateLine(i, 'amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={line.currency}
                    onChange={(e) => updateLine(i, 'currency', e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {line.currency !== 'QAR' ? (
                  <div className="col-span-1">
                    <Input
                      type="number" min={0} step="0.0001"
                      placeholder="Rate"
                      title="Exchange rate to QAR"
                      value={line.exchange_rate || ''}
                      onChange={(e) => updateLine(i, 'exchange_rate', parseFloat(e.target.value) || 1)}
                    />
                  </div>
                ) : (
                  <div className="col-span-1" />
                )}
                <div className="col-span-2 flex items-center gap-1 pt-0.5">
                  {/* Hidden file input — accessed via ref */}
                  <input
                    ref={(el) => { fileInputRefs.current[i] = el }}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => handleBillUpload(i, e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    title={line.bill_path ? 'Bill attached — click to replace' : 'Attach bill document (PDF or image, max 5 MB)'}
                    disabled={uploadingLines.has(i)}
                    onClick={() => fileInputRefs.current[i]?.click()}
                    className={cn(
                      'flex items-center justify-center h-8 w-8 rounded border text-sm transition-colors shrink-0',
                      line.bill_path
                        ? 'border-green-400 text-green-600 bg-green-50 hover:bg-green-100'
                        : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent',
                      uploadingLines.has(i) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {uploadingLines.has(i)
                      ? <span className="text-xs animate-pulse">…</span>
                      : <Paperclip className="h-3.5 w-3.5" />}
                  </button>
                  {line.currency !== 'QAR' && (line.exchange_rate ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      ={new Decimal(line.amount || 0).times(line.exchange_rate || 1).toFixed(2)} QAR
                    </span>
                  )}
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
```

- [ ] **Step 7: Update the submit button to disable during upload**

Find the submit `<Button type="submit"`:

```tsx
            <Button type="submit" disabled={createLc.isPending}>
              {createLc.isPending ? 'Creating…' : 'Create Landed Cost'}
            </Button>
```

Replace with:

```tsx
            <Button type="submit" disabled={createLc.isPending || uploadingLines.size > 0}>
              {createLc.isPending ? 'Creating…' : uploadingLines.size > 0 ? 'Uploading…' : 'Create Landed Cost'}
            </Button>
```

- [ ] **Step 8: Replace the receival selector JSX**

Find the entire `{/* Receival Selector */}` section in `CreateLcDialog` and replace:

```tsx
          {/* Receival Selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Attach Receivals</p>
            <Input
              placeholder="Search by receival number…"
              value={receivalSearch}
              onChange={(e) => setReceivalSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {(receivals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {receivalSearch ? 'No receivals match your search' : 'No receivals found'}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {(receivals ?? []).map((r) => {
                  const isExpanded = expandedReceivalId === r.id
                  const isChecked = selectedReceivalIds.includes(r.id)
                  return (
                    <div key={r.id}>
                      {/* Row header */}
                      <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleReceival(r.id)}
                          className="h-4 w-4 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedReceivalId(isExpanded ? null : r.id)}
                          className="flex items-center gap-1.5 flex-1 text-left text-sm min-w-0"
                        >
                          <span className="text-muted-foreground w-4 shrink-0">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          <span className="font-mono shrink-0">{r.receival_number}</span>
                          <span className="text-muted-foreground truncate">
                            — {r.supplier_name ?? 'Unknown'} · {formatDate(r.date)}
                          </span>
                        </button>
                      </div>

                      {/* Expanded items */}
                      {isExpanded && (
                        <div className="bg-muted/30 px-4 pb-2">
                          {loadingExpanded ? (
                            <div className="space-y-1 pt-2">
                              {[1, 2].map((n) => <div key={n} className="h-5 rounded bg-muted animate-pulse" />)}
                            </div>
                          ) : (expandedItems ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground pt-2">No billable items</p>
                          ) : (
                            <table className="w-full text-xs mt-2">
                              <thead>
                                <tr className="text-muted-foreground border-b">
                                  <th className="text-left py-1 font-medium">Item</th>
                                  <th className="text-right py-1 font-medium">Received</th>
                                  <th className="text-right py-1 font-medium">Remaining</th>
                                  <th className="text-right py-1 font-medium">Unit Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(expandedItems ?? []).map((item) => (
                                  <tr key={item.id} className="border-b last:border-0">
                                    <td className="py-1 pr-2">{item.item_name}</td>
                                    <td className="text-right py-1">{item.qty_received}</td>
                                    <td className={cn('text-right py-1 font-medium', item.remaining_qty === 0 && 'text-amber-600')}>
                                      {item.remaining_qty}
                                    </td>
                                    <td className="text-right py-1">{formatCurrency(item.unit_cost, 'QAR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors. If `cn` is missing from `@/lib/utils`, add the import. `cn` is the standard shadcn classname helper.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/purchase/landed-costs/page.tsx"
git commit -m "feat(lc): CreateLcDialog — bill upload, expandable items, decimal total, receival search"
```

---

### Task 7: `LcDetailDialog` — bill links, all_items_sold badge, receivals breakdown, POs, apply pre-flight

**Files:**
- Modify: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

All changes are inside `LcDetailDialog` and two new local helper functions (`useAttachedReceivals`, `useAttachedPOs`) placed directly above the component.

The Apply confirm dialog gains a validation table (from `useValidateLcAllocation`). The detail dialog gains:
- `all_items_sold` badge next to status badge in the title
- "Bill" column in the Cost Lines table (signed URL via `useBillSignedUrls`)
- "Attached Receivals" expandable section with item rows (remaining qty) and clickable receival links
- "Attached POs" section listing PO numbers + supplier names

- [ ] **Step 1: Add local hooks `useAttachedReceivals` + `useAttachedPOs` above `LcDetailDialog`**

Find the line `// ─── LC Detail Dialog ─────` and insert before it:

```typescript
// ─── Local hooks for detail dialog ───────────────────────────────────────────

function useAttachedReceivals(receivalIds: string[]) {
  return useQuery({
    queryKey: ['lc-attached-receivals', receivalIds.slice().sort().join(',')],
    enabled: receivalIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('id, receival_number, date, purchase_orders!receivals_po_id_fkey(supplier_name)')
        .in('id', receivalIds)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        receival_number: r.receival_number as string,
        date: r.date as string,
        supplier_name: (r.purchase_orders?.supplier_name ?? 'Unknown') as string,
      }))
    },
    staleTime: 2 * 60 * 1000,
  })
}

function useAttachedPOs(poIds: string[]) {
  return useQuery({
    queryKey: ['lc-attached-pos', poIds.slice().sort().join(',')],
    enabled: poIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('id, po_number, supplier_name')
        .in('id', poIds)
      if (error) throw error
      return (data ?? []) as Array<{ id: string; po_number: string; supplier_name: string }>
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

These two local hooks need `useQuery`. Since the `useQuery` import was removed from the file-level imports in Task 6 Step 2 (when `import { useQuery }` was deleted along with the local hook), you must add it back. Update the top-of-file import:

```typescript
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
```

- [ ] **Step 2: Add hook calls inside `LcDetailDialog`**

Inside `function LcDetailDialog`, after the existing `const [voidReason, setVoidReason] = useState('')` line, add:

```typescript
  const billPaths = (lc?.lines ?? []).map((l) => l.bill_path)
  const { data: signedUrls } = useBillSignedUrls(billPaths)

  const { data: attachedReceivals, isLoading: loadingReceivals } = useAttachedReceivals(
    lc?.attached_receival_ids ?? [],
  )
  const { data: attachedPOs } = useAttachedPOs(lc?.attached_po_ids ?? [])

  const [detailExpandedReceivalId, setDetailExpandedReceivalId] = useState<string | null>(null)
  const { data: detailExpandedItems, isLoading: loadingDetailItems } = useReceivalItemsWithFifo(
    detailExpandedReceivalId,
  )

  const { data: validationItems, isLoading: validating } = useValidateLcAllocation(
    lc?.id,
    applyOpen,
  )
```

- [ ] **Step 3: Add `all_items_sold` badge to `DialogTitle`**

Find:

```tsx
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              {statusBadge}
            </DialogTitle>
```

Replace with:

```tsx
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              {statusBadge}
              {lc.all_items_sold && (
                <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-xs">
                  All Items Sold
                </Badge>
              )}
            </DialogTitle>
```

- [ ] **Step 4: Replace the Cost Lines table to add a "Bill" column**

Find the Cost Lines `<Table>` block (inside `<div className="rounded-md border overflow-x-auto">`) and replace with:

```tsx
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="w-12 text-center">Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lc.lines ?? []).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(line.amount, line.currency)}
                          {line.currency !== 'QAR' && line.exchange_rate && line.exchange_rate !== 1 && (
                            <span className="block text-xs text-muted-foreground">
                              ×{line.exchange_rate} = {formatCurrency(line.amount * line.exchange_rate, 'QAR')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{line.currency}</TableCell>
                        <TableCell className="text-center">
                          {line.bill_path && signedUrls?.[line.bill_path] ? (
                            <a
                              href={signedUrls[line.bill_path]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800"
                              title="View bill document"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
```

- [ ] **Step 5: Add Attached Receivals breakdown section**

Inside `<div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">`, after the Cost Lines `</div>` closing tag and before Item Allocations, insert:

```tsx
            {/* Attached Receivals Breakdown */}
            {(lc.attached_receival_ids?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Attached Receivals</h3>
                {loadingReceivals ? (
                  <div className="space-y-1">
                    {lc.attached_receival_ids.map((id) => (
                      <div key={id} className="h-8 rounded-md bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border divide-y">
                    {(attachedReceivals ?? []).map((r) => {
                      const isExpanded = detailExpandedReceivalId === r.id
                      return (
                        <div key={r.id}>
                          <button
                            type="button"
                            onClick={() => setDetailExpandedReceivalId(isExpanded ? null : r.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                          >
                            <span className="text-muted-foreground w-4 shrink-0">
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                            <Link
                              href="/purchase/receivals"
                              target="_blank"
                              className="font-mono font-medium hover:underline text-blue-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.receival_number}
                            </Link>
                            <span className="text-muted-foreground">
                              — {r.supplier_name} · {formatDate(r.date)}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="bg-muted/20 px-6 pb-3">
                              {loadingDetailItems ? (
                                <div className="space-y-1 pt-2">
                                  {[1, 2].map((n) => <div key={n} className="h-5 rounded bg-muted animate-pulse" />)}
                                </div>
                              ) : (detailExpandedItems ?? []).length === 0 ? (
                                <p className="text-xs text-muted-foreground pt-2">No billable items</p>
                              ) : (
                                <table className="w-full text-xs mt-2">
                                  <thead>
                                    <tr className="text-muted-foreground border-b">
                                      <th className="text-left py-1 font-medium">Item</th>
                                      <th className="text-right py-1 font-medium">Received</th>
                                      <th className="text-right py-1 font-medium">Remaining</th>
                                      <th className="text-right py-1 font-medium">Unit Cost</th>
                                      <th className="text-right py-1 font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(detailExpandedItems ?? []).map((item) => (
                                      <tr key={item.id} className="border-b last:border-0">
                                        <td className="py-1 pr-2">{item.item_name}</td>
                                        <td className="text-right py-1">{item.qty_received}</td>
                                        <td className={cn('text-right py-1 font-medium', item.remaining_qty === 0 && 'text-amber-600')}>
                                          {item.remaining_qty}
                                        </td>
                                        <td className="text-right py-1">{formatCurrency(item.unit_cost, 'QAR')}</td>
                                        <td className="text-right py-1 font-medium">
                                          {formatCurrency(item.qty_received * item.unit_cost, 'QAR')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Attached POs */}
            {(lc.attached_po_ids?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Attached Purchase Orders</h3>
                <div className="rounded-md border divide-y">
                  {(attachedPOs ?? []).map((po) => (
                    <div key={po.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Link
                        href="/purchase/orders"
                        target="_blank"
                        className="font-mono font-medium hover:underline text-blue-600"
                      >
                        {po.po_number}
                      </Link>
                      <span className="text-muted-foreground">— {po.supplier_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
```

- [ ] **Step 6: Enhance the Apply confirm dialog with validation table**

Find the entire `{/* Apply confirm */}` dialog block and replace it with:

```tsx
      {/* Apply confirm — shows pre-flight validation before destructive action */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {lc && (
            <>
              <DialogHeader><DialogTitle>Apply Landed Cost to Inventory</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This will distribute{' '}
                  <strong>{formatCurrency(lc.total_amount, lc.currency)}</strong> across the FIFO
                  layers of all items in the attached receivals. This action cannot be undone.
                </p>
                {validating ? (
                  <Skeleton className="h-28 w-full" />
                ) : (validationItems ?? []).length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(validationItems ?? []).map((item, idx) => (
                          <TableRow key={idx} className={item.warning ? 'bg-amber-50' : ''}>
                            <TableCell className="text-sm">
                              {item.item_name}
                              {item.warning && (
                                <p className="text-xs text-amber-600 mt-0.5">{item.warning}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{item.qty_received}</TableCell>
                            <TableCell className={cn('text-right text-sm font-medium', item.qty_remaining_in_layers === 0 && 'text-amber-600')}>
                              {item.qty_remaining_in_layers}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button
                  disabled={applyLc.isPending || validating}
                  onClick={() =>
                    applyLc.mutate(lc.id, {
                      onSuccess: () => {
                        toast.success('Landed cost applied to inventory')
                        setApplyOpen(false)
                        onClose()
                      },
                      onError: (err) => toast.error(err.message),
                    })
                  }
                >
                  {applyLc.isPending ? 'Applying…' : 'Confirm Apply'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors. Common issues to fix if they appear:
- Missing `useQuery` import — add `import { useQuery } from '@tanstack/react-query'`  
- `lc` possibly null inside dialog hooks — the `lc?.id` null-safe calls handle this; if TS complains about `lc.lines`, guard with `lc?.lines ?? []`

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/purchase/landed-costs/page.tsx"
git commit -m "feat(lc): detail dialog — bill links, receivals breakdown, POs, all_items_sold badge, apply pre-flight"
```

---

### Task 8: Build verification + PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Next.js production build**

```bash
npx next build 2>&1 | tail -20
```

Expected: clean exit. The `/purchase/landed-costs` route must appear in the page list.

- [ ] **Step 3: Update PROGRESS.md**

In `## ✅ Completed`, add at the top:

```
- [2026-04-25] **LC Page Enhancements Tasks 0–8** — `supabase/migrations/20260425000200_lc_bills_bucket.sql`, `supabase/migrations/20260425000201_rpc_validate_lc_allocation.sql`, `src/hooks/useReceivals.ts`, `src/hooks/useLandedCosts.ts`, `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Private lc-bills bucket with role-based RLS, validate_lc_allocation pre-flight RPC, decimal.js totals, useRef-based bill upload with 5 MB guard + date-structured paths, expandable receival items (remaining FIFO qty) in Create dialog, all_items_sold badge + bill signed-URL links + attached receivals/PO breakdown + apply pre-flight table in Detail dialog
```

In `## 🔄 In Progress`: remove this plan's entry.

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — LC page enhancements complete"
```

---

## Acceptance Criteria

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx next build` → clean exit, `/purchase/landed-costs` route present
- [ ] `lc-bills` bucket is **private** in Supabase Storage (no public URL issued)
- [ ] Uploading a bill >5 MB shows toast error without uploading
- [ ] Uploading a second bill for the same line removes the first file from storage
- [ ] File stored under `YYYY/MM/timestamp-filename` path in `lc-bills`
- [ ] Paperclip button turns green after upload; clicking it triggers replacement
- [ ] Submit button is disabled and shows "Uploading…" while any upload is in progress
- [ ] Receival selector has a search input that filters results without a hardcoded limit
- [ ] Clicking the chevron on a receival row expands a table showing Received / Remaining / Unit Cost
- [ ] Remaining qty shown in amber when zero
- [ ] All Items Sold badge appears in Detail dialog title when `all_items_sold = true`
- [ ] Cost Lines table in Detail dialog has a Bill column with `ExternalLink` icon for lines with a `bill_path`
- [ ] Clicking the icon opens the bill via signed URL in a new tab
- [ ] Detail dialog shows an "Attached Receivals" section listing each receival with supplier + date
- [ ] Expanding a receival in detail dialog shows items with Received / Remaining / Unit Cost / Total columns
- [ ] Receival numbers in the breakdown are clickable links to `/purchase/receivals`
- [ ] Detail dialog shows "Attached Purchase Orders" section when `attached_po_ids` is non-empty
- [ ] Clicking "Apply to Inventory" shows validation table (items, received qty, remaining qty) before confirm button is enabled
- [ ] Warnings shown in amber for items with 0 remaining units

---

## Notes on items marked out-of-scope

Two issues from the original code review are deliberately **not** in this plan:

**Notification routing** — wiring LC-related notifications to configurable routes requires changes to the notification config table and the notification dispatch layer. This is a separate, self-contained feature.

**Ghost edit cleanup** — stale `receival_edit_requests` in `pending` state (for requests that were never approved and have since expired) need a background cleanup job. This is a separate operational concern.

Both can be addressed as independent follow-on tasks.
