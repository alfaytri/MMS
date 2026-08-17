'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useWarehouseTransfers, useReceiveTransfer } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useVariantImages } from '@/hooks/useVariantImages'
import { PicturePhoto } from './PicturePhoto'
import { QtyStepper } from './QtyStepper'

/**
 * Receive screen — in-transit transfers headed to the worker's warehouse(s).
 * One big ✓ Receive per delivery accepts everything at dispatched qty; "I got
 * fewer" reveals per-item steppers (the existing shrinkage path).
 */
export function PictureReceive({
  mySubIds,
  onExit,
}: {
  mySubIds: string[]
  onExit: () => void
}) {
  const { data: inTransit = [], isLoading } = useWarehouseTransfers({ status: 'in_transit' })
  const mine = useMemo(
    () => inTransit.filter((t) => t.to_sub_container_id != null && mySubIds.includes(t.to_sub_container_id)),
    [inTransit, mySubIds],
  )
  const allVariantIds = useMemo(
    () => mine.flatMap((t) => (t.transfer_items ?? []).map((i) => i.brand_variant_id)),
    [mine],
  )
  const { data: images } = useVariantImages(allVariantIds)
  const receive = useReceiveTransfer()
  const { data: currentProfile } = useCurrentUserProfile()

  const [fewer, setFewer] = useState<Record<string, boolean>>({})
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  async function doReceive(t: (typeof mine)[number]) {
    if (!currentProfile?.id) {
      toast.error('Could not find your profile')
      return
    }
    setBusyId(t.id)
    try {
      await receive.mutateAsync({
        id: t.id,
        profileId: currentProfile.id,
        profileName: currentProfile.full_name ?? '',
        receivedItems: (t.transfer_items ?? []).map((i) => ({
          transfer_item_id: i.id,
          received_qty: qtys[i.id] ?? (i.dispatched_qty ?? 0),
        })),
      })
      toast.success('Received')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong'
      toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b p-4">
        <button type="button" onClick={onExit} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-xl border">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Receive</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="grid place-items-center py-16 text-sm text-muted-foreground">Loading…</div>
        ) : mine.length === 0 ? (
          <div className="grid place-items-center py-20 text-center text-base text-muted-foreground">Nothing waiting to receive.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {mine.map((t) => {
              const items = t.transfer_items ?? []
              const showFewer = !!fewer[t.id]
              return (
                <div key={t.id} className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
                  <div className="text-sm font-semibold text-muted-foreground">
                    from {t.from_warehouse?.name ?? 'another warehouse'}
                    {t.from_sub_container_name ? ` · ${t.from_sub_container_name}` : ''}
                  </div>
                  {items.map((i) => {
                    const dispatched = i.dispatched_qty ?? 0
                    const val = qtys[i.id] ?? dispatched
                    return (
                      <div key={i.id} className="flex items-center gap-4">
                        <PicturePhoto url={images?.get(i.brand_variant_id) ?? null} name={i.item_name} size={64} />
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-base font-bold leading-tight">{i.item_name}</div>
                          {showFewer && (
                            <div className="mt-1 w-40">
                              <QtyStepper value={val} min={0} max={dispatched} onChange={(n) => setQtys((p) => ({ ...p, [i.id]: n }))} />
                            </div>
                          )}
                        </div>
                        {!showFewer && (
                          <div className="text-center">
                            <div className="text-2xl font-extrabold tabular-nums">{dispatched}</div>
                            <div className="text-[11px] font-semibold text-muted-foreground">pcs</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => doReceive(t)}
                    disabled={busyId === t.id}
                    className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-6 py-4 text-lg font-extrabold text-white disabled:opacity-50"
                  >
                    <Check className="h-6 w-6" /> {busyId === t.id ? 'Receiving…' : 'Receive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFewer((p) => ({ ...p, [t.id]: !p[t.id] }))}
                    className="text-center text-sm font-medium text-muted-foreground underline"
                  >
                    {showFewer ? 'Got everything' : 'I got fewer'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
