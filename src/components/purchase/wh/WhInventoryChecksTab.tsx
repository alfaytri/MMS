'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhInventoryCheckDialog } from './WhInventoryCheckDialog'
import { useInventoryChecks } from '@/hooks/useWarehouseOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'border-muted-foreground/40 text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-warning text-warning' },
  reviewed:  { label: 'Reviewed',  className: 'border-success text-success' },
}

export function WhInventoryChecksTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const { data: warehouses } = useWarehouses()
  const { data: checks, isLoading } = useInventoryChecks({ warehouseId: warehouseId || undefined })

  const dialogOpen = createOpen || !!selectedCheckId
  const dialogCheckId = createOpen ? null : selectedCheckId

  function handleDialogClose(open: boolean) {
    if (!open) { setCreateOpen(false); setSelectedCheckId(null) }
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ New Inventory Check</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (checks ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No inventory checks found
        </div>
      ) : (
        <div className="space-y-3">
          {(checks ?? []).map((check) => {
            const cfg = STATUS_CONFIG[check.status] ?? { label: check.status, className: '' }
            return (
              <div key={check.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="font-mono font-semibold text-sm hover:underline"
                      onClick={() => setSelectedCheckId(check.id)}
                    >
                      {check.check_number}
                    </button>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-8 h-8"
                    onClick={() => setSelectedCheckId(check.id)}
                  >
                    {check.status === 'draft' ? 'Count' : 'View'}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {check.warehouse_name} · {formatDate(check.created_at)}
                  {check.submitted_by_name && ` · submitted by ${check.submitted_by_name}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <WhInventoryCheckDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        checkId={dialogCheckId}
      />
    </div>
  )
}
