'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useParentOrderForFollowUp } from '@/hooks/useParentOrderForFollowUp'
import { useFollowUpRequest } from '@/hooks/useFollowUpRequest'
import { PageContainer } from '@/components/shared/PageContainer'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateFollowUpPage() {
  const router = useRouter()
  const params = useSearchParams()
  const from   = params.get('from')      // Path B
  const reqId  = params.get('request')   // Path A

  const { data: req } = useFollowUpRequest(reqId)
  const parentId = from ?? req?.parent_order_id ?? null
  const { data: parent, isLoading: parentLoading } = useParentOrderForFollowUp(parentId)

  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)
  const [draggingDayWindow, setDraggingDayWindow] = useState<{ date: string; fromTime: string | null; toTime: string | null } | null>(null)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [initialized, setInitialized] = useState(false)

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
    updateSiteVisitTime,
    setType,
    update,
    isValid,
    submit,
  } = useCreateOrder()

  const { data: teams } = useTeams()

  // Initialize draft from parent order once it loads
  useEffect(() => {
    if (initialized || !parent) return

    // Lock the customer from parent
    setCustomer({
      found: true as const,
      customerId:   parent.customer_id,
      phoneId:      '',
      customerName: parent.customer_name,
      phone:        parent.customer_phone ?? '',
      addressCount: 0,
      orderCount:   0,
    })

    // Division: pull from parent so the calendar / service selector filter correctly
    if (parent.division) {
      update({ division: parent.division })
      setSelectedDivisions([parent.division])
    }

    // Pre-fill services from parent at 0 QAR (reused).
    // Use a synthetic prefix so they don't collide with real services the user adds.
    for (const s of parent.services) {
      addService({
        serviceId:   `reused-${s.id}`,
        serviceName: s.name,
        qty:         s.qty,
        price:       0,
        duration:    s.duration ?? 60,
        path:        [],
        fromTime:    null,
        toTime:      null,
      })
    }

    // Pre-fill date / notes from the request when on Path A
    if (req?.requested_date) {
      update({
        visitDate:  req.requested_date,
        visitDates: [{
          date:     req.requested_date,
          fromTime: req.requested_time_from ?? null,
          toTime:   req.requested_time_to ?? null,
        }],
      })
    }
    if (req?.notes) {
      update({ notes: req.notes })
    }

    setInitialized(true)
  }, [parent, req, initialized, setCustomer, update, addService])

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

    const dropData = over.data.current as { teamId: string; hour: number; minute?: number } | undefined
    if (!dropData?.teamId) return

    const { teamId, hour, minute = 0 } = dropData
    const match = (teams as TeamFull[] | undefined)?.find((t) => t.id === teamId)
    const teamName = match?.name_en ?? match?.name ?? teamId

    // ── Day-window drag: assign ALL services at the day's time window ────────
    if (active.data.current.type === 'day-window') {
      const dayData = active.data.current as { date: string; fromTime: string | null; toTime: string | null }
      if (draft.services.length === 0) return
      const timeSlot = dayData.fromTime ?? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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
    if (!service) return
    const visitWindow = draft.visitDates.find((w) => w.date === draft.visitDate)
    const timeSlot = visitWindow?.fromTime ?? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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
    if (!parent) return
    try {
      const result = await submit.mutateAsync()
      // Link the new order to its parent + flip request status. The endpoint
      // accepts the human-readable order_id and resolves it to a UUID.
      const linkRes = await fetch(`/api/orders/${encodeURIComponent(result.orderId)}/link-follow-up`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          parent_order_id:      parent.id,
          follow_up_request_id: reqId ?? null,
        }),
      })
      if (!linkRes.ok) {
        const err = await linkRes.json().catch(() => ({ error: 'link failed' }))
        toast.error(`Order created but link failed: ${err.error ?? 'unknown error'}`)
        return
      }
      toast.success('Follow-up scheduled')
      router.push('/orders')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create follow-up')
    }
  }

  if (parentLoading || !parent) {
    return (
      <PageContainer>
        <p className="p-4 text-sm text-muted-foreground">Loading parent order…</p>
      </PageContainer>
    )
  }

  return (
    <DndContext autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative overflow-hidden md:h-[calc(100vh-56px)]">
        {/* Follow-up context banner (Path A only) */}
        {req && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs">
            <span className="font-semibold">Confirming request {req.request_number}</span>
            {req.notes && <span className="ml-2 italic">&ldquo;{req.notes}&rdquo;</span>}
            {req.time_note && <span className="ml-2">Time note: {req.time_note}</span>}
          </div>
        )}

        <div className={`flex flex-col overflow-hidden md:flex-row ${req ? 'md:h-[calc(100vh-56px-32px)]' : 'md:h-[calc(100vh-56px)]'}`}>
          <OrderFormPanel
            draft={draft}
            pendingFiles={pendingFiles}
            onTypeChange={setType}
            onAddService={addService}
            onRemoveService={removeService}
            onUpdateServiceQty={updateServiceQty}
            onUpdateServiceTime={updateServiceTime}
            onAddressSelect={setAddress}
            onUpdateSiteVisitTime={updateSiteVisitTime}
            onUpdate={update}
            onLookupCustomer={() => { /* customer is locked from parent */ }}
            onDivisionsChange={setSelectedDivisions}
            onPendingFilesChange={setPendingFiles}
            onSubmit={handleSubmit}
            isSubmitting={submit.isPending}
            isValid={isValid()}
            submitLabel="Confirm & Schedule"
          />

          <div className="flex-1 overflow-hidden">
            <TeamCalendarPanel
              visitDate={draft.visitDate}
              primaryVisitDate={
                draft.visitDates.length > 0
                  ? [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))[0].date
                  : draft.visitDate
              }
              mode={draft.mode}
              onModeChange={(mode) => update({ mode })}
              assignments={draft.assignments}
              draftServices={draft.services}
              draftInfo={{
                orderId:      draft.orderId,
                customerName: draft.customerName,
                phone:        draft.phone || draft.arrivalPhone,
                notes:        draft.notes,
                mode:         draft.mode,
              }}
              draggingService={draggingService}
              onAssign={addAssignment}
              onRemoveAssignment={removeAssignment}
              onDateChange={(date) => update({ visitDate: date })}
              divisionSlugs={selectedDivisions}
              initialTeamId={parent.team_id ?? undefined}
            />
          </div>
        </div>
      </div>

      {/* Drag ghost (portal-rendered to document.body) */}
      <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
        {draggingDayWindow ? (
          <div className="w-72 rotate-1 rounded-xl border border-orange-300 bg-white shadow-2xl ring-1 ring-orange-200 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
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
                <p key={s.serviceId} className="truncate text-xs text-foreground">
                  {s.qty > 1 && <span className="font-semibold text-muted-foreground">{s.qty}× </span>}
                  {s.serviceName}
                </p>
              ))}
            </div>
          </div>
        ) : draggingService ? (
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
