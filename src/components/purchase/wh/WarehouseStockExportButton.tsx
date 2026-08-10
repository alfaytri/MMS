'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { exportSheetsToExcel, type ExcelColumn } from '@/lib/utils/exportToExcel'
import { toast } from 'sonner'

type StockExportRow = {
  sub_container_name: string | null
  category_name: string | null
  subcategory_name: string | null
  item_name: string
  brand: string | null
  country_name: string | null
  sku: string | null
  unit: string | null
  qty: number | null
  avg_cost: number | null
  total_value: number | null
}

const COLUMNS: ExcelColumn<StockExportRow>[] = [
  { header: 'Category', accessor: (r) => (r.subcategory_name ? `${r.category_name ?? '—'} / ${r.subcategory_name}` : (r.category_name ?? '—')) },
  { header: 'Item', accessor: (r) => r.item_name },
  { header: 'Brand', accessor: (r) => r.brand ?? '' },
  { header: 'Origin', accessor: (r) => r.country_name ?? '' },
  { header: 'SKU', accessor: (r) => r.sku ?? '' },
  { header: 'Unit', accessor: (r) => r.unit ?? '' },
  { header: 'Qty', accessor: (r) => r.qty ?? 0, format: 'number', total: true },
  { header: 'Avg Cost', accessor: (r) => r.avg_cost ?? 0, format: 'currency' },
  { header: 'Total Value', accessor: (r) => r.total_value ?? 0, format: 'currency', total: true },
]

interface Props {
  warehouseId: string
  warehouseName: string
  /** Selected sub-container; null = export every sub-container (one sheet each). */
  subContainerId?: string | null
  className?: string
}

/**
 * Per-warehouse stock export to Excel. When a sub-container is selected the
 * workbook has that one sheet; when "All" is selected each sub-container gets
 * its own sheet. Workbook is named after the warehouse. On-demand fetch — no
 * cost until clicked.
 */
export function WarehouseStockExportButton({ warehouseId, warehouseName, subContainerId, className }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    if (busy) return
    setBusy(true)
    try {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_stock_view')
        .select('sub_container_name, category_name, subcategory_name, item_name, brand, country_name, sku, unit, qty, avg_cost, total_value')
        .eq('warehouse_id', warehouseId)
        .order('sub_container_name', { ascending: true })
        .order('category_name', { ascending: true })
        .order('item_name', { ascending: true })
      if (subContainerId) q = q.eq('sub_container_id', subContainerId)
      // `as unknown as` — database.types.ts is stale re: warehouse_stock_view's
      // origin columns; the row is correct at runtime.
      const { data, error } = await q.limit(10000)
      if (error) throw error
      const rows = (data ?? []) as unknown as StockExportRow[]

      if (rows.length === 0) {
        toast.info('No stock to export for this selection.')
        return
      }

      // Group rows into one sheet per sub-container (stable insertion order from
      // the sub_container_name sort above).
      const bySub = new Map<string, StockExportRow[]>()
      for (const r of rows) {
        const key = r.sub_container_name ?? 'Unassigned'
        if (!bySub.has(key)) bySub.set(key, [])
        bySub.get(key)!.push(r)
      }

      await exportSheetsToExcel({
        filename: warehouseName,
        title: warehouseName,
        sheets: [...bySub.entries()].map(([name, subRows]) => ({
          name,
          subtitle: `Sub-container: ${name}`,
          columns: COLUMNS,
          rows: subRows,
        })),
      })
      const sheetCount = bySub.size
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} across ${sheetCount} sheet${sheetCount === 1 ? '' : 's'}.`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className ?? 'h-7 min-h-11 md:min-h-0 text-xs gap-1.5'}
      onClick={handleExport}
      disabled={busy}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
      Export
    </Button>
  )
}
