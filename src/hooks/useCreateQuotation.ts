// src/hooks/useCreateQuotation.ts
'use client'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDraft, QuotationLineDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'

const INITIAL: QuotationDraft = {
  quotationId: '',
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  division: '',
  services: [],
  notes: '',
}

export function computeTotal(services: QuotationLineDraft[]): number {
  return services.reduce((sum, s) => sum + s.price * s.qty, 0)
}

export function useCreateQuotation() {
  const [draft, setDraft] = useState<QuotationDraft>(INITIAL)
  const supabase = createClient()
  const qc = useQueryClient()

  // Generate Q/YYYY/MM/NNNN via DB sequence — race-condition-free
  useEffect(() => {
    ;(supabase as any)
      .rpc('generate_quotation_id')
      .then(({ data }: { data: string | null }) => {
        if (data) setDraft((d) => ({ ...d, quotationId: data }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setCustomer(result: CustomerLookupResult) {
    setDraft((d) => ({
      ...d,
      customerId: result.customerId,
      phoneId: result.phoneId,
      customerName: result.customerName,
      phone: result.phone,
    }))
  }

  function addService(service: OrderServiceDraft) {
    const line: QuotationLineDraft = {
      serviceId: service.serviceId,
      name: service.serviceName,
      path: service.path,
      qty: service.qty,
      price: service.price,
      duration: service.duration ?? null,
      division: (service as any).division ?? '',
    }
    setDraft((d) => {
      const services = [...d.services, line]
      const division = d.division || line.division
      return { ...d, services, division }
    })
  }

  function removeService(serviceId: string) {
    setDraft((d) => {
      const services = d.services.filter((s) => s.serviceId !== serviceId)
      const division = services[0]?.division ?? ''
      return { ...d, services, division }
    })
  }

  function updateQty(serviceId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, qty: Math.max(1, qty) } : s,
      ),
    }))
  }

  function update(partial: Partial<Pick<QuotationDraft, 'notes'>>) {
    setDraft((d) => ({ ...d, ...partial }))
  }

  function isValid(): boolean {
    return !!draft.customerId && draft.services.length > 0
  }

  // Single RPC call — quotation row + line items committed atomically
  async function saveToDb(status: 'draft' | 'sent'): Promise<string> {
    const total = computeTotal(draft.services)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)

    const { data: quotUuid, error } = await (supabase as any).rpc('save_quotation', {
      p_quotation_id: draft.quotationId,
      p_customer_id:  draft.customerId,
      p_division:     draft.division,
      p_status:       status,
      p_total_amount: total,
      p_notes:        draft.notes || '',
      p_expiry_date:  expiry.toISOString().split('T')[0],
      p_sent_date:    status === 'sent' ? new Date().toISOString() : null,
      p_line_items:   JSON.stringify(
        draft.services.map((s) => ({
          service_id: s.serviceId || null,
          name:       s.name,
          path:       s.path,
          qty:        s.qty,
          price:      s.price,
          duration:   s.duration ?? null,
        })),
      ),
    })
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['quotations'] })
    return quotUuid as string
  }

  const saveDraft = useMutation({
    mutationFn: () => saveToDb('draft'),
  })

  const sendViaWhatsApp = useMutation({
    mutationFn: async () => {
      await saveToDb('sent')
      const total = computeTotal(draft.services)
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 30)
      const res = await fetch('/api/wati/send-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:        draft.phone,
          customerName: draft.customerName,
          quotationId:  draft.quotationId,
          divisionName: draft.division,
          services: draft.services.map((s) => ({
            name:  s.name,
            qty:   s.qty,
            price: s.price,
          })),
          total,
          expiryDate: expiryDate.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          }),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send')
      return json as { windowClosed?: boolean }
    },
  })

  return {
    draft,
    setCustomer,
    addService,
    removeService,
    updateQty,
    update,
    isValid,
    saveDraft,
    sendViaWhatsApp,
    total: computeTotal(draft.services),
  }
}
