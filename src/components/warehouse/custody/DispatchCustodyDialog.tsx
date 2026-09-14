'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'
import { Truck, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useDispatchCustodyAssign, useCustodyTransferItems } from '@/hooks/useCustodyMoves'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'

interface Props {
  open:               boolean
  onOpenChange:       (open: boolean) => void
  transferId:         string | null
  transferNumber:     string | null
  destSubName:        string
  sourceLabel:        string | null
  fromWarehouseId:    string | null
  fromSubContainerId: string | null
}

/**
 * Preview-and-confirm dialog for dispatching a pending custody request. Lists
 * every requested line with the quantity being SENT alongside the quantity
 * currently ON HAND at the source location ("have vs sending"), so the
 * dispatcher can spot a shortfall before committing. Quantities are read-only:
 * dispatch sends exactly what was requested (rpc_dispatch_custody_assign takes
 * no per-line quantity). Mirrors AcceptCustodyDialog on the receiving side.
 */
export function DispatchCustodyDialog({
  open, onOpenChange, transferId, transferNumber, destSubName, sourceLabel, fromWarehouseId, fromSubContainerId,
}: Props) {
  const { data: profile } = useCurrentUserProfile()
  const { data: itemData, isLoading } = useCustodyTransferItems(open ? transferId : null)
  const items = useMemo(() => itemData ?? [], [itemData])

  // Source on-hand, keyed by brand_variant, to show "have" beside "sending".
  // Gated on `open` so the (potentially large) stock query never runs while the
  // dialog is closed — the card keeps this component mounted for the animation.
  const { data: sourceStock = [] } = useWarehouseStock(
    fromWarehouseId ?? undefined,
    fromSubContainerId,
    open && !!fromWarehouseId,
  )
  const haveByVariant = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sourceStock) m.set(s.brand_variant_id, (m.get(s.brand_variant_id) ?? 0) + (s.qty ?? 0))
    return m
  }, [sourceStock])

  // Category tree + brand + origin above each dispatched item name.
  const variantMeta = useVariantItemMeta(items.map((i) => i.brand_variant_id))
  const dispatch = useDispatchCustodyAssign()

  const totalSending = useMemo(() => items.reduce((s, i) => s + i.dispatched_qty, 0), [items])
  const anyShort = useMemo(
    () => items.some((i) => (haveByVariant.get(i.brand_variant_id) ?? 0) < i.dispatched_qty),
    [items, haveByVariant],
  )

  async function handleConfirm() {
    if (!transferId) return
    try {
      await dispatch.mutateAsync({
        transfer_id:              transferId,
        dispatched_by_profile_id: profile?.id ?? null,
        dispatched_by_name:       profile?.full_name ?? null,
      })
      toast.success(`Dispatched ${transferNumber ?? ''} — awaiting ${destSubName} to accept`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch custody request')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!dispatch.isPending) onOpenChange(o) }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-lg sm:w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Truck className="h-4 w-4 text-primary" /> Dispatch — {transferNumber}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Sending to <span className="font-medium text-foreground">{destSubName}</span>
            {sourceLabel ? <> from {sourceLabel}</> : null}. Review what&apos;s going out — and what you have
            on hand — then confirm.
          </p>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No items on this request.</p>
          ) : items.map((i) => {
            const have  = haveByVariant.get(i.brand_variant_id) ?? 0
            const short = have < i.dispatched_qty
            return (
              <div key={i.id} className={`rounded-md border p-2.5 ${short ? 'border-warning/50 bg-warning/10' : 'bg-card'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <ItemLabel meta={variantMeta.get(i.brand_variant_id)} name={i.item_name} nameClassName="text-xs font-medium truncate" />
                    {i.sku && <div className="text-[10px] text-muted-foreground truncate">{i.sku}</div>}
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-semibold">Sending {i.dispatched_qty}</div>
                    <div className={`text-[10px] ${short ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                      Have {have}
                    </div>
                  </div>
                </div>
                {short && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Only {have} on hand at source — dispatch will fail unless there&apos;s enough stock.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            {items.length} item{items.length === 1 ? '' : 's'} · {totalSending} units
            {anyShort && <span className="text-warning font-medium"> · shortfall</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-[11px] h-11 sm:h-8" onClick={() => onOpenChange(false)} disabled={dispatch.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-[11px] h-11 sm:h-8 gap-1"
              disabled={dispatch.isPending || isLoading || items.length === 0}
              onClick={handleConfirm}
            >
              <Truck className="h-3 w-3" />
              {dispatch.isPending ? 'Dispatching…' : 'Confirm & dispatch'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
