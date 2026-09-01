import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { InventoryCategory } from '@/hooks/useInventory'
import { queryKeys } from '@/lib/queryKeys'

const EMPTY_CATEGORIES: InventoryCategory[] = []

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryTreeNode = InventoryCategory & {
  children: InventoryTreeNode[]
}

// ─── Pure helpers (exported so callers can use them independently) ─────────────

/**
 * Build a recursive tree from a flat list of categories.
 * Nodes are sorted by sort_order then name_en at each level.
 */
export function buildTree(
  flat: InventoryCategory[],
  parentId: string | null = null,
): InventoryTreeNode[] {
  return flat
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => {
      const aOrder = a.sort_order ?? 0
      const bOrder = b.sort_order ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name_en.localeCompare(b.name_en)
    })
    .map((c) => ({
      ...c,
      children: buildTree(flat, c.id),
    }))
}

/**
 * Returns the ancestor chain from root → parent (NOT including the node itself).
 */
export function ancestors(
  id: string,
  flat: InventoryCategory[],
): InventoryCategory[] {
  const map = new Map(flat.map((c) => [c.id, c]))
  const chain: InventoryCategory[] = []
  const current = map.get(id)
  if (!current) return chain

  let parentId: string | null = current.parent_id ?? null
  while (parentId) {
    const parent = map.get(parentId)
    if (!parent) break
    chain.unshift(parent)
    parentId = parent.parent_id ?? null
  }
  return chain
}

/**
 * Returns a human-readable breadcrumb string, e.g. "AC > Split > Rotary".
 * The node itself IS included at the end.
 */
export function breadcrumb(id: string, flat: InventoryCategory[]): string {
  const map = new Map(flat.map((c) => [c.id, c]))
  const node = map.get(id)
  if (!node) return ''
  const chain = [...ancestors(id, flat), node]
  return chain.map((c) => c.name_en).join(' > ')
}

/** The four product-type tags as displayed app-wide. */
export const CATEGORY_TYPE_LABELS: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

/**
 * The product-type tag ("Products" / "Spare Parts" / "Consumables" / "Tools")
 * taken from the ROOT of this category's ancestor chain, or null if unknown.
 * `type` is stored on every category but is authoritative at the root.
 */
export function categoryTypeLabel(id: string, flat: InventoryCategory[]): string | null {
  const map = new Map(flat.map((c) => [c.id, c]))
  let node = map.get(id)
  if (!node) return null
  while (node.parent_id) {
    const parent = map.get(node.parent_id)
    if (!parent) break
    node = parent
  }
  return node.type ? (CATEGORY_TYPE_LABELS[node.type] ?? null) : null
}

/**
 * Breadcrumb prefixed with the product-type tag, e.g.
 * "Products > AC Unit > Split > Indoor Unit". Falls back to the bare breadcrumb
 * when the type is unknown.
 */
export function breadcrumbWithType(id: string, flat: InventoryCategory[]): string {
  const crumb = breadcrumb(id, flat)
  const tag = categoryTypeLabel(id, flat)
  if (!tag) return crumb
  return crumb ? `${tag} > ${crumb}` : tag
}

/**
 * Returns all descendant IDs (children, grandchildren, …) for a given node.
 * Useful for cycle prevention in parent pickers.
 */
export function allDescendantIds(id: string, flat: InventoryCategory[]): string[] {
  const result: string[] = []
  const queue: string[] = [id]

  while (queue.length > 0) {
    const current = queue.shift()!
    const children = flat.filter(
      (c) => (c.parent_id ?? null) === current,
    )
    for (const child of children) {
      result.push(child.id)
      queue.push(child.id)
    }
  }

  return result
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetches all categories of a given type (optionally including archived),
 * builds a recursive tree in memory, and exposes helper functions.
 */
export function useInventoryTree(type: string, showArchived = false) {
  const query = useQuery({
    queryKey: queryKeys.inventory.categoriesTreeByType(type, showArchived),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_categories')
        .select('*')
        .eq('type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const flat = query.data ?? EMPTY_CATEGORIES
  const tree = useMemo(() => buildTree(flat, null), [flat])

  return {
    ...query,
    tree,
    flat,
    ancestors: (id: string) => ancestors(id, flat),
    breadcrumb: (id: string) => breadcrumb(id, flat),
    allDescendantIds: (id: string) => allDescendantIds(id, flat),
  }
}

/**
 * Returns ALL non-archived categories regardless of type.
 * Useful for cross-type lookups or admin tooling.
 */
export function useAllCategoriesFlat() {
  return useQuery({
    queryKey: queryKeys.inventory.categoriesAllFlat,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .neq('status', 'archived')
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
