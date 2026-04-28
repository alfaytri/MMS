# LC Inventory Apply — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Apply to Inventory" capability to Landed Costs — DB columns, atomic SQL RPC, TypeScript hook, and UI button — so landed costs actually propagate into FIFO layers and average cost.

**Architecture:** A single Postgres RPC (`allocate_landed_cost`) handles the entire apply transaction atomically: reads receival items attached to the LC, computes proportional cost shares, updates FIFO layers + triggers `recalc_average_cost`, inserts `cost_adjustment` stock movements, and stamps `applied_at`. The TypeScript hook calls the RPC via `rpc()`. The UI adds an "Apply to Inventory" button next to the existing Void button.

**Tech Stack:** Supabase Postgres (PLPGSQL RPC, SECURITY DEFINER), TanStack Query v5 `useMutation`, shadcn/ui Button + Badge, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260425000060_lc_columns.sql` | Create | Add `voided_at`, `voided_reason`, `applied_at` to `landed_costs`; add `'cost_adjustment'` to `inventory_stock_movements` CHECK |
| `supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql` | Create | Atomic `allocate_landed_cost(UUID)` RPC |
| `src/hooks/useLandedCosts.ts` | Modify | Add `applied_at` to `LandedCost` type, `qty_remaining_at_lc` + `lc_per_unit` + `allocated_lc_total` to `LandedCostItemAllocation`, add `useApplyLandedCost` mutation |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Modify | Add "Apply to Inventory" button + confirm dialog in `LcDetailDialog`; update status badge to show "Applied" |

---

### Task 1: DB Migration — LC columns + CHECK constraint fix

**Files:**
- Create: `supabase/migrations/20260425000060_lc_columns.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260425000060_lc_columns.sql

-- Add lifecycle columns to landed_costs
ALTER TABLE landed_costs
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT,
  ADD COLUMN IF NOT EXISTS applied_at    TIMESTAMPTZ;

-- Allow 'cost_adjustment' movement type
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment'
  ));
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```

Expected: no errors. Verify with:
```bash
npx supabase db diff
```
Expected: empty diff (all changes applied).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000060_lc_columns.sql
git commit -m "feat(db): add lc lifecycle columns and cost_adjustment movement type"
```

---

### Task 2: Allocate Landed Cost RPC

**Files:**
- Create: `supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql`

- [ ] **Step 1: Create the RPC migration**

```sql
-- supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql

CREATE OR REPLACE FUNCTION allocate_landed_cost(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lc            RECORD;
  v_grand_total   NUMERIC := 0;
  v_total_remaining INT := 0;
  v_allocations   JSONB := '[]'::JSONB;
  v_bv            RECORD;
  v_bv_lc_share   NUMERIC;
  v_bv_remaining  INT;
  v_per_unit_lc   NUMERIC;
BEGIN
  -- Lock the row to prevent concurrent apply
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  -- Sum total received value across all eligible receival items
  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  -- Iterate once per brand_variant
  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                        AS item_name,
      MAX(ri.sku)                              AS sku,
      SUM(ri.qty_received)                     AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)      AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0
      END                                      AS avg_unit_cost
    FROM receival_items ri
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    -- This brand_variant's proportional share of the total LC amount
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    -- How many units are still in FIFO inventory right now
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers
     WHERE brand_variant_id = v_bv.brand_variant_id
       AND remaining_qty > 0;

    -- Build allocation record (even if nothing remains — still record the cost event)
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',  v_bv.brand_variant_id,
      'item_name',         v_bv.item_name,
      'sku',               v_bv.sku,
      'qty_received',      v_bv.qty_received,
      'qty_remaining_at_lc', v_bv_remaining,
      'original_unit_cost', ROUND(v_bv.avg_unit_cost, 4),
      'lc_per_unit',       CASE WHEN v_bv_remaining > 0
                             THEN ROUND(v_bv_lc_share / v_bv_remaining, 4)
                             ELSE 0 END,
      'allocated_lc_total', ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',  CASE WHEN v_bv_remaining > 0
                              THEN ROUND(v_bv.avg_unit_cost + v_bv_lc_share / v_bv_remaining, 4)
                              ELSE ROUND(v_bv.avg_unit_cost, 4) END,
      -- Legacy alias expected by existing UI:
      'allocated_cost',    ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    -- Only touch FIFO layers if units remain
    IF v_bv_remaining > 0 THEN
      v_per_unit_lc := v_bv_lc_share / v_bv_remaining;

      -- Push LC cost into all remaining FIFO layers for this variant
      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0;

      -- Recompute average_cost on the brand_variant row
      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      -- Record the cost-adjustment movement
      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_bv_lc_share, 2) || ' QAR over '
           || v_bv_remaining || ' units');

      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;
  END LOOP;

  -- Stamp the landed_cost as applied
  UPDATE landed_costs
     SET item_allocations = v_allocations,
         applied_at       = now(),
         all_items_sold   = (v_total_remaining = 0),
         updated_at       = now()
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_landed_cost(UUID) TO authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `allocate_landed_cost` function created, no errors.

- [ ] **Step 3: Smoke-test the RPC (optional, in Supabase SQL editor)**

```sql
-- Should error "No eligible receival items" on a fresh LC with no receivals
SELECT allocate_landed_cost('<a-valid-lc-id-without-receivals>');
```

Expected: EXCEPTION with meaningful message.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql
git commit -m "feat(db): add allocate_landed_cost RPC for FIFO layer cost adjustment"
```

---

### Task 3: TypeScript types + useApplyLandedCost hook

**Files:**
- Modify: `src/hooks/useLandedCosts.ts`

- [ ] **Step 1: Update types and add hook**

Replace the entire file with:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LandedCostLine = {
  description: string
  amount: number
  currency: string
}

export type LandedCostItemAllocation = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  qty_remaining_at_lc: number
  original_unit_cost: number
  lc_per_unit: number
  allocated_lc_total: number
  // Legacy alias returned by RPC (allocated LC per received unit)
  allocated_cost: number
  updated_unit_cost: number
}

export type LandedCost = {
  id: string
  lc_number: string
  description: string | null
  total_amount: number
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
  all_items_sold: boolean
  date: string
  item_allocations: LandedCostItemAllocation[] | null
  voided_at: string | null
  voided_reason: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

export type CreateLandedCostPayload = {
  description?: string | null
  date: string
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLandedCosts({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: ['landed_costs', { search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('landed_costs')
        .select('*')
        .order('date', { ascending: false })
      if (search) {
        q = q.or(`lc_number.ilike.%${search}%,description.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LandedCost[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useLandedCost(id: string) {
  return useQuery({
    queryKey: ['landed_costs', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('landed_costs')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LandedCost
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateLandedCostPayload) => {
      const supabase = createClient()
      const total_amount = payload.lines.reduce((s, l) => s + l.amount, 0)
      const { data, error } = await (supabase as any)
        .from('landed_costs')
        .insert({ ...payload, total_amount, all_items_sold: false })
        .select()
        .single()
      if (error) throw error
      return data as LandedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useVoidLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('landed_costs')
        .update({ voided_at: new Date().toISOString(), voided_reason: reason })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useApplyLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('allocate_landed_cost', { p_lc_id: id })
      if (error) throw error
      return data as LandedCostItemAllocation[]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `useLandedCosts.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLandedCosts.ts
git commit -m "feat(hooks): add applied_at type + useApplyLandedCost mutation"
```

---

### Task 4: "Apply to Inventory" button in LcDetailDialog

**Files:**
- Modify: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

The goal: when an LC is `Active` (not voided, not applied), show both "Apply to Inventory" and "Void LC" buttons. When applied, show a green "Applied" badge. When voided, show the existing red "Voided" badge. After applying, the dialog re-renders with the populated `item_allocations` table and `applied_at` date.

- [ ] **Step 1: Update imports at top of file**

Find the existing import:
```typescript
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost,
  type LandedCost, type LandedCostLine,
} from '@/hooks/useLandedCosts'
```

Replace with:
```typescript
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost, useApplyLandedCost,
  type LandedCost, type LandedCostLine,
} from '@/hooks/useLandedCosts'
```

- [ ] **Step 2: Update `LcDetailDialog` component**

Replace the entire `LcDetailDialog` function (lines 62–208) with:

```typescript
function LcDetailDialog({
  lc,
  onClose,
}: {
  lc: LandedCost | null
  onClose: () => void
}) {
  const voidLc = useVoidLandedCost()
  const applyLc = useApplyLandedCost()
  const [voidOpen, setVoidOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  if (!lc) return null

  const isVoided = !!lc.voided_at
  const isApplied = !!lc.applied_at

  const statusBadge = isVoided
    ? <Badge variant="destructive">Voided</Badge>
    : isApplied
      ? <Badge className="bg-green-100 text-green-800 border-green-200">Applied</Badge>
      : <Badge variant="outline">Active</Badge>

  return (
    <>
      <Dialog open={!!lc} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              {statusBadge}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{formatDate(lc.date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Amount</p>
                <p className="font-semibold">{formatCurrency(lc.total_amount, lc.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-medium">{lc.description ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Receivals Attached</p>
                <p className="font-medium">{lc.attached_receival_ids?.length ?? 0}</p>
              </div>
              {isApplied && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Applied At</p>
                  <p className="font-medium text-green-700">{formatDate(lc.applied_at!)}</p>
                </div>
              )}
              {isVoided && (
                <>
                  <div>
                    <p className="text-muted-foreground text-xs">Voided At</p>
                    <p className="font-medium text-destructive">{formatDate(lc.voided_at!)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs">Void Reason</p>
                    <p className="font-medium">{lc.voided_reason}</p>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Cost Lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Cost Lines</h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lc.lines ?? []).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(line.amount, line.currency)}</TableCell>
                        <TableCell className="text-sm">{line.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Item Allocations */}
            {(lc.item_allocations ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Item Allocations</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Rcvd</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Remaining</TableHead>
                        <TableHead className="text-right">Original</TableHead>
                        <TableHead className="text-right">LC/Unit</TableHead>
                        <TableHead className="text-right">New Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lc.item_allocations ?? []).map((alloc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{alloc.item_name}</TableCell>
                          <TableCell className="text-sm font-mono">{alloc.sku ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{alloc.qty_received}</TableCell>
                          <TableCell className="text-right text-sm hidden sm:table-cell">
                            {alloc.qty_remaining_at_lc ?? '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.original_unit_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm text-blue-600">
                            +{formatCurrency(alloc.lc_per_unit ?? 0, lc.currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(alloc.updated_unit_cost, lc.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {!isVoided && !isApplied && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
              <Button
                size="sm"
                onClick={() => setApplyOpen(true)}
                disabled={lc.attached_receival_ids.length === 0}
              >
                Apply to Inventory
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply confirm */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Apply Landed Cost to Inventory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will distribute <strong>{formatCurrency(lc.total_amount, lc.currency)}</strong> across
              the FIFO layers of all items in the attached receivals. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              disabled={applyLc.isPending}
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
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Void Landed Cost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will void {lc.lc_number}. Please provide a reason.</p>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason || voidLc.isPending}
              onClick={() => voidLc.mutate(
                { id: lc.id, reason: voidReason },
                {
                  onSuccess: () => { toast.success('LC voided'); setVoidOpen(false); onClose() },
                  onError: (err) => toast.error(err.message),
                }
              )}
            >
              {voidLc.isPending ? 'Voiding…' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: Update status badge in the DataTable columns**

Find the status column cell in the `columns` array (around line 380):
```typescript
    cell: ({ row }) => (
      <Badge variant={row.original.voided_at ? 'destructive' : 'outline'}>
        {row.original.voided_at ? 'Voided' : 'Active'}
      </Badge>
    ),
```

Replace with:
```typescript
    cell: ({ row }) => {
      const lc = row.original
      if (lc.voided_at) return <Badge variant="destructive">Voided</Badge>
      if (lc.applied_at) return <Badge className="bg-green-100 text-green-800 border-green-200">Applied</Badge>
      return <Badge variant="outline">Active</Badge>
    },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify Next.js builds cleanly**

```bash
npx next build 2>&1 | tail -20
```

Expected: no TypeScript or import errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/purchase/landed-costs/page.tsx
git commit -m "feat(ui): add Apply to Inventory button + Applied status badge to LcDetailDialog"
```

---

### Task 5: PROGRESS.md update

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed` (top of the list):
```
- [2026-04-25] **LC Inventory Apply Task 4: Apply to Inventory UI** — `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Apply button + confirm dialog + Applied badge in LcDetailDialog
- [2026-04-25] **LC Inventory Apply Task 3: useApplyLandedCost hook** — `src/hooks/useLandedCosts.ts` — applied_at type, qty_remaining_at_lc, lc_per_unit fields, useApplyLandedCost mutation
- [2026-04-25] **LC Inventory Apply Task 2: allocate_landed_cost RPC** — `supabase/migrations/20260425000061_rpc_allocate_landed_cost.sql` — atomic FIFO layer update + stock movement insert
- [2026-04-25] **LC Inventory Apply Task 1: DB Migration** — `supabase/migrations/20260425000060_lc_columns.sql` — voided_at, voided_reason, applied_at columns + cost_adjustment CHECK
```

Update `## 🔄 In Progress`:
```
Ready to move to Landed Cost feature implementation.
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — LC inventory apply plan complete"
```

---

## Acceptance Criteria

- `npx tsc --noEmit` passes with zero errors
- `npx next build` completes without errors
- `landed_costs` table has `voided_at`, `voided_reason`, `applied_at` columns in Supabase
- `inventory_stock_movements.movement_type` CHECK accepts `'cost_adjustment'`
- `allocate_landed_cost(uuid)` RPC exists and is callable by `authenticated` role
- An Active LC with attached receivals shows an "Apply to Inventory" button
- Clicking it opens a confirm dialog describing the total amount and the irreversibility
- After confirming, the LC gains `applied_at`, `item_allocations` is populated, status badge turns green "Applied"
- An Applied LC no longer shows the Apply or Void buttons
- Status column in the DataTable shows "Applied" (green) / "Voided" (red) / "Active" (outline)
