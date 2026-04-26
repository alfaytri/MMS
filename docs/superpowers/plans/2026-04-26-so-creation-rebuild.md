# SO Creation Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the create-SO page's notes-packing workaround with proper schema columns, rebuild the line items editor to match the PO typed-group pattern, add server-side credit-check approval, and add PDF quotation download.

**Architecture:** Two migrations add dedicated columns and the credit-check RPC. `SoLineItemsEditor` is rewritten to use `CascadeInventorySelector` (already used by PO) with `selling_price`. The create-SO page mirrors the PO sticky-header layout. Credit approval is fully server-side — the RPC decides `approved` vs `pending_approval`. PDF generation uses `@react-pdf/renderer` client-side with a `PDFDownloadLink`.

**Tech Stack:** Next.js 15 App Router · Supabase postgres · TanStack React Query v5 · shadcn/ui · @react-pdf/renderer

**Prerequisite:** Plan `2026-04-26-so-credit-groups.md` must be fully applied first — this plan depends on the `credit_groups` table and the `credit_group_id` FK on `customers`.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260427000002_sale_orders_columns.sql` | Create |
| `supabase/migrations/20260427000003_rpc_check_so_credit.sql` | Create |
| `src/components/sales/SoLineItemsEditor.tsx` | Rewrite |
| `src/components/sales/SoTermsSection.tsx` | Modify — add `validity_days` field |
| `src/hooks/useSaleOrders.ts` | Modify — new types + credit-check fn |
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

-- Add pending_approval to the sale_order_status enum if not already present
ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- Dedicated columns on sale_orders — replace the notes-packing workaround
ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS currency            TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_delivery   DATE,
  ADD COLUMN IF NOT EXISTS payment_terms       TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_milestones  JSONB,
  ADD COLUMN IF NOT EXISTS delivery_terms      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes      TEXT,
  ADD COLUMN IF NOT EXISTS validity_days       INTEGER NOT NULL DEFAULT 30;

-- Dedicated columns on sale_order_lines
ALTER TABLE sale_order_lines
  ADD COLUMN IF NOT EXISTS line_type          TEXT NOT NULL DEFAULT 'products',
  ADD COLUMN IF NOT EXISTS unit               TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS tool_asset_item_id UUID REFERENCES tool_asset_items(id),
  ADD COLUMN IF NOT EXISTS avg_cost           NUMERIC;

COMMIT;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: migration applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000002_sale_orders_columns.sql
git commit -m "feat(db): add dedicated columns to sale_orders and sale_order_lines"
```

---

### Task 2: Database migration — credit check RPC

**Files:**
- Create: `supabase/migrations/20260427000003_rpc_check_so_credit.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260427000003_rpc_check_so_credit.sql
BEGIN;

CREATE OR REPLACE FUNCTION check_and_reserve_so_credit(
  p_customer_id UUID,
  p_so_amount   NUMERIC,
  p_so_id       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_limit NUMERIC;
  v_group_name   TEXT;
  v_open_total   NUMERIC;
  v_available    NUMERIC;
BEGIN
  SELECT cg.credit_limit, cg.name
  INTO   v_credit_limit, v_group_name
  FROM   customers c
  JOIN   credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'approved', false,
      'reason',   'no_credit_group'
    );
  END IF;

  -- Sum all non-cancelled outstanding totals.
  -- Includes 'delivered' so unpaid-but-fulfilled orders still consume credit.
  SELECT COALESCE(SUM(total), 0)
  INTO   v_open_total
  FROM   sale_orders
  WHERE  customer_id = p_customer_id
    AND  status NOT IN ('cancelled')
    AND  deleted_at IS NULL
    AND  (p_so_id IS NULL OR id != p_so_id);

  v_available := v_credit_limit - v_open_total;

  IF p_so_amount <= v_available THEN
    RETURN jsonb_build_object(
      'approved',      true,
      'auto_approved', true,
      'credit_limit',  v_credit_limit,
      'group_name',    v_group_name,
      'open_total',    v_open_total,
      'available',     v_available
    );
  ELSE
    RETURN jsonb_build_object(
      'approved',      false,
      'auto_approved', false,
      'reason',        'credit_exceeded',
      'credit_limit',  v_credit_limit,
      'group_name',    v_group_name,
      'open_total',    v_open_total,
      'available',     v_available
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_reserve_so_credit(UUID, NUMERIC, UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Push migration**

```bash
npx supabase db push --linked
```

Expected: function created, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000003_rpc_check_so_credit.sql
git commit -m "feat(db): add check_and_reserve_so_credit RPC"
```

---

### Task 3: Install @react-pdf/renderer

- [ ] **Step 1: Install the package**

```bash
cd D:/MMS && npm install @react-pdf/renderer
```

Expected: package added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @react-pdf/renderer for quotation PDF"
```

---

### Task 4: Extend types and add credit-check helper in useSaleOrders

**Files:**
- Modify: `src/hooks/useSaleOrders.ts`

The goal is to (a) add new typed fields to `SaleOrder` and `SOLineItem`, (b) update `SOLineItemDraft` and `CreateSOPayload` to carry the new columns, and (c) add a `checkSOCredit` async helper.

- [ ] **Step 1: Update types and CreateSOPayload**

In `src/hooks/useSaleOrders.ts`:

Replace the `SOLineItem` type with:

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
  brand_variant_id:    string | null
  tool_asset_item_id:  string | null
  line_type:           string
  avg_cost:            number | null
  created_at:          string
}
```

Replace the `SaleOrder` type block's fields (keep existing fields, add new ones):

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
  // new dedicated columns
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
  // legacy (kept for old records)
  notes:                    string | null
  created_by_name:          string | null
  created_at:               string
  updated_at:               string
  deleted_at:               string | null
  // joined
  sale_order_lines?:        SOLineItem[]
  sale_deliveries?:         SaleDelivery[]
  customer_name?:           string
  customer_phone?:          string
}
```

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
  avg_cost?:          number
}
```

Replace `CreateSOPayload`:

```ts
export type CreateSOPayload = {
  customer_id:          string
  customer_name:        string
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
```

- [ ] **Step 2: Add checkSOCredit helper**

Add this function after the `hasNegativeMargin` helper:

```ts
export type CreditCheckResult = {
  approved:      boolean
  auto_approved?: boolean
  reason?:        'no_credit_group' | 'credit_exceeded'
  credit_limit?:  number
  group_name?:    string
  open_total?:    number
  available?:     number
}

export async function checkSOCredit(
  customerId: string,
  soAmount:   number,
  soId?:      string
): Promise<CreditCheckResult> {
  const supabase = createClient()
  const { data, error } = await (supabase as any).rpc('check_and_reserve_so_credit', {
    p_customer_id: customerId,
    p_so_amount:   soAmount,
    p_so_id:       soId ?? null,
  })
  if (error) throw error
  return data as CreditCheckResult
}
```

- [ ] **Step 3: Update useCreateSO to pass new columns**

In the `useCreateSO` mutationFn, replace the `.insert({...})` block:

```ts
const { data: so, error: soErr } = await (supabase as any)
  .from('sale_orders')
  .insert({
    so_number,
    customer_id:          payload.customer_id,
    status:               'quotation',
    subtotal,
    tax:                  0,
    total,
    discount_amount:      payload.discount_amount,
    discount_label:       payload.discount_label,
    discount_type:        payload.discount_type,
    discount_amount_resolved: discountResolved,
    currency:             payload.currency,
    exchange_rate:        payload.exchange_rate,
    expected_delivery:    payload.expected_delivery,
    payment_terms:        payload.payment_terms,
    payment_terms_notes:  payload.payment_terms_notes,
    payment_milestones:   payload.payment_milestones,
    delivery_terms:       payload.delivery_terms,
    delivery_terms_notes: payload.delivery_terms_notes,
    customer_notes:       payload.customer_notes,
    validity_days:        payload.validity_days,
    notes:                null,
  })
  .select()
  .single()
if (soErr) throw soErr
```

And update the `sale_order_lines` insert to include new fields:

```ts
const { error: liErr } = await (supabase as any)
  .from('sale_order_lines')
  .insert(
    payload.line_items.map(({ avg_cost: _unused, ...li }) => ({
      ...li,
      sale_order_id: so.id,
    }))
  )
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "useSaleOrders" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSaleOrders.ts
git commit -m "feat(hooks): extend SaleOrder types + add checkSOCredit helper"
```

---

### Task 5: Rebuild SoLineItemsEditor with typed groups

**Files:**
- Rewrite: `src/components/sales/SoLineItemsEditor.tsx`

This mirrors `PoLineItemsEditor` exactly — same 4 groups, same components — but uses `selling_price` instead of `cost_price`, drops `free_qty`, and uses `total` (not `total_price`) to match `SOLineItemDraft`.

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

interface TypeConfig {
  label:       string
  icon:        ElementType
  headerClass: string
  buttonClass: string
}

const TYPE_CONFIG: Record<SoLineType, TypeConfig> = {
  products: {
    label:       'Products',
    icon:        ShoppingBag,
    headerClass: 'bg-blue-500/10 text-blue-700 border-b border-blue-200',
    buttonClass: 'border-blue-300 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20',
  },
  'spare-parts': {
    label:       'Spare Parts',
    icon:        Cog,
    headerClass: 'bg-amber-500/10 text-amber-700 border-b border-amber-200',
    buttonClass: 'border-amber-300 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20',
  },
  consumables: {
    label:       'Consumables',
    icon:        Droplets,
    headerClass: 'bg-green-500/10 text-green-700 border-b border-green-200',
    buttonClass: 'border-green-300 bg-green-500/10 text-green-700 hover:bg-green-500/20',
  },
  tools: {
    label:       'Tools & Assets',
    icon:        Wrench,
    headerClass: 'bg-purple-500/10 text-purple-700 border-b border-purple-200',
    buttonClass: 'border-purple-300 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20',
  },
}

const ALL_TYPES: SoLineType[] = ['products', 'spare-parts', 'consumables', 'tools']

function makeRow(line_type: SoLineType): SoLineItemRow {
  return {
    _key:               crypto.randomUUID(),
    line_type,
    item_name:          '',
    sku:                '',
    qty:                1,
    unit:               'pcs',
    unit_price:         0,
    total:              0,
    brand_variant_id:   null,
    tool_asset_item_id: null,
  }
}

interface SoLineItemsEditorProps {
  value:           SoLineItemRow[]
  onChange:        (rows: SoLineItemRow[]) => void
  currency:        string
  readOnly?:       boolean
  onPriceLoading?: (loading: boolean) => void
}

export function SoLineItemsEditor({
  value,
  onChange,
  currency,
  readOnly = false,
  onPriceLoading,
}: SoLineItemsEditorProps) {
  const priceLoadingKeys = useRef(new Set<string>())

  function handleRowPriceLoading(key: string, loading: boolean) {
    loading
      ? priceLoadingKeys.current.add(key)
      : priceLoadingKeys.current.delete(key)
    onPriceLoading?.(priceLoadingKeys.current.size > 0)
  }

  function addRow(line_type: SoLineType) {
    onChange([...value, makeRow(line_type)])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<SoLineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, {
        item_name: '', sku: '', unit: 'pcs', unit_price: 0,
        total: 0, brand_variant_id: null,
      })
      return
    }
    const existingRow = value.find((r) => r._key === key)
    updateRow(key, {
      item_name:          item.item_name,
      sku:                existingRow?.sku?.trim() ? existingRow.sku : (item.sku ?? ''),
      unit:               item.unit,
      unit_price:         item.selling_price,   // ← selling_price, not cost_price
      total:              item.selling_price,
      brand_variant_id:   item.brand_variant_id,
      tool_asset_item_id: null,
      avg_cost:           item.cost_price,      // kept for margin check
    })
  }

  function handleToolSelect(key: string, item: ToolAssetLookupResult | null) {
    if (!item) {
      updateRow(key, {
        item_name: '', sku: '', unit: 'pcs', unit_price: 0,
        total: 0, tool_asset_item_id: null,
      })
      return
    }
    updateRow(key, {
      item_name:          item.item_name,
      tool_asset_item_id: item.tool_asset_item_id,
      brand_variant_id:   null,
    })
  }

  const groupedTypes = ALL_TYPES.filter((t) => value.some((r) => r.line_type === t))

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            ADD ITEM:
          </span>
          {ALL_TYPES.map((t) => {
            const cfg = TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <Button
                key={t}
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 text-xs gap-1.5 ${cfg.buttonClass}`}
                onClick={() => addRow(t)}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
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
        const cfg = TYPE_CONFIG[lineType]
        const Icon = cfg.icon
        const rows = value.filter((r) => r.line_type === lineType)

        return (
          <div key={lineType} className="border rounded-lg overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-2 ${cfg.headerClass}`}>
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{cfg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                  {rows.length} item{rows.length !== 1 ? 's' : ''}
                </Badge>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => addRow(lineType)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Item Name</span>
              <span>SKU</span>
              <span>Qty *</span>
              <span>Unit</span>
              <span>Unit Price *</span>
              <span>Total</span>
            </div>

            <div className="divide-y">
              {rows.map((row) => {
                const isInventory = lineType !== 'tools'
                return (
                  <div key={row._key} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        {readOnly ? (
                          <div className="h-8 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
                            {row.item_name || '—'}
                          </div>
                        ) : isInventory ? (
                          <CascadeInventorySelector
                            lineType={lineType}
                            value={
                              row.brand_variant_id
                                ? {
                                    brand_variant_id: row.brand_variant_id,
                                    item_name:        row.item_name,
                                    item_name_ar:     null,
                                    sku:              row.sku,
                                    unit:             row.unit,
                                    cost_price:       row.avg_cost ?? 0,
                                    selling_price:    row.unit_price,
                                    category_name:    null,
                                    category_name_ar: null,
                                    brand:            null,
                                  }
                                : null
                            }
                            onChange={(item) => handleInventorySelect(row._key, item)}
                            onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
                          />
                        ) : (
                          <ToolAssetLookup
                            value={
                              row.tool_asset_item_id
                                ? { tool_asset_item_id: row.tool_asset_item_id, item_name: row.item_name }
                                : null
                            }
                            onChange={(item) => handleToolSelect(row._key, item)}
                          />
                        )}
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0"
                          onClick={() => removeRow(row._key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 items-center">
                      <div />
                      <Input
                        className="h-7 text-xs"
                        placeholder="SKU"
                        value={row.sku}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={1}
                        className="h-7 text-xs text-right"
                        value={row.qty}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                      />
                      <Input
                        className="h-7 text-xs"
                        placeholder="pcs"
                        value={row.unit}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { unit: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-7 text-xs text-right"
                        value={row.unit_price}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                      />
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
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoLineItemsEditor" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoLineItemsEditor.tsx
git commit -m "feat(ui): rebuild SoLineItemsEditor with typed groups matching PO pattern"
```

---

### Task 6: Add validity_days to SoTermsSection

**Files:**
- Modify: `src/components/sales/SoTermsSection.tsx`

- [ ] **Step 1: Add validity_days to the interface and render**

Add `validity_days: number` to `SoTermsValues`:

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

Add a `DEFAULT_TERMS` export constant (used by the create page):

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

In the JSX, after the `customer_notes` textarea, add a Validity Days field:

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
  <p className="text-xs text-muted-foreground">
    How long this quotation remains valid from issue date
  </p>
</div>
```

Also add `Input` to imports: `import { Input } from '@/components/ui/input'`

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoTermsSection" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoTermsSection.tsx
git commit -m "feat(ui): add validity_days field to SoTermsSection"
```

---

### Task 7: Rewrite create-SO page

**Files:**
- Rewrite: `src/app/(dashboard)/sales/create-so/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/(dashboard)/sales/create-so/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Save, CheckCircle2,
  Users, Package, AlertTriangle,
} from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { SoLineItemsEditor, type SoLineItemRow } from '@/components/sales/SoLineItemsEditor'
import { SoTermsSection, DEFAULT_TERMS, type SoTermsValues } from '@/components/sales/SoTermsSection'
import {
  useCreateSO,
  useCustomers,
  useCreateCustomer,
  checkSOCredit,
  calcSOSubtotal,
  calcSOTotal,
  hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { formatCurrency } from '@/lib/utils/formatters'

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const
const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
const CURRENCY_NAMES: Record<string, string> = {
  QAR: 'Qatari Riyal', USD: 'US Dollar', EUR: 'Euro',
  GBP: 'British Pound', AED: 'UAE Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar',
}

function sym(c: string) { return CURRENCY_SYMBOLS[c] ?? `${c} ` }

function fmtAmt(amount: number, currency: string) {
  return `${sym(currency)}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreateSOPage() {
  const router = useRouter()
  const createSO = useCreateSO()
  const createCustomer = useCreateCustomer()

  // Customer
  const [customerSearch, setCustomerSearch]   = useState('')
  const [customerId, setCustomerId]           = useState('')
  const [customerName, setCustomerName]       = useState('')
  const [customerCreditGroupId, setCustomerCreditGroupId]   = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]       = useState<number | null>(null)
  const [customerOpen, setCustomerOpen]       = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')

  // Order fields
  const [currency, setCurrency]               = useState('QAR')
  const [exchangeRate, setExchangeRate]       = useState(1)
  const [lineItems, setLineItems]             = useState<SoLineItemRow[]>([])
  const [terms, setTerms]                     = useState<SoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount]   = useState(0)
  const [discountLabel, setDiscountLabel]     = useState('')
  const [isPriceLoading, setIsPriceLoading]   = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)

  const subtotal = calcSOSubtotal(lineItems)
  const total    = calcSOTotal(subtotal, discountAmount, 'fixed')
  const negativeMargin = hasNegativeMargin(lineItems)

  const noCreditGroup = customerId !== '' && customerCreditGroupId === null

  function handleSelectCustomer(c: {
    id: string; name: string;
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
  }) {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerOpen(false)
  }

  function handleAddCustomer() {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      toast.error('Name and phone are required')
      return
    }
    createCustomer.mutate(
      { name: newCustomerName.trim(), email: newCustomerEmail || null },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          handleSelectCustomer({
            id: data.id, name: data.name,
            credit_group_id: data.credit_group_id ?? null,
          })
          setAddCustomerOpen(false)
          setNewCustomerName('')
          setNewCustomerPhone('')
          setNewCustomerEmail('')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function validate() {
    if (!customerId)             { toast.error('Please select a customer'); return false }
    if (noCreditGroup)           { toast.error('Customer has no credit group assigned'); return false }
    if (lineItems.length === 0)  { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) {
      toast.error('All line items need an item name'); return false
    }
    return true
  }

  function buildPayload(statusOverride?: string) {
    return {
      customer_id:          customerId,
      customer_name:        customerName,
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

  async function saveQuotation() {
    if (!validate()) return
    try {
      const creditResult = await checkSOCredit(customerId, total * exchangeRate)
      const so = await createSO.mutateAsync(buildPayload())
      if (!creditResult.approved) {
        // Update status to pending_approval
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        await (supabase as any)
          .from('sale_orders')
          .update({ status: 'pending_approval' })
          .eq('id', so.id)
        toast.warning(
          `Order saved — exceeds credit limit (available: ${fmtAmt(creditResult.available ?? 0, 'QAR')}). Sent for owner approval.`
        )
      } else {
        toast.success('Saved as quotation')
      }
      router.push('/sales/orders')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function confirmOrder() {
    if (!validate()) return
    try {
      const creditResult = await checkSOCredit(customerId, total * exchangeRate)
      if (!creditResult.approved) {
        toast.error(
          `Cannot confirm — exceeds credit limit. Available: ${fmtAmt(creditResult.available ?? 0, 'QAR')}`
        )
        return
      }
      const so = await createSO.mutateAsync(buildPayload())
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', so.id)
      toast.success('Order confirmed')
      router.push('/sales/orders')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const isPending = createSO.isPending
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={saveQuotation}
            disabled={isPending || isPriceLoading || noCreditGroup}
          >
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Saving…' : 'Save as Quotation'}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={confirmOrder}
            disabled={isPending || isPriceLoading || noCreditGroup}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isPending ? 'Confirming…' : 'Confirm Order'}
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Customer */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            Customer
          </h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                CUSTOMER *
              </label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger
                  className="h-9 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  render={(props) => <button type="button" {...props} />}
                >
                  <span className={customerName ? '' : 'text-muted-foreground'}>
                    {customerName || 'Search customers…'}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search customers..."
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {(customers ?? []).map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => handleSelectCustomer(c)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${customerId === c.id ? 'opacity-100' : 'opacity-0'}`}
                            />
                            <div className="flex-1">
                              <span>{c.name}</span>
                              {!c.credit_group_id && (
                                <span className="ml-2 text-[10px] text-destructive">No credit group</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Add new customer"
              onClick={() => setAddCustomerOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Credit group info / error */}
          {customerId && (
            noCreditGroup ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This customer has no credit group assigned. Go to Master Data → Customers to assign one before creating an order.
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
                <span>Credit limit: {fmtAmt(customerCreditLimit ?? 0, 'QAR')}</span>
              </div>
            )
          )}
        </section>

        <Separator />

        {/* ② Currency */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                CURRENCY
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{sym(c)}{c} — {CURRENCY_NAMES[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                SUBTOTAL ({currency})
              </label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                {fmtAmt(subtotal, currency)}
              </div>
            </div>
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  GRAND TOTAL ({currency})
                </label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                  {fmtAmt(total, currency)}
                </div>
              </div>
            )}
          </div>
          {currency !== 'QAR' && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Exchange Rate (to QAR)
              </label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                className="h-8 w-32 text-sm"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
          )}
        </section>

        <Separator />

        {/* ③ Line Items */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" />
              Line Items
            </h2>
            <Badge variant="outline" className="text-[9px]">{validCount} valid</Badge>
            {negativeMargin && (
              <Badge variant="outline" className="text-[9px] border-warning text-warning gap-1">
                <AlertTriangle className="h-3 w-3" /> Negative margin
              </Badge>
            )}
          </div>
          <SoLineItemsEditor
            value={lineItems}
            onChange={setLineItems}
            currency={currency}
            onPriceLoading={setIsPriceLoading}
          />
        </section>

        <Separator />

        {/* ④ Discount */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g. Volume Discount"
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Amount ({currency})
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-9 text-sm"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
              />
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
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name *</label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phone *</label>
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="+974 XXXX XXXX"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <Input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? 'Adding…' : 'Add Customer'}
            </Button>
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

Navigate to Sales → Sale Orders → Create. Verify:
- Customer combobox loads, selecting a customer with no credit group shows the blocking error
- Selecting a customer with a group shows the credit group badge
- Both buttons are disabled when no credit group is selected
- Line items — click "Products", cascade selector opens, selecting a variant populates `selling_price` (not cost)
- Save as Quotation fires the credit check RPC; if within limit, redirects with success toast

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/sales/create-so/page.tsx
git commit -m "feat(ui): rebuild create-SO page — PO layout, typed line items, credit check"
```

---

### Task 8: PDF Quotation component

**Files:**
- Create: `src/components/sales/SoQuotationPdf.tsx`

`@react-pdf/renderer` cannot run during SSR. The component is marked `'use client'` and only imported dynamically in the dialog.

- [ ] **Step 1: Create the PDF component**

```tsx
// src/components/sales/SoQuotationPdf.tsx
'use client'

import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'
import type { SaleOrder, SOLineItem } from '@/hooks/useSaleOrders'

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
  page:          { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#111827' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo:          { width: 80, height: 40, objectFit: 'contain' },
  docTitle:      { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1d4ed8', marginBottom: 4 },
  docMeta:       { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  section:       { marginBottom: 14 },
  sectionLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b7280', marginBottom: 4 },
  billTo:        { fontSize: 9, color: '#111827', lineHeight: 1.5 },
  groupHeader:   { backgroundColor: '#eff6ff', paddingVertical: 4, paddingHorizontal: 6, marginBottom: 2, borderRadius: 2 },
  groupLabel:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },
  tableRow:      { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHeader:   { backgroundColor: '#f9fafb' },
  col_num:       { width: '5%',  fontSize: 8, color: '#6b7280' },
  col_item:      { width: '35%', fontSize: 8 },
  col_sku:       { width: '15%', fontSize: 8, color: '#6b7280' },
  col_qty:       { width: '8%',  fontSize: 8, textAlign: 'right' },
  col_unit:      { width: '8%',  fontSize: 8, textAlign: 'center', color: '#6b7280' },
  col_price:     { width: '14%', fontSize: 8, textAlign: 'right' },
  col_total:     { width: '15%', fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  divider:       { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 10 },
  totalsRow:     { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  totalsLabel:   { width: 100, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 8 },
  totalsValue:   { width: 100, fontSize: 9, textAlign: 'right' },
  grandRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  grandLabel:    { width: 100, fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', paddingRight: 8 },
  grandValue:    { width: 100, fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  termsRow:      { flexDirection: 'row', marginBottom: 3 },
  termsKey:      { width: 120, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151' },
  termsVal:      { flex: 1, fontSize: 8, color: '#6b7280' },
  footer:        { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerText:    { fontSize: 7, color: '#9ca3af' },
})

const LINE_TYPES = ['products', 'spare-parts', 'consumables', 'tools'] as const
const TYPE_LABELS: Record<string, string> = {
  products: 'Products', 'spare-parts': 'Spare Parts', consumables: 'Consumables', tools: 'Tools & Assets',
}

interface Props {
  so:            SaleOrder
  lines:         SOLineItem[]
  customerName:  string
  customerPhone: string | null
}

export function QuotationDocument({ so, lines, customerName, customerPhone }: Props) {
  const currency = so.currency ?? 'QAR'
  const validityDays = so.validity_days ?? 30

  const presentTypes = LINE_TYPES.filter((t) => lines.some((l) => l.line_type === t))

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Image style={s.logo} src="/logo.png" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.docTitle}>QUOTATION</Text>
            <Text style={s.docMeta}>No: {so.so_number}</Text>
            <Text style={s.docMeta}>Date: {formatDate(so.created_at)}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Bill To */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Bill To</Text>
          <Text style={s.billTo}>{customerName}</Text>
          {customerPhone && <Text style={s.billTo}>{customerPhone}</Text>}
        </View>

        {/* Line item groups */}
        {presentTypes.map((lineType) => {
          const rows = lines.filter((l) => l.line_type === lineType)
          return (
            <View key={lineType} style={s.section} wrap={false}>
              <View style={s.groupHeader}>
                <Text style={s.groupLabel}>{TYPE_LABELS[lineType]}</Text>
              </View>
              {/* Column headers */}
              <View style={[s.tableRow, s.tableHeader]}>
                <Text style={s.col_num}>#</Text>
                <Text style={s.col_item}>Item Name</Text>
                <Text style={s.col_sku}>SKU</Text>
                <Text style={s.col_qty}>Qty</Text>
                <Text style={s.col_unit}>Unit</Text>
                <Text style={s.col_price}>Unit Price</Text>
                <Text style={s.col_total}>Total</Text>
              </View>
              {rows.map((li, idx) => (
                <View key={li.id} style={s.tableRow}>
                  <Text style={s.col_num}>{idx + 1}</Text>
                  <Text style={s.col_item}>{li.item_name}</Text>
                  <Text style={s.col_sku}>{li.sku ?? '—'}</Text>
                  <Text style={s.col_qty}>{li.qty}</Text>
                  <Text style={s.col_unit}>{li.unit}</Text>
                  <Text style={s.col_price}>{fmt(li.unit_price, currency)}</Text>
                  <Text style={s.col_total}>{fmt(li.total, currency)}</Text>
                </View>
              ))}
            </View>
          )
        })}

        <View style={s.divider} />

        {/* Totals */}
        <View style={s.totalsRow}>
          <Text style={s.totalsLabel}>Subtotal</Text>
          <Text style={s.totalsValue}>{fmt(so.subtotal, currency)}</Text>
        </View>
        {(so.discount_amount_resolved > 0) && (
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>
              Discount{so.discount_label ? ` (${so.discount_label})` : ''}
            </Text>
            <Text style={[s.totalsValue, { color: '#dc2626' }]}>
              -{fmt(so.discount_amount_resolved, currency)}
            </Text>
          </View>
        )}
        <View style={s.grandRow}>
          <Text style={s.grandLabel}>Grand Total</Text>
          <Text style={s.grandValue}>{fmt(so.total, currency)}</Text>
        </View>

        <View style={s.divider} />

        {/* Terms */}
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
            <Text style={s.termsVal}>{validityDays} days from issue date</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Al Faytri Group</Text>
          <Text style={s.footerText}>{so.so_number} — {formatDate(so.created_at)}</Text>
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
git commit -m "feat(ui): add QuotationDocument PDF component using @react-pdf/renderer"
```

---

### Task 9: Add Download PDF to SoDetailDialog

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx`

The PDF download uses a dynamic import to avoid SSR.

- [ ] **Step 1: Add the download button**

At the top of `SoDetailDialog.tsx`, add the lazy import:

```ts
import dynamic from 'next/dynamic'

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFDownloadLink),
  { ssr: false }
)
const QuotationDocument = dynamic(
  () => import('./SoQuotationPdf').then((m) => m.QuotationDocument),
  { ssr: false }
) as any
```

In the `DialogHeader` section (after the existing action buttons), add the PDF button. Find the block that contains `canConfirm` and `canEdit` buttons and add after them:

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

- [ ] **Step 2: Update `useSaleOrder` select to include `customer_phone`**

In `src/hooks/useSaleOrders.ts`, in the `useSaleOrder` queryFn, update the select to include phone:

```ts
.select('*, sale_order_lines(*), sale_deliveries(*), customers(name, phone, email, customer_number)')
```

And update the mapping:

```ts
return {
  ...data,
  customer_name:  data.customers?.name  ?? null,
  customer_phone: data.customers?.phone ?? null,
} as SaleOrder
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep "SoDetailDialog\|useSaleOrders" | head -20
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

Open the dev server. Open an existing quotation from Sales → Sale Orders. Confirm:
- "Download PDF" button appears for quotations and pending-approval SOs
- Clicking it prepares and downloads a PDF named `Quotation-SO-XXXXX.pdf`
- PDF renders company logo, line items grouped by type, totals, and validity

- [ ] **Step 5: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx src/hooks/useSaleOrders.ts
git commit -m "feat(ui): add PDF quotation download to SoDetailDialog"
```
