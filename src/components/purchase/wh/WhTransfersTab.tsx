'use client'

import React from 'react'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useWarehouseTransfers, useApproveTransfer, useRejectTransfer } from '@/hooks/useWarehouseOperations'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'

const STATUS_STYLES: Record<string, string> = {
  pending:          'bg-muted text-muted-foreground',
  in_transit:       'bg-primary/10 text-primary',
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const WhTransfersTab = React.memo(function WhTransfersTab({ warehouses, currentProfile }: Props) {
  const { data: transfers = [] } = useWarehouseTransfers()
  const approve = useApproveTransfer()
  const reject = useRejectTransfer()

  function canApprove(transfer: any) {
    const toWh = warehouses.find(w => w.id === transfer.to_warehouse_id)
    // manager_profile_id is a profiles.id — same space as currentProfile.id
    return (toWh as any)?.manager_profile_id === currentProfile?.id
  }

  async function notifyCreator(transfer: any, approved: boolean) {
    const creatorProfileId: string | null = transfer.created_by_profile_id ?? null
    if (!creatorProfileId) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notifications').insert({
      profile_id:   creatorProfileId,
      type:         approved ? 'transfer_approved' : 'transfer_rejected',
      title:        approved ? 'Stock Transfer Approved' : 'Stock Transfer Rejected',
      body:         approved
        ? `Your transfer ${transfer.transfer_number} has been approved by ${currentProfile?.full_name ?? 'the warehouse manager'}.`
        : `Your transfer ${transfer.transfer_number} was rejected by ${currentProfile?.full_name ?? 'the warehouse manager'}.`,
      related_id:   transfer.id,
      related_type: 'warehouse_transfer',
    })
  }

  function handleApprove(transfer: any) {
    approve.mutate(
      { id: transfer.id, approvedByName: currentProfile?.full_name ?? 'Manager' },
      {
        onSuccess: () => {
          toast.success('Transfer approved')
          notifyCreator(transfer, true)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function handleReject(transfer: any) {
    reject.mutate(transfer.id, {
      onSuccess: () => {
        toast.success('Transfer rejected')
        notifyCreator(transfer, false)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  if (transfers.length === 0) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground">No transfers yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-3">
      {transfers.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border p-4 ${t.status === 'pending_approval' ? 'border-warning/30 bg-warning/5' : ''}`}
        >
          {/* Header row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-primary">{t.transfer_number}</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[t.status] ?? 'bg-muted text-muted-foreground'}`}>
                {t.status.replace(/_/g, ' ')}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {t.date ? format(new Date(t.date), 'dd MMM yyyy') : ''}
              </span>
            </div>
            {t.status === 'pending_approval' && canApprove(t) && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                  onClick={() => handleApprove(t)}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className="h-3 w-3" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleReject(t)}
                  disabled={reject.isPending}
                >
                  <XCircle className="h-3 w-3" /> Reject
                </Button>
              </div>
            )}
          </div>

          {/* Route */}
          <div className="text-xs mb-2 flex items-center gap-1.5 flex-wrap text-muted-foreground">
            <span className="text-foreground font-medium">{t.from_warehouse?.name ?? 'Unknown'}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{t.to_warehouse?.name ?? 'Unknown'}</span>
            {t.created_by_name && <span>· by {t.created_by_name}</span>}
            {t.status === 'approved' && t.approved_by_name && (
              <span className="text-[10px] text-success">• Approved by {t.approved_by_name}</span>
            )}
          </div>

          {/* Items */}
          <div className="flex flex-wrap gap-1.5">
            {(t.items ?? []).map((item, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {item.qty}× {item.item_name}
              </Badge>
            ))}
          </div>

          {/* Notes */}
          {t.notes && (
            <p className="text-[10px] text-muted-foreground mt-1.5">{t.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
})
