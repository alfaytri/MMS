// src/app/(dashboard)/orders/[id]/edit/page.tsx
'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
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
  const [draggingDayWindow, setDraggingDayWindow] = useState<{ date: string; fromTime: string | null; toTime: string | null } | null>(null)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])

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
    } else if (data.current?.type === 'day-window') {
      setDraggingDayWindow({
        date:     data.current.date     as string,
        fromTime: data.current.fromTime as string | null,
        toTime:   data.current.toTime   as string | null,
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingService(null)
    setDraggingDayWindow(null)
    const { active, over } = event
    if (!over || !active.data.current) return

    const dropData = over.data.current as { teamId: string; hour: number } | undefined
    if (!dropData?.teamId) return

    const { teamId, hour } = dropData
    const match = (teams as unknown as Array<Record<string, unknown>>)?.find((t) => t['id'] === teamId)
    const teamName =
      (match?.['name_en'] as string | null | undefined) ??
      (match?.['name'] as string | null | undefined) ??
      teamId

    // ── Day-window drag: assign ALL services at the day's time window ────────
    if (active.data.current.type === 'day-window') {
      const dayData = active.data.current as { date: string; fromTime: string | null; toTime: string | null }
      if (!draft || draft.services.length === 0) return
      const timeSlot = dayData.fromTime ?? `${String(hour).padStart(2, '0')}:00`
      const toTime   = dayData.toTime ?? null
      const totalDuration = draft.services.reduce((sum, s) => sum + s.duration, 0)
      addAssignment({
        teamId,
        teamName,
        services: draft.services.map((s) => ({ serviceId: s.serviceId, qty: s.qty })),
        timeSlot,
        toTime,
        duration: totalDuration,
        date: dayData.date,
      })
      return
    }

    // ── Single-service drag ──────────────────────────────────────────────────
    const service = active.data.current.service as OrderServiceDraft | undefined
    if (!service || !draft) return
    const visitWindow = draft.visitDates.find((w) => w.date === draft.visitDate)
    const timeSlot = visitWindow?.fromTime ?? `${String(hour).padStart(2, '0')}:00`
    const toTime   = visitWindow?.toTime ?? null

    addAssignment({
      teamId,
      teamName,
      services: [{ serviceId: service.serviceId, qty: service.qty }],
      timeSlot,
      toTime,
      duration: service.duration,
      date: draft.visitDate,
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
    <DndContext autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
            onDivisionsChange={setSelectedDivisions}
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
              editingOrderNumber={draft.orderId}
              divisionSlugs={selectedDivisions}
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
        {draggingDayWindow ? (
          <div className="w-72 rotate-1 rounded-xl border border-orange-300 bg-white shadow-2xl ring-1 ring-orange-200 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">
                {new Date(draggingDayWindow.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {draggingDayWindow.fromTime && (
                <span className="text-[11px] font-semibold text-orange-600">
                  {(() => {
                    const fmt = (t: string) => { const h = parseInt(t); const m = t.split(':')[1]; const p = h < 12 ? 'AM' : 'PM'; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${m} ${p}` }
                    return draggingDayWindow.toTime
                      ? `${fmt(draggingDayWindow.fromTime)} → ${fmt(draggingDayWindow.toTime)}`
                      : `From ${fmt(draggingDayWindow.fromTime)}`
                  })()}
                </span>
              )}
            </div>
            <div className="border-t border-slate-100" />
            <div className="space-y-0.5">
              {draft.services.map((s) => (
                <p key={s.serviceId} className="truncate text-xs text-slate-700">
                  {s.qty > 1 && <span className="font-semibold text-slate-500">{s.qty}× </span>}
                  {s.serviceName}
                </p>
              ))}
            </div>
          </div>
        ) : draggingService ? (
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
