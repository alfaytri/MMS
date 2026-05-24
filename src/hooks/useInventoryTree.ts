import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { InventoryCategory } from '@/hooks/useInventory'

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
    .filter((c) => ((c as any).parent_id ?? null) === parentId)
    .sort((a, b) => {
      const aOrder = (a as any).sort_order ?? 0
      const bOrder = (b as any).sort_order ?? 0
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
  let current = map.get(id)
  if (!current) return chain

  let parentId: string | null = (current as any).parent_id ?? null
  while (parentId) {
    const parent = map.get(parentId)
    if (!parent) break
    chain.unshift(parent)
    parentId = (parent as any).parent_id ?? null
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
      (c) => ((c as any).parent_id ?? null) === current,
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
    queryKey: ['inventory-categories-tree', type, showArchived],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('inventory_categories')
        .select('*')
        .eq('type', type)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const flat = query.data ?? []
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
    queryKey: ['inventory-categories-all-flat'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
