// src/hooks/useCreateOrder.ts
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import type { OrderDraft, OrderServiceDraft, TeamAssignmentDraft, CustomerAddress } from '@/types/orders'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'

const INITIAL_DRAFT: OrderDraft = {
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  addressId: null,
  addressSnapshot: null,
  type: 'order',
  services: [],
  visitDate: new Date().toISOString().split('T')[0],
  visitEndDate: null,
  mode: 'normal',
  assignments: [],
  voucherCode: '',
  voucherDiscount: 0,
  notes: '',
}

export function useCreateOrder() {
  const [draft, setDraft] = useState<OrderDraft>(INITIAL_DRAFT)
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

      const { data: order, error } = await (supabase as any)
        .from('orders')
        .insert({
          order_id: orderId,
          customer_id: draft.customerId,
          type: draft.type,
          status,
          confirmation_status: 'not_sent',
          scheduled_date: draft.visitDate,
          total_amount: totalAmount,
          address: addressString,
          notes: draft.notes || null,
          has_invoice: false,
        })
        .select('id')
        .single()

      if (error || !order) throw error ?? new Error('Failed to create order')

      if (draft.services.length > 0) {
        await (supabase as any).from('order_services').insert(
          draft.services.map((s) => ({
            order_id: order.id,
            service_id: s.serviceId,
            name: s.serviceName,
            qty: s.qty,
            price: s.price,
            duration: s.duration,
            path: s.path,
            configuration: s.configuration ?? null,
          }))
        )
      }

      if (draft.assignments.length > 0) {
        const { error: assignError } = await (supabase as any).from('order_team_assignments').insert(
          draft.assignments.map((a) => ({
            order_id: order.id,
            team_id: a.teamId,
            services: a.services,
            scheduled_date: draft.visitDate,
            time_slot: a.timeSlot,
            duration: a.duration,
          }))
        )
        if (assignError) {
          if (assignError.code === '23505') {
            throw new Error('That time slot is already taken — choose a different time or team')
          }
          throw assignError
        }
      }

      await (supabase as any).from('order_log').insert({
        order_id: order.id,
        action: 'created',
        user_name: 'agent',
        details: `Order ${orderId} created`,
      })

      return order.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      reset()
    },
  })

  return {
    draft,
    setCustomer,
    setAddress,
    addService,
    removeService,
    addAssignment,
    removeAssignment,
    update,
    reset,
    isValid,
    submit,
  }
}
