// src/components/services/inventory/serviceInventoryHelpers.ts

export const LINK_TYPE_CONFIG = {
  supply: {
    label: 'Supply',
    letter: 'S',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  consumable: {
    label: 'Consumable',
    letter: 'C',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
} as const

export type LinkType = keyof typeof LINK_TYPE_CONFIG

export interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string | null
  warranty?: number | null
}

export interface ServiceInventoryLinkFull {
  id: string
  service_id: string
  brand_variant_id: string
  link_type: LinkType
  warranty_months: number
  quantity: number
  group_label: string | null
  is_default: boolean
  inventory_brand_variants: {
    brand: string
    selling_price: number | null
    inventory_items: {
      name_en: string
      sku: string
      unit: string
    }
  } | null
}

/** Returns a Map from parent_id → children, used by the column browser. */
export function buildTreeMap(
  services: ServiceNode[],
): Map<string | null, ServiceNode[]> {
  const map = new Map<string | null, ServiceNode[]>()
  for (const s of services) {
    const key = s.parent_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

/**
 * Pre-computes a serviceId → breadcrumb string map.
 * Call once when services load; pass the result wherever breadcrumbs are needed.
 */
export function buildBreadcrumbMap(services: ServiceNode[]): Map<string, string> {
  const nodeMap = new Map(services.map((s) => [s.id, s]))
  const cache = new Map<string, string>()

  function resolve(id: string): string {
    if (cache.has(id)) return cache.get(id)!
    const node = nodeMap.get(id)
    if (!node) return ''
    const parentCrumb = node.parent_id ? resolve(node.parent_id) : ''
    const result = parentCrumb ? `${parentCrumb} › ${node.name_en}` : node.name_en
    cache.set(id, result)
    return result
  }

  for (const s of services) resolve(s.id)
  return cache
}

/** Returns the set of service IDs that are parents (have at least one child). */
export function buildParentIdSet(services: ServiceNode[]): Set<string> {
  return new Set(
    services.map((s) => s.parent_id).filter(Boolean) as string[],
  )
}
