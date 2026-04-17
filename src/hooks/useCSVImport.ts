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
      const valid = rows.filter((r) => r._valid)
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

          const { data: po, error: poErr } = await (supabase as any)
            .from('purchase_orders')
            .insert({
              po_number: poNumber,
              supplier_name: firstRow.supplier_name,
              supplier_id: 'unknown',
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

      const groups = new Map<string, ParsedRow[]>()
      for (const row of valid) {
        const key = row.group_key
          ? String(row.group_key)
          : `${row.customer_name}_${row.created_date ?? 'nodate'}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

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
