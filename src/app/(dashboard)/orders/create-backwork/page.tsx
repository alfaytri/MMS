'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { BackworkServicePicklist } from '@/components/orders/BackworkServicePicklist'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useParentOrderForFollowUp } from '@/hooks/useParentOrderForFollowUp'
import { backworkDraftService } from '@/lib/orders/backworkDraftService'
import { PageContainer } from '@/components/shared/PageContainer'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateBackworkPage() {
  const router = useRouter()
  const params = useSearchParams()
  const from   = params.get('from')

  const { data: parent, isLoading: parentLoading } = useParentOrderForFollowUp(from)

  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)
  const [draggingDayWindow, setDraggingDayWindow] = useState<{ date: string; fromTime: string | null; toTime: string | null } | null>(null)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  const {
    draft, pendingFiles, setPendingFiles, setCustomer, setAddress,
    addService, removeService, updateServiceQty, updateServiceTime,
    addAssignment, removeAssignment, updateSiteVisitTime, setType, update, isValid, submit,
  } = useCreateOrder({ kind: 'backwork' })

  const { data: teams } = useTeams()

  // Lock customer / division / address from the parent (no services auto-added —
  // the operator ticks which ones need backwork).
  useEffect(() => {
    if (initialized || !parent) return
    setCustomer({
      found: true as const,
      customerId:   parent.customer_id,
      phoneId:      '',
      customerName: parent.customer_name,
      phone:        parent.customer_phone ?? '',
      addressCount: 0,
      orderCount:   0,
    })
    if (parent.division) {
      update({ division: parent.division })
      setSelectedDivisions([parent.division])
    }
    setInitialized(true)
  }, [parent, initialized, setCustomer, update])

  // Ticking a parent service adds a 0-QAR backwork line; unticking removes it.
  function handleToggle(parentServiceId: string, checked: boolean) {
    const s = parent?.services.find((x) => x.id === parentServiceId)
    if (!s) return
    const draftSvc = backworkDraftService(s)
    setPicked((prev) => {
      const next = new Set(prev)
      if (checked) { next.add(parentServiceId); addService(draftSvc) }
      else { next.delete(parentServiceId); removeService(draftSvc.serviceId) }
      return next
    })
  }

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active
    if (data.current?.type === 'service') setDraggingService(data.current.service as OrderServiceDraft)
    else if (data.current?.type === 'day-window') {
      setDraggingDayWindow({
        date: data.current.date as string,
        fromTime: data.current.fromTime as string | null,
        toTime: data.current.toTime as string | null,
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingService(null); setDraggingDayWindow(null)
    const { active, over } = event
    if (!over || !active.data.current) return
    const dropData = over.data.current as { teamId: string; hour: number; minute?: number } | undefined
    if (!dropData?.teamId) return
    const { teamId, hour, minute = 0 } = dropData
    const match = (teams as TeamFull[] | undefined)?.find((t) => t.id === teamId)
    const teamName = match?.name_en ?? match?.name ?? teamId

    if (active.data.current.type === 'day-window') {
      const dayData = active.data.current as { date: string; fromTime: string | null; toTime: string | null }
      if (draft.services.length === 0) return
      const timeSlot = dayData.fromTime ?? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const totalDuration = draft.services.reduce((sum, s) => sum + s.duration, 0)
      const existing = draft.assignments.find((a) => a.teamId === teamId && (a.date ?? dayData.date) === dayData.date)
      if (existing) removeAssignment(existing.id)
      addAssignment({
        teamId, teamName,
        services: draft.services.map((s) => ({ serviceId: s.serviceId, qty: s.qty })),
        timeSlot, toTime: dayData.toTime ?? null, duration: totalDuration, date: dayData.date,
      })
      return
    }

    const service = active.data.current.service as OrderServiceDraft | undefined
    if (!service) return
    const visitWindow = draft.visitDates.find((w) => w.date === draft.visitDate)
    const timeSlot = visitWindow?.fromTime ?? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    addAssignment({
      teamId, teamName,
      services: [{ serviceId: service.serviceId, qty: service.qty }],
      timeSlot, toTime: visitWindow?.toTime ?? null, duration: service.duration, date: draft.visitDate,
    })
  }

  async function handleSubmit() {
    if (!parent) return
    try {
      const result = await submit.mutateAsync()
      const linkRes = await fetch(`/api/orders/${encodeURIComponent(result.orderId)}/link-backwork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parent_order_id: parent.id }),
      })
      if (!linkRes.ok) {
        const err = await linkRes.json().catch(() => ({ error: 'link failed' }))
        toast.error(`Order created but link failed: ${err.error ?? 'unknown error'}`)
        return
      }
      toast.success(result.pendingApproval ? 'Backwork sent for approval' : 'Backwork scheduled')
      router.push(`/orders?openOrderId=${result.id}`)
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create backwork')
    }
  }

  if (parentLoading || !parent) {
    return <PageContainer><p className="p-4 text-sm text-muted-foreground">Loading parent order…</p></PageContainer>
  }

  return (
    <DndContext autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {submit.isPending && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white px-6 py-5 shadow-xl">
            <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
            <p className="text-sm font-medium text-foreground">Creating backwork…</p>
          </div>
        </div>
      )}
      <div className="relative overflow-hidden md:h-[calc(100vh-56px)]">
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2">
          <p className="text-xs font-semibold text-rose-800">Backwork from {parent.order_id}</p>
          <div className="mt-2">
            <BackworkServicePicklist services={parent.services} selectedIds={picked} onToggle={handleToggle} />
          </div>
        </div>
        <div className="flex flex-col overflow-hidden md:flex-row md:h-[calc(100vh-56px-96px)]">
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
            submitLabel="Create Backwork"
          />
          <div className="flex-1 overflow-hidden">
            <TeamCalendarPanel
              visitDate={draft.visitDate}
              primaryVisitDate={draft.visitDates.length > 0 ? [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))[0].date : draft.visitDate}
              mode={draft.mode}
              onModeChange={(mode) => update({ mode })}
              assignments={draft.assignments}
              draftServices={draft.services}
              draftInfo={{ orderId: draft.orderId, customerName: draft.customerName, phone: draft.phone || draft.arrivalPhone, notes: draft.notes, mode: draft.mode }}
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
      <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
        {draggingService ? (
          <div className="w-72 rotate-1">
            <SelectedServiceCard service={draggingService} onRemove={() => {}} onQtyChange={() => {}} onTimeChange={() => {}} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
