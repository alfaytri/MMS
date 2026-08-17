'use client'

import { useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateTransfer } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { PictureItemFind, type Cart } from './PictureItemFind'
import { PictureWhere, type Destination } from './PictureWhere'
import { PictureConfirm } from './PictureConfirm'

type Step = 'find' | 'where' | 'confirm'
const STEPS: Step[] = ['find', 'where', 'confirm']

/**
 * Orchestrates the Send flow: Find → Where → Confirm, owns the cart +
 * destination, and submits through the existing `create_transfer_v2` (status
 * 'pending' — a dispatcher finishes it on the classic surface).
 */
export function PictureSendFlow({
  source,
  onExit,
}: {
  source: { warehouseId: string; subContainerId: string | null }
  onExit: () => void
}) {
  const [cart, setCart] = useState<Cart>(new Map())
  const [dest, setDest] = useState<Destination | null>(null)
  const [step, setStep] = useState<Step>('find')
  const [sent, setSent] = useState(false)
  const createTransfer = useCreateTransfer()
  const { data: currentProfile } = useCurrentUserProfile()

  const lines = [...cart.values()]

  function back() {
    if (step === 'find') return onExit()
    if (step === 'where') return setStep('find')
    return setStep('where')
  }

  async function send() {
    if (!dest || lines.length === 0) return
    try {
      await createTransfer.mutateAsync({
        from_warehouse_id: source.warehouseId,
        to_warehouse_id: dest.toWarehouseId,
        from_sub_container_id: source.subContainerId,
        to_sub_container_id: dest.toSubContainerId,
        date: new Date().toISOString().split('T')[0],
        items: lines.map(({ qty, item }) => ({
          brand_variant_id: item.brand_variant_id,
          item_name: item.item_name,
          sku: item.sku ?? null,
          qty,
          unit_cost: item.avg_cost ?? 0,
        })),
        notes: null,
        created_by_profile_id: currentProfile?.id ?? null,
        created_by_name: currentProfile?.full_name ?? null,
      })
      setSent(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Something went wrong'
      toast.error(msg)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-green-100 text-green-600">
          <Check className="h-12 w-12" />
        </div>
        <div className="text-2xl font-extrabold">Sent to {dest?.label}</div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-2xl bg-primary px-10 py-4 text-lg font-bold text-primary-foreground"
        >
          Done
        </button>
      </div>
    )
  }

  const canNext = step === 'find' ? lines.length > 0 : step === 'where' ? !!dest : false

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b p-4">
        <button type="button" onClick={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-xl border">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-lg font-bold">
          {step === 'find' ? 'Pick items' : step === 'where' ? 'Where to?' : 'Check & send'}
        </h1>
        <div className="flex items-center gap-1.5">
          {STEPS.map((d) => (
            <span key={d} className={`h-2.5 rounded-full ${d === step ? 'w-6 bg-primary' : 'w-2.5 bg-muted'}`} />
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {step === 'find' && <PictureItemFind source={source} cart={cart} onCartChange={setCart} />}
        {step === 'where' && <PictureWhere value={dest} onChange={setDest} />}
        {step === 'confirm' && (
          <PictureConfirm lines={lines} destLabel={dest?.label ?? ''} sending={createTransfer.isPending} onSend={send} />
        )}
      </div>

      {step !== 'confirm' && (
        <footer className="flex items-center gap-3 border-t bg-card p-4">
          <span className="text-sm font-bold">
            {step === 'find' ? (
              lines.length > 0 ? (
                `${lines.length} item${lines.length === 1 ? '' : 's'}`
              ) : (
                <span className="font-medium text-muted-foreground">No items yet</span>
              )
            ) : dest ? (
              `To ${dest.label}`
            ) : (
              <span className="font-medium text-muted-foreground">Pick a place</span>
            )}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setStep(step === 'find' ? 'where' : 'confirm')}
            className="ml-auto rounded-2xl bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground disabled:opacity-40"
          >
            Next ›
          </button>
        </footer>
      )}
    </div>
  )
}
