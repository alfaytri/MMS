// src/hooks/useCreateQuotation.ts
'use client'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { QuotationDraft, QuotationLineDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'
import type { PostgrestError } from '@supabase/supabase-js'
import { roundMoney, computeDiscount } from '@/lib/money'

// Fetch the quotation PDF URL from the server-side generator. Replaces the
// old DOM-screenshot pipeline (html2canvas + jspdf + manual storage upload)
// with a single API call — Puppeteer renders the same HTML the editor's
// iframe preview shows, uploads to Storage, and returns the public URL.
async function fetchGeneratedPdfUrl(
  quotationUuid: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  const res = await fetch(`/api/quotations/${quotationUuid}/generate-pdf`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.url) {
    throw new Error(body?.error ?? `PDF generation failed (HTTP ${res.status})`)
  }
  return body.url as string
}

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

export function useCreateQuotation(initialDraft?: QuotationDraft | null) {
  const [draft, setDraft] = useState<QuotationDraft>(initialDraft ?? INITIAL)
  const [quotationIdError, setQuotationIdError] = useState<PostgrestError | null>(null)
  const supabase = createClient()
  const qc = useQueryClient()

  // For new quotations, generate Q/YYYY/MM/NNNN via DB sequence — race-condition-free.
  // For edits (initialDraft.quotationId is set), skip generation and reuse the
  // existing id so save_order_quotation upserts the same row.
  useEffect(() => {
    if (initialDraft?.quotationId) return
    ;supabase
      .rpc('generate_order_quotation_id')
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

    // Read the admin-configurable validity (days) from app_settings.
    // Falls back to 30 if the row is missing or value is malformed.
    const { data: validityRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'order_quotation_validity_days')
      .maybeSingle()
    const validityDays = Number(
      (validityRow?.value as { days?: number } | null)?.days,
    )
    const days = Number.isFinite(validityDays) && validityDays > 0 ? validityDays : 30
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + days)

    const { data: quotUuid, error } = await supabase.rpc('save_order_quotation', {
      p_quotation_id:        draft.quotationId,
      p_service_customer_id: draft.customerId,
      p_division:            draft.division,
      p_status:              status,
      p_total_amount:        finalTotal,
      p_notes:               draft.notes || '',
      p_expiry_date:         expiry.toISOString().split('T')[0],
      // sent_date is only meaningful when status === 'sent'. For drafts we
      // pass NULL — PostgREST rejects empty strings on timestamptz params.
      p_sent_date:           (status === 'sent' ? new Date().toISOString() : null) as unknown as string,
      // Pass the array directly — NOT JSON.stringify'd. PostgREST serialises
      // it into jsonb itself; pre-stringifying made it a scalar string and
      // jsonb_array_elements() threw 22023 "cannot extract elements from a scalar".
      p_line_items: draft.services.map((s) => ({
        service_id: s.serviceId || null,
        name:       s.name,
        path:       s.path,
        qty:        s.qty,
        price:      s.price,
        duration:   s.duration ?? null,
      })),
      p_discount_type:  draft.discountType,
      p_discount_value: draft.discountValue,
    })
    if (error) {
      // Surface the full PostgREST error in the console so the actual
      // database message (missing column, type mismatch, RLS, etc.) is visible
      // — the supabase-js wrapper otherwise hides it in `error.message`.
      console.error('[save_order_quotation] failed', {
        message:  error.message,
        details:  (error as { details?: string }).details,
        hint:     (error as { hint?: string }).hint,
        code:     (error as { code?: string }).code,
        sentArgs: { quotation_id: draft.quotationId, status, sub: finalTotal },
      })
      const parts = [
        error.message,
        (error as { details?: string }).details,
        (error as { hint?: string }).hint,
      ].filter(Boolean)
      throw new Error(parts.join(' — ') || 'Failed to save order quotation')
    }
    qc.invalidateQueries({ queryKey: queryKeys.quotations.all })
    qc.invalidateQueries({ queryKey: queryKeys.quotations.counts })
    qc.invalidateQueries({ queryKey: ['quotation-detail'] })
    return quotUuid as string
  }

  const saveDraft = useMutation({
    mutationFn: () => saveToDb('draft'),
  })

  const sendViaWati = useMutation({
    mutationFn: async () => {
      // 1. Save draft + generate PDF server-side
      const uuid = await saveToDb('draft')
      const publicUrl = await fetchGeneratedPdfUrl(uuid, supabase)
      // 2. Check Wati conversation window
      const digits = draft.phone.replace(/\D/g, '')
      const checkRes = await fetch('/api/wati/send-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, checkWindowOnly: true }),
      })
      const checkJson = await checkRes.json()
      if (checkJson.windowClosed) throw new WindowClosedError()
      // 3. Send PDF file via Wati
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
        throw new Error((errJson as Record<string, string>).error ?? 'Wati file send failed')
      }
      // 4. Mark as sent
      await saveToDb('sent')
    },
  })

  const sendViaWhapi = useMutation({
    mutationFn: async () => {
      // 1. Save draft + generate PDF server-side
      const uuid = await saveToDb('draft')
      const publicUrl = await fetchGeneratedPdfUrl(uuid, supabase)
      // 2. Send via WHAPI
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
      // 3. Mark as sent
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
