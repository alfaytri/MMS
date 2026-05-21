// src/app/(dashboard)/orders/create/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import { useTeams } from '@/hooks/useTeams'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { SiteVisitCard, SITE_VISIT_SERVICE_ID, makeSiteVisitDraft } from '@/components/orders/SiteVisitCard'
import { createClient } from '@/lib/supabase/client'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledCustomerId = searchParams.get('customer_id')
  const prefilledPhoneId = searchParams.get('phone_id')
  const prefilledDate = searchParams.get('date')
  const prefilledTeamId = searchParams.get('teamId')
  const prefilledHour = searchParams.get('hour') ? parseInt(searchParams.get('hour')!) : undefined

  // If we arrived from a site visit, skip the lookup modal
  const [lookupOpen, setLookupOpen] = useState(!prefilledCustomerId)
  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)
  const [draggingDayWindow, setDraggingDayWindow] = useState<{ date: string; fromTime: string | null; toTime: string | null } | null>(null)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])

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

  // Pre-set visit date when navigating from the calendar cell click
  useEffect(() => {
    if (prefilledDate) update({ visitDate: prefilledDate })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-fill customer when navigating from a site visit
  useEffect(() => {
    if (!prefilledCustomerId) return
    const supabase = createClient()
    ;(supabase as any)
      .from('customers')
      .select('id, name, customer_phones(id, phone)')
      .eq('id', prefilledCustomerId)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) return
        const phones: Array<{ id: string; phone: string }> = data.customer_phones ?? []
        const phone = prefilledPhoneId
          ? phones.find((p) => p.id === prefilledPhoneId) ?? phones[0]
          : phones[0]
        if (!phone) return
        setCustomer({
          found: true as const,
          customerId: data.id as string,
          phoneId: phone.id,
          customerName: data.name as string,
          phone: phone.phone,
          addressCount: 0,
          orderCount: 0,
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const match = (teams as unknown as Array<Record<string, unknown>>)?.find(
      (t) => t['id'] === teamId,
    )
    const teamName = (match?.['name_en'] as string | null | undefined) ??
      (match?.['name'] as string | null | undefined) ??
      teamId

    // ── Day-window drag: assign ALL services at the day's time window ────────
    if (active.data.current.type === 'day-window') {
      const dayData = active.data.current as { date: string; fromTime: string | null; toTime: string | null }
      if (draft.services.length === 0) return
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
    if (!service) return
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
      toast.success('Order created successfully')
      router.push('/orders')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create order'
      toast.error(message)
    }
  }

  return (
    <DndContext autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          onTypeChange={setType}
          onAddService={addService}
          onRemoveService={removeService}
          onUpdateServiceQty={updateServiceQty}
          onUpdateServiceTime={updateServiceTime}
          onAddressSelect={setAddress}
          onUpdateSiteVisitTime={updateSiteVisitTime}
          onUpdate={update}
          onLookupCustomer={() => setLookupOpen(true)}
          onDivisionsChange={setSelectedDivisions}
          onPendingFilesChange={setPendingFiles}
          onSubmit={handleSubmit}
          isSubmitting={submit.isPending}
          isValid={isValid()}
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
            divisionSlugs={selectedDivisions}
            initialTeamId={prefilledTeamId ?? undefined}
            initialHour={prefilledHour}
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
