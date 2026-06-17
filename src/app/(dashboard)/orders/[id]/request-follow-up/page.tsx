'use client'
import { use } from 'react'
import { useOrderDetail } from '@/hooks/useOrderDetail'
import { RequestFollowUpForm } from '@/components/orders/RequestFollowUpForm'
import { PageContainer } from '@/components/shared/PageContainer'

export default function RequestFollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrderDetail(id)

  if (isLoading) {
    return (
      <PageContainer>
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    )
  }
  if (!order) {
    return (
      <PageContainer>
        <p className="p-4 text-sm text-destructive">Order not found.</p>
      </PageContainer>
    )
  }
  if (order.status !== 'completed') {
    return (
      <PageContainer>
        <p className="p-4 text-sm text-destructive">Follow-up can only be requested on completed orders.</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <RequestFollowUpForm
        parentOrderId={order.id}
        parentOrderNumber={order.order_id}
        customerName={order.customer_name}
        services={order.order_services.map((s) => ({ id: s.id, name: s.name }))}
      />
    </PageContainer>
  )
}
