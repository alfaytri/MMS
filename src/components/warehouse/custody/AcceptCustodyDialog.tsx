'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, PackageCheck } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useAcceptCustodyAssign, useCustodyTransferItems } from '@/hooks/useCustodyMoves'

interface Props {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  transferId:     string | null
  transferNumber: string | null
  destSubName:    string
}

/**
 * Confirm-receipt dialog for a pending custody assignment. Lists each dispatched
 * line with a "received" input (defaulting to the dispatched qty); anything short
 * is written off as shrinkage by rpc_accept_custody_assign.
 */
export function AcceptCustodyDialog({ open, onOpenChange, transferId, transferNumber, destSubName }: Props) {
  const { data: profile } = useCurrentUserProfile()
  const { data: items = [], isLoading } = useCustodyTransferItems(open ? transferId : null)
  const accept = useAcceptCustodyAssign()
  const [received, setReceived] = useState<Record<string, string>>({})

  // Default each received qty to the dispatched qty when the items load.
  useEffect(() => {
    if (!open) { setReceived({}); return }
    setReceived(Object.fromEntries(items.map((i) => [i.id, String(i.dispatched_qty)])))
  }, [open, items])

  const anyShort = useMemo(
    () => items.some((i) => (parseInt(received[i.id] ?? '', 10) || 0) < i.dispatched_qty),
    [items, received],
  )

  async function handleConfirm() {
    if (!transferId) return
    const receipts = items.map((i) => ({
      transfer_item_id: i.id,
      received_qty: Math.max(0, Math.min(i.dispatched_qty, parseInt(received[i.id] ?? '', 10) || 0)),
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
            Confirm how much actually arrived on {destSubName}. Anything short of the dispatched quantity is written off as shrinkage.
          </p>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No items on this transfer.</p>
          ) : items.map((i) => {
            const recv = parseInt(received[i.id] ?? '', 10) || 0
            const short = recv < i.dispatched_qty
            return (
              <div key={i.id} className={`rounded-md border p-2.5 ${short ? 'border-warning/50 bg-warning/10' : 'bg-card'}`}>
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
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-warning-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {i.dispatched_qty - recv} will be written off as shrinkage
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
            {accept.isPending ? 'Accepting…' : anyShort ? 'Accept with shrinkage' : 'Accept receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
