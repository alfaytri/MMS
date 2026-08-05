// src/hooks/useEffectiveWarranty.ts
//
// Resolves the warranty policy that applies to an inventory item by
// calling the SQL function get_effective_warranty_policy(p_item_id).
// Precedence handled server-side: item override → nearest ancestor
// category with a default → NULL.
//
// Used by:
//   - Item edit dialog — to render the effective-policy preview under
//     the "Warranty Policy Override" select.
//   - SO line editor — to render the "12mo warranty" / "No warranty"
//     badge next to each line.

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { WarrantyPolicy } from '@/hooks/useWarrantyPolicies'

export type EffectiveWarrantyResult = {
  policyId: string | null
  policy: WarrantyPolicy | null
}

/**
 * Resolves the warranty policy for a single item.
 *
 * Two-step query on purpose:
 *   1. RPC returns just the uuid (server-side precedence walk).
 *   2. Follow-up SELECT fetches the policy row itself.
 *
 * Both queries are cached under the same key so downstream renders
 * don't refetch when the item id is stable.
 *
 * Returns `{ policyId: null, policy: null }` when the item is uninsured.
 */
/**
 * Same as {@link useEffectiveWarranty} but keyed by brand_variant_id.
 * Resolves the underlying inventory_items.id first, then delegates to
 * the RPC. Used by the SO line editor where the row only carries
 * brand_variant_id.
 */
export function useEffectiveWarrantyForVariant(brandVariantId: string | null | undefined) {
  return useQuery({
    queryKey: ['warranty-effective-variant', brandVariantId ?? null],
    queryFn: async (): Promise<EffectiveWarrantyResult> => {
      if (!brandVariantId) return { policyId: null, policy: null }
      const supabase = createClient()

      const { data: bv, error: bvError } = await supabase
        .from('inventory_item_brand_variants')
        .select('item_id')
        .eq('id', brandVariantId)
        .maybeSingle()
      if (bvError) throw bvError
      const itemId = bv?.item_id ?? null
      if (!itemId) return { policyId: null, policy: null }

      const { data: policyId, error: rpcError } = await supabase.rpc(
        'get_effective_warranty_policy',
        { p_item_id: itemId },
      )
      if (rpcError) throw rpcError
      if (!policyId) return { policyId: null, policy: null }

      const { data: policy, error: fetchError } = await supabase
        .from('warranty_policies')
        .select('*')
        .eq('id', policyId as string)
        .maybeSingle()
      if (fetchError) throw fetchError
      return {
        policyId: policyId as string,
        policy: (policy ?? null) as WarrantyPolicy | null,
      }
    },
    enabled: !!brandVariantId,
    staleTime: 30 * 1000,
  })
}

export function useEffectiveWarranty(itemId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.warranty.effectiveForItem(itemId ?? null),
    queryFn: async (): Promise<EffectiveWarrantyResult> => {
      if (!itemId) return { policyId: null, policy: null }
      const supabase = createClient()

      const { data: policyId, error: rpcError } = await supabase.rpc(
        'get_effective_warranty_policy',
        { p_item_id: itemId },
      )
      if (rpcError) throw rpcError
      if (!policyId) return { policyId: null, policy: null }

      const { data: policy, error: fetchError } = await supabase
        .from('warranty_policies')
        .select('*')
        .eq('id', policyId as string)
        .maybeSingle()
      if (fetchError) throw fetchError

      return {
        policyId: policyId as string,
        policy: (policy ?? null) as WarrantyPolicy | null,
      }
    },
    enabled: !!itemId,
    staleTime: 30 * 1000,
  })
}
