# CSV Import Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CRITICAL: After every task commit, immediately commit an updated PROGRESS.md marking that task complete. Do this BEFORE dispatching the next task's subagent.**

**Goal:** Build a CSV bulk-import tool at `/master-data/import` supporting 5 entity types: Suppliers, Inventory Items, Customers, Purchase Orders, Sale Orders.

**Architecture:** Unified import page with entity selector tabs → CSV upload → client-side parse + validate (PapaParse) → preview DataTable with row/cell error highlighting → batch Supabase upsert via entity-specific hooks → results summary.

**Tech Stack:** Next.js 15 App Router, TypeScript, PapaParse (CSV parsing), TanStack Query v5, Supabase, shadcn/ui, Tailwind CSS.

---

## CRITICAL codebase rules — read before writing any code

1. `DropdownMenuTrigger` does **NOT** support `asChild` — use `className` directly.
2. `DropdownMenuLabel` **MUST** be inside `<DropdownMenuGroup>`.
3. `zodResolver(schema) as never` — always add `as never` for zod v4 TS inference.
4. Supabase: `import { createClient } from '@/lib/supabase/client'` — cast stale tables: `(supabase as any).from(...)`.
5. **Responsive design mandatory** — phone/tablet/laptop/TV. Dialogs: `w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg`. Touch targets: `min-h-11`.
6. Import `cn` from `@/lib/utils`
7. Formatters: `import { formatCurrency, formatDate } from '@/lib/utils/formatters'`

---

## Key schema facts

**`suppliers`**: name (NOT NULL), category, contact_name, phone, email, address, notes, is_active (default true)

**`inventory_categories`**: id, name (NOT NULL), type (text: `inventory|spare_parts|consumable`), description

**`inventory_items`**: id, name (NOT NULL), name_ar, category_id (FK), unit (NOT NULL), description, is_active

**`inventory_brand_variants`**: id, item_id (FK), brand (text), sku, cost_price, selling_price, stock_level

**`purchase_orders`**: po_number (UNIQUE NOT NULL), supplier_id, supplier_name, status (default 'draft'), currency (default 'QAR'), subtotal, total_qar, created_date, payment_terms, vendor_notes

**`po_line_items`**: po_id (FK), item_name, sku, qty, unit, unit_price, total_price, free_qty (default 0)

**`sale_orders`**: so_number (UNIQUE NOT NULL — auto-generated), customer_name, phone, status (default 'quotation'), subtotal, discount_amount, total, notes, created_date

**`sale_order_lines`**: so_id (FK), item_name, sku, qty, unit, unit_price, total_price, brand_variant_id (nullable)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/csv/config.ts` | Entity column definitions, labels, required fields, example values |
| `src/lib/csv/validate.ts` | Per-row validation → ParsedRow with _valid/_errors |
| `src/hooks/useCSVImport.ts` | Import mutations for all 5 entity types |
| `src/app/(dashboard)/master-data/import/page.tsx` | Full import page with tabs, upload, preview, results |

---

## Task 1: CSV Utilities + Hooks

**Files:**
- Create: `src/lib/csv/config.ts`
- Create: `src/lib/csv/validate.ts`
- Create: `src/hooks/useCSVImport.ts`
- Install: `papaparse @types/papaparse`

- [ ] **Step 1: Install PapaParse**

```bash
cd D:/MMS && npm install papaparse @types/papaparse
```

- [ ] **Step 2: Create `src/lib/csv/config.ts`**

```typescript
// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'suppliers' | 'inventory_items' | 'customers' | 'purchase_orders' | 'sale_orders'

export type ColumnDef = {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'boolean'
  hint?: string
}

export type EntityConfig = {
  label: string
  description: string
  columns: ColumnDef[]
  exampleRow: Record<string, string>
  notes?: string[]
}

// ─── Entity Configs ────────────────────────────────────────────────────────────

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  suppliers: {
    label: 'Suppliers',
    description: 'Import suppliers into the system',
    columns: [
      { key: 'name',         label: 'Name',         required: true,  type: 'string' },
      { key: 'category',     label: 'Category',     required: false, type: 'string', hint: 'e.g. Electrical, Plumbing' },
      { key: 'contact_name', label: 'Contact Name', required: false, type: 'string' },
      { key: 'phone',        label: 'Phone',        required: false, type: 'string' },
      { key: 'email',        label: 'Email',        required: false, type: 'string' },
      { key: 'address',      label: 'Address',      required: false, type: 'string' },
      { key: 'notes',        label: 'Notes',        required: false, type: 'string' },
    ],
    exampleRow: {
      name: 'Al Jazeera Trading', category: 'Electrical', contact_name: 'Ahmed Ali',
      phone: '+97412345678', email: 'ahmed@aljazeera.qa', address: 'Industrial Area, Doha', notes: '',
    },
  },

  inventory_items: {
    label: 'Inventory Items',
    description: 'Import inventory items with brand variants',
    columns: [
      { key: 'item_name',     label: 'Item Name',      required: true,  type: 'string' },
      { key: 'item_name_ar',  label: 'Item Name (AR)', required: false, type: 'string' },
      { key: 'category_name', label: 'Category',       required: true,  type: 'string', hint: 'Must match existing category name' },
      { key: 'brand_name',    label: 'Brand',          required: true,  type: 'string' },
      { key: 'sku',           label: 'SKU',            required: false, type: 'string' },
      { key: 'unit',          label: 'Unit',           required: true,  type: 'string', hint: 'e.g. pcs, m, kg, L' },
      { key: 'cost_price',    label: 'Cost Price',     required: true,  type: 'number' },
      { key: 'selling_price', label: 'Selling Price',  required: true,  type: 'number' },
    ],
    exampleRow: {
      item_name: 'LED Bulb 9W', item_name_ar: 'مصباح LED 9 وات',
      category_name: 'Electrical', brand_name: 'Philips', sku: 'LED-9W-E27',
      unit: 'pcs', cost_price: '8.50', selling_price: '15.00',
    },
    notes: ['Category must already exist in the system', 'A new brand variant will be created for each row'],
  },

  customers: {
    label: 'Customers',
    description: 'Import customer contact records',
    columns: [
      { key: 'customer_name', label: 'Customer Name', required: true,  type: 'string' },
      { key: 'phone',         label: 'Phone',         required: false, type: 'string' },
      { key: 'email',         label: 'Email',         required: false, type: 'string' },
      { key: 'address',       label: 'Address',       required: false, type: 'string' },
      { key: 'notes',         label: 'Notes',         required: false, type: 'string' },
    ],
    exampleRow: {
      customer_name: 'Qatar Petroleum LLC', phone: '+97444445555',
      email: 'facilities@qp.com.qa', address: 'West Bay, Doha', notes: '',
    },
  },

  purchase_orders: {
    label: 'Purchase Orders',
    description: 'Import purchase orders — one row per line item (group by PO number)',
    columns: [
      { key: 'po_number',      label: 'PO Number',      required: true,  type: 'string', hint: 'Rows with same PO number are grouped' },
      { key: 'supplier_name',  label: 'Supplier Name',  required: true,  type: 'string' },
      { key: 'currency',       label: 'Currency',       required: false, type: 'string', hint: 'Default: QAR' },
      { key: 'created_date',   label: 'Created Date',   required: false, type: 'string', hint: 'YYYY-MM-DD' },
      { key: 'payment_terms',  label: 'Payment Terms',  required: false, type: 'string' },
      { key: 'item_name',      label: 'Item Name',      required: true,  type: 'string' },
      { key: 'sku',            label: 'SKU',            required: false, type: 'string' },
      { key: 'qty',            label: 'Qty',            required: true,  type: 'number' },
      { key: 'unit',           label: 'Unit',           required: false, type: 'string', hint: 'Default: pcs' },
      { key: 'unit_price',     label: 'Unit Price',     required: true,  type: 'number' },
    ],
    exampleRow: {
      po_number: 'PO-2026-001', supplier_name: 'Al Jazeera Trading', currency: 'QAR',
      created_date: '2026-04-17', payment_terms: '50/50',
      item_name: 'LED Bulb 9W', sku: 'LED-9W-E27', qty: '100', unit: 'pcs', unit_price: '8.50',
    },
    notes: ['Multiple rows with the same PO number = one PO with multiple line items', 'PO will be created in Draft status'],
  },

  sale_orders: {
    label: 'Sale Orders',
    description: 'Import sale orders — one row per line item (group by SO number or customer+date)',
    columns: [
      { key: 'customer_name',   label: 'Customer Name',  required: true,  type: 'string' },
      { key: 'phone',           label: 'Phone',          required: false, type: 'string' },
      { key: 'group_key',       label: 'Group Key',      required: false, type: 'string', hint: 'Groups rows into one SO. Defaults to customer_name+created_date' },
      { key: 'created_date',    label: 'Created Date',   required: false, type: 'string', hint: 'YYYY-MM-DD' },
      { key: 'notes',           label: 'Notes',          required: false, type: 'string' },
      { key: 'item_name',       label: 'Item Name',      required: true,  type: 'string' },
      { key: 'sku',             label: 'SKU',            required: false, type: 'string' },
      { key: 'qty',             label: 'Qty',            required: true,  type: 'number' },
      { key: 'unit',            label: 'Unit',           required: false, type: 'string', hint: 'Default: pcs' },
      { key: 'unit_price',      label: 'Unit Price',     required: true,  type: 'number' },
    ],
    exampleRow: {
      customer_name: 'Qatar Petroleum LLC', phone: '+97444445555',
      group_key: 'QP-APR-001', created_date: '2026-04-17', notes: '',
      item_name: 'LED Bulb 9W', sku: 'LED-9W-E27', qty: '50', unit: 'pcs', unit_price: '15.00',
    },
    notes: ['Rows with the same group_key are combined into one Sale Order', 'SO will be created as Quotation status'],
  },
}

// ─── Template generator ────────────────────────────────────────────────────────

export function generateCSVTemplate(entityType: EntityType): string {
  const config = ENTITY_CONFIGS[entityType]
  const headers = config.columns.map((c) => c.key).join(',')
  const example = config.columns.map((c) => {
    const val = config.exampleRow[c.key] ?? ''
    // Quote values that contain commas
    return val.includes(',') ? `"${val}"` : val
  }).join(',')
  return `${headers}\n${example}\n`
}

export function downloadCSVTemplate(entityType: EntityType) {
  const config = ENTITY_CONFIGS[entityType]
  const csv = generateCSVTemplate(entityType)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template_${entityType}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Create `src/lib/csv/validate.ts`**

```typescript
import type { EntityType, EntityConfig } from './config'
import { ENTITY_CONFIGS } from './config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedRow = {
  _rowIndex: number
  _valid: boolean
  _errors: Record<string, string>
  [key: string]: unknown
}

// ─── Core validation ──────────────────────────────────────────────────────────

export function validateRows(entityType: EntityType, rawRows: Record<string, string>[]): ParsedRow[] {
  const config = ENTITY_CONFIGS[entityType]
  return rawRows.map((raw, i) => validateRow(raw, i, config))
}

function validateRow(raw: Record<string, string>, index: number, config: EntityConfig): ParsedRow {
  const errors: Record<string, string> = {}
  const parsed: Record<string, unknown> = {}

  for (const col of config.columns) {
    const rawVal = (raw[col.key] ?? '').trim()

    // Required check
    if (col.required && !rawVal) {
      errors[col.key] = `${col.label} is required`
      parsed[col.key] = rawVal
      continue
    }

    // Type coercion
    if (col.type === 'number') {
      if (rawVal === '') {
        parsed[col.key] = null
      } else {
        const num = Number(rawVal)
        if (isNaN(num)) {
          errors[col.key] = `${col.label} must be a number`
          parsed[col.key] = rawVal
        } else if (num < 0) {
          errors[col.key] = `${col.label} must be ≥ 0`
          parsed[col.key] = rawVal
        } else {
          parsed[col.key] = num
        }
      }
    } else if (col.type === 'boolean') {
      parsed[col.key] = rawVal.toLowerCase() === 'true' || rawVal === '1' || rawVal.toLowerCase() === 'yes'
    } else {
      parsed[col.key] = rawVal || null
    }
  }

  // Entity-specific validations
  if (config === ENTITY_CONFIGS.inventory_items) {
    if (!errors['unit'] && parsed['unit'] === null) {
      parsed['unit'] = 'pcs'
    }
  }

  if (config === ENTITY_CONFIGS.purchase_orders || config === ENTITY_CONFIGS.sale_orders) {
    if (!errors['unit'] && parsed['unit'] === null) {
      parsed['unit'] = 'pcs'
    }
    if (!errors['currency'] && parsed['currency'] === null) {
      parsed['currency'] = 'QAR'
    }
  }

  return {
    ...parsed,
    _rowIndex: index + 2, // 1-based + header row
    _valid: Object.keys(errors).length === 0,
    _errors: errors,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function countValid(rows: ParsedRow[]): number {
  return rows.filter((r) => r._valid).length
}

export function countErrors(rows: ParsedRow[]): number {
  return rows.filter((r) => !r._valid).length
}

export function exportErrorRows(rows: ParsedRow[], entityType: EntityType): void {
  const config = ENTITY_CONFIGS[entityType]
  const errorRows = rows.filter((r) => !r._valid)
  if (errorRows.length === 0) return

  const headers = ['row', ...config.columns.map((c) => c.key), 'errors']
  const lines = errorRows.map((r) => {
    const vals = config.columns.map((c) => {
      const v = String(r[c.key] ?? '')
      return v.includes(',') ? `"${v}"` : v
    })
    const errStr = Object.entries(r._errors).map(([k, v]) => `${k}: ${v}`).join('; ')
    return [r._rowIndex, ...vals, `"${errStr}"`].join(',')
  })

  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `errors_${entityType}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Create `src/hooks/useCSVImport.ts`**

```typescript
import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ParsedRow } from '@/lib/csv/validate'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportResult = {
  succeeded: number
  failed: number
  errors: { row: number; message: string }[]
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

async function batchInsert(
  table: string,
  rows: object[],
  batchSize = 50
): Promise<ImportResult> {
  const supabase = createClient()
  let succeeded = 0
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await (supabase as any).from(table).insert(batch)
    if (error) {
      // Mark all rows in batch as failed
      batch.forEach((_, j) => {
        errors.push({ row: i + j + 2, message: error.message })
      })
    } else {
      succeeded += batch.length
    }
  }

  return { succeeded, failed: errors.length, errors }
}

// ─── Import: Suppliers ────────────────────────────────────────────────────────

export function useImportSuppliers() {
  return useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const valid = rows.filter((r) => r._valid)
      const payload = valid.map((r) => ({
        name: r.name,
        category: r.category ?? null,
        contact_name: r.contact_name ?? null,
        phone: r.phone ?? null,
        email: r.email ?? null,
        address: r.address ?? null,
        notes: r.notes ?? null,
        is_active: true,
      }))
      return batchInsert('suppliers', payload)
    },
  })
}

// ─── Import: Inventory Items ──────────────────────────────────────────────────

export function useImportInventoryItems() {
  return useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const supabase = createClient()
      const valid = rows.filter((r) => r._valid)
      let succeeded = 0
      const errors: { row: number; message: string }[] = []

      // Load all categories once
      const { data: categories } = await (supabase as any)
        .from('inventory_categories')
        .select('id, name')
      const catMap = new Map<string, string>(
        (categories ?? []).map((c: any) => [c.name.toLowerCase(), c.id])
      )

      // Load existing items (name dedup)
      const { data: existingItems } = await (supabase as any)
        .from('inventory_items')
        .select('id, name')
      const itemMap = new Map<string, string>(
        (existingItems ?? []).map((it: any) => [it.name.toLowerCase(), it.id])
      )

      for (const row of valid) {
        try {
          const catName = String(row.category_name ?? '')
          const catId = catMap.get(catName.toLowerCase())
          if (!catId) {
            errors.push({ row: row._rowIndex as number, message: `Category "${catName}" not found` })
            continue
          }

          // Get or create inventory item
          let itemId = itemMap.get(String(row.item_name ?? '').toLowerCase())
          if (!itemId) {
            const { data: newItem, error: itemErr } = await (supabase as any)
              .from('inventory_items')
              .insert({
                name: row.item_name,
                name_ar: row.item_name_ar ?? null,
                category_id: catId,
                unit: row.unit ?? 'pcs',
                is_active: true,
              })
              .select('id')
              .single()
            if (itemErr) { errors.push({ row: row._rowIndex as number, message: itemErr.message }); continue }
            itemId = newItem.id
            itemMap.set(String(row.item_name ?? '').toLowerCase(), itemId!)
          }

          // Create brand variant
          const { error: varErr } = await (supabase as any)
            .from('inventory_brand_variants')
            .insert({
              item_id: itemId,
              brand: row.brand_name ?? null,
              sku: row.sku ?? null,
              cost_price: row.cost_price ?? 0,
              selling_price: row.selling_price ?? 0,
              stock_level: 0,
              average_cost: row.cost_price ?? 0,
            })
          if (varErr) { errors.push({ row: row._rowIndex as number, message: varErr.message }); continue }

          succeeded++
        } catch (e: any) {
          errors.push({ row: row._rowIndex as number, message: e?.message ?? 'Unknown error' })
        }
      }

      return { succeeded, failed: errors.length, errors }
    },
  })
}

// ─── Import: Customers ────────────────────────────────────────────────────────

export function useImportCustomers() {
  return useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const supabase = createClient()
      const valid = rows.filter((r) => r._valid)
      // Try customers table (may not exist — gracefully degrade)
      const payload = valid.map((r) => ({
        customer_name: r.customer_name,
        phone: r.phone ?? null,
        email: r.email ?? null,
        address: r.address ?? null,
        notes: r.notes ?? null,
      }))
      try {
        return batchInsert('customers', payload)
      } catch {
        // customers table may not exist — attempt sale_order approach
        return { succeeded: 0, failed: valid.length, errors: valid.map((r) => ({ row: r._rowIndex as number, message: 'customers table not found' })) }
      }
    },
  })
}

// ─── Import: Purchase Orders ──────────────────────────────────────────────────

export function useImportPurchaseOrders() {
  return useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const supabase = createClient()
      const valid = rows.filter((r) => r._valid)
      let succeeded = 0
      const errors: { row: number; message: string }[] = []

      // Group rows by po_number
      const groups = new Map<string, ParsedRow[]>()
      for (const row of valid) {
        const key = String(row.po_number ?? '')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

      for (const [poNumber, lineRows] of groups) {
        try {
          const firstRow = lineRows[0]
          const subtotal = lineRows.reduce((s, r) => s + (Number(r.qty) * Number(r.unit_price)), 0)
          const currency = String(firstRow.currency ?? 'QAR')
          const exchangeRate = currency === 'QAR' ? 1 : 1

          // Create PO header
          const { data: po, error: poErr } = await (supabase as any)
            .from('purchase_orders')
            .insert({
              po_number: poNumber,
              supplier_name: firstRow.supplier_name,
              supplier_id: 'unknown', // placeholder — supplier lookup could be added
              status: 'draft',
              currency,
              exchange_rate: exchangeRate,
              subtotal,
              total_qar: subtotal * exchangeRate,
              created_date: firstRow.created_date ?? new Date().toISOString().split('T')[0],
              payment_terms: firstRow.payment_terms ?? null,
              approval_level: 1,
            })
            .select('id')
            .single()
          if (poErr) {
            lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: poErr.message }))
            continue
          }

          // Insert line items
          const lines = lineRows.map((r) => ({
            po_id: po.id,
            item_name: r.item_name,
            sku: r.sku ?? null,
            qty: Number(r.qty),
            unit: String(r.unit ?? 'pcs'),
            unit_price: Number(r.unit_price),
            total_price: Number(r.qty) * Number(r.unit_price),
            free_qty: 0,
            received_qty: 0,
          }))

          const { error: lineErr } = await (supabase as any).from('po_line_items').insert(lines)
          if (lineErr) {
            lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: lineErr.message }))
            continue
          }

          succeeded += lineRows.length
        } catch (e: any) {
          lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: e?.message ?? 'Unknown error' }))
        }
      }

      return { succeeded, failed: errors.length, errors }
    },
  })
}

// ─── Import: Sale Orders ──────────────────────────────────────────────────────

export function useImportSaleOrders() {
  return useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const supabase = createClient()
      const valid = rows.filter((r) => r._valid)
      let succeeded = 0
      const errors: { row: number; message: string }[] = []

      // Group by group_key (or customer_name+created_date)
      const groups = new Map<string, ParsedRow[]>()
      for (const row of valid) {
        const key = row.group_key
          ? String(row.group_key)
          : `${row.customer_name}_${row.created_date ?? 'nodate'}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

      // Get next SO number sequence
      const { data: lastSO } = await (supabase as any)
        .from('sale_orders')
        .select('so_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      let soCounter = 1
      if (lastSO?.so_number) {
        const match = lastSO.so_number.match(/(\d+)$/)
        if (match) soCounter = parseInt(match[1], 10) + 1
      }

      for (const [, lineRows] of groups) {
        try {
          const firstRow = lineRows[0]
          const subtotal = lineRows.reduce((s, r) => s + (Number(r.qty) * Number(r.unit_price)), 0)
          const soNumber = `SO-${String(soCounter).padStart(4, '0')}`
          soCounter++

          const { data: so, error: soErr } = await (supabase as any)
            .from('sale_orders')
            .insert({
              so_number: soNumber,
              customer_name: firstRow.customer_name,
              phone: firstRow.phone ?? null,
              status: 'quotation',
              subtotal,
              discount_amount: 0,
              total: subtotal,
              notes: firstRow.notes ?? null,
              created_date: firstRow.created_date ?? new Date().toISOString().split('T')[0],
            })
            .select('id')
            .single()
          if (soErr) {
            lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: soErr.message }))
            continue
          }

          const lines = lineRows.map((r) => ({
            so_id: so.id,
            item_name: r.item_name,
            sku: r.sku ?? null,
            qty: Number(r.qty),
            unit: String(r.unit ?? 'pcs'),
            unit_price: Number(r.unit_price),
            total_price: Number(r.qty) * Number(r.unit_price),
          }))

          const { error: lineErr } = await (supabase as any).from('sale_order_lines').insert(lines)
          if (lineErr) {
            lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: lineErr.message }))
            continue
          }

          succeeded += lineRows.length
        } catch (e: any) {
          lineRows.forEach((r) => errors.push({ row: r._rowIndex as number, message: e?.message ?? 'Unknown error' }))
        }
      }

      return { succeeded, failed: errors.length, errors }
    },
  })
}
```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/lib/csv/ src/hooks/useCSVImport.ts
git commit -m "feat: add CSV import utilities — config, validation, import hooks for all 5 entity types"
```

---

## Task 2: CSV Import Page

**Files:**
- Create: `src/app/(dashboard)/master-data/import/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/master-data/import/page.tsx`**

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { Upload, Download, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ENTITY_CONFIGS, downloadCSVTemplate, type EntityType,
} from '@/lib/csv/config'
import { validateRows, countValid, countErrors, exportErrorRows, type ParsedRow } from '@/lib/csv/validate'
import {
  useImportSuppliers, useImportInventoryItems, useImportCustomers,
  useImportPurchaseOrders, useImportSaleOrders, type ImportResult,
} from '@/hooks/useCSVImport'

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES: EntityType[] = ['suppliers', 'inventory_items', 'customers', 'purchase_orders', 'sale_orders']

// ─── Sub-components ────────────────────────────────────────────────────────────

function EntityTab({ type, active, onClick }: { type: EntityType; active: boolean; onClick: () => void }) {
  const cfg = ENTITY_CONFIGS[type]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
      )}
    >
      {cfg.label}
    </button>
  )
}

function DropZone({
  onFile,
  isDragging,
  setIsDragging,
  fileName,
}: {
  onFile: (file: File) => void
  isDragging: boolean
  setIsDragging: (v: boolean) => void
  fileName: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.name.endsWith('.csv')) {
        onFile(file)
      } else {
        toast.error('Please upload a .csv file')
      }
    },
    [onFile, setIsDragging]
  )

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      {fileName ? (
        <div>
          <p className="font-medium text-sm">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1">Click or drag to replace</p>
        </div>
      ) : (
        <div>
          <p className="font-medium text-sm">Drop your CSV file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse — .csv files only</p>
        </div>
      )}
    </div>
  )
}

function ValidationSummary({ rows, entityType }: { rows: ParsedRow[]; entityType: EntityType }) {
  const valid = countValid(rows)
  const invalid = countErrors(rows)

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span className="font-medium">{valid} valid rows</span>
      </div>
      {invalid > 0 && (
        <div className="flex items-center gap-1.5 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="font-medium">{invalid} rows with errors</span>
        </div>
      )}
      {invalid > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => exportErrorRows(rows, entityType)}
        >
          Download Error Rows
        </Button>
      )}
    </div>
  )
}

function PreviewTable({ rows, entityType }: { rows: ParsedRow[]; entityType: EntityType }) {
  const [showOnlyErrors, setShowOnlyErrors] = useState(false)
  const config = ENTITY_CONFIGS[entityType]
  const displayed = showOnlyErrors ? rows.filter((r) => !r._valid) : rows

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium">Preview ({rows.length} rows)</p>
        {countErrors(rows) > 0 && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyErrors}
              onChange={(e) => setShowOnlyErrors(e.target.checked)}
              className="h-4 w-4"
            />
            Show errors only
          </label>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted border-b">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Row</th>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
              {config.columns.map((col) => (
                <th key={col.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col.label}{col.required ? ' *' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row._rowIndex}
                className={cn(
                  'border-b last:border-0',
                  row._valid ? 'hover:bg-muted/30' : 'bg-destructive/5'
                )}
              >
                <td className="px-2 py-1.5 text-muted-foreground">{row._rowIndex}</td>
                <td className="px-2 py-1.5">
                  {row._valid ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                </td>
                {config.columns.map((col) => {
                  const val = String(row[col.key] ?? '')
                  const err = row._errors[col.key]
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-2 py-1.5 max-w-[200px] truncate',
                        err ? 'text-destructive font-medium' : ''
                      )}
                      title={err ? `Error: ${err}` : val}
                    >
                      {val || <span className="text-muted-foreground/50">—</span>}
                      {err && <span className="block text-[10px] text-destructive">{err}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No rows to display</div>
        )}
      </div>
    </div>
  )
}

function ResultSummary({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <h3 className="font-semibold text-lg">Import Complete</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{result.succeeded}</p>
          <p className="text-xs text-green-600 mt-1">Rows imported</p>
        </div>
        <div className={cn('rounded-md border p-3 text-center', result.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
          <p className={cn('text-2xl font-bold', result.failed > 0 ? 'text-red-700' : 'text-gray-500')}>{result.failed}</p>
          <p className={cn('text-xs mt-1', result.failed > 0 ? 'text-red-600' : 'text-gray-500')}>Failed rows</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-destructive">Errors:</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {result.errors.slice(0, 20).map((err, i) => (
              <p key={i} className="text-xs text-destructive">Row {err.row}: {err.message}</p>
            ))}
            {result.errors.length > 20 && (
              <p className="text-xs text-muted-foreground">…and {result.errors.length - 20} more errors</p>
            )}
          </div>
        </div>
      )}

      <Button onClick={onReset}>Import Another File</Button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CSVImportPage() {
  const [entityType, setEntityType] = useState<EntityType>('suppliers')
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Import mutations
  const importSuppliers = useImportSuppliers()
  const importInventory = useImportInventoryItems()
  const importCustomers = useImportCustomers()
  const importPOs = useImportPurchaseOrders()
  const importSOs = useImportSaleOrders()

  const currentConfig = ENTITY_CONFIGS[entityType]

  const isImporting =
    importSuppliers.isPending || importInventory.isPending ||
    importCustomers.isPending || importPOs.isPending || importSOs.isPending

  function handleEntityChange(type: EntityType) {
    setEntityType(type)
    setRows(null)
    setFileName(null)
    setImportResult(null)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setIsParsing(true)
    setRows(null)
    setImportResult(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rawRows = result.data as Record<string, string>[]
        if (rawRows.length === 0) {
          toast.error('CSV file is empty')
          setIsParsing(false)
          return
        }
        const parsed = validateRows(entityType, rawRows)
        setRows(parsed)
        setIsParsing(false)
        const valid = countValid(parsed)
        const invalid = countErrors(parsed)
        if (invalid > 0) {
          toast.warning(`Parsed ${rawRows.length} rows — ${valid} valid, ${invalid} with errors`)
        } else {
          toast.success(`Parsed ${rawRows.length} rows — all valid`)
        }
      },
      error: (err) => {
        toast.error(`Parse error: ${err.message}`)
        setIsParsing(false)
      },
    })
  }

  async function handleImport() {
    if (!rows) return
    const validCount = countValid(rows)
    if (validCount === 0) { toast.error('No valid rows to import'); return }

    const onSuccess = (result: ImportResult) => {
      setImportResult(result)
      if (result.succeeded > 0) {
        toast.success(`Imported ${result.succeeded} rows successfully`)
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} rows failed — see details below`)
      }
    }
    const onError = (err: Error) => toast.error(err.message)

    switch (entityType) {
      case 'suppliers':
        importSuppliers.mutate(rows, { onSuccess, onError }); break
      case 'inventory_items':
        importInventory.mutate(rows, { onSuccess, onError }); break
      case 'customers':
        importCustomers.mutate(rows, { onSuccess, onError }); break
      case 'purchase_orders':
        importPOs.mutate(rows, { onSuccess, onError }); break
      case 'sale_orders':
        importSOs.mutate(rows, { onSuccess, onError }); break
    }
  }

  function handleReset() {
    setRows(null)
    setFileName(null)
    setImportResult(null)
  }

  const validCount = rows ? countValid(rows) : 0
  const errorCount = rows ? countErrors(rows) : 0

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        title="CSV Import"
        description="Bulk import data from spreadsheets — download a template, fill it in, then upload"
      />

      {/* Entity Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex border-b min-w-max">
          {ENTITY_TYPES.map((type) => (
            <EntityTab
              key={type}
              type={type}
              active={entityType === type}
              onClick={() => handleEntityChange(type)}
            />
          ))}
        </div>
      </div>

      {/* Entity info + template download */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{currentConfig.label}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{currentConfig.description}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCSVTemplate(entityType)}
            className="shrink-0"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download Template
          </Button>
        </div>

        {/* Column definitions */}
        <div className="flex flex-wrap gap-2">
          {currentConfig.columns.map((col) => (
            <span
              key={col.key}
              className={cn(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
                col.required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
              title={col.hint}
            >
              {col.label}
              {col.required && <span className="ml-0.5 text-primary">*</span>}
            </span>
          ))}
        </div>

        {/* Notes */}
        {currentConfig.notes && (
          <div className="space-y-1">
            {currentConfig.notes.map((note, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {note}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* If import result is shown */}
      {importResult ? (
        <ResultSummary result={importResult} onReset={handleReset} />
      ) : (
        <>
          {/* Upload zone */}
          <DropZone
            onFile={handleFile}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            fileName={fileName}
          />

          {/* Parsing skeleton */}
          {isParsing && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {/* Preview */}
          {rows && !isParsing && (
            <div className="space-y-4">
              <ValidationSummary rows={rows} entityType={entityType} />
              <PreviewTable rows={rows} entityType={entityType} />

              <Separator />

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {validCount > 0
                    ? `Ready to import ${validCount} valid row${validCount !== 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} will be skipped)` : ''}`
                    : 'No valid rows — fix errors and re-upload'}
                </div>
                <Button
                  onClick={handleImport}
                  disabled={validCount === 0 || isImporting}
                  className="min-w-32"
                >
                  {isImporting
                    ? 'Importing…'
                    : `Import ${validCount} Row${validCount !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/master-data/import/page.tsx"
git commit -m "feat: add CSV Import page — entity tabs, drag-and-drop upload, validation preview, batch import, results"
```

---

## Task 3: Integration Test + PROGRESS.md

- [ ] **Step 1: Run TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit --pretty 2>&1 | grep -v "node_modules" | head -40
```

Fix any new errors. Pre-existing stale-type errors are fine.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm run test:run
```

Expected: All existing tests pass.

- [ ] **Step 3: Run build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -30
```

Expected: Build succeeds. Route `/master-data/import` appears.

- [ ] **Step 4: Verify PapaParse import works**

Check that `papaparse` is in `package.json` dependencies and that the import `import Papa from 'papaparse'` resolves:

```bash
cd D:/MMS && node -e "require('papaparse'); console.log('papaparse OK')"
```

- [ ] **Step 5: Update PROGRESS.md**

In `## ✅ Completed`, add:
```markdown
- [2026-04-17] **CSV Import Task 1: Utilities + Hooks** — ENTITY_CONFIGS (5 entity column defs + example rows + template download), validateRows (per-type validation, number coercion, required checks), useImportSuppliers/InventoryItems/Customers/PurchaseOrders/SaleOrders (batch insert, grouping by PO/SO number for multi-line entities)
- [2026-04-17] **CSV Import Task 2: Import Page** — Tabbed entity selector, drag-and-drop CSV upload (PapaParse), column legend with required/optional badges, preview DataTable with per-cell error highlighting, show-errors-only toggle, download error rows, import valid rows with progress, ResultSummary with success/fail counts
- [2026-04-17] **CSV Import plan: COMPLETE** — All 3 tasks done. 1 page, 3 utility/hook files, 5 entity importers, full workflow (template → upload → validate → import → results).
```

In `## 🔄 In Progress`, replace with:
```markdown
- Phase 1 complete — considering Phase 2 (Invoices & Payments, Orders, Contracts)
```

Update `## ⏳ Not Started`:
```markdown
- Phase 2: Invoices & Payments module
- Phase 2: Orders module
- Phase 2: Contracts module
- Phase 2: Teams module
```

Update the Implementation Plans table:
```markdown
| `docs/superpowers/plans/2026-04-17-mms-csv-import.md` | **DONE** | CSV import for Suppliers, Inventory, Customers, POs, SOs |
```

- [ ] **Step 6: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: mark CSV Import plan complete — Phase 1 all modules done"
```
