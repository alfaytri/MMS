# PO Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Purchase Order Returns — inventory deducted on dispatch, supplier-confirmation step, cancel support for both PO and Sale returns, toggle on the Returns page.

**Architecture:** Extend the existing `returns` table (source_type + status enums), add two SECURITY DEFINER RPCs for inventory deduction/reversal, add a new `usePurchaseReturns` hook, wire a Returns tab into `PoDetailDialog`, and update the Returns page with a type toggle.

**Tech Stack:** Next.js App Router, React Query, Supabase, Tailwind, shadcn/ui

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260430170000_po_returns.sql` |
| Create | `src/hooks/usePurchaseReturns.ts` |
| Modify | `src/hooks/useSaleReturns.ts` — add `cancelled` to status type |
| Modify | `src/components/purchase/PoDetailDialog.tsx` — add Returns tab |
| Modify | `src/app/(dashboard)/sales/returns/page.tsx` — add toggle + PO returns + cancel |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260430170000_po_returns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260430170000_po_returns.sql

-- 1. Extend enums
ALTER TYPE return_source_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'dispatched';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'supplier_confirmed';
ALTER TYPE return_status      ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Extend movement_type CHECK (drop and recreate — same pattern as prior migrations)
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
    'cost_adjustment',
    'receival_edit',
    'free_receival',
    'sale_return',
    'sale_return_damaged',
    'purchase_return',
    'purchase_return_cancelled'
  ));

-- 3. Idempotency guard column
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- 4. RPC: deduct inventory when PO return is dispatched
CREATE OR REPLACE FUNCTION rpc_process_po_return_dispatch(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
BEGIN
  SELECT id, items, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level - v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: reverse inventory when a dispatched PO return is cancelled
CREATE OR REPLACE FUNCTION rpc_cancel_po_return_dispatch(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
BEGIN
  SELECT id, items, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level + v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return_cancelled',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: `Applying migration 20260430170000_po_returns.sql... Finished supabase db push.`

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --project-id wkmvjxxmzstsvahuiwsz > src/types/database.types.ts
```

Then open `src/types/database.types.ts`, scroll to the very end, and verify the last line is `} as const` with no CLI update notice appended. If the CLI banner got appended, delete the two notice lines after `} as const`.

Then append the helper types at the bottom of the file (they are stripped by the generator):

```ts
// ─── Shorthand helpers ─────────────────────────────────────────────────────
export type DBTable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type DBInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type DBUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -5
```

Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260430170000_po_returns.sql src/types/database.types.ts
git commit -m "feat(db): add PO returns — enums, dispatched_at column, dispatch/cancel RPCs"
```

---

## Task 2: `usePurchaseReturns` Hook

**Files:**
- Create: `src/hooks/usePurchaseReturns.ts`
- Modify: `src/hooks/useSaleReturns.ts`

- [ ] **Step 1: Create `src/hooks/usePurchaseReturns.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

export type POReturnStatus = 'pending' | 'dispatched' | 'supplier_confirmed' | 'closed' | 'cancelled'

export type POReturnItem = {
  item_name: string
  sku: string | null
  qty: number
  brand_variant_id: string | null
}

export type POReturn = {
  id: string
  return_number: string
  source_type: 'purchase_order'
  source_id: string
  date: string
  reason: string
  items: POReturnItem[]
  restock_warehouse_id: string | null
  notes: string | null
  status: POReturnStatus
  dispatched_at: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function usePurchaseReturnsByPO(poId: string | null) {
  return useQuery({
    queryKey: ['po-returns-by-po', poId],
    enabled: !!poId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as POReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['po-returns', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'purchase_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as POReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string
      date: string
      reason: string
      items: POReturnItem[]
      warehouse_id: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'purchase_order')
      const return_number = `PR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('returns')
        .insert({
          return_number,
          source_type: 'purchase_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          items: payload.items,
          restock_warehouse_id: payload.warehouse_id,
          notes: payload.notes,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data as POReturn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['po-returns'] })
      queryClient.invalidateQueries({ queryKey: ['po-returns-by-po'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      const totalQty = data.items.reduce((s, i) => s + i.qty, 0)
      logActivity({
        action:    'PO Return Created',
        module:    'purchase_orders',
        entity_id: data.source_id,
        details:   `${data.return_number} · ${totalQty} item(s) · ${data.reason}`,
        severity:  'info',
      })
    },
  })
}

export function useUpdatePOReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      sourceId,
    }: {
      id: string
      status: POReturnStatus
      sourceId: string
    }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await (supabase as any)
        .from('returns')
        .select('return_number, dispatched_at')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      if (status === 'dispatched') {
        const { error: rpcErr } = await (supabase as any)
          .rpc('rpc_process_po_return_dispatch', { p_return_id: id })
        if (rpcErr) throw rpcErr
      }

      if (status === 'cancelled' && ret.dispatched_at) {
        const { error: rpcErr } = await (supabase as any)
          .rpc('rpc_cancel_po_return_dispatch', { p_return_id: id })
        if (rpcErr) throw rpcErr
      }

      return { return_number: ret.return_number as string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-returns'] })
      queryClient.invalidateQueries({ queryKey: ['po-returns-by-po'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      if (variables.status === 'dispatched' || variables.status === 'cancelled') {
        queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      }
      const ACTION_MAP: Record<POReturnStatus, { action: string; severity: 'info' | 'warning' }> = {
        pending:            { action: 'PO Return Marked Pending',     severity: 'info' },
        dispatched:         { action: 'PO Return Dispatched',         severity: 'info' },
        supplier_confirmed: { action: 'PO Return Supplier Confirmed', severity: 'info' },
        closed:             { action: 'PO Return Closed',             severity: 'info' },
        cancelled:          { action: 'PO Return Cancelled',          severity: 'warning' },
      }
      const { action, severity } = ACTION_MAP[variables.status]
      logActivity({
        action,
        module:    'purchase_orders',
        entity_id: variables.sourceId,
        details:   ret.return_number,
        severity,
      })
    },
  })
}
```

- [ ] **Step 2: Update `SaleReturn` type to include `cancelled`**

In `src/hooks/useSaleReturns.ts`, change line:

```ts
  status: 'pending' | 'received' | 'restocked' | 'closed'
```

to:

```ts
  status: 'pending' | 'received' | 'restocked' | 'closed' | 'cancelled'
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -5
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePurchaseReturns.ts src/hooks/useSaleReturns.ts
git commit -m "feat(hooks): add usePurchaseReturns; extend SaleReturn status with cancelled"
```

---

## Task 3: PO Detail Dialog — Returns Tab

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Add imports at the top of `PoDetailDialog.tsx`**

After the existing imports, add:

```ts
import { usePurchaseReturnsByPO, useCreatePurchaseReturn, useUpdatePOReturnStatus, type POReturn, type POReturnItem } from '@/hooks/usePurchaseReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
```

- [ ] **Step 2: Add hook calls and state inside the component**

Find the block that begins with `const { data: activityLogs }` and add after it:

```tsx
  const { data: poReturns = [] } = usePurchaseReturnsByPO(open ? resolvedId : null)
  const { data: warehouses = [] } = useWarehouses()
  const createPOReturn = useCreatePurchaseReturn()
  const updatePOReturnStatus = useUpdatePOReturnStatus()

  const [returnCreateOpen, setReturnCreateOpen] = useState(false)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [returnReason, setReturnReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnWarehouseId, setReturnWarehouseId] = useState('')
  const [returnItems, setReturnItems] = useState<POReturnItem[]>([])
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null)
```

- [ ] **Step 3: Add a helper to initialise return items from line items**

Add this function inside the component, before the `return` statement:

```tsx
  function openCreateReturn() {
    const receivedLines = (fullPO?.po_line_items ?? []).filter((li) => li.received_qty > 0)
    setReturnItems(
      receivedLines.map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? null,
        qty: 0,
        brand_variant_id: li.brand_variant_id ?? null,
        _max: li.received_qty,
      } as POReturnItem & { _max: number }))
    )
    // Default warehouse = most recent receival's warehouse
    const latestReceival = (receivals ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    setReturnWarehouseId(latestReceival?.warehouse_id ?? '')
    setReturnDate(new Date().toISOString().split('T')[0])
    setReturnReason('')
    setReturnNotes('')
    setReturnCreateOpen(true)
  }

  function handleCreatePOReturn() {
    if (!returnReason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    createPOReturn.mutate(
      {
        source_id: resolvedId,
        date: returnDate,
        reason: returnReason,
        items: items.map(({ item_name, sku, qty, brand_variant_id }) => ({ item_name, sku, qty, brand_variant_id })),
        warehouse_id: returnWarehouseId || null,
        notes: returnNotes || null,
      },
      {
        onSuccess: () => { toast.success('Return created'); setReturnCreateOpen(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }
```

- [ ] **Step 4: Add the Returns tab trigger**

Find the `<TabsList>` block in `PoDetailDialog.tsx`. After the `<TabsTrigger value="activity">Activity</TabsTrigger>` line, add:

```tsx
                {!isViewingSnapshot && current && ['partially_received', 'received', 'completed'].includes(current.status) && (
                  <TabsTrigger value="returns">Returns {poReturns.length > 0 && `(${poReturns.length})`}</TabsTrigger>
                )}
```

- [ ] **Step 5: Add the Returns tab content**

Find the closing `</TabsContent>` of the activity tab (the one just before `</Tabs>`). After it, insert:

```tsx
              {/* ── Returns ──────────────────────────────────────── */}
              {!isViewingSnapshot && current && ['partially_received', 'received', 'completed'].includes(current.status) && (
                <TabsContent value="returns" className="flex-1 overflow-y-auto space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(fullPO?.po_line_items ?? []).every((li) => li.received_qty === 0)}
                      title={(fullPO?.po_line_items ?? []).every((li) => li.received_qty === 0) ? 'No items received yet' : undefined}
                      onClick={openCreateReturn}
                    >
                      + Create Return
                    </Button>
                  </div>

                  {poReturns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
                  ) : (
                    poReturns.map((ret) => {
                      const PO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
                        pending:            { label: 'Pending',            className: 'border-warning text-warning' },
                        dispatched:         { label: 'Dispatched',         className: 'border-blue-500 text-blue-500' },
                        supplier_confirmed: { label: 'Supplier Confirmed', className: 'border-success text-success' },
                        closed:             { label: 'Closed',             className: 'border-muted-foreground/50 text-muted-foreground' },
                        cancelled:          { label: 'Cancelled',          className: 'border-muted-foreground/30 text-muted-foreground/60' },
                      }
                      const cfg = PO_STATUS_CONFIG[ret.status] ?? PO_STATUS_CONFIG.pending
                      const PO_STATUS_NEXT: Partial<Record<string, string>> = {
                        pending:            'dispatched',
                        dispatched:         'supplier_confirmed',
                        supplier_confirmed: 'closed',
                      }
                      const PO_STATUS_LABEL: Record<string, string> = {
                        dispatched:         'Mark Dispatched',
                        supplier_confirmed: 'Confirm Supplier Receipt',
                        closed:             'Close Return',
                      }
                      const next = PO_STATUS_NEXT[ret.status]
                      const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
                      return (
                        <div key={ret.id} className="rounded-md border p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="font-mono font-semibold text-sm hover:underline"
                                onClick={() => setExpandedReturnId(expandedReturnId === ret.id ? null : ret.id)}
                              >
                                {ret.return_number}
                              </button>
                              <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {next && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={updatePOReturnStatus.isPending}
                                  onClick={() => updatePOReturnStatus.mutate(
                                    { id: ret.id, status: next as any, sourceId: resolvedId },
                                    { onSuccess: () => toast.success(`Return ${PO_STATUS_LABEL[next]?.toLowerCase() ?? next}`), onError: (e) => toast.error(e.message) }
                                  )}
                                >
                                  {PO_STATUS_LABEL[next]}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={updatePOReturnStatus.isPending}
                                  onClick={() => updatePOReturnStatus.mutate(
                                    { id: ret.id, status: 'cancelled', sourceId: resolvedId },
                                    { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                                  )}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ret.date} · {ret.items.length} item(s) · {ret.reason}
                          </div>
                          {expandedReturnId === ret.id && (
                            <div className="rounded-md border overflow-x-auto mt-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Item</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {ret.items.map((item, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="text-xs">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                                      <TableCell className="text-xs text-right">{item.qty}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  {/* Create Return Dialog */}
                  <Dialog open={returnCreateOpen} onOpenChange={(o) => { if (!o) setReturnCreateOpen(false) }}>
                    <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
                      <DialogHeader className="shrink-0">
                        <DialogTitle>Create PO Return</DialogTitle>
                      </DialogHeader>
                      <div className="flex-1 overflow-y-auto space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label htmlFor="por-date">Return Date *</Label>
                            <Input id="por-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="por-warehouse">Dispatch From Warehouse</Label>
                            <select
                              id="por-warehouse"
                              value={returnWarehouseId}
                              onChange={(e) => setReturnWarehouseId(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            >
                              <option value="">Select warehouse…</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="por-reason">Reason *</Label>
                          <Input id="por-reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Wrong item, damaged on arrival…" />
                        </div>
                        {returnItems.length > 0 && (
                          <div className="space-y-2">
                            <Label>Items to Return</Label>
                            {returnItems.map((item, idx) => {
                              const max = (item as any)._max as number
                              return (
                                <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{item.item_name}</div>
                                    {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                                    <div className="text-xs text-muted-foreground">Max returnable: {max}</div>
                                  </div>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={max}
                                    value={item.qty}
                                    onChange={(e) => {
                                      const updated = [...returnItems]
                                      updated[idx] = { ...updated[idx], qty: Math.min(max, Math.max(0, Number(e.target.value))) }
                                      setReturnItems(updated)
                                    }}
                                    className="w-20 text-right"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label htmlFor="por-notes">Notes</Label>
                          <Textarea id="por-notes" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} />
                        </div>
                      </div>
                      <DialogFooter className="shrink-0">
                        <Button variant="outline" onClick={() => setReturnCreateOpen(false)} disabled={createPOReturn.isPending}>Cancel</Button>
                        <Button onClick={handleCreatePOReturn} disabled={createPOReturn.isPending}>
                          {createPOReturn.isPending ? 'Creating…' : 'Create Return'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TabsContent>
              )}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "PoDetailDialog\|usePurchaseReturns" | head -10
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/components/purchase/PoDetailDialog.tsx
git commit -m "feat(purchase): add Returns tab to PO detail dialog"
```

---

## Task 4: Returns Page — Toggle + PO Returns + Cancel

**Files:**
- Modify: `src/app/(dashboard)/sales/returns/page.tsx`

- [ ] **Step 1: Replace the entire file with the updated version**

```tsx
'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useSaleReturns,
  useCreateSaleReturn,
  useUpdateReturnStatus,
  type SaleReturn,
} from '@/hooks/useSaleReturns'
import {
  usePurchaseReturns,
  useCreatePurchaseReturn,
  useUpdatePOReturnStatus,
  type POReturn,
  type POReturnItem,
  type POReturnStatus,
} from '@/hooks/usePurchaseReturns'
import { useSaleOrders } from '@/hooks/useSaleOrders'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// ─── Sale Return status config ────────────────────────────────────────────────
const SR_STATUS_CONFIG: Record<SaleReturn['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-warning text-warning' },
  received:  { label: 'Received',  className: 'border-blue-500 text-blue-500' },
  restocked: { label: 'Restocked', className: 'border-success text-success' },
  closed:    { label: 'Closed',    className: 'border-muted-foreground/50 text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'border-muted-foreground/30 text-muted-foreground/60' },
}

const SR_STATUS_NEXT: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
  pending:  'received',
  received: 'restocked',
  restocked: 'closed',
}

// ─── PO Return status config ──────────────────────────────────────────────────
const PR_STATUS_CONFIG: Record<POReturnStatus, { label: string; className: string }> = {
  pending:            { label: 'Pending',            className: 'border-warning text-warning' },
  dispatched:         { label: 'Dispatched',         className: 'border-blue-500 text-blue-500' },
  supplier_confirmed: { label: 'Supplier Confirmed', className: 'border-success text-success' },
  closed:             { label: 'Closed',             className: 'border-muted-foreground/50 text-muted-foreground' },
  cancelled:          { label: 'Cancelled',          className: 'border-muted-foreground/30 text-muted-foreground/60' },
}

const PR_STATUS_NEXT: Partial<Record<POReturnStatus, POReturnStatus>> = {
  pending:            'dispatched',
  dispatched:         'supplier_confirmed',
  supplier_confirmed: 'closed',
}

const PR_STATUS_LABEL: Record<string, string> = {
  dispatched:         'Mark Dispatched',
  supplier_confirmed: 'Confirm Supplier Receipt',
  closed:             'Close Return',
}

// ─── Inner component (uses useSearchParams — requires Suspense wrapper) ───────
function ReturnsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnType = (searchParams.get('type') ?? 'sale') as 'sale' | 'po'

  function setReturnType(t: 'sale' | 'po') {
    const params = new URLSearchParams(searchParams.toString())
    params.set('type', t)
    router.replace(`?${params.toString()}`)
  }

  // ── Sale return state ──
  const [srSearch, setSrSearch] = useState('')
  const [srStatusFilter, setSrStatusFilter] = useState<SaleReturn['status'] | ''>('')
  const [srCreateOpen, setSrCreateOpen] = useState(false)
  const [srDetailReturn, setSrDetailReturn] = useState<SaleReturn | null>(null)
  const [soId, setSoId] = useState('')
  const [srDate, setSrDate] = useState(new Date().toISOString().split('T')[0])
  const [srReason, setSrReason] = useState('')
  const [srNotes, setSrNotes] = useState('')
  const [srWarehouseId, setSrWarehouseId] = useState('')
  const [srItems, setSrItems] = useState<SaleReturn['items']>([])

  // ── PO return state ──
  const [prSearch, setPrSearch] = useState('')
  const [prStatusFilter, setPrStatusFilter] = useState<POReturnStatus | ''>('')
  const [prCreateOpen, setPrCreateOpen] = useState(false)
  const [prDetailReturn, setPrDetailReturn] = useState<POReturn | null>(null)
  const [poId, setPoId] = useState('')
  const [prDate, setPrDate] = useState(new Date().toISOString().split('T')[0])
  const [prReason, setPrReason] = useState('')
  const [prNotes, setPrNotes] = useState('')
  const [prWarehouseId, setPrWarehouseId] = useState('')
  const [prItems, setPrItems] = useState<(POReturnItem & { _max: number })[]>([])

  // ── Queries ──
  const { data: saleReturns, isLoading: srLoading } = useSaleReturns({ search: srSearch, status: srStatusFilter || undefined })
  const { data: poReturns,   isLoading: prLoading }  = usePurchaseReturns({ search: prSearch, status: prStatusFilter || undefined })
  const { data: saleOrders }   = useSaleOrders({ status: 'delivered' })
  const { data: purchaseOrders } = usePurchaseOrders({})  // all statuses — filter to those with receivals client-side
  const { data: warehouses = [] } = useWarehouses()

  // ── Mutations ──
  const createSaleReturn  = useCreateSaleReturn()
  const updateSaleStatus  = useUpdateReturnStatus()
  const createPOReturn    = useCreatePurchaseReturn()
  const updatePOStatus    = useUpdatePOReturnStatus()

  // ── Sale return handlers ──
  function handleSOSelect(id: string) {
    setSoId(id)
    const so = (saleOrders ?? []).find((o) => o.id === id)
    if (!so) return
    setSrItems(
      (so.sale_order_lines ?? [])
        .filter((l) => l.delivered_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku, qty: 0, condition: 'good' as const, brand_variant_id: l.brand_variant_id }))
    )
  }

  function handleCreateSaleReturn() {
    if (!soId)   { toast.error('Select a sale order'); return }
    if (!srReason) { toast.error('Reason is required'); return }
    const items = srItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    createSaleReturn.mutate(
      { source_id: soId, date: srDate, reason: srReason, items, restock_warehouse_id: srWarehouseId || null, notes: srNotes || null },
      {
        onSuccess: () => { toast.success('Return created'); setSrCreateOpen(false); setSoId(''); setSrReason(''); setSrNotes(''); setSrItems([]) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // ── PO return handlers ──
  function handlePOSelect(id: string) {
    setPoId(id)
    const po = (purchaseOrders ?? []).find((o) => o.id === id)
    if (!po) return
    setPrItems(
      (po.po_line_items ?? [])
        .filter((l) => l.received_qty > 0)
        .map((l) => ({ item_name: l.item_name, sku: l.sku ?? null, qty: 0, brand_variant_id: l.brand_variant_id ?? null, _max: l.received_qty }))
    )
  }

  function handleCreatePOReturn() {
    if (!poId)     { toast.error('Select a purchase order'); return }
    if (!prReason) { toast.error('Reason is required'); return }
    const items = prItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    createPOReturn.mutate(
      {
        source_id: poId,
        date: prDate,
        reason: prReason,
        items: items.map(({ item_name, sku, qty, brand_variant_id }) => ({ item_name, sku, qty, brand_variant_id })),
        warehouse_id: prWarehouseId || null,
        notes: prNotes || null,
      },
      {
        onSuccess: () => { toast.success('Return created'); setPrCreateOpen(false); setPoId(''); setPrReason(''); setPrNotes(''); setPrItems([]) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Returns"
        description="Manage returns and restocking"
        actions={
          <Button onClick={() => returnType === 'sale' ? setSrCreateOpen(true) : setPrCreateOpen(true)}>
            + Create Return
          </Button>
        }
      />

      {/* ── Type toggle + search ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Segmented toggle */}
        <div className="flex rounded-lg border p-1 gap-1 shrink-0">
          {(['sale', 'po'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setReturnType(t)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                returnType === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
            >
              {t === 'sale' ? 'Sale Returns' : 'PO Returns'}
            </button>
          ))}
        </div>

        {returnType === 'sale' ? (
          <>
            <SearchInput value={srSearch} onChange={setSrSearch} placeholder="Search return number…" />
            <div className="flex flex-wrap gap-2">
              {(['', 'pending', 'received', 'restocked', 'closed', 'cancelled'] as const).map((s) => (
                <button key={s} onClick={() => setSrStatusFilter(s)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    srStatusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  )}>
                  {s || 'All'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <SearchInput value={prSearch} onChange={setPrSearch} placeholder="Search return number…" />
            <div className="flex flex-wrap gap-2">
              {(['', 'pending', 'dispatched', 'supplier_confirmed', 'closed', 'cancelled'] as const).map((s) => (
                <button key={s} onClick={() => setPrStatusFilter(s)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    prStatusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  )}>
                  {s === 'supplier_confirmed' ? 'Supplier Confirmed' : s || 'All'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Sale returns list ── */}
      {returnType === 'sale' && (
        srLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (saleReturns ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No sale returns found</div>
        ) : (
          <div className="space-y-3">
            {(saleReturns ?? []).map((ret) => {
              const cfg  = SR_STATUS_CONFIG[ret.status] ?? SR_STATUS_CONFIG.pending
              const next = SR_STATUS_NEXT[ret.status]
              const canCancel = ret.status === 'pending' || ret.status === 'received'
              return (
                <div key={ret.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="font-mono font-semibold text-sm hover:underline" onClick={() => setSrDetailReturn(ret)}>
                        {ret.return_number}
                      </button>
                      <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && (
                        <Button size="sm" variant="outline" disabled={updateSaleStatus.isPending}
                          onClick={() => updateSaleStatus.mutate({ id: ret.id, status: next },
                            { onSuccess: () => toast.success(`Marked as ${SR_STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          Mark as {SR_STATUS_CONFIG[next].label}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={updateSaleStatus.isPending}
                          onClick={() => updateSaleStatus.mutate({ id: ret.id, status: 'cancelled' },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}</div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── PO returns list ── */}
      {returnType === 'po' && (
        prLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (poReturns ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No PO returns found</div>
        ) : (
          <div className="space-y-3">
            {(poReturns ?? []).map((ret) => {
              const cfg  = PR_STATUS_CONFIG[ret.status] ?? PR_STATUS_CONFIG.pending
              const next = PR_STATUS_NEXT[ret.status]
              const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
              return (
                <div key={ret.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="font-mono font-semibold text-sm hover:underline" onClick={() => setPrDetailReturn(ret)}>
                        {ret.return_number}
                      </button>
                      <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {next && (
                        <Button size="sm" variant="outline" disabled={updatePOStatus.isPending}
                          onClick={() => updatePOStatus.mutate({ id: ret.id, status: next, sourceId: ret.source_id },
                            { onSuccess: () => toast.success(`Marked as ${PR_STATUS_CONFIG[next].label}`), onError: (e) => toast.error(e.message) }
                          )}>
                          {PR_STATUS_LABEL[next]}
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={updatePOStatus.isPending}
                          onClick={() => updatePOStatus.mutate({ id: ret.id, status: 'cancelled', sourceId: ret.source_id },
                            { onSuccess: () => toast.success('Return cancelled'), onError: (e) => toast.error(e.message) }
                          )}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(ret.date)} · {ret.items.length} item(s) · {ret.reason}</div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Sale Return Detail Dialog ── */}
      <Dialog open={!!srDetailReturn} onOpenChange={(o) => { if (!o) setSrDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {srDetailReturn && (
            <>
              <DialogHeader><DialogTitle>Return {srDetailReturn.return_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(srDetailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {srDetailReturn.reason}</div>
                  {srDetailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {srDetailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Condition</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {srDetailReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{item.item_name}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${item.condition === 'damaged' ? 'border-destructive text-destructive' : 'border-success text-success'}`}>
                              {item.condition}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setSrDetailReturn(null)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── PO Return Detail Dialog ── */}
      <Dialog open={!!prDetailReturn} onOpenChange={(o) => { if (!o) setPrDetailReturn(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {prDetailReturn && (
            <>
              <DialogHeader><DialogTitle>Return {prDetailReturn.return_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(prDetailReturn.date)}</div>
                  <div><span className="text-muted-foreground">Reason:</span> {prDetailReturn.reason}</div>
                  {prDetailReturn.notes && <div><span className="text-muted-foreground">Notes:</span> {prDetailReturn.notes}</div>}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {prDetailReturn.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                          <TableCell className="text-right text-sm">{item.qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setPrDetailReturn(null)}>Close</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Sale Return Dialog ── */}
      <Dialog open={srCreateOpen} onOpenChange={(o) => { if (!o) setSrCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>Create Sale Return</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="sr-so">Sale Order (delivered) *</Label>
              <select id="sr-so" value={soId} onChange={(e) => handleSOSelect(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">Select sale order…</option>
                {(saleOrders ?? []).map((o) => <option key={o.id} value={o.id}>{o.so_number} — {o.customer_name ?? 'Unknown'}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sr-date">Return Date *</Label>
                <Input id="sr-date" type="date" value={srDate} onChange={(e) => setSrDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-warehouse">Restock Warehouse</Label>
                <select id="sr-warehouse" value={srWarehouseId} onChange={(e) => setSrWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">No restocking</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-reason">Reason *</Label>
              <Input id="sr-reason" value={srReason} onChange={(e) => setSrReason(e.target.value)} placeholder="e.g. Defective item, wrong item shipped…" />
            </div>
            {srItems.length > 0 && (
              <div className="space-y-2">
                <Label>Return Items</Label>
                {srItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="0" value={item.qty}
                        onChange={(e) => { const u = [...srItems]; u[idx] = { ...u[idx], qty: Math.max(0, Number(e.target.value)) }; setSrItems(u) }}
                        className="w-20 text-right" />
                      <button type="button"
                        onClick={() => { const u = [...srItems]; u[idx] = { ...u[idx], condition: item.condition === 'good' ? 'damaged' : 'good' }; setSrItems(u) }}
                        className={cn('rounded-md border px-2 py-1 text-xs font-medium transition-colors min-h-9',
                          item.condition === 'good' ? 'border-success text-success' : 'border-destructive text-destructive')}>
                        {item.condition}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="sr-notes">Notes</Label>
              <Textarea id="sr-notes" value={srNotes} onChange={(e) => setSrNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setSrCreateOpen(false)} disabled={createSaleReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreateSaleReturn} disabled={createSaleReturn.isPending}>
              {createSaleReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create PO Return Dialog ── */}
      <Dialog open={prCreateOpen} onOpenChange={(o) => { if (!o) setPrCreateOpen(false) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>Create PO Return</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="pr-po">Purchase Order (with receivals) *</Label>
              <select id="pr-po" value={poId} onChange={(e) => handlePOSelect(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">Select purchase order…</option>
                {(purchaseOrders ?? []).filter((o) => (o.po_line_items ?? []).some((l) => l.received_qty > 0)).map((o) => <option key={o.id} value={o.id}>{o.po_number} — {o.supplier_name ?? 'Unknown'}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="pr-date">Return Date *</Label>
                <Input id="pr-date" type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr-warehouse">Dispatch From Warehouse</Label>
                <select id="pr-warehouse" value={prWarehouseId} onChange={(e) => setPrWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pr-reason">Reason *</Label>
              <Input id="pr-reason" value={prReason} onChange={(e) => setPrReason(e.target.value)} placeholder="e.g. Wrong item, damaged on arrival…" />
            </div>
            {prItems.length > 0 && (
              <div className="space-y-2">
                <Label>Items to Return</Label>
                {prItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                      <div className="text-xs text-muted-foreground">Max: {item._max}</div>
                    </div>
                    <Input type="number" min="0" max={item._max} value={item.qty}
                      onChange={(e) => { const u = [...prItems]; u[idx] = { ...u[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }; setPrItems(u) }}
                      className="w-20 text-right" />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="pr-notes">Notes</Label>
              <Textarea id="pr-notes" value={prNotes} onChange={(e) => setPrNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPrCreateOpen(false)} disabled={createPOReturn.isPending}>Cancel</Button>
            <Button onClick={handleCreatePOReturn} disabled={createPOReturn.isPending}>
              {createPOReturn.isPending ? 'Creating…' : 'Create Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}

// ─── Page export — wraps in Suspense required by useSearchParams ──────────────
export default function ReturnsPage() {
  return (
    <Suspense>
      <ReturnsContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify `usePurchaseOrders` accepts an empty filter object**

Open `src/hooks/usePurchaseOrders.ts` and confirm `usePurchaseOrders({})` (no status filter) returns all non-cancelled POs. If the hook requires a status, remove the filter or pass `undefined` for status. The dropdown filters client-side to POs that have at least one received line item.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/sales/returns/page.tsx
git commit -m "feat(returns): add type toggle, PO returns list, cancel for both return types"
```

---

## Task 5: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-30] **PO Returns: Full feature** — `supabase/migrations/20260430170000_po_returns.sql`, `src/hooks/usePurchaseReturns.ts`, `src/hooks/useSaleReturns.ts`, `src/components/purchase/PoDetailDialog.tsx`, `src/app/(dashboard)/sales/returns/page.tsx` — PO returns with dispatch→supplier_confirmed→closed flow, inventory deduction on dispatch, cancel with reversal RPC, type toggle on Returns page
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — PO returns complete"
```
