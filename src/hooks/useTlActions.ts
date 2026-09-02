'use client'
// Team-leader completion + invoicing actions (C + E).
// - useCompleteVisit: uploads photos/signature to storage, then complete_visit RPC
//   (persists field data + sets status=completed). No invoice.
// - useCreateTlInvoice: create_tl_invoice RPC (server recomputes/validates money).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { TlVisit, OrderCompletionData, AddedBillableService } from '@/types/team-leader'

const BUCKET = 'visit-completions'

async function uploadBlobs(
  supabase: SupabaseClient,
  visitId: string,
  blobs: Blob[],
  prefix: string,
): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i]
    const ext = ((b.type?.split('/')[1] || 'jpg').replace('jpeg', 'jpg')) || 'jpg'
    const path = `${visitId}/${prefix}-${Date.now()}-${i}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, b, { contentType: b.type || 'image/jpeg', upsert: false })
    if (error) { console.warn('[completion upload]', prefix, error.message); continue }
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }
  return urls
}

export function useCompleteVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      visit: TlVisit
      data: OrderCompletionData
      profileId: string
      teamId: string
    }): Promise<string> => {
      const { visit, data, profileId, teamId } = input
      const supabase = createClient()

      const photoUrls      = await uploadBlobs(supabase, visit.id, data.photos ?? [], 'photo')
      const damagePhotoUrls = await uploadBlobs(supabase, visit.id, data.damageReport?.photos ?? [], 'damage')
      let signatureUrl: string | null = null
      if (data.signature) {
        const [u] = await uploadBlobs(supabase, visit.id, [data.signature], 'signature')
        signatureUrl = u ?? null
      }

      const damage = data.damageReport?.noted
        ? { noted: true, description: data.damageReport.description ?? null, photo_urls: damagePhotoUrls }
        : null

      const { data: id, error } = await supabase.rpc('complete_visit' as never, {
        p_visit_id:         visit.id,
        p_source_id:        visit.source_id,
        p_source_type:      visit.source_type,
        p_completed_by:     profileId,
        p_service_statuses: data.serviceStatuses ?? {},
        p_damage:           damage,
        p_notes:            null,
        p_qc_scores:        data.qcScores ?? null,
        p_photo_urls:       photoUrls,
        p_signature_url:    signatureUrl,
        p_team_id:          teamId,
        p_added_services:   data.addedServices ?? null,
      } as never)
      if (error) throw error
      return id as unknown as string
    },
    onSuccess: (_d, { teamId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.teamLeader.orders(teamId) })
    },
  })
}

export type InvoiceLine = { name: string; qty: number; unit_price: number }

export function useCreateTlInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      visit: TlVisit
      lines: InvoiceLine[]
      discount: number
      paymentMethodId: string
      notes: string
      createdBy: string
      markPaid: boolean
    }): Promise<{ id: string; invoice_number: string }> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_tl_invoice' as never, {
        p_visit_id:          input.visit.id,
        p_order_id:          input.visit.order_id ?? null,
        p_customer_name:     input.visit.customer_name,
        p_customer_phone:    input.visit.customer_phone ?? null,
        p_lines:             input.lines,
        p_discount:          input.discount,
        p_payment_method_id: input.paymentMethodId || null,
        p_notes:             input.notes || null,
        p_created_by:        input.createdBy,
        p_mark_paid:         input.markPaid,
      } as never)
      if (error) throw error
      const row = (data as unknown as { id: string; invoice_number: string }[])?.[0]
      if (!row) throw new Error('Invoice creation returned no row')
      return row
    },
    onSuccess: (_d, { visit }) => {
      qc.invalidateQueries({ queryKey: queryKeys.teamLeader.orders(visit.team_id) })
    },
  })
}

export type VisitCompletion = {
  service_statuses: Record<string, 'done' | 'skipped' | 'issue'> | null
  damage_report:    { noted?: boolean; description?: string | null; photo_urls?: string[] } | null
  notes:            string | null
  qc_scores:        Record<string, number> | null
  photo_urls:       string[] | null
  signature_url:    string | null
  completed_at:     string | null
}

/** Read the persisted field-work record for a visit (statuses/notes/damage/photos/signature). */
export function useVisitCompletion(visitId: string | null) {
  return useQuery({
    queryKey: ['visit-completion', visitId],
    enabled: !!visitId,
    staleTime: 30_000,
    queryFn: async (): Promise<VisitCompletion | null> => {
      const supabase = createClient()
      const { data } = await supabase
        .from('visit_completions' as never)
        .select('service_statuses, damage_report, notes, qc_scores, photo_urls, signature_url, completed_at')
        .eq('visit_id' as never, visitId as never)
        .maybeSingle()
      return (data as unknown as VisitCompletion) ?? null
    },
  })
}

/** Read an existing completion's added billable services (for the decoupled invoice step). */
export async function fetchAddedServices(visitId: string): Promise<AddedBillableService[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('visit_completions' as never)
    .select('added_services')
    .eq('visit_id' as never, visitId as never)
    .maybeSingle()
  return ((data as { added_services?: AddedBillableService[] } | null)?.added_services ?? [])
}
