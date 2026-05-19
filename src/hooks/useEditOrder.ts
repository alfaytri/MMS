// src/hooks/useEditOrder.ts
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { SITE_VISIT_SERVICE_ID } from '@/components/orders/SiteVisitCard'
import { useOrderDetail } from './useOrderDetail'
import type {
  OrderDraft,
  OrderServiceDraft,
  TeamAssignmentDraft,
  CustomerAddress,
  OrderType,
  VisitDateWindow,
} from '@/types/orders'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { PendingAttachment } from '@/components/orders/AttachmentsUpload'

/** Compute toTime string ("HH:00") from timeSlot + durationHours */
function computeToTime(timeSlot: string, durationHours: number): string | null {
  const h = parseInt(timeSlot)
  if (isNaN(h)) return null
  return `${String(h + durationHours - 1).padStart(2, '0')}:00`
}

export function useEditOrder(orderId: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: order, isLoading } = useOrderDetail(orderId)

  const [draft, setDraft] = useState<OrderDraft | null>(null)
  const [existingAddress, setExistingAddress] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])

  // Initialise draft once the order loads
  useEffect(() => {
    if (!order) return

    const durationHours = (raw: number | string) => {
      const n = typeof raw === 'string' ? parseInt(raw) : raw
      return isNaN(n) || n < 1 ? 1 : n
    }

    const assignments: TeamAssignmentDraft[] = order.order_team_assignments.map((a) => {
      const dh = durationHours(a.duration)
      return {
        id: crypto.randomUUID(),
        teamId: a.team_id,
        teamName: a.team_name,
        services: (a.services as Array<{ serviceId: string; qty: number }>) ?? [],
        timeSlot: a.time_slot,
        toTime: computeToTime(a.time_slot, dh),
        duration: dh * 60,  // store in minutes (same as create flow)
      }
    })

    const services: OrderServiceDraft[] = order.order_services.map((s) => ({
      serviceId: s.service_id ?? s.id,
      serviceName: s.name,
      path: s.path ?? [],
      qty: s.qty,
      price: s.price,
      duration: s.duration,
      fromTime: (s as any).from_time ? (s as any).from_time.substring(0, 5) : null,
      toTime: (s as any).to_time ? (s as any).to_time.substring(0, 5) : null,
    }))

    const visitDates: VisitDateWindow[] = (order.order_visit_dates ?? []).length > 0
      ? order.order_visit_dates.map((v) => ({
          date: v.visit_date,
          fromTime: v.from_time ?? null,
          toTime: v.to_time ?? null,
        }))
      : [{ date: order.scheduled_date ?? '', fromTime: null, toTime: null }]

    setExistingAddress(order.address ?? '')
    setDraft({
      orderId: order.order_id,
      customerId: (order as any).service_customer_id ?? order.customer_id,
      phoneId: '',
      customerName: order.customer_name,
      phone: order.customer_phone,
      addressId: null,           // force re-select to change address
      addressSnapshot: null,
      type: order.type as OrderType,
      division: order.division ?? '',
      services,
      visitDate: order.scheduled_date ?? '',
      visitDates,
      visitEndDate: null,
      mode: 'normal',
      assignments,
      voucherCode: '',
      voucherDiscount: 0,
      notes: order.notes ?? '',
      arrivalPhone: order.arrival_phone ?? '',
      attachments: [],
      siteVisitFromTime: null,
      siteVisitToTime: null,
    })
  }, [order])  // eslint-disable-line react-hooks/exhaustive-deps

  function setCustomer(result: CustomerLookupResult) {
    setDraft((d) => d ? ({
      ...d,
      customerId: result.customerId,
      phoneId: result.phoneId,
      customerName: result.customerName,
      phone: result.phone,
    }) : d)
  }

  function setAddress(address: CustomerAddress) {
    setDraft((d) => d ? ({ ...d, addressId: address.id, addressSnapshot: address }) : d)
  }

  function addService(service: OrderServiceDraft) {
    setDraft((d) => d ? ({ ...d, services: [...d.services, service] }) : d)
  }

  function removeService(serviceId: string) {
    setDraft((d) => {
      if (!d) return d
      return {
        ...d,
        services: d.services.filter((s) => s.serviceId !== serviceId),
        assignments: d.assignments
          .map((a) => ({ ...a, services: a.services.filter((s) => s.serviceId !== serviceId) }))
          .filter((a) => a.services.length > 0),
      }
    })
  }

  function updateServiceQty(serviceId: string, qty: number) {
    setDraft((d) => d ? ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, qty: Math.max(1, qty) } : s
      ),
    }) : d)
  }

  function updateServiceTime(serviceId: string, fromTime: string | null, toTime: string | null) {
    setDraft((d) => d ? ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, fromTime, toTime } : s
      ),
      assignments: d.assignments.map((a) =>
        a.services.some((s) => s.serviceId === serviceId)
          ? { ...a, toTime: toTime ?? null }
          : a
      ),
    }) : d)
  }

  function updateSiteVisitTime(fromTime: string | null, toTime: string | null) {
    setDraft((d) => d ? ({ ...d, siteVisitFromTime: fromTime, siteVisitToTime: toTime }) : d)
  }

  function addAssignment(assignment: Omit<TeamAssignmentDraft, 'id'>) {
    setDraft((d) => d ? ({
      ...d,
      assignments: [...d.assignments, { ...assignment, id: crypto.randomUUID() }],
    }) : d)
  }

  function removeAssignment(id: string) {
    setDraft((d) => d ? ({
      ...d,
      assignments: d.assignments.filter((a) => a.id !== id),
    }) : d)
  }

  function update(patch: Partial<OrderDraft>) {
    setDraft((d) => d ? ({ ...d, ...patch }) : d)
  }

  function isValid(): boolean {
    if (!draft) return false
    const hasAddress = !!draft.addressId || !!existingAddress
    if (draft.type === 'site-visit') {
      return !!draft.customerId && !!draft.visitDate && hasAddress && draft.assignments.length > 0
    }
    return (
      !!draft.customerId &&
      !!draft.division &&
      draft.services.length > 0 &&
      !!draft.visitDate &&
      hasAddress &&
      draft.assignments.length > 0
    )
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Draft not ready')

      const sortedWindows = [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))
      const primaryDate = sortedWindows.length > 0 ? sortedWindows[0].date : draft.visitDate

      const addressString = draft.addressSnapshot
        ? [
            draft.addressSnapshot.building,
            draft.addressSnapshot.street,
            draft.addressSnapshot.zone,
          ]
            .filter(Boolean)
            .join(', ')
        : existingAddress

      // 1. Update orders row
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          division: (draft.division || null) as any,
          scheduled_date: primaryDate,
          notes: draft.notes || null,
          arrival_phone: draft.arrivalPhone || null,
          address: addressString || null,
          total_amount: draft.services.reduce((sum, s) => sum + s.price * s.qty, 0) - draft.voucherDiscount,
        })
        .eq('id', orderId)
      if (orderErr) throw orderErr

      // 2. Replace services
      const { error: delSvcErr } = await supabase.from('order_services').delete().eq('order_id', orderId)
      if (delSvcErr) throw delSvcErr
      if (draft.services.length > 0) {
        const { error: insSvcErr } = await (supabase as any).from('order_services').insert(
          draft.services.map((s) => ({
            order_id: orderId,
            service_id: s.serviceId === SITE_VISIT_SERVICE_ID ? null : s.serviceId,
            name: s.serviceName,
            qty: s.qty,
            price: s.price,
            duration: s.duration,
            path: s.path ?? [],
            from_time: s.fromTime ?? null,
            to_time: s.toTime ?? null,
          }))
        )
        if (insSvcErr) throw insSvcErr
      }

      // 3. Replace team assignments
      const { error: delAsnErr } = await supabase
        .from('order_team_assignments')
        .delete()
        .eq('order_id', orderId)
      if (delAsnErr) throw delAsnErr

      const asnPayload = draft.assignments
        .filter((a) => a.services.every((s) => s.serviceId !== SITE_VISIT_SERVICE_ID))
        .map((a) => {
          let durationHours = Math.max(1, Math.ceil(a.duration / 60))
          if (a.toTime) {
            const startH = parseInt(a.timeSlot)
            const endH = parseInt(a.toTime)
            if (!isNaN(startH) && !isNaN(endH) && endH >= startH) durationHours = endH - startH + 1
          }
          return {
            order_id: orderId,
            team_id: a.teamId,
            services: a.services,
            scheduled_date: primaryDate,
            time_slot: a.timeSlot,
            duration: String(durationHours),
          }
        })
      if (asnPayload.length > 0) {
        const { error: insAsnErr } = await supabase.from('order_team_assignments').insert(asnPayload)
        if (insAsnErr) throw insAsnErr
      }

      // 4. Replace visit dates
      const { error: delDatesErr } = await (supabase as any)
        .from('order_visit_dates')
        .delete()
        .eq('order_id', orderId)
      if (delDatesErr) throw delDatesErr
      if (sortedWindows.length > 0) {
        const { error: insDatesErr } = await (supabase as any).from('order_visit_dates').insert(
          sortedWindows.map((w, i) => ({
            order_id: orderId,
            visit_date: w.date,
            from_time: w.fromTime ?? null,
            to_time: w.toTime ?? null,
            sort_order: i,
          }))
        )
        if (insDatesErr) throw insDatesErr
      }

      // 5. Log
      await supabase.from('order_log').insert({
        order_id: orderId,
        action: 'edited',
        user_name: 'agent',
        details: `Order updated — date: ${primaryDate}`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order-detail', orderId] })
      qc.invalidateQueries({ queryKey: ['site-visits'] })
    },
  })

  return {
    draft,
    existingAddress,
    pendingFiles,
    setPendingFiles,
    isLoading,
    setCustomer,
    setAddress,
    addService,
    removeService,
    updateServiceQty,
    updateServiceTime,
    updateSiteVisitTime,
    addAssignment,
    removeAssignment,
    update,
    isValid,
    submit,
  }
}
