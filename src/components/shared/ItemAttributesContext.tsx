'use client'

import { createContext, useContext } from 'react'

/**
 * Optional batch of item→attribute picks, provided by a list container
 * (e.g. an expanded CategoryRow) so per-item chip strips don't each fire
 * their own query. `byItem` maps itemId → (definitionId → optionId).
 *
 * A container renders the Provider as soon as the list is shown (with an
 * empty map while the batch query is in flight), so children NEVER fall
 * back to a per-item query. When the context is absent (null) — e.g. a
 * non-list caller — consumers fall back to their own per-item fetch, so
 * those callers keep working unchanged.
 */
export type ItemAttributesBatch = {
  byItem: Map<string, Map<string, string>>
}

const ItemAttributesContext = createContext<ItemAttributesBatch | null>(null)

export const ItemAttributesProvider = ItemAttributesContext.Provider

export function useItemAttributesContext(): ItemAttributesBatch | null {
  return useContext(ItemAttributesContext)
}
