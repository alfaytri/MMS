// src/app/(dashboard)/orders/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import { useTeams } from '@/hooks/useTeams'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateOrderPage() {
  const router = useRouter()
  const [lookupOpen, setLookupOpen] = useState(true)
  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)

  const {
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
    isValid,
    submit,
  } = useCreateOrder()

  const { data: teams } = useTeams()

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active
    if (data.current?.type === 'service') {
      setDraggingService(data.current.service as OrderServiceDraft)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingService(null)
    const { active, over } = event
    if (!over || !active.data.current) return

    const service = active.data.current.service as OrderServiceDraft
    const dropData = over.data.current as { teamId: string; hour: number } | undefined
    if (!dropData?.teamId) return

    const { teamId, hour } = dropData
    const match = (teams as unknown as Array<Record<string, unknown>>)?.find(
      (t) => t['id'] === teamId,
    )
    const teamName = (match?.['name_en'] as string | null | undefined) ??
      (match?.['name'] as string | null | undefined) ??
      teamId
    // If the service has a preferred fromTime, use it; otherwise use the dropped cell hour
    const timeSlot = service.fromTime ?? `${String(hour).padStart(2, '0')}:00`

    addAssignment({
      teamId,
      teamName,
      services: [{ serviceId: service.serviceId, qty: service.qty }],
      timeSlot,
      toTime: service.toTime ?? null,
      duration: service.duration,
    })
  }

  async function handleSubmit() {
    try {
      await submit.mutateAsync()
      toast.success('Order created successfully')
      router.push('/orders')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create order'
      toast.error(message)
    }
  }

  return (
    <DndContext autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative overflow-x-hidden">
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={(result) => {
          setCustomer(result)
          setLookupOpen(false)
        }}
      />

      {/* Three-panel layout:
          - OrderFormPanel: fixed 340 px on sm+, full-width on mobile
          - TeamCalendarPanel: flex-1, scrollable
          - CustomerHistoryPanel: fixed 320 px, collapsible
      */}
      <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden sm:flex-row">
        <OrderFormPanel
          draft={draft}
          pendingFiles={pendingFiles}
          onTypeChange={(type) => update({ type })}
          onAddService={addService}
          onRemoveService={removeService}
          onUpdateServiceQty={updateServiceQty}
          onUpdateServiceTime={updateServiceTime}
          onAddressSelect={setAddress}
          onUpdate={update}
          onLookupCustomer={() => setLookupOpen(true)}
          onPendingFilesChange={setPendingFiles}
          onSubmit={handleSubmit}
          isSubmitting={submit.isPending}
          isValid={isValid()}
        />

        <div className="flex-1 overflow-hidden">
          <TeamCalendarPanel
            visitDate={draft.visitDate}
            mode={draft.mode}
            onModeChange={(mode) => update({ mode })}
            assignments={draft.assignments}
            draftServices={draft.services}
            draftInfo={{
              orderId: draft.orderId,
              customerName: draft.customerName,
              phone: draft.phone || draft.arrivalPhone,
              notes: draft.notes,
              mode: draft.mode,
            }}
            draggingService={draggingService}
            onAssign={addAssignment}
            onRemoveAssignment={removeAssignment}
            onDateChange={(date) => update({ visitDate: date })}
          />
        </div>

        <CustomerHistoryPanel
          customerId={draft.customerId || null}
          onViewOrder={(id) => window.open(`/orders/${id}`, '_blank')}
          onCreateBackwork={(id) => router.push(`/orders/create-backwork?from=${id}`)}
        />
      </div>
      </div>

      {/* Portal-rendered drag ghost — renders at document.body, never clipped by sidebar overflow */}
      <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
        {draggingService ? (
          <div className="w-72 rotate-1">
            <SelectedServiceCard
              service={draggingService}
              onRemove={() => {}}
              onQtyChange={() => {}}
              onTimeChange={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
