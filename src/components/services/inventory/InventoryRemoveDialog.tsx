'use client'

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export type RemoveAction = 'archive' | 'delete'
export type RemoveEntity = 'category' | 'item' | 'variant'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: RemoveAction
  entity: RemoveEntity
  name: string
  /** Total blocking stock (on-hand + reserved + damaged + incoming) across the subtree. */
  blockingUnits: number
  /** Optional per-child breakdown of what still holds stock, shown when blocked. */
  breakdown?: { label: string; units: number }[]
  isPending: boolean
  onConfirm: () => void
}

/**
 * Shared confirm for the guarded Archive / Delete of an inventory
 * category / item / variant. Both actions require the branch to hold zero
 * stock — when it doesn't, this shows what's still in there and blocks the
 * action. The server RPC enforces the same rule (this is the friendly UX layer).
 */
export function InventoryRemoveDialog({
  open, onOpenChange, action, entity, name, blockingUnits, breakdown = [], isPending, onConfirm,
}: Props) {
  const blocked = blockingUnits > 0
  const verb = action === 'delete' ? 'Delete' : 'Archive'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} {entity}</DialogTitle>
        </DialogHeader>

        {blocked ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">&ldquo;{name}&rdquo; still holds {blockingUnits} unit{blockingUnits === 1 ? '' : 's'} of stock.</span>{' '}
                Bring the quantity to zero before you can {action} this {entity}.
              </span>
            </div>
            {breakdown.length > 0 && (
              <div className="rounded-md border border-border">
                <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
                  Still in stock
                </div>
                <ul className="divide-y divide-border">
                  {breakdown.map((b, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="truncate">{b.label}</span>
                      <span className="tabular-nums font-medium">{b.units}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {action === 'delete' ? (
              <>Permanently delete <span className="font-medium text-foreground">&ldquo;{name}&rdquo;</span>? This can&apos;t be undone. If it has any transaction history, you&apos;ll be told to archive it instead.</>
            ) : (
              <>Archive <span className="font-medium text-foreground">&ldquo;{name}&rdquo;</span>? It&apos;ll be hidden from the catalog{entity !== 'variant' ? ' along with anything under it' : ''}.</>
            )}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {blocked ? 'Close' : 'Cancel'}
          </Button>
          {!blocked && (
            <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
              {isPending ? 'Processing…' : verb}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
