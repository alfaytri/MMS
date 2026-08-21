import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

/**
 * Fetches the warranty-certificate PDF for a delivery and opens it in a new tab.
 * Shared by the manual "Print Warranty Certificate" button and the auto-open on
 * delivery completion.
 *
 * The certificate route streams the PDF bytes (it does not persist to Storage),
 * so we turn the response into a blob URL and open that. When the browser blocks
 * the programmatic `window.open` (common when this runs after an async delivery
 * mutation rather than directly in a click handler), we fall back to a toast whose
 * action re-opens the same URL — that click IS a user gesture, so it always works.
 */
export async function openWarrantyCertificate(deliveryId: string): Promise<void> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    toast.error('Not authenticated')
    return
  }

  let url: string
  try {
    const res = await fetch(`/api/sales/deliveries/${deliveryId}/warranty-certificate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Request failed (${res.status})`)
    }
    const blob = await res.blob()
    url = URL.createObjectURL(blob)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to generate certificate')
    return
  }

  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    // Popup blocked (e.g. opened after an async mutation, not a direct click).
    toast('Warranty certificate ready', {
      description: 'Your browser blocked the pop-up.',
      action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') },
      duration: 10_000,
    })
  }
  // Revoke after a delay so the opened tab has time to load the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Returns true if the given delivery produced any warranty_records (records link
 * to a delivery only via sale_delivery_lines.sale_delivery_id — there is no direct
 * sale_delivery_id column). Used to decide whether to auto-open the certificate.
 */
export async function deliveryHasWarrantyRecords(deliveryId: string): Promise<boolean> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('warranty_records')
    .select('id, sale_delivery_lines!inner(sale_delivery_id)', { count: 'exact', head: true })
    .eq('sale_delivery_lines.sale_delivery_id', deliveryId)
  if (error) return false
  return (count ?? 0) > 0
}
