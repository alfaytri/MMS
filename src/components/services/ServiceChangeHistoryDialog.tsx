'use client'

import { formatDistanceToNow } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useServiceChangeHistory, type ServiceChangeRequest } from '@/hooks/useServiceChangeRequests'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 border-red-200' },
}

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  add: { label: 'Add', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  edit: { label: 'Edit', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  delete: { label: 'Delete', className: 'bg-red-100 text-red-700 border-red-200' },
}

const FIELD_LABELS: Record<string, string> = {
  name_en: 'Name (EN)',
  name_ar: 'Name (AR)',
  price: 'Price',
  emergency_price: 'Emergency Price',
  status: 'Status',
  duration: 'Duration',
  warranty: 'Warranty',
  code: 'Code',
  division: 'Division',
  discount: 'Discount',
  invoice_text_en: 'Invoice Text (EN)',
  invoice_text_ar: 'Invoice Text (AR)',
}

function DiffLines({ changes, changeType }: { changes: Record<string, { old: unknown; new: unknown }>; changeType: string }) {
  if (changeType === 'delete') {
    return <p className="text-sm text-muted-foreground italic">Requested deletion of this service</p>
  }

  const entries = Object.entries(changes).filter(([key]) =>
    !['tree_type', 'sort_order', 'parent_id', 'inventory_items', 'components', 'qc_items', 'booking_time_matrix'].includes(key)
  )

  if (entries.length === 0) return <p className="text-sm text-muted-foreground italic">No visible changes</p>

  return (
    <div className="space-y-0.5">
      {entries.map(([key, { old: oldVal, new: newVal }]) => (
        <div key={key} className="text-xs">
          <span className="font-medium text-muted-foreground">{FIELD_LABELS[key] ?? key}:</span>{' '}
          <span className="text-destructive line-through">{oldVal == null ? '—' : String(oldVal)}</span>
          {' → '}
          <span className="text-green-700 font-medium">{newVal == null ? '—' : String(newVal)}</span>
        </div>
      ))}
    </div>
  )
}

function HistoryEntry({ req }: { req: ServiceChangeRequest }) {
  const statusBadge = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending
  const typeBadge = TYPE_BADGE[req.change_type] ?? TYPE_BADGE.edit

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={statusBadge.className}>{statusBadge.label}</Badge>
        <Badge variant="outline" className={typeBadge.className}>{typeBadge.label}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
        </span>
      </div>

      <DiffLines changes={req.changes} changeType={req.change_type} />

      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>Requested by: <span className="font-medium text-foreground">{req.requester?.full_name ?? 'Unknown'}</span></div>
        {req.reviewed_by && (
          <div>
            {req.status === 'approved' ? 'Approved' : 'Rejected'} by:{' '}
            <span className="font-medium text-foreground">{req.reviewer?.full_name ?? 'Unknown'}</span>
            {req.reviewed_at && ` — ${formatDistanceToNow(new Date(req.reviewed_at), { addSuffix: true })}`}
          </div>
        )}
      </div>

      {req.rejection_reason && (
        <div className="bg-destructive/10 border border-red-200 rounded p-2 text-xs text-red-700">
          <span className="font-medium">Rejection reason:</span> {req.rejection_reason}
        </div>
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceId: string | null
  serviceName: string
}

export function ServiceChangeHistoryDialog({ open, onOpenChange, serviceId, serviceName }: Props) {
  const { data: history = [], isLoading } = useServiceChangeHistory(serviceId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[80vh] flex flex-col sm:rounded-lg rounded-none">
        <DialogHeader>
          <DialogTitle>Change History — {serviceName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No change history for this service.</p>
          ) : (
            <div className="space-y-3 pb-2">
              {history.map((req) => (
                <HistoryEntry key={req.id} req={req} />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
