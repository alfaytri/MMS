import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Map a `service_customers.id` to its unified `customers.id` via the consolidation
 * bridge (`service_customers.customer_id → customers.id`). Returns `null` when the
 * service customer has no bridged row yet (or no service customer was given).
 *
 * Contact Centre's CRM panel still resolves its customer as a `service_customers.id`
 * (by phone), but `chat_conversations.customer_id`/`customer_id_v2` now FK the unified
 * `customers` table. This helper translates the panel's service id into the customers
 * id that those columns store, so writes don't violate the re-pointed FK.
 *
 * Takes an untyped SupabaseClient on purpose: `service_customers.customer_id` is the
 * Stage-1 bridge column and isn't in the (stale) generated types yet, so the typed
 * client rejects the select. Mirrors `resolveBridge` in useCustomerAddresses.ts.
 */
export async function bridgeServiceToCustomer(
  supabase: SupabaseClient,
  serviceCustomerId: string | null | undefined,
): Promise<string | null> {
  if (!serviceCustomerId) return null
  const { data } = await supabase
    .from('service_customers')
    .select('customer_id')
    .eq('id', serviceCustomerId)
    .maybeSingle()
  return (data as { customer_id: string | null } | null)?.customer_id ?? null
}
