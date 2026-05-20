// src/hooks/useCreateOrder.ts
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import type { OrderDraft, OrderServiceDraft, TeamAssignmentDraft, CustomerAddress, OrderAttachment, VisitDateWindow, OrderType } from '@/types/orders'
import { SITE_VISIT_SERVICE_ID } from '@/components/orders/SiteVisitCard'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { PendingAttachment } from '@/components/orders/AttachmentsUpload'

const today = new Date().toISOString().split('T')[0]

const INITIAL_DRAFT: OrderDraft = {
  orderId: '',
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  addressId: null,
  addressSnapshot: null,
  type: 'order',
  division: '',
  services: [],
  visitDate: today,
  visitDates: [{ date: today, fromTime: null, toTime: null }] as VisitDateWindow[],
  visitEndDate: null,
  mode: 'normal',
  assignments: [],
  voucherCode: '',
  voucherDiscount: 0,
  notes: '',
  arrivalPhone: '',
  attachments: [],
  siteVisitFromTime: null,
  siteVisitToTime: null,
}

async function generateOrderId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: last } = await supabase
    .from('orders')
    .select('order_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastNum = last?.order_id
    ? parseInt(last.order_id.match(/(\d+)$/)?.[1] ?? '0', 10)
    : 0
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `N/${year}/${month}/${String(lastNum + 1).padStart(4, '0')}`
}

async function generateVisitId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: last } = await (supabase as any)
    .from('site_visits')
    .select('visit_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { visit_id: string } | null }
  const lastNum = last?.visit_id
    ? parseInt(last.visit_id.match(/(\d+)$/)?.[1] ?? '0', 10)
    : 0
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `V/${year}/${month}/${String(lastNum + 1).padStart(4, '0')}`
}

export function useCreateOrder() {
  const [draft, setDraft] = useState<OrderDraft>(INITIAL_DRAFT)
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const supabase = createClient()
  const qc = useQueryClient()

  // Pre-generate the order ID on mount so it can be displayed before submit
  useEffect(() => {
    generateOrderId(supabase).then((id) => {
      setDraft((d) => ({ ...d, orderId: id }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setType(type: OrderType) {
    const newId = type === 'site-visit'
      ? await generateVisitId(supabase)
      : await generateOrderId(supabase)
    setDraft((d) => ({ ...d, type, orderId: newId }))
  }

  function setCustomer(result: CustomerLookupResult) {
    setDraft((d) => ({
      ...d,
      customerId: result.customerId,
      phoneId: result.phoneId,
      customerName: result.customerName,
      phone: result.phone,
    }))
  }

  function setAddress(address: CustomerAddress) {
    setDraft((d) => ({ ...d, addressId: address.id, addressSnapshot: address }))
  }

  function addService(service: OrderServiceDraft) {
    setDraft((d) => ({ ...d, services: [...d.services, service] }))
  }

  function removeService(serviceId: string) {
    setDraft((d) => ({
      ...d,
      services: d.services.filter((s) => s.serviceId !== serviceId),
      assignments: d.assignments
        .map((a) => ({
          ...a,
          services: a.services.filter((s) => s.serviceId !== serviceId),
        }))
        .filter((a) => a.services.length > 0),
    }))
  }

  function updateServiceQty(serviceId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, qty: Math.max(1, qty) } : s
      ),
    }))
  }

  function updateServiceTime(serviceId: string, fromTime: string | null, toTime: string | null) {
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, fromTime, toTime } : s
      ),
      // Keep calendar blocks in sync: update both start and end on assignments that carry this service
      assignments: d.assignments.map((a) =>
        a.services.some((s) => s.serviceId === serviceId)
          ? { ...a, timeSlot: fromTime ?? a.timeSlot, toTime: toTime ?? null }
          : a
      ),
    }))
  }

  function updateSiteVisitTime(fromTime: string | null, toTime: string | null) {
    setDraft((d) => ({ ...d, siteVisitFromTime: fromTime, siteVisitToTime: toTime }))
  }

  function addAssignment(assignment: Omit<TeamAssignmentDraft, 'id'>) {
    setDraft((d) => ({ ...d, assignments: [...d.assignments, { ...assignment, id: crypto.randomUUID() }] }))
  }

  function removeAssignment(id: string) {
    setDraft((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) }))
  }

  function update(patch: Partial<OrderDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function reset() {
    setDraft(INITIAL_DRAFT)
    setPendingFiles([])
  }

  function isValid(): boolean {
    if (draft.type === 'site-visit') {
      return (
        !!draft.customerId &&
        !!draft.visitDate &&
        !!draft.addressId &&
        draft.assignments.length > 0
      )
    }
    return (
      !!draft.customerId &&
      !!draft.division &&
      draft.services.length > 0 &&
      !!draft.visitDate &&
      !!draft.addressId &&
      draft.assignments.length > 0
    )
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!isValid()) throw new Error('Form is incomplete')

      const status = draft.mode === 'waitlist' ? 'waitlist' : 'scheduled'
      const addressString = draft.addressSnapshot ? formatAddressLine(draft.addressSnapshot) : null
      const sortedWindows = [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))
      const primaryDate = sortedWindows.length > 0 ? sortedWindows[0].date : draft.visitDate

      const visitDatesPayload = sortedWindows.map((w, i) => ({
        visit_date: w.date,
        from_time: w.fromTime ?? null,
        to_time: w.toTime ?? null,
        sort_order: i,
      }))

      // Upload pending files to Supabase storage before the atomic RPC
      const uploadedAttachments: OrderAttachment[] = []
      for (const item of pendingFiles) {
        const ext = item.file.name.split('.').pop() ?? 'bin'
        const storagePath = `${draft.orderId}/${item.id}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('order-attachments')
          .upload(storagePath, item.file, { upsert: true, contentType: item.file.type })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('order-attachments')
            .getPublicUrl(storagePath)
          uploadedAttachments.push({ url: publicUrl, name: item.file.name, type: item.file.type })
        }
      }

      // ── Site visit path ─────────────────────────────────────────────────────
      if (draft.type === 'site-visit') {
        const visitId = await generateVisitId(supabase)

        const assignmentsPayload = draft.assignments.map((a) => {
          let durationHours = Math.max(1, Math.ceil(a.duration / 60))
          if (a.toTime) {
            const startH = parseInt(a.timeSlot)
            const endH = parseInt(a.toTime)
            if (!isNaN(startH) && !isNaN(endH) && endH >= startH) {
              durationHours = endH - startH + 1
            }
          }
          return {
            team_id: a.teamId,
            scheduled_date: a.date ?? primaryDate,
            time_slot: a.timeSlot,
            duration: String(durationHours),
          }
        })

        const { data: newId, error } = await (supabase as any).rpc('create_site_visit', {
          p_visit_id:            visitId,
          p_service_customer_id: draft.customerId,
          p_status:         status,
          p_mode:           draft.mode,
          p_scheduled_date: primaryDate,
          p_address:        addressString ?? '',
          p_notes:          draft.notes ?? '',
          p_arrival_phone:  draft.arrivalPhone ?? '',
          p_attachments:    uploadedAttachments.length > 0 ? uploadedAttachments : null,
          p_visit_dates:    visitDatesPayload,
          p_assignments:    assignmentsPayload,
        })

        if (error) {
          if (error.message?.startsWith('slot_conflict:')) {
            throw new Error('That time slot is already taken — choose a different time or team')
          }
          const detail = (error as { details?: string }).details
          const hint   = (error as { hint?: string }).hint
          throw new Error([error.message ?? 'Failed to create site visit', detail, hint].filter(Boolean).join(' — '))
        }

        return { orderId: visitId, primaryDate, type: 'site-visit' as const }
      }

      // ── Regular order path ──────────────────────────────────────────────────
      const orderId = await generateOrderId(supabase)
      const totalAmount = draft.services.reduce((sum, s) => sum + s.price * s.qty, 0) - draft.voucherDiscount

      const servicesPayload = draft.services.map((s) => ({
        service_id: s.serviceId,
        name: s.serviceName,
        qty: s.qty,
        price: s.price,
        duration: s.duration,
        path: s.path,
        configuration: s.configuration ?? null,
        from_time: s.fromTime ?? null,
        to_time: s.toTime ?? null,
      }))

      const assignmentsPayload = draft.assignments.map((a) => {
        let durationHours = Math.max(1, Math.ceil(a.duration / 60))
        if (a.toTime) {
          const startH = parseInt(a.timeSlot)
          const endH = parseInt(a.toTime)
          if (!isNaN(startH) && !isNaN(endH) && endH > startH) {
            durationHours = endH - startH
          }
        }
        return {
          team_id: a.teamId,
          services: a.services.filter((s) => s.serviceId !== SITE_VISIT_SERVICE_ID),
          scheduled_date: a.date ?? primaryDate,
          time_slot: a.timeSlot,
          duration: String(durationHours),
        }
      })

      const { data: newOrderId, error } = await (supabase as any).rpc('create_order_with_dates', {
        p_order_id:            orderId,
        p_service_customer_id: draft.customerId,
        p_type:           draft.type,
        p_division:       draft.division,
        p_status:         status,
        p_scheduled_date: primaryDate,
        p_total_amount:   totalAmount,
        p_address:        addressString ?? '',
        p_notes:          draft.notes ?? '',
        p_arrival_phone:  draft.arrivalPhone ?? '',
        p_attachments:    uploadedAttachments.length > 0 ? uploadedAttachments : null,
        p_services:       servicesPayload,
        p_visit_dates:    visitDatesPayload,
        p_assignments:    assignmentsPayload,
        p_address_id:     draft.addressId ?? null,
      })

      if (error) {
        if (error.message?.startsWith('slot_conflict:')) {
          throw new Error('That time slot is already taken — choose a different time or team')
        }
        const detail = (error as { details?: string }).details
        const hint   = (error as { hint?: string }).hint
        throw new Error([error.message ?? 'Failed to create order', detail, hint].filter(Boolean).join(' — '))
      }

      return { orderId, primaryDate, type: draft.type }
    },
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['site-visits'] })
      reset()

      // Send confirmation immediately if the visit is within 2 days (cron would miss it)
      if (result.type !== 'site-visit') {
        const todayMs        = new Date().setHours(0, 0, 0, 0)
        const visitMs        = new Date(result.primaryDate + 'T00:00:00').getTime()
        const daysUntilVisit = Math.round((visitMs - todayMs) / 86_400_000)

        if (daysUntilVisit <= 2) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            fetch('/api/notifications/send-booking-confirmations', {
              method:  'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization:  `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ orderId: result.orderId }),
            })
              .then(async (res) => {
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}))
                  console.warn('[booking-confirm] route error', res.status, body)
                } else {
                  const body = await res.json().catch(() => ({}))
                  console.log('[booking-confirm] sent', body)
                }
              })
              .catch((err) => console.error('[booking-confirm] fetch failed', err))
          }
        }
      }
    },
  })

  return {
    draft,
    pendingFiles,
    setPendingFiles,
    setCustomer,
    setAddress,
    setType,
    addService,
    removeService,
    updateServiceQty,
    updateServiceTime,
    addAssignment,
    removeAssignment,
    updateSiteVisitTime,
    update,
    reset,
    isValid,
    submit,
  }
}
