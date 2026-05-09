// src/app/(dashboard)/orders/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import { useTeams } from '@/hooks/useTeams'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateOrderPage() {
  const router = useRouter()
  const [lookupOpen, setLookupOpen] = useState(true)
  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)

  const {
    draft,
    setCustomer,
    setAddress,
    addService,
    removeService,
    addAssignment,
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
    // TeamFull extends DBTable<'teams'> whose Row fields are opaque to TS — use any cast
    const match = (teams as unknown as Array<Record<string, unknown>>)?.find(
      (t) => t['id'] === teamId,
    )
    const teamName = (match?.['name_en'] as string | null | undefined) ??
      (match?.['name'] as string | null | undefined) ??
      teamId
    const timeSlot = `${String(hour).padStart(2, '0')}:00`

    addAssignment({
      teamId,
      teamName,
      services: [{ serviceId: service.serviceId, qty: service.qty }],
      timeSlot,
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
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative">
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={(result) => {
          setCustomer(result)
          setLookupOpen(false)
        }}
      />

      {/* Look up another customer — shown in top-right when a customer is loaded */}
      {draft.customerId && (
        <div className="absolute right-4 top-3 z-10">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={() => setLookupOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
            Look Up Another Customer
          </Button>
        </div>
      )}

      {/* Three-panel layout:
          - OrderFormPanel: fixed 340 px on sm+, full-width on mobile
          - TeamCalendarPanel: flex-1, scrollable
          - CustomerHistoryPanel: fixed 320 px, collapsible
      */}
      <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden sm:flex-row">
        <OrderFormPanel
          draft={draft}
          onTypeChange={(type) => update({ type })}
          onAddService={addService}
          onRemoveService={removeService}
          onAddressSelect={setAddress}
          onUpdate={update}
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
            draggingService={draggingService}
            onAssign={addAssignment}
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
    </DndContext>
  )
}
