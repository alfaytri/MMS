import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { AllTables } from '@/types/database.types'
import type { ActivityLog } from './useActivityLog'

type EntityTypeConfig = {
  table: string
  nameCol: string
  fallbackCol?: string
}

const ENTITY_TYPE_MAP: Record<string, EntityTypeConfig> = {
  item:             { table: 'inventory_items',          nameCol: 'name_en' },
  inventory_item:   { table: 'inventory_items',          nameCol: 'name_en' },
  tool_unit:        { table: 'tool_asset_units',         nameCol: 'serial_number' },
  category:         { table: 'inventory_categories',     nameCol: 'name_en' },
  brand_variant:    { table: 'inventory_item_brand_variants', nameCol: 'brand' },
  warehouse:        { table: 'warehouses',               nameCol: 'name' },
  supplier:         { table: 'suppliers',                nameCol: 'name' },
  customer:         { table: 'customers',                nameCol: 'name' },
  user:             { table: 'user_data',                nameCol: 'full_name' },
  role:             { table: 'custom_roles',             nameCol: 'name' },
  company:          { table: 'companies',                nameCol: 'name_en' },
  currency:         { table: 'currencies',               nameCol: 'code' },
  purchase_order:   { table: 'purchase_orders',          nameCol: 'po_number' },
  purchase_orders:  { table: 'purchase_orders',          nameCol: 'po_number' },
  sale_order:       { table: 'sale_orders',              nameCol: 'so_number' },
  sale_orders:      { table: 'sale_orders',              nameCol: 'so_number' },
  bill:             { table: 'bills',                    nameCol: 'source_label', fallbackCol: 'bill_number' },
  credit_note:      { table: 'credit_notes',             nameCol: 'credit_note_id' },
  debit_note:       { table: 'debit_notes',              nameCol: 'debit_note_id' },
}

/** Field-name → target-table mapping used to resolve FK VALUES inside
 *  old_data / new_data diffs (e.g. Division field showing a UUID instead
 *  of the division name). */
const FK_FIELD_MAP: Record<string, EntityTypeConfig> = {
  division_id:      { table: 'company_divisions',        nameCol: 'name' },
  warehouse_id:     { table: 'warehouses',               nameCol: 'name' },
  supplier_id:      { table: 'suppliers',                nameCol: 'name' },
  customer_id:      { table: 'customers',                nameCol: 'name' },
  category_id:      { table: 'inventory_categories',     nameCol: 'name_en' },
  item_id:          { table: 'inventory_items',          nameCol: 'name_en' },
  brand_variant_id: { table: 'inventory_item_brand_variants', nameCol: 'brand' },
  brand_id:         { table: 'brands',                   nameCol: 'name' },
  assigned_to:      { table: 'user_data',                nameCol: 'full_name' },
  role_id:          { table: 'custom_roles',             nameCol: 'name' },
  company_id:       { table: 'companies',                nameCol: 'name_en' },
  currency_id:      { table: 'currencies',               nameCol: 'code' },
  credit_group_id:  { table: 'credit_groups',            nameCol: 'name' },
  team_id:          { table: 'teams',                    nameCol: 'name' },
  tool_unit_id:     { table: 'tool_asset_units',         nameCol: 'serial_number' },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** Fields known to hold FK UUIDs. Used by the audit diff renderer to
 *  detect when a raw UUID should be substituted with a human name (or
 *  labeled "(deleted)" if the target row no longer exists). */
export const FK_FIELDS: ReadonlySet<string> = new Set(Object.keys({
  division_id:      1, warehouse_id:     1, supplier_id:      1, customer_id:      1,
  category_id:      1, item_id:          1, brand_variant_id: 1, brand_id:         1,
  assigned_to:      1, role_id:          1, company_id:       1, currency_id:      1,
  credit_group_id:  1, team_id:          1, tool_unit_id:     1,
}))

export function useAuditEntityNames(logs: ActivityLog[]) {
  const missing = new Map<string, Set<string>>()

  function want(table: string, id: string) {
    if (!missing.has(table)) missing.set(table, new Set())
    missing.get(table)!.add(id)
  }

  for (const log of logs) {
    // 1. Top-level entity name lookup (unchanged).
    if (log.entity_type && log.entity_id) {
      const config = ENTITY_TYPE_MAP[log.entity_type]
      if (config) {
        const nd = log.new_data as Record<string, unknown> | null
        const od = log.old_data as Record<string, unknown> | null
        const hasName = !!(
          (nd && (nd.name || nd.full_name || nd.code || nd.brand || nd.name_en)) ||
          (od && (od.name || od.full_name || od.code || od.brand || od.name_en))
        )
        if (!hasName) want(config.table, log.entity_id)
      }
    }

    // 2. FK-value lookups inside old_data + new_data (Division: <uuid> → <uuid>).
    for (const bag of [log.new_data, log.old_data]) {
      if (!bag || typeof bag !== 'object') continue
      const rec = bag as Record<string, unknown>
      for (const [key, val] of Object.entries(rec)) {
        const cfg = FK_FIELD_MAP[key]
        if (!cfg) continue
        if (isUuid(val)) want(cfg.table, val)
      }
    }
  }

  // Include a stable version of every table's config so the query knows
  // how to fetch each batch.
  const missingKey = Array.from(missing.entries())
    .map(([table, ids]) => `${table}:${Array.from(ids).sort().join(',')}`)
    .sort()
    .join('|')

  return useQuery({
    queryKey: ['auditEntityNames', missingKey],
    enabled: missing.size > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const lookup = new Map<string, string>()

      // Build a table → config lookup — any config with the right table works.
      const tableCfg = new Map<string, EntityTypeConfig>()
      for (const c of Object.values(ENTITY_TYPE_MAP)) tableCfg.set(c.table, c)
      for (const c of Object.values(FK_FIELD_MAP))    tableCfg.set(c.table, c)

      await Promise.all(
        Array.from(missing.entries()).map(async ([table, idSet]) => {
          const config = tableCfg.get(table)
          if (!config) return
          const ids = Array.from(idSet)
          const cols = config.fallbackCol
            ? `id, ${config.nameCol}, ${config.fallbackCol}`
            : `id, ${config.nameCol}`
          const { data } = await supabase
            .from(config.table as AllTables)
            .select(cols)
            .in('id', ids)
            .limit(ids.length)
          if (!data) return
          for (const row of data as unknown as Record<string, unknown>[]) {
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
