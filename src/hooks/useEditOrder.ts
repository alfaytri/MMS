// src/hooks/useEditOrder.ts
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { SITE_VISIT_SERVICE_ID } from '@/components/orders/SiteVisitCard'
import { useOrderDetail } from './useOrderDetail'
import { effectiveUnitPrice } from '@/lib/orders/pricing'
import { addOrBumpService } from '@/lib/orders/draft-services'
import { queryKeys } from '@/lib/queryKeys'
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

    const services: OrderServiceDraft[] = order.order_services.map((s) => {
      const svc = s as typeof s & { from_time?: string | null; to_time?: string | null }
      return {
        serviceId: s.service_id ?? s.id,
        serviceName: s.name,
        path: s.path ?? [],
        qty: s.qty,
        price: s.price,
        duration: s.duration,
        fromTime: svc.from_time ? svc.from_time.substring(0, 5) : null,
        toTime: svc.to_time ? svc.to_time.substring(0, 5) : null,
      }
    })

    const visitDates: VisitDateWindow[] = (order.order_visit_dates ?? []).length > 0
      ? order.order_visit_dates.map((v) => ({
          date: v.visit_date,
          fromTime: v.from_time ?? null,
          toTime: v.to_time ?? null,
        }))
      : [{ date: order.scheduled_date ?? '', fromTime: null, toTime: null }]

    setExistingAddress(order.address ?? '')

    // Pre-populate the address from the joined service_customer_addresses
    // record so the user doesn't have to re-select it just to edit other fields.
    const orderExt = order as typeof order & {
      service_customer_addresses?: {
        id: string; label?: string | null; building?: string | null; street?: string | null;
        zone?: string | null; lat?: number | null; lng?: number | null; is_primary?: boolean;
        is_geocoded?: boolean; waze_link?: string | null; tags?: string[]; created_at?: string
      } | null
      service_customer_id?: string | null
      address_id?: string | null
    }
    const addrRow = orderExt.service_customer_addresses ?? null
    const addressSnapshot: CustomerAddress | null = addrRow
      ? {
          id:           addrRow.id,
          customer_id:  orderExt.service_customer_id ?? '',
          phone_id:     null,
          label:        addrRow.label ?? null,
          address_type: 'blue-plate',
          unit:         null,
          building:     addrRow.building ?? null,
          street:       addrRow.street ?? null,
          zone:         addrRow.zone ?? null,
          lat:          addrRow.lat ?? null,
          lng:          addrRow.lng ?? null,
          is_primary:   !!addrRow.is_primary,
          is_geocoded:  addrRow.is_geocoded ?? false,
          waze_link:    addrRow.waze_link ?? null,
          tags:         addrRow.tags ?? [],
          created_at:   addrRow.created_at ?? '',
        }
      : null

    setDraft({
      orderId: order.order_id,
      customerId: orderExt.service_customer_id ?? order.customer_id,
      phoneId: '',
      customerName: order.customer_name,
      phone: order.customer_phone,
      addressId:       orderExt.address_id ?? null,
      addressSnapshot: addressSnapshot,
      type: order.type as OrderType,
      division: order.division ?? '',
      services,
      visitDate: order.scheduled_date ?? '',
      visitDates,
      visitEndDate: null,
      // Load the real mode so an emergency order opens as Emergency (and prices
      // as such) instead of silently reverting to Normal on save.
      mode: (order as typeof order & { is_emergency?: boolean | null }).is_emergency ? 'emergency' : 'normal',
      assignments,
      voucherCode: '',
      voucherDiscount: 0,
      notes: order.notes ?? '',
      arrivalPhone: order.arrival_phone ?? '',
      attachments: [],
      siteVisitFromTime: null,
      siteVisitToTime: null,
    })
  }, [order])

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
    setDraft((d) => d ? ({ ...d, services: addOrBumpService(d.services, service, (s) => s.serviceId) }) : d)
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

      // Build the payloads for the atomic edit RPC (mirrors create_order_with_dates).
      // Emergency pricing is resolved here via effectiveUnitPrice, exactly like create.
      const servicesPayload = draft.services.map((s) => ({
        service_id: s.serviceId === SITE_VISIT_SERVICE_ID ? null : s.serviceId,
        name: s.serviceName,
        qty: s.qty,
        price: effectiveUnitPrice(s, draft.mode),
        duration: s.duration,
        path: s.path ?? [],
        from_time: s.fromTime ?? null,
        to_time: s.toTime ?? null,
      }))

      const assignmentsPayload = draft.assignments
        .filter((a) => a.services.every((s) => s.serviceId !== SITE_VISIT_SERVICE_ID))
        .map((a) => {
          let durationHours = Math.max(1, Math.ceil(a.duration / 60))
          if (a.toTime) {
            const startH = parseInt(a.timeSlot)
            const endH = parseInt(a.toTime)
            if (!isNaN(startH) && !isNaN(endH) && endH >= startH) durationHours = endH - startH + 1
          }
          return {
            team_id: a.teamId,
            services: a.services,
            scheduled_date: primaryDate,
            time_slot: a.timeSlot,
            duration: String(durationHours),
          }
        })

      const visitDatesPayload = sortedWindows.map((w, i) => ({
        visit_date: w.date,
        from_time: w.fromTime ?? null,
        to_time: w.toTime ?? null,
        sort_order: i,
      }))

      const totalAmount =
        draft.services.reduce((sum, s) => sum + effectiveUnitPrice(s, draft.mode) * s.qty, 0) - draft.voucherDiscount

      // Single atomic call — updates the order and replaces all children in one
      // transaction (no more partial-failure gutting), and logs the real editor
      // server-side via auth.uid() instead of a hardcoded 'agent'.
      const { error } = await supabase.rpc('edit_order_with_dates' as never, {
        p_order_id: orderId,
        p_division: draft.division || null,
        p_scheduled_date: primaryDate,
        p_total_amount: totalAmount,
        p_address: addressString || null,
        p_notes: draft.notes || null,
        p_arrival_phone: draft.arrivalPhone || null,
        p_is_emergency: draft.mode === 'emergency',
        p_services: servicesPayload,
        p_assignments: assignmentsPayload,
        p_visit_dates: visitDatesPayload,
      } as never)
      if (error) throw error

      return { orderReadableId: draft.orderId, primaryDate }
    },
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.orders.all })
      qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) })
      qc.invalidateQueries({ queryKey: queryKeys.siteVisits.all })

      // Re-send confirmation immediately if visit is within 2 days;
      // for far-future orders the cron will pick it up (confirmation_sent_at is now null).
      const todayMs        = new Date().setHours(0, 0, 0, 0)
      const visitMs        = new Date(result.primaryDate + 'T00:00:00').getTime()
      const daysUntilVisit = Math.round((visitMs - todayMs) / 86_400_000)

      if (daysUntilVisit <= 2) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          fetch('/api/notifications/send-booking-confirmations', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body:    JSON.stringify({ orderId: result.orderReadableId }),
          })
            .catch(() => {})
        }
      }
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
