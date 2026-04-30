// src/components/services/inventory/serviceInventoryHelpers.ts

export const LINK_TYPE_CONFIG = {
  consumable: {
    label: 'Consumable',
    letter: 'C',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  select_one: {
    label: 'Select One',
    letter: 'S',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  install_all: {
    label: 'Install All',
    letter: 'I',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
} as const

export type LinkType = keyof typeof LINK_TYPE_CONFIG

export const WARRANTY_OPTIONS = [0, 3, 6, 12, 24, 36, 48, 60]

export interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string | null
}

export interface ServiceInventoryLinkFull {
  id: string
  service_id: string
  brand_variant_id: string
  link_type: LinkType
  warranty_months: number
  quantity: number
  group_label: string | null
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

/** Returns only leaf services (services that are not the parent of any other service). */
export function collectLeaves(services: ServiceNode[]): ServiceNode[] {
  const parentIds = new Set(services.map((s) => s.parent_id).filter(Boolean) as string[])
  return services.filter((s) => !parentIds.has(s.id))
}

/**
 * Pre-computes a serviceId → breadcrumb string map for all services.
 * Call once when the services array loads; pass the resulting map to getBreadcrumb.
 * Avoids recreating the lookup Map O(n) per service on every filter/render.
 */
export function buildBreadcrumbMap(services: ServiceNode[]): Map<string, string> {
  const nodeMap = new Map(services.map((s) => [s.id, s]))
  const cache = new Map<string, string>()

  function resolve(id: string): string {
    if (cache.has(id)) return cache.get(id)!
    const node = nodeMap.get(id)
    if (!node) return ''
    const parentBreadcrumb = node.parent_id ? resolve(node.parent_id) : ''
    const result = parentBreadcrumb ? `${parentBreadcrumb} › ${node.name_en}` : node.name_en
    cache.set(id, result)
    return result
  }

  for (const s of services) resolve(s.id)
  return cache
}
