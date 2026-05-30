import { createClient } from '@/lib/supabase/client'
import type { POLineItemDraft } from '@/hooks/usePurchaseOrders'

/**
 * For line items with an empty item_name, resolve from the inventory via brand_variant_id.
 */
export async function resolveLineItemNames(
  supabase: ReturnType<typeof createClient>,
  items: POLineItemDraft[],
): Promise<POLineItemDraft[]> {
  const needsResolve = items.filter((li) => !li.item_name?.trim() && li.brand_variant_id)
  if (needsResolve.length === 0) return items

  const ids = needsResolve.map((li) => li.brand_variant_id!)
  const { data: rows } = await (supabase as any)
    .from('inventory_brand_variants')
    .select('id, inventory_items(name_en)')
    .in('id', ids)
  const nameMap = new Map<string, string>()
  for (const r of rows ?? []) {
    nameMap.set(r.id, r.inventory_items?.name_en ?? '')
  }

  return items.map((li) => {
    if (li.item_name?.trim()) return li
    const resolved = li.brand_variant_id ? nameMap.get(li.brand_variant_id) : null
    return { ...li, item_name: resolved || li.item_name || 'Item' }
  })
}

/**
 * Saves a read-only snapshot of the PO's current state into po_versions.
 * label: 'submitted' | 'approved' | 'manual'
 * Non-critical — silently swallows errors so it never blocks the main flow.
 */
export async function savePoSnapshot(
  supabase: ReturnType<typeof createClient>,
  poId: string,
  label: string,
) {
  try {
    const { data: po } = await (supabase as any)
      .from('purchase_orders')
      .select('*, po_line_items(*)')
      .eq('id', poId)
      .single()
    if (!po) return

    const { data: latest } = await (supabase as any)
      .from('po_versions')
      .select('version_number')
      .eq('po_id', poId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextVersion = (latest?.version_number ?? 0) + 1

    await (supabase as any).from('po_versions').insert({
      po_id: poId,
      version_number: nextVersion,
      snapshot_label: label,
      supplier_id: po.supplier_id ?? po.supplier_name,
      supplier_name: po.supplier_name,
      currency: po.currency,
      exchange_rate: po.exchange_rate,
      subtotal: po.subtotal,
      discount_amount: po.discount_amount ?? 0,
      discount_label: po.discount_label ?? null,
      payment_terms: po.payment_terms ?? null,
      payment_terms_notes: po.payment_terms_notes ?? null,
      payment_milestones: po.payment_milestones ?? null,
      delivery_terms: po.delivery_terms ?? null,
      delivery_terms_notes: po.delivery_terms_notes ?? null,
      expected_delivery: po.expected_delivery ?? null,
      vendor_notes: po.vendor_notes ?? null,
      line_items: po.po_line_items ?? [],
    })
  } catch {
    // Non-critical — snapshot failure must never block the main operation
  }
}
