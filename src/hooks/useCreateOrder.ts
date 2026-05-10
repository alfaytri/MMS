// src/hooks/useCreateOrder.ts
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import type { OrderDraft, OrderServiceDraft, TeamAssignmentDraft, CustomerAddress, OrderAttachment, VisitDateWindow } from '@/types/orders'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { PendingAttachment } from '@/components/orders/AttachmentsUpload'

const today = new Date().toISOString().split('T')[0]

const INITIAL_DRAFT: OrderDraft = {
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  addressId: null,
  addressSnapshot: null,
  type: 'order',
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
}

export function useCreateOrder() {
  const [draft, setDraft] = useState<OrderDraft>(INITIAL_DRAFT)
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const supabase = createClient()
  const qc = useQueryClient()

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
    }))
  }

  function addAssignment(assignment: Omit<TeamAssignmentDraft, 'id'>) {
    setDraft((d) => ({ ...d, assignments: [...d.assignments, { toTime: null, ...assignment, id: crypto.randomUUID() }] }))
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
    return (
      !!draft.customerId &&
      draft.services.length > 0 &&
      !!draft.visitDate &&
      !!draft.addressId &&
      draft.assignments.length > 0
    )
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!isValid()) throw new Error('Order is incomplete')

      const { data: last } = await supabase
        .from('orders')
        .select('order_id')
        .ilike('order_id', 'ORD-%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const nextNum = last?.order_id
        ? parseInt(last.order_id.replace('ORD-', ''), 10) + 1
        : 1
      const orderId = `ORD-${String(nextNum).padStart(4, '0')}`

      const totalAmount =
        draft.services.reduce((sum, s) => sum + s.price * s.qty, 0) - draft.voucherDiscount

      const status = draft.mode === 'waitlist' ? 'waitlist' : 'scheduled'

      const addressString = draft.addressSnapshot
        ? formatAddressLine(draft.addressSnapshot)
        : null

      // Upload pending files to Supabase storage before the atomic RPC
      const uploadedAttachments: OrderAttachment[] = []
      for (const item of pendingFiles) {
        const ext = item.file.name.split('.').pop() ?? 'bin'
        const path = `${orderId}/${item.id}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('order-attachments')
          .upload(path, item.file, { upsert: true, contentType: item.file.type })
        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('order-attachments')
            .getPublicUrl(path)
          uploadedAttachments.push({ url: publicUrl, name: item.file.name, type: item.file.type })
        }
      }

      // Primary visit date = first window in sorted order
      const sortedWindows = [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))
      const primaryDate = sortedWindows.length > 0 ? sortedWindows[0].date : draft.visitDate

      // Build payloads for the atomic RPC
      const servicesPayload = draft.services.map((s) => ({
        service_id: s.serviceId,
        name: s.serviceName,
        qty: s.qty,
        price: s.price,
        duration: s.duration,
        path: s.path,
        configuration: s.configuration ?? null,
      }))

      const visitDatesPayload = sortedWindows.map((w, i) => ({
        visit_date: w.date,
        from_time: w.fromTime ?? null,
        to_time: w.toTime ?? null,
        sort_order: i,
      }))

      const assignmentsPayload = draft.assignments.map((a) => ({
        team_id: a.teamId,
        services: a.services,
        scheduled_date: draft.visitDate,
        time_slot: a.timeSlot,
        duration: String(a.duration),
      }))

      // Single atomic RPC — all inserts in one DB transaction
      const { data: newOrderId, error } = await (supabase as any).rpc('create_order_with_dates', {
        p_order_id:       orderId,
        p_customer_id:    draft.customerId,
        p_type:           draft.type,
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
      })

      if (error) {
        // The RPC raises 'slot_conflict' via RAISE EXCEPTION with ERRCODE P0001
        if (error.message?.startsWith('slot_conflict:')) {
          throw new Error('That time slot is already taken — choose a different time or team')
        }
        throw error
      }

      return newOrderId as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      reset()
    },
  })

  return {
    draft,
    pendingFiles,
    setPendingFiles,
    setCustomer,
    setAddress,
    addService,
    removeService,
    updateServiceQty,
    updateServiceTime,
    addAssignment,
    removeAssignment,
    update,
    reset,
    isValid,
    submit,
  }
}
