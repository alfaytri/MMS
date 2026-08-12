'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, PackageCheck, Undo2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useAcceptCustodyAssign, useCustodyTransferItems } from '@/hooks/useCustodyMoves'

type Disposition = 'writeoff' | 'restock'

interface Props {
  open:               boolean
  onOpenChange:       (open: boolean) => void
  transferId:         string | null
  transferNumber:     string | null
  destSubName:        string
  sourceWarehouseName?: string | null
}

/**
 * Confirm-receipt dialog for a pending custody assignment. Lists each dispatched
 * line with a "received" input (defaulting to the dispatched qty). For any short
 * line the accepter picks what happens to the shortfall: write it off as
 * shrinkage (lost in transit) or give it back to the source warehouse's stock.
 */
export function AcceptCustodyDialog({
  open, onOpenChange, transferId, transferNumber, destSubName, sourceWarehouseName,
}: Props) {
  const { data: profile } = useCurrentUserProfile()
  const { data, isLoading } = useCustodyTransferItems(open ? transferId : null)
  // Stabilise the reference: `data ?? []` would allocate a fresh array every
  // render while the query has no data (i.e. whenever the dialog is closed),
  // which makes the init effect below re-fire endlessly. useMemo keeps the same
  // array identity until `data` itself changes.
  const items = useMemo(() => data ?? [], [data])
  const accept = useAcceptCustodyAssign()
  const [received, setReceived]       = useState<Record<string, string>>({})
  const [disposition, setDisposition] = useState<Record<string, Disposition>>({})

  // Default each received qty to the dispatched qty when the items load; clear
  // the per-line dispositions (each short line defaults to write-off until changed).
  useEffect(() => {
    if (!open) { setReceived({}); setDisposition({}); return }
    setReceived(Object.fromEntries(items.map((i) => [i.id, String(i.dispatched_qty)])))
    setDisposition({})
  }, [open, items])

  const sourceLabel = sourceWarehouseName?.trim() || 'the source warehouse'

  // At least one short line is being written off (a real inventory loss) — used
  // to colour the confirm button. Restocked shortfalls are not a loss.
  const anyWriteoff = useMemo(
    () => items.some((i) => {
      const recv = parseInt(received[i.id] ?? '', 10) || 0
      return recv < i.dispatched_qty && (disposition[i.id] ?? 'writeoff') === 'writeoff'
    }),
    [items, received, disposition],
  )

  async function handleConfirm() {
    if (!transferId) return
    const receipts = items.map((i) => ({
      transfer_item_id: i.id,
      received_qty:     Math.max(0, Math.min(i.dispatched_qty, parseInt(received[i.id] ?? '', 10) || 0)),
      shortfall_action: (disposition[i.id] ?? 'writeoff') as Disposition,
    }))
    try {
      await accept.mutateAsync({
        transfer_id:            transferId,
        receipts,
        accepted_by_profile_id: profile?.id ?? null,
        accepted_by_name:       profile?.full_name ?? null,
      })
      toast.success(`Accepted ${transferNumber ?? ''} — stock is now on ${destSubName}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept custody')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!accept.isPending) onOpenChange(o) }}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <PackageCheck className="h-4 w-4 text-primary" /> Confirm receipt — {transferNumber}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Confirm how much actually arrived on {destSubName}. For anything short of the dispatched
            quantity, choose whether it&apos;s written off as shrinkage or returned to the warehouse.
          </p>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No items on this transfer.</p>
          ) : items.map((i) => {
            const recv  = parseInt(received[i.id] ?? '', 10) || 0
            const short = recv < i.dispatched_qty
            const miss  = i.dispatched_qty - recv
            const act   = disposition[i.id] ?? 'writeoff'
            const cardClass = !short
              ? 'bg-card'
              : act === 'restock'
                ? 'border-primary/40 bg-primary/5'
                : 'border-warning/50 bg-warning/10'
            return (
              <div key={i.id} className={`rounded-md border p-2.5 ${cardClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{i.item_name}</div>
                    {i.sku && <div className="text-[10px] text-muted-foreground truncate">{i.sku}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={i.dispatched_qty}
                      className="h-8 w-[70px] text-[11px]"
                      value={received[i.id] ?? ''}
                      onChange={(e) => setReceived((p) => ({ ...p, [i.id]: e.target.value.replace(/[^\d]/g, '') }))}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">/ {i.dispatched_qty}</span>
                  </div>
                </div>

                {short && (
                  <div className="mt-2 space-y-1.5">
                    {/* Two-way disposition for the shortfall. */}
                    <div className="inline-flex rounded-md border overflow-hidden" role="group" aria-label="What happens to the shortfall">
                      <button
                        type="button"
                        aria-pressed={act === 'writeoff'}
                        onClick={() => setDisposition((p) => ({ ...p, [i.id]: 'writeoff' }))}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                          act === 'writeoff' ? 'bg-warning text-warning-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" /> Write off
                      </button>
                      <button
                        type="button"
                        aria-pressed={act === 'restock'}
                        onClick={() => setDisposition((p) => ({ ...p, [i.id]: 'restock' }))}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium border-l transition-colors ${
                          act === 'restock' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Undo2 className="h-3 w-3" /> Give back
                      </button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {act === 'restock'
                        ? `${miss} unit${miss === 1 ? '' : 's'} returned to ${sourceLabel}`
                        : `${miss} unit${miss === 1 ? '' : 's'} written off as shrinkage`}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => onOpenChange(false)} disabled={accept.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-[11px] h-8 min-w-[130px]"
            disabled={accept.isPending || isLoading || items.length === 0}
            onClick={handleConfirm}
          >
            {accept.isPending ? 'Accepting…' : anyWriteoff ? 'Accept with shrinkage' : 'Accept receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
