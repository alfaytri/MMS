import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ActivityLog } from './useActivityLog'

type EntityTypeConfig = {
  table: string
  nameCol: string
  fallbackCol?: string
}

const ENTITY_TYPE_MAP: Record<string, EntityTypeConfig> = {
  item:             { table: 'inventory_items',          nameCol: 'name' },
  category:         { table: 'inventory_categories',     nameCol: 'name_en',      fallbackCol: 'name' },
  brand_variant:    { table: 'inventory_brand_variants', nameCol: 'brand' },
  tool_asset:       { table: 'tool_asset_items',         nameCol: 'name' },
  warehouse:        { table: 'warehouses',               nameCol: 'name' },
  supplier:         { table: 'suppliers',                nameCol: 'name' },
  customer:         { table: 'customers',                nameCol: 'name' },
  user:             { table: 'profiles',                 nameCol: 'full_name' },
  role:             { table: 'custom_roles',             nameCol: 'name' },
  company:          { table: 'companies',                nameCol: 'name' },
  currency:         { table: 'currencies',               nameCol: 'code' },
  purchase_order:   { table: 'purchase_orders',          nameCol: 'po_number' },
  purchase_orders:  { table: 'purchase_orders',          nameCol: 'po_number' },
  sale_order:       { table: 'sale_orders',              nameCol: 'so_number' },
  sale_orders:      { table: 'sale_orders',              nameCol: 'so_number' },
  bill:             { table: 'supplier_bills',           nameCol: 'source_label', fallbackCol: 'invoice_id' },
  credit_note:      { table: 'credit_notes',             nameCol: 'credit_note_id' },
  debit_note:       { table: 'credit_notes',             nameCol: 'credit_note_id' },
}

export function useAuditEntityNames(logs: ActivityLog[]) {
  const missing = new Map<string, Set<string>>()

  for (const log of logs) {
    if (!log.entity_type || !log.entity_id) continue
    const config = ENTITY_TYPE_MAP[log.entity_type]
    if (!config) continue

    const nd = log.new_data as Record<string, unknown> | null
    const od = log.old_data as Record<string, unknown> | null
    const hasName = !!(
      (nd && (nd.name || nd.full_name || nd.code || nd.brand || nd.name_en)) ||
      (od && (od.name || od.full_name || od.code || od.brand || od.name_en))
    )
    if (hasName) continue

    if (!missing.has(log.entity_type)) missing.set(log.entity_type, new Set())
    missing.get(log.entity_type)!.add(log.entity_id)
  }

  const missingKey = Array.from(missing.entries())
    .map(([type, ids]) => `${type}:${Array.from(ids).sort().join(',')}`)
    .sort()
    .join('|')

  return useQuery({
    queryKey: ['auditEntityNames', missingKey],
    enabled: missing.size > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const lookup = new Map<string, string>()

      await Promise.all(
        Array.from(missing.entries()).map(async ([type, idSet]) => {
          const config = ENTITY_TYPE_MAP[type]
          if (!config) return
          const ids = Array.from(idSet)
          const cols = config.fallbackCol
            ? `id, ${config.nameCol}, ${config.fallbackCol}`
            : `id, ${config.nameCol}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from(config.table)
            .select(cols)
            .in('id', ids)
            .limit(ids.length)
          if (!data) return
          for (const row of data as Record<string, unknown>[]) {
            const name = (row[config.nameCol] as string | null)
              ?? (config.fallbackCol ? (row[config.fallbackCol] as string | null) : null)
            if (name) lookup.set(row.id as string, name)
          }
        })
      )

      return lookup
    },
  })
}
