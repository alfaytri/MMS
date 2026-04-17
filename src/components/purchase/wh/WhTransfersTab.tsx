'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhTransferDialog } from './WhTransferDialog'
import { useWarehouseTransfers, useApproveTransfer, useRejectTransfer } from '@/hooks/useWarehouseOperations'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:          { label: 'Pending',          className: 'border-muted-foreground/40 text-muted-foreground' },
  in_transit:       { label: 'In Transit',        className: 'border-blue-500 text-blue-500' },
  pending_approval: { label: 'Pending Approval',  className: 'border-warning text-warning' },
  approved:         { label: 'Approved',           className: 'border-success text-success' },
  rejected:         { label: 'Rejected',           className: 'border-destructive text-destructive' },
}

export function WhTransfersTab() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: transfers, isLoading } = useWarehouseTransfers()
  const approve = useApproveTransfer()
  const reject = useRejectTransfer()

  function handleApprove(id: string) {
    approve.mutate(
      { id, approvedByName: 'Manager' },
      {
        onSuccess: () => toast.success('Transfer approved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReject(id: string) {
    reject.mutate(id, {
      onSuccess: () => toast.success('Transfer rejected'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Create Transfer</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (transfers ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No transfers found
        </div>
      ) : (
        <div className="space-y-3">
          {(transfers ?? []).map((t) => {
            const cfg = STATUS_CONFIG[t.status] ?? { label: t.status, className: '' }
            return (
              <div key={t.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{t.transfer_number}</span>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  {t.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/50 hover:bg-destructive/5"
                        onClick={() => handleReject(t.id)}
                        disabled={reject.isPending}
                      >
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(t.id)} disabled={approve.isPending}>
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-sm">
                  {t.from_warehouse?.name ?? 'Unknown'} → {t.to_warehouse?.name ?? 'Unknown'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(t.date)} · {t.items.length} item(s)
                  {t.created_by_name && ` · by ${t.created_by_name}`}
                </div>
                {t.items.length > 0 && (
                  <div className="text-xs text-muted-foreground truncate">
                    Items: {t.items.slice(0, 3).map((i) => i.item_name).join(', ')}
                    {t.items.length > 3 ? `… +${t.items.length - 3} more` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <WhTransferDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
