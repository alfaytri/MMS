'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhAdjustmentDialog } from './WhAdjustmentDialog'
import { useStockAdjustments, useApproveStockAdjustment } from '@/hooks/useWarehouseOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

export function WhAdjustmentsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data: warehouses } = useWarehouses()
  const { data: adjustments, isLoading } = useStockAdjustments({ warehouseId: warehouseId || undefined })
  const approve = useApproveStockAdjustment()

  function handleApprove(id: string) {
    approve.mutate(
      { id, approvedByName: 'Manager' },
      {
        onSuccess: () => toast.success('Adjustment approved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
        >
          <option value="">All warehouses</option>
          {(warehouses ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ New Adjustment</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (adjustments ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No adjustments found
        </div>
      ) : (
        <div className="space-y-3">
          {(adjustments ?? []).map((adj) => (
            <div key={adj.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{adj.adjustment_type}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      adj.status === 'approved'
                        ? 'border-success text-success'
                        : adj.status === 'rejected'
                        ? 'border-destructive text-destructive'
                        : 'border-warning text-warning'
                    )}
                  >
                    {adj.status}
                  </Badge>
                </div>
                {adj.status === 'pending_approval' && (
                  <Button size="sm" onClick={() => handleApprove(adj.id)} disabled={approve.isPending}>
                    Approve
                  </Button>
                )}
              </div>
              <div className="text-sm">
                Qty:{' '}
                <span className={cn('font-semibold', adj.qty > 0 ? 'text-success' : 'text-destructive')}>
                  {adj.qty > 0 ? '+' : ''}{adj.qty}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(adj.created_at)} · {adj.reason}
                {adj.requested_by_name && ` · requested by ${adj.requested_by_name}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <WhAdjustmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
