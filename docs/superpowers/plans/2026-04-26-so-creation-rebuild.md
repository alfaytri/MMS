# SO Creation Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the create-SO page's notes-packing workaround with proper schema columns, rebuild the line items editor to match the PO typed-group pattern, add atomic server-side SO creation with credit approval, and add PDF quotation download.

**Architecture:** One migration adds dedicated columns (`avg_cost DEFAULT 0` prevents NULL in margin reports). A second migration creates `create_sale_order` — a single atomic Postgres function that acquires an advisory lock on the customer, runs the credit check, inserts the SO + lines in one transaction, and returns the final status. The client never writes a status itself; the database decides `quotation`, `confirmed`, or `pending_approval`. PDF generation uses `@react-pdf/renderer` with Cairo font (Arabic support).

**Tech Stack:** Next.js 15 App Router · Supabase postgres · TanStack React Query v5 · shadcn/ui · @react-pdf/renderer

**Prerequisite:** Plan `2026-04-26-so-credit-groups.md` must be fully applied first — this plan depends on the `credit_groups` table and the `credit_group_id` FK on `customers`.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260427000002_sale_orders_columns.sql` | Create |
| `supabase/migrations/20260427000003_rpc_create_sale_order.sql` | Create |
| `public/fonts/Cairo-Regular.ttf` | Add (download step in Task 3) |
| `public/fonts/Cairo-Bold.ttf` | Add (download step in Task 3) |
| `src/components/sales/SoLineItemsEditor.tsx` | Rewrite |
| `src/components/sales/SoTermsSection.tsx` | Modify — add `validity_days` field |
| `src/hooks/useSaleOrders.ts` | Modify — new types, `useCreateSO` calls RPC |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Rewrite |
| `src/components/sales/SoQuotationPdf.tsx` | Create |
| `src/components/sales/SoDetailDialog.tsx` | Modify — Download PDF button |

---

### Task 1: Database migration — schema columns

**Files:**
- Create: `supabase/migrations/20260427000002_sale_orders_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260427000002_sale_orders_columns.sql
BEGIN;

-- Extend sale_order_status enum
ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- Dedicated columns on sale_orders
ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS currency             TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS exchange_rate        NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_delivery    DATE,
  ADD COLUMN IF NOT EXISTS payment_terms        TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_notes  TEXT,
  ADD COLUMN IF NOT EXISTS payment_milestones   JSONB,
  ADD COLUMN IF NOT EXISTS delivery_terms       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes       TEXT,
  ADD COLUMN IF NOT EXISTS validity_days        INTEGER NOT NULL DEFAULT 30;

-- Dedicated columns on sale_order_lines
-- DEFAULT 0 on avg_cost is critical: NULL avg_cost breaks margin SQL aggregations.
ALTER TABLE sale_order_lines
  ADD COLUMN IF NOT EXISTS line_type          TEXT NOT NULL DEFAULT 'products',
  ADD COLUMN IF NOT EXISTS unit               TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS tool_asset_item_id UUID REFERENCES tool_asset_items(id),
  ADD COLUMN IF NOT EXISTS avg_cost           NUMERIC NOT NULL DEFAULT 0;

COMMIT;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000002_sale_orders_columns.sql
git commit -m "feat(db): add dedicated columns to sale_orders and sale_order_lines (avg_cost DEFAULT 0)"
```

---

### Task 2: Atomic create_sale_order RPC

**Files:**
- Create: `supabase/migrations/20260427000003_rpc_create_sale_order.sql`

This RPC eliminates two security/correctness problems from a multi-step client flow:
1. **Race condition** — `pg_advisory_xact_lock` on the customer ID serialises concurrent SO creation for the same customer; both salespeople hitting "Confirm" simultaneously cannot both pass the credit check.
2. **Client-side status manipulation** — the database assigns the final status (`confirmed`, `quotation`, or `pending_approval`). A client cannot bypass this by calling the Supabase REST API directly.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260427000003_rpc_create_sale_order.sql
BEGIN;

CREATE OR REPLACE FUNCTION create_sale_order(
  p_customer_id          UUID,
  p_intent               TEXT,    -- 'quotation' | 'confirm'
  p_currency             TEXT,
  p_exchange_rate        NUMERIC,
  p_expected_delivery    DATE,
  p_payment_terms        TEXT,
  p_payment_terms_notes  TEXT,
  p_payment_milestones   JSONB,
  p_delivery_terms       TEXT,
  p_delivery_terms_notes TEXT,
  p_customer_notes       TEXT,
  p_validity_days        INTEGER,
  p_discount_amount      NUMERIC,
  p_discount_label       TEXT,
  p_discount_type        TEXT,
  p_line_items           JSONB    -- [{item_name,sku,qty,unit,unit_price,total,line_type,brand_variant_id,tool_asset_item_id,avg_cost}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_so_number         TEXT;
  v_count             INTEGER;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
BEGIN
  -- ── Serialise concurrent SO creation for this customer ─────────────────────
  -- pg_advisory_xact_lock is released automatically at transaction end.
  -- Two salespeople confirming orders for the same customer at the same moment
  -- will queue here instead of both passing the credit check.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- ── Generate SO number (safe within lock) ──────────────────────────────────
  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  -- ── Calculate totals ───────────────────────────────────────────────────────
  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  -- ── Credit check (atomic — within same transaction as insert) ──────────────
  SELECT cg.credit_limit, cg.name
  INTO   v_credit_limit, v_group_name
  FROM   customers c
  JOIN   credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_credit_group';
  END IF;

  -- All non-cancelled outstanding totals consume credit (includes delivered-unpaid).
  SELECT COALESCE(SUM(total), 0)
  INTO   v_open_total
  FROM   sale_orders
  WHERE  customer_id = p_customer_id
    AND  status NOT IN ('cancelled')
    AND  deleted_at IS NULL;

  v_available := v_credit_limit - v_open_total;

  -- 'confirm' intent requires credit to be available — hard block.
  -- 'quotation' intent saves as pending_approval when credit is exceeded.
  IF p_intent = 'confirm' AND v_total_qar > v_available THEN
    RAISE EXCEPTION 'credit_exceeded'
      USING DETAIL = json_build_object(
        'available', GREATEST(v_available, 0),
        'needed',    v_total_qar
      )::text;
  END IF;

  v_so_status := CASE
    WHEN p_intent = 'confirm'         THEN 'confirmed'::sale_order_status
    WHEN v_total_qar <= v_available   THEN 'quotation'::sale_order_status
    ELSE                                   'pending_approval'::sale_order_status
  END;

  -- ── Insert SO ──────────────────────────────────────────────────────────────
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    auth.uid()
  )
  RETURNING id INTO v_so_id;

  -- ── Insert line items ──────────────────────────────────────────────────────
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost,
    created_by
  )
  SELECT
    v_so_id,
    item->>'item_name',
    NULLIF(item->>'sku', ''),
    (item->>'qty')::INTEGER,
    COALESCE(NULLIF(item->>'unit', ''), 'pcs'),
    (item->>'unit_price')::NUMERIC,
    (item->>'total')::NUMERIC,
    COALESCE(NULLIF(item->>'line_type', ''), 'products'),
    CASE
      WHEN (item->>'brand_variant_id') IS NOT NULL
        AND (item->>'brand_variant_id') NOT IN ('', 'null')
      THEN (item->>'brand_variant_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN (item->>'tool_asset_item_id') IS NOT NULL
        AND (item->>'tool_asset_item_id') NOT IN ('', 'null')
      THEN (item->>'tool_asset_item_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    auth.uid()
  FROM jsonb_array_elements(p_line_items) AS item;

  -- ── Reserve inventory stock ────────────────────────────────────────────────
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(jsonb_build_object('bv_id', (item->>'brand_variant_id')::UUID, 'delta', (item->>'qty')::INTEGER))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)  -- floor at 0 for display
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale_order(UUID,TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,JSONB,TEXT,TEXT,TEXT,INTEGER,NUMERIC,TEXT,TEXT,JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: function created, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000003_rpc_create_sale_order.sql
git commit -m "feat(db): add atomic create_sale_order RPC — advisory lock, credit check, insert in one transaction"
```

---

### Task 3: Install @react-pdf/renderer + download Cairo font

The default Helvetica font in react-pdf has no Arabic glyph support. Customer names, notes, and item names in Arabic will render as blank squares or crash the PDF. Cairo is a bilingual (Arabic/Latin) font.

- [ ] **Step 1: Install the package**

```bash
cd D:/MMS && npm install @react-pdf/renderer
```

- [ ] **Step 2: Create fonts directory and download Cairo**

```bash
mkdir -p D:/MMS/public/fonts
curl -L "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf" -o D:/MMS/public/fonts/Cairo-Regular.ttf
```

If `curl` is not available, open this URL in a browser and save to `public/fonts/Cairo-Regular.ttf`:
`https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf`

For a bold variant we use the same variable font with a weight hint — react-pdf accepts one file for both weights if it's a variable font.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json public/fonts/
git commit -m "chore: install @react-pdf/renderer; add Cairo variable font for Arabic PDF support"
```

---

### Task 4: Extend types + update useCreateSO to call atomic RPC

**Files:**
- Modify: `src/hooks/useSaleOrders.ts`

The `useCreateSO` hook becomes a thin wrapper that calls `create_sale_order` RPC. No client-side discount math — the server handles it. This eliminates the `discountResolved` undefined-variable bug.

- [ ] **Step 1: Update SOLineItem type**

Replace the `SOLineItem` type:

```ts
export type SOLineItem = {
  id:                  string
  sale_order_id:       string
  item_name:           string
  sku:                 string | null
  qty:                 number
  unit:                string
  unit_price:          number
  total:               number
  delivered_qty:       number
  line_type:           string
  brand_variant_id:    string | null
  tool_asset_item_id:  string | null
  avg_cost:            number
  created_at:          string
}
```

- [ ] **Step 2: Update SaleOrder type**

Replace the `SaleOrder` type — add all new dedicated columns, keep legacy `notes`:

```ts
export type SaleOrder = {
  id:                       string
  so_number:                string
  customer_id:              string
  status:                   SOStatus
  subtotal:                 number
  tax:                      number
  total:                    number
  discount_amount:          number
  discount_label:           string | null
  discount_type:            string | null
  discount_amount_resolved: number
  currency:                 string
  exchange_rate:            number
  expected_delivery:        string | null
  payment_terms:            string | null
  payment_terms_notes:      string | null
  payment_milestones:       { label: string; percent: number }[] | null
  delivery_terms:           string | null
  delivery_terms_notes:     string | null
  customer_notes:           string | null
  validity_days:            number
  notes:                    string | null   // legacy — kept for old records
  created_by_name:          string | null
  created_at:               string
  updated_at:               string
  deleted_at:               string | null
  sale_order_lines?:        SOLineItem[]
  sale_deliveries?:         SaleDelivery[]
  customer_name?:           string
  customer_phone?:          string
}
```

- [ ] **Step 3: Update SOLineItemDraft**

Replace `SOLineItemDraft`:

```ts
export type SOLineItemDraft = {
  item_name:          string
  sku:                string
  qty:                number
  unit:               string
  unit_price:         number
  total:              number
  line_type:          string
  brand_variant_id:   string | null
  tool_asset_item_id: string | null
  avg_cost:           number    // 0 for manual rows — DEFAULT 0 in DB prevents NULL
}
```

- [ ] **Step 4: Replace CreateSOPayload and useCreateSO**

Replace the `CreateSOPayload` type:

```ts
export type CreateSOPayload = {
  customer_id:          string
  intent:               'quotation' | 'confirm'
  currency:             string
  exchange_rate:        number
  expected_delivery:    string | null
  payment_terms:        string | null
  payment_terms_notes:  string | null
  payment_milestones:   { label: string; percent: number }[] | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
  validity_days:        number
  discount_amount:      number
  discount_label:       string | null
  discount_type:        'fixed' | 'percentage'
  line_items:           SOLineItemDraft[]
}

export type CreateSOResult = {
  so_id:        string
  so_number:    string
  status:       SOStatus
  credit_limit: number
  group_name:   string
  open_total:   number
  available:    number   // floored at 0 by the RPC
}
```

Replace the `useCreateSO` function:

```ts
export function useCreateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSOPayload): Promise<CreateSOResult> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('create_sale_order', {
        p_customer_id:          payload.customer_id,
        p_intent:               payload.intent,
        p_currency:             payload.currency,
        p_exchange_rate:        payload.exchange_rate,
        p_expected_delivery:    payload.expected_delivery,
        p_payment_terms:        payload.payment_terms,
        p_payment_terms_notes:  payload.payment_terms_notes,
        p_payment_milestones:   payload.payment_milestones,
        p_delivery_terms:       payload.delivery_terms,
        p_delivery_terms_notes: payload.delivery_terms_notes,
        p_customer_notes:       payload.customer_notes,
        p_validity_days:        payload.validity_days,
        p_discount_amount:      payload.discount_amount,
        p_discount_label:       payload.discount_label,
        p_discount_type:        payload.discount_type,
        p_line_items:           payload.line_items,
      })
      if (error) throw error
      return data as CreateSOResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
    },
  })
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "useSaleOrders" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSaleOrders.ts
git commit -m "feat(hooks): update SaleOrder types; useCreateSO calls atomic create_sale_order RPC"
```

---

### Task 5: Rebuild SoLineItemsEditor with typed groups

**Files:**
- Rewrite: `src/components/sales/SoLineItemsEditor.tsx`

Mirrors `PoLineItemsEditor` exactly but uses `selling_price` (not `cost_price`), drops `free_qty`, and uses `total` (not `total_price`) to match `SOLineItemDraft`. `avg_cost` is always explicitly set to `item.cost_price ?? 0` so manual rows get 0, never undefined.

- [ ] **Step 1: Rewrite the file**

```tsx
// src/components/sales/SoLineItemsEditor.tsx
'use client'

import { useRef } from 'react'
import type { ElementType } from 'react'
import { Trash2, Plus, ShoppingBag, Cog, Droplets, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import { ToolAssetLookup, type ToolAssetLookupResult } from '@/components/purchase/ToolAssetLookup'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import type { SOLineItemDraft } from '@/hooks/useSaleOrders'

export type SoLineType = 'products' | 'spare-parts' | 'consumables' | 'tools'

export type SoLineItemRow = SOLineItemDraft & {
  _key:      string
  line_type: SoLineType
}

interface TypeConfig { label: string; icon: ElementType; headerClass: string; buttonClass: string }

const TYPE_CONFIG: Record<SoLineType, TypeConfig> = {
  products:     { label: 'Products',      icon: ShoppingBag, headerClass: 'bg-blue-500/10 text-blue-700 border-b border-blue-200',   buttonClass: 'border-blue-300 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20' },
  'spare-parts':{ label: 'Spare Parts',   icon: Cog,         headerClass: 'bg-amber-500/10 text-amber-700 border-b border-amber-200', buttonClass: 'border-amber-300 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20' },
  consumables:  { label: 'Consumables',   icon: Droplets,    headerClass: 'bg-green-500/10 text-green-700 border-b border-green-200', buttonClass: 'border-green-300 bg-green-500/10 text-green-700 hover:bg-green-500/20' },
  tools:        { label: 'Tools & Assets',icon: Wrench,      headerClass: 'bg-purple-500/10 text-purple-700 border-b border-purple-200', buttonClass: 'border-purple-300 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20' },
}

const ALL_TYPES: SoLineType[] = ['products', 'spare-parts', 'consumables', 'tools']

function makeRow(line_type: SoLineType): SoLineItemRow {
  return {
    _key: crypto.randomUUID(), line_type,
    item_name: '', sku: '', qty: 1, unit: 'pcs',
    unit_price: 0, total: 0,
    brand_variant_id: null, tool_asset_item_id: null,
    avg_cost: 0,
  }
}

interface SoLineItemsEditorProps {
  value:           SoLineItemRow[]
  onChange:        (rows: SoLineItemRow[]) => void
  currency:        string
  readOnly?:       boolean
  onPriceLoading?: (loading: boolean) => void
}

export function SoLineItemsEditor({ value, onChange, currency, readOnly = false, onPriceLoading }: SoLineItemsEditorProps) {
  const priceLoadingKeys = useRef(new Set<string>())

  function handleRowPriceLoading(key: string, loading: boolean) {
    loading ? priceLoadingKeys.current.add(key) : priceLoadingKeys.current.delete(key)
    onPriceLoading?.(priceLoadingKeys.current.size > 0)
  }

  function addRow(line_type: SoLineType) { onChange([...value, makeRow(line_type)]) }
  function removeRow(key: string) { onChange(value.filter((r) => r._key !== key)) }

  function updateRow(key: string, patch: Partial<SoLineItemRow>) {
    onChange(value.map((r) => {
      if (r._key !== key) return r
      const u = { ...r, ...patch }
      if ('qty' in patch || 'unit_price' in patch) u.total = u.qty * u.unit_price
      return u
    }))
  }

  function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
    if (!item) { updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total: 0, brand_variant_id: null, avg_cost: 0 }); return }
    const existing = value.find((r) => r._key === key)
    updateRow(key, {
      item_name:          item.item_name,
      sku:                existing?.sku?.trim() ? existing.sku : (item.sku ?? ''),
      unit:               item.unit,
      unit_price:         item.selling_price,           // ← selling price, not cost
      total:              item.selling_price,
      brand_variant_id:   item.brand_variant_id,
      tool_asset_item_id: null,
      avg_cost:           item.cost_price ?? 0,         // always a number — never undefined
    })
  }

  function handleToolSelect(key: string, item: ToolAssetLookupResult | null) {
    if (!item) { updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total: 0, tool_asset_item_id: null, avg_cost: 0 }); return }
    updateRow(key, { item_name: item.item_name, tool_asset_item_id: item.tool_asset_item_id, brand_variant_id: null })
  }

  const groupedTypes = ALL_TYPES.filter((t) => value.some((r) => r.line_type === t))

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ADD ITEM:</span>
          {ALL_TYPES.map((t) => {
            const cfg = TYPE_CONFIG[t]; const Icon = cfg.icon
            return (
              <Button key={t} type="button" variant="outline" size="sm" className={`h-7 text-xs gap-1.5 ${cfg.buttonClass}`} onClick={() => addRow(t)}>
                <Icon className="h-3.5 w-3.5" />{cfg.label}
              </Button>
            )
          })}
        </div>
      )}
      {value.length === 0 && (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Click one of the buttons above to add a line item
        </div>
      )}
      {groupedTypes.map((lineType) => {
        const cfg = TYPE_CONFIG[lineType]; const Icon = cfg.icon
        const rows = value.filter((r) => r.line_type === lineType)
        return (
          <div key={lineType} className="border rounded-lg overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-2 ${cfg.headerClass}`}>
              <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /><span className="text-xs font-semibold">{cfg.label}</span></div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] py-0 px-1.5">{rows.length} item{rows.length !== 1 ? 's' : ''}</Badge>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => addRow(lineType)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Item Name</span><span>SKU</span><span>Qty *</span><span>Unit</span><span>Unit Price *</span><span>Total</span>
            </div>
            <div className="divide-y">
              {rows.map((row) => {
                const isInventory = lineType !== 'tools'
                return (
                  <div key={row._key} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        {readOnly ? (
                          <div className="h-8 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">{row.item_name || '—'}</div>
                        ) : isInventory ? (
                          <CascadeInventorySelector
                            lineType={lineType}
                            value={row.brand_variant_id ? { brand_variant_id: row.brand_variant_id, item_name: row.item_name, item_name_ar: null, sku: row.sku, unit: row.unit, cost_price: row.avg_cost, selling_price: row.unit_price, category_name: null, category_name_ar: null, brand: null } : null}
                            onChange={(item) => handleInventorySelect(row._key, item)}
                            onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
                          />
                        ) : (
                          <ToolAssetLookup
                            value={row.tool_asset_item_id ? { tool_asset_item_id: row.tool_asset_item_id, item_name: row.item_name } : null}
                            onChange={(item) => handleToolSelect(row._key, item)}
                          />
                        )}
                      </div>
                      {!readOnly && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0" onClick={() => removeRow(row._key)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 items-center">
                      <div />
                      <Input className="h-7 text-xs" placeholder="SKU" value={row.sku} readOnly={readOnly} onChange={(e) => updateRow(row._key, { sku: e.target.value })} />
                      <Input type="number" min={1} className="h-7 text-xs text-right" value={row.qty} readOnly={readOnly} onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })} />
                      <Input className="h-7 text-xs" placeholder="pcs" value={row.unit} readOnly={readOnly} onChange={(e) => updateRow(row._key, { unit: e.target.value })} />
                      <Input type="number" min={0} step="0.01" className="h-7 text-xs text-right" value={row.unit_price} readOnly={readOnly} onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })} />
                      <div className="h-7 px-2 flex items-center justify-end rounded-md bg-muted/30 text-xs font-medium tabular-nums">
                        {formatCurrency(row.total, currency)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoLineItemsEditor" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoLineItemsEditor.tsx
git commit -m "feat(ui): rebuild SoLineItemsEditor — typed groups, selling_price, avg_cost always 0 not undefined"
```

---

### Task 6: Add validity_days to SoTermsSection

**Files:**
- Modify: `src/components/sales/SoTermsSection.tsx`

- [ ] **Step 1: Add validity_days to the interface**

Replace the `SoTermsValues` interface:

```ts
export interface SoTermsValues {
  payment_terms:        string
  payment_terms_notes:  string
  delivery_terms:       string
  delivery_terms_notes: string
  customer_notes:       string
  validity_days:        number
}
```

Add `DEFAULT_TERMS` export after the interface:

```ts
export const DEFAULT_TERMS: SoTermsValues = {
  payment_terms:        '',
  payment_terms_notes:  '',
  delivery_terms:       '',
  delivery_terms_notes: '',
  customer_notes:       '',
  validity_days:        30,
}
```

Add `Input` to imports: `import { Input } from '@/components/ui/input'`

In the JSX, after the `customer_notes` block, add:

```tsx
<div className="space-y-2">
  <Label className="text-sm font-medium">Quotation Validity (days)</Label>
  <Input
    type="number"
    min={1}
    className="h-9 w-32 text-sm"
    value={value.validity_days}
    onChange={(e) => set('validity_days', Math.max(1, Number(e.target.value)))}
  />
  <p className="text-xs text-muted-foreground">How long this quotation remains valid from issue date</p>
</div>
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoTermsSection" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoTermsSection.tsx
git commit -m "feat(ui): add validity_days field + DEFAULT_TERMS export to SoTermsSection"
```

---

### Task 7: Rewrite create-SO page

**Files:**
- Rewrite: `src/app/(dashboard)/sales/create-so/page.tsx`

The page calls `useCreateSO` with `intent: 'quotation' | 'confirm'`. The hook calls the atomic RPC — the page never writes a status directly. Available credit is floored at 0 before display.

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/(dashboard)/sales/create-so/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Save, CheckCircle2, Users, Package, AlertTriangle } from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SoLineItemsEditor, type SoLineItemRow } from '@/components/sales/SoLineItemsEditor'
import { SoTermsSection, DEFAULT_TERMS, type SoTermsValues } from '@/components/sales/SoTermsSection'
import {
  useCreateSO, useCustomers, useCreateCustomer,
  calcSOSubtotal, calcSOTotal, hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { formatCurrency } from '@/lib/utils/formatters'

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const
const CURRENCY_SYMBOLS: Record<string, string> = { QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ' }
const CURRENCY_NAMES: Record<string, string> = { QAR: 'Qatari Riyal', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', AED: 'UAE Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar' }

function sym(c: string) { return CURRENCY_SYMBOLS[c] ?? `${c} ` }
function fmtAmt(amount: number, currency: string) {
  return `${sym(currency)}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreateSOPage() {
  const router      = useRouter()
  const createSO    = useCreateSO()
  const createCust  = useCreateCustomer()

  const [customerSearch, setCustomerSearch]               = useState('')
  const [customerId, setCustomerId]                       = useState('')
  const [customerName, setCustomerName]                   = useState('')
  const [customerCreditGroupId, setCustomerCreditGroupId] = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]     = useState<number | null>(null)
  const [customerOpen, setCustomerOpen]                   = useState(false)
  const [addOpen, setAddOpen]                             = useState(false)
  const [newName, setNewName]                             = useState('')
  const [newPhone, setNewPhone]                           = useState('')
  const [newEmail, setNewEmail]                           = useState('')

  const [currency, setCurrency]         = useState('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [lineItems, setLineItems]       = useState<SoLineItemRow[]>([])
  const [terms, setTerms]               = useState<SoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel]   = useState('')
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)

  const subtotal       = calcSOSubtotal(lineItems)
  const total          = calcSOTotal(subtotal, discountAmount, 'fixed')
  const negativeMargin = hasNegativeMargin(lineItems)
  const noCreditGroup  = customerId !== '' && customerCreditGroupId === null

  function handleSelectCustomer(c: {
    id: string; name: string
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
  }) {
    setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerOpen(false)
  }

  function handleAddCustomer() {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return }
    createCust.mutate(
      { name: newName.trim(), email: newEmail || null },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          handleSelectCustomer({ id: data.id, name: data.name, credit_group_id: data.credit_group_id ?? null })
          setAddOpen(false); setNewName(''); setNewPhone(''); setNewEmail('')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function validate() {
    if (!customerId)            { toast.error('Please select a customer'); return false }
    if (noCreditGroup)          { toast.error('Customer has no credit group assigned'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) { toast.error('All line items need an item name'); return false }
    return true
  }

  function buildPayload(intent: 'quotation' | 'confirm') {
    return {
      customer_id:          customerId,
      intent,
      currency,
      exchange_rate:        exchangeRate,
      expected_delivery:    null,
      payment_terms:        terms.payment_terms || null,
      payment_terms_notes:  terms.payment_terms_notes || null,
      payment_milestones:   null,
      delivery_terms:       terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      customer_notes:       terms.customer_notes || null,
      validity_days:        terms.validity_days,
      discount_amount:      discountAmount,
      discount_label:       discountLabel || null,
      discount_type:        'fixed' as const,
      line_items:           lineItems.map(({ _key, ...li }) => li),
    }
  }

  function saveQuotation() {
    if (!validate()) return
    createSO.mutate(buildPayload('quotation'), {
      onSuccess: (result) => {
        if (result.status === 'pending_approval') {
          // Available is floored at 0 by the RPC — display is always non-negative
          toast.warning(`Saved — exceeds credit limit (available: ${fmtAmt(result.available, 'QAR')}). Sent for owner approval.`)
        } else {
          toast.success('Saved as quotation')
        }
        router.push('/sales/orders')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  function confirmOrder() {
    if (!validate()) return
    createSO.mutate(buildPayload('confirm'), {
      onSuccess: () => { toast.success('Order confirmed'); router.push('/sales/orders') },
      onError: (err) => {
        // RPC raises EXCEPTION 'credit_exceeded' — surface available credit to the user
        if (err.message?.includes('credit_exceeded')) {
          toast.error(`Cannot confirm — exceeds credit limit. Check available credit.`)
        } else {
          toast.error(err.message)
        }
      },
    })
  }

  const isPending  = createSO.isPending
  const validCount = lineItems.filter((li) => li.item_name.trim() !== '').length

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/sales/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">New Sales Order</h1>
            <p className="text-xs text-muted-foreground">Create a quotation or confirm an order</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveQuotation} disabled={isPending || isPriceLoading || noCreditGroup}>
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Saving…' : 'Save as Quotation'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={confirmOrder} disabled={isPending || isPriceLoading || noCreditGroup}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isPending ? 'Confirming…' : 'Confirm Order'}
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Customer */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />Customer</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CUSTOMER *</label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger className="h-9 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  render={(props) => <button type="button" {...props} />}>
                  <span className={customerName ? '' : 'text-muted-foreground'}>{customerName || 'Search customers…'}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search customers..." value={customerSearch} onValueChange={setCustomerSearch} />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {(customers ?? []).map((c) => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => handleSelectCustomer(c)}>
                            <Check className={`mr-2 h-4 w-4 ${customerId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex-1">
                              <span>{c.name}</span>
                              {!c.credit_group_id && <span className="ml-2 text-[10px] text-destructive">No credit group</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new customer" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {customerId && (
            noCreditGroup ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This customer has no credit group. Go to Master Data → Customers to assign one.
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
                <span>Limit: {fmtAmt(customerCreditLimit ?? 0, 'QAR')}</span>
              </div>
            )
          )}
        </section>

        <Separator />

        {/* ② Currency */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {CURRENCIES.map((c) => <option key={c} value={c}>{sym(c)}{c} — {CURRENCY_NAMES[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">{fmtAmt(subtotal, currency)}</div>
            </div>
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">{fmtAmt(total, currency)}</div>
              </div>
            )}
          </div>
          {currency !== 'QAR' && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Exchange Rate (to QAR)</label>
              <Input type="number" min="0.0001" step="0.0001" className="h-8 w-32 text-sm" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} />
            </div>
          )}
        </section>

        <Separator />

        {/* ③ Line Items */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4 text-primary" />Line Items</h2>
            <Badge variant="outline" className="text-[9px]">{validCount} valid</Badge>
            {negativeMargin && (
              <Badge variant="outline" className="text-[9px] border-warning text-warning gap-1">
                <AlertTriangle className="h-3 w-3" /> Negative margin
              </Badge>
            )}
          </div>
          <SoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} onPriceLoading={setIsPriceLoading} />
        </section>

        <Separator />

        {/* ④ Discount */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
              <Input className="h-9 text-sm" placeholder="e.g. Volume Discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount ({currency})</label>
              <Input type="number" min="0" step="0.01" className="h-9 text-sm" value={discountAmount} onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))} />
            </div>
          </div>
        </section>

        <Separator />

        {/* ⑤ Terms */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Terms</h2>
          <SoTermsSection value={terms} onChange={setTerms} />
        </section>

      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Phone *</label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+974 XXXX XXXX" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Email</label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer} disabled={createCust.isPending}>{createCust.isPending ? 'Adding…' : 'Add Customer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "create-so" | head -20
```

Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

Navigate to Sales → Create. Verify:
- Customer with no credit group shows blocking error and disabled buttons
- Adding a line item (Products) — cascade selector populates selling_price
- "Save as Quotation" fires the atomic RPC; if credit exceeded, redirects and shows warning toast with pending_approval
- "Confirm Order" fires RPC with `intent='confirm'`; if credit exceeded, the RPC raises an exception and the page shows an error toast (no SO is created — the transaction rolled back)

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/sales/create-so/page.tsx
git commit -m "feat(ui): rebuild create-SO page — atomic RPC, credit gating, PO-style layout"
```

---

### Task 8: PDF Quotation component

**Files:**
- Create: `src/components/sales/SoQuotationPdf.tsx`

Cairo font (downloaded in Task 3) is registered once at module level. The `Font.register` call is outside any component so it runs once when the module is first imported.

- [ ] **Step 1: Create the component**

```tsx
// src/components/sales/SoQuotationPdf.tsx
'use client'

import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer'
import type { SaleOrder, SOLineItem } from '@/hooks/useSaleOrders'

// Register Cairo for Arabic + Latin support.
// Font files are in /public/fonts/ (downloaded in Task 3).
Font.register({
  family: 'Cairo',
  fonts: [
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 700 },  // variable font handles weight via CSS
  ],
})

const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}

function fmt(amount: number, currency = 'QAR') {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  return `${sym}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Cairo', fontSize: 9, padding: 36, color: '#111827' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo:        { width: 80, height: 40, objectFit: 'contain' },
  docTitle:    { fontSize: 20, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 4 },
  docMeta:     { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  section:     { marginBottom: 14 },
  sectionLbl:  { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b7280', marginBottom: 4 },
  billTo:      { fontSize: 9, color: '#111827', lineHeight: 1.5 },
  groupHeader: { backgroundColor: '#eff6ff', paddingVertical: 4, paddingHorizontal: 6, marginBottom: 2, borderRadius: 2 },
  groupLabel:  { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8' },
  tableRow:    { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHead:   { backgroundColor: '#f9fafb' },
  c_num:       { width: '5%',  fontSize: 8, color: '#6b7280' },
  c_item:      { width: '35%', fontSize: 8 },
  c_sku:       { width: '15%', fontSize: 8, color: '#6b7280' },
  c_qty:       { width: '8%',  fontSize: 8, textAlign: 'right' },
  c_unit:      { width: '8%',  fontSize: 8, textAlign: 'center', color: '#6b7280' },
  c_price:     { width: '14%', fontSize: 8, textAlign: 'right' },
  c_total:     { width: '15%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 10 },
  totRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  totLbl:      { width: 110, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 8 },
  totVal:      { width: 110, fontSize: 9, textAlign: 'right' },
  grandRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  grandLbl:    { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right', paddingRight: 8 },
  grandVal:    { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },
  termsRow:    { flexDirection: 'row', marginBottom: 3 },
  termsKey:    { width: 120, fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#374151' },
  termsVal:    { flex: 1, fontSize: 8, color: '#6b7280' },
  footer:      { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: '#9ca3af' },
})

const LINE_TYPES = ['products', 'spare-parts', 'consumables', 'tools'] as const
const TYPE_LABELS: Record<string, string> = {
  products: 'Products', 'spare-parts': 'Spare Parts', consumables: 'Consumables', tools: 'Tools & Assets',
}

interface Props {
  so:           SaleOrder
  lines:        SOLineItem[]
  customerName: string
  customerPhone: string | null
}

export function QuotationDocument({ so, lines, customerName, customerPhone }: Props) {
  const currency    = so.currency ?? 'QAR'
  const validDays   = so.validity_days ?? 30
  const presentTypes = LINE_TYPES.filter((t) => lines.some((l) => l.line_type === t))

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.header}>
          <Image style={s.logo} src="/logo.png" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.docTitle}>QUOTATION</Text>
            <Text style={s.docMeta}>No: {so.so_number}</Text>
            <Text style={s.docMeta}>Date: {formatDate(so.created_at)}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          <Text style={s.sectionLbl}>Bill To</Text>
          <Text style={s.billTo}>{customerName}</Text>
          {customerPhone && <Text style={s.billTo}>{customerPhone}</Text>}
        </View>

        {presentTypes.map((lineType) => {
          const rows = lines.filter((l) => l.line_type === lineType)
          return (
            <View key={lineType} style={s.section} wrap={false}>
              <View style={s.groupHeader}><Text style={s.groupLabel}>{TYPE_LABELS[lineType]}</Text></View>
              <View style={[s.tableRow, s.tableHead]}>
                <Text style={s.c_num}>#</Text><Text style={s.c_item}>Item Name</Text>
                <Text style={s.c_sku}>SKU</Text><Text style={s.c_qty}>Qty</Text>
                <Text style={s.c_unit}>Unit</Text><Text style={s.c_price}>Unit Price</Text>
                <Text style={s.c_total}>Total</Text>
              </View>
              {rows.map((li, idx) => (
                <View key={li.id} style={s.tableRow}>
                  <Text style={s.c_num}>{idx + 1}</Text>
                  <Text style={s.c_item}>{li.item_name}</Text>
                  <Text style={s.c_sku}>{li.sku ?? '—'}</Text>
                  <Text style={s.c_qty}>{li.qty}</Text>
                  <Text style={s.c_unit}>{li.unit}</Text>
                  <Text style={s.c_price}>{fmt(li.unit_price, currency)}</Text>
                  <Text style={s.c_total}>{fmt(li.total, currency)}</Text>
                </View>
              ))}
            </View>
          )
        })}

        <View style={s.divider} />

        <View style={s.totRow}>
          <Text style={s.totLbl}>Subtotal</Text>
          <Text style={s.totVal}>{fmt(so.subtotal, currency)}</Text>
        </View>
        {so.discount_amount_resolved > 0 && (
          <View style={s.totRow}>
            <Text style={s.totLbl}>Discount{so.discount_label ? ` (${so.discount_label})` : ''}</Text>
            <Text style={[s.totVal, { color: '#dc2626' }]}>-{fmt(so.discount_amount_resolved, currency)}</Text>
          </View>
        )}
        <View style={s.grandRow}>
          <Text style={s.grandLbl}>Grand Total</Text>
          <Text style={s.grandVal}>{fmt(so.total, currency)}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          {so.payment_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Payment Terms:</Text>
              <Text style={s.termsVal}>{so.payment_terms}{so.payment_terms_notes ? ` — ${so.payment_terms_notes}` : ''}</Text>
            </View>
          )}
          {so.delivery_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Delivery Terms:</Text>
              <Text style={s.termsVal}>{so.delivery_terms}{so.delivery_terms_notes ? ` — ${so.delivery_terms_notes}` : ''}</Text>
            </View>
          )}
          {so.customer_notes && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Notes:</Text>
              <Text style={s.termsVal}>{so.customer_notes}</Text>
            </View>
          )}
          <View style={s.termsRow}>
            <Text style={s.termsKey}>Validity:</Text>
            <Text style={s.termsVal}>{validDays} days from issue date</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Al Faytri Group</Text>
          <Text style={s.footerTxt}>{so.so_number} — {formatDate(so.created_at)}</Text>
        </View>

      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoQuotationPdf" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoQuotationPdf.tsx
git commit -m "feat(ui): add QuotationDocument PDF — Cairo font (Arabic), grouped line items, validity"
```

---

### Task 9: Add Download PDF button to SoDetailDialog

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx`
- Modify: `src/hooks/useSaleOrders.ts` — add `customer_phone` to `useSaleOrder` select

- [ ] **Step 1: Add phone to useSaleOrder query**

In `src/hooks/useSaleOrders.ts`, in the `useSaleOrder` queryFn, update the select and mapping:

```ts
// select
.select('*, sale_order_lines(*), sale_deliveries(*), customers(name, phone, email, customer_number)')

// mapping
return {
  ...data,
  customer_name:  data.customers?.name  ?? null,
  customer_phone: data.customers?.phone ?? null,
} as SaleOrder
```

- [ ] **Step 2: Add dynamic imports to SoDetailDialog.tsx**

At the top of `SoDetailDialog.tsx`, after existing imports, add:

```ts
import dynamic from 'next/dynamic'

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
)

// Cast to any because the dynamic import loses the render-prop type
const QuotationDocument = dynamic(
  () => import('./SoQuotationPdf').then((m) => m.QuotationDocument),
  { ssr: false }
) as any
```

- [ ] **Step 3: Add the PDF download button in the DialogHeader**

In `SoDetailDialog.tsx`, find the block that contains the `canConfirm` and `canEdit` conditions. After those buttons, add:

```tsx
{(current?.status === 'quotation' || current?.status === 'pending_approval') && fullSO && (
  <PDFDownloadLink
    document={
      <QuotationDocument
        so={fullSO}
        lines={fullSO.sale_order_lines ?? []}
        customerName={current.customer_name ?? ''}
        customerPhone={current.customer_phone ?? null}
      />
    }
    fileName={`Quotation-${current.so_number}.pdf`}
  >
    {({ loading }: { loading: boolean }) => (
      <Button variant="outline" size="sm" disabled={loading}>
        {loading ? 'Preparing…' : 'Download PDF'}
      </Button>
    )}
  </PDFDownloadLink>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "SoDetailDialog|useSaleOrders" | head -20
```

Expected: no errors.

- [ ] **Step 5: Smoke test**

Open dev server. Open an existing quotation from the SO list. Confirm "Download PDF" appears. Click it — PDF downloads with Cairo font, line items grouped by type, totals, and validity. If the system has Arabic customer names, confirm they render as Arabic characters (not squares).

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx src/hooks/useSaleOrders.ts
git commit -m "feat(ui): add PDF quotation download to SoDetailDialog with Arabic font support"
```
