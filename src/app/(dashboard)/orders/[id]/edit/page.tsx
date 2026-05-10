// src/app/(dashboard)/orders/[id]/edit/page.tsx
'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { SiteVisitCard, SITE_VISIT_SERVICE_ID, makeSiteVisitDraft } from '@/components/orders/SiteVisitCard'
import { useEditOrder } from '@/hooks/useEditOrder'
import { useTeams } from '@/hooks/useTeams'
import type { OrderServiceDraft, OrderType } from '@/types/orders'

export default function EditOrderPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)

  const {
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
  } = useEditOrder(orderId)

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
    const match = (teams as unknown as Array<Record<string, unknown>>)?.find((t) => t['id'] === teamId)
    const teamName =
      (match?.['name_en'] as string | null | undefined) ??
      (match?.['name'] as string | null | undefined) ??
      teamId
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
      toast.success('Order updated successfully')
      router.push('/orders')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update order'
      toast.error(message)
    }
  }

  if (isLoading || !draft) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center text-sm text-slate-400">
        Loading order…
      </div>
    )
  }

  return (
    <DndContext autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative overflow-x-hidden">
        {/* Back bar */}
        <div className="flex items-center gap-2 border-b bg-white px-4 py-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-semibold text-slate-700">
            Editing {draft.orderId}
          </span>
          {existingAddress && !draft.addressSnapshot && (
            <span className="ml-auto text-xs text-slate-400 hidden sm:block">
              Address: {existingAddress}
            </span>
          )}
        </div>

        <div className="flex h-[calc(100vh-56px-41px)] flex-col overflow-hidden sm:flex-row">
          <OrderFormPanel
            draft={draft}
            pendingFiles={pendingFiles}
            onTypeChange={(t: OrderType) => update({ type: t })}
            onAddService={addService}
            onRemoveService={removeService}
            onUpdateServiceQty={updateServiceQty}
            onUpdateServiceTime={updateServiceTime}
            onAddressSelect={setAddress}
            onUpdateSiteVisitTime={updateSiteVisitTime}
            onUpdate={update}
            onLookupCustomer={() => {}}   // customer locked on edit — no lookup modal
            onPendingFilesChange={setPendingFiles}
            onSubmit={handleSubmit}
            isSubmitting={submit.isPending}
            isValid={isValid()}
            submitLabel="Save Changes"
          />

          <div className="flex-1 overflow-hidden">
            <TeamCalendarPanel
              visitDate={draft.visitDate}
              mode={draft.mode}
              onModeChange={(mode) => update({ mode })}
              assignments={draft.assignments}
              draftServices={
                draft.type === 'site-visit'
                  ? [makeSiteVisitDraft(draft.siteVisitFromTime, draft.siteVisitToTime)]
                  : draft.services
              }
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

      <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
        {draggingService ? (
          <div className="w-72 rotate-1">
            {draggingService.serviceId === SITE_VISIT_SERVICE_ID ? (
              <SiteVisitCard
                fromTime={draggingService.fromTime ?? null}
                toTime={draggingService.toTime ?? null}
                onTimeChange={() => {}}
                isOverlay
              />
            ) : (
              <SelectedServiceCard
                service={draggingService}
                onRemove={() => {}}
                onQtyChange={() => {}}
                onTimeChange={() => {}}
                isOverlay
              />
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
