// src/hooks/useCreateQuotation.ts
'use client'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDraft, QuotationLineDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'
import type { PostgrestError } from '@supabase/supabase-js'
import { roundMoney, computeDiscount } from '@/lib/money'
import { capturePdfBlob } from '@/lib/quotations/capture-pdf'

const INITIAL: QuotationDraft = {
  quotationId: '',
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  division: '',
  services: [],
  notes: '',
  discountType: 'flat',
  discountValue: 0,
}

export class WindowClosedError extends Error {
  constructor() {
    super('Wati conversation window is closed')
    this.name = 'WindowClosedError'
  }
}

export function computeSubtotal(services: QuotationLineDraft[]): number {
  return roundMoney(services.reduce((sum, s) => sum + s.price * s.qty, 0))
}

export function useCreateQuotation() {
  const [draft, setDraft] = useState<QuotationDraft>(INITIAL)
  const [quotationIdError, setQuotationIdError] = useState<PostgrestError | null>(null)
  const supabase = createClient()
  const qc = useQueryClient()

  // Generate Q/YYYY/MM/NNNN via DB sequence — race-condition-free
  useEffect(() => {
    ;(supabase as any)
      .rpc('generate_quotation_id')
      .then(({ data, error }: { data: string | null; error: PostgrestError | null }) => {
        if (error) {
          setQuotationIdError(error)
          return
        }
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
      division: service.division ?? '',
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

  function setDivision(slug: string) {
    setDraft((d) => {
      if (d.division === slug) return d
      return { ...d, division: slug, services: [] }
    })
  }

  function update(partial: Partial<Pick<QuotationDraft, 'notes'>>) {
    setDraft((d) => ({ ...d, ...partial }))
  }

  function setDiscountType(type: 'flat' | 'percent') {
    setDraft((d) => ({ ...d, discountType: type }))
  }

  function setDiscountValue(value: number) {
    setDraft((d) => ({ ...d, discountValue: Math.max(0, value) }))
  }

  function isValid(): boolean {
    return !!draft.customerId && draft.services.length > 0
  }

  // Single RPC call — quotation row + line items committed atomically
  async function saveToDb(status: 'draft' | 'sent'): Promise<string> {
    const sub = computeSubtotal(draft.services)
    const disc = computeDiscount(sub, draft.discountType, draft.discountValue)
    const finalTotal = roundMoney(sub - disc)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)

    const { data: quotUuid, error } = await (supabase as any).rpc('save_quotation', {
      p_quotation_id:        draft.quotationId,
      p_service_customer_id: draft.customerId,
      p_division:            draft.division,
      p_status:              status,
      p_total_amount:        finalTotal,
      p_notes:               draft.notes || '',
      p_expiry_date:         expiry.toISOString().split('T')[0],
      p_sent_date:           status === 'sent' ? new Date().toISOString() : null,
      p_line_items:          JSON.stringify(
        draft.services.map((s) => ({
          service_id: s.serviceId || null,
          name:       s.name,
          path:       s.path,
          qty:        s.qty,
          price:      s.price,
          duration:   s.duration ?? null,
        })),
      ),
      p_discount_type:  draft.discountType,
      p_discount_value: draft.discountValue,
    })
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['quotations'] })
    return quotUuid as string
  }

  const saveDraft = useMutation({
    mutationFn: () => saveToDb('draft'),
  })

  const sendViaWati = useMutation({
    mutationFn: async (pdfElement: HTMLElement) => {
      await saveToDb('draft')
      // 1. Capture PDF from DOM
      const blob = await capturePdfBlob(pdfElement)
      // 2. Upload to Supabase Storage
      const fileName = `${draft.quotationId}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('quotation-pdfs')
        .upload(fileName, blob, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)
      // 3. Get public URL
      const { data: urlData } = supabase.storage
        .from('quotation-pdfs')
        .getPublicUrl(fileName)
      const publicUrl = urlData.publicUrl
      // 4. Check Wati conversation window + send PDF
      const digits = draft.phone.replace(/\D/g, '')
      const checkRes = await fetch('/api/wati/send-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, checkWindowOnly: true }),
      })
      const checkJson = await checkRes.json()
      if (checkJson.windowClosed) throw new WindowClosedError()
      // 5. Send PDF file via Wati
      const sub = computeSubtotal(draft.services)
      const disc = computeDiscount(sub, draft.discountType, draft.discountValue)
      const finalTotal = roundMoney(sub - disc)
      const sendRes = await fetch('/api/wati/send-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:     digits,
          url:       publicUrl,
          filename:  `Quotation-${draft.quotationId}.pdf`,
          mime_type: 'application/pdf',
          caption:   `Quotation ${draft.quotationId} — Total: QAR ${finalTotal.toLocaleString()}`,
        }),
      })
      if (!sendRes.ok) {
        const errJson = await sendRes.json().catch(() => ({}))
        throw new Error((errJson as any).error ?? 'Wati file send failed')
      }
      // 6. Mark as sent
      await saveToDb('sent')
    },
  })

  const sendViaWhapi = useMutation({
    mutationFn: async (pdfElement: HTMLElement) => {
      await saveToDb('draft')
      // 1. Capture PDF from DOM
      const blob = await capturePdfBlob(pdfElement)
      // 2. Upload to Supabase Storage
      const fileName = `${draft.quotationId}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('quotation-pdfs')
        .upload(fileName, blob, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)
      // 3. Get public URL
      const { data: urlData } = supabase.storage
        .from('quotation-pdfs')
        .getPublicUrl(fileName)
      const publicUrl = urlData.publicUrl
      // 4. Send via WHAPI
      const sub = computeSubtotal(draft.services)
      const disc = computeDiscount(sub, draft.discountType, draft.discountValue)
      const finalTotal = roundMoney(sub - disc)
      const res = await fetch('/api/whapi/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:        draft.phone,
          documentUrl:  publicUrl,
          documentName: `Quotation-${draft.quotationId}.pdf`,
          text:         `Quotation ${draft.quotationId} — Total: QAR ${finalTotal.toLocaleString()}`,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'WHAPI send failed')
      // 5. Mark as sent
      await saveToDb('sent')
    },
  })

  const subtotal = computeSubtotal(draft.services)
  const discountAmount = computeDiscount(subtotal, draft.discountType, draft.discountValue)
  const total = roundMoney(subtotal - discountAmount)

  return {
    draft,
    quotationIdError,
    setCustomer,
    setDivision,
    addService,
    removeService,
    updateQty,
    update,
    setDiscountType,
    setDiscountValue,
    isValid,
    saveDraft,
    sendViaWati,
    sendViaWhapi,
    subtotal,
    discountAmount,
    total,
  }
}
