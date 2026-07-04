'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ReceivalFormDialog } from '@/components/purchase/ReceivalFormDialog'
import { ReceivalDetailDialog } from '@/components/purchase/ReceivalDetailDialog'
import {
  useReceivals,
  useReceivalEditRequests,
  useRequestReceivalEdit,
  useApproveReceivalEdit,
  useSaveReceivalEdit,
  useLcLockedReceivalIds,
  type Receival,
  type ReceivalEditRequest,
  type ReceivalStatus,
} from '@/hooks/useReceivals'
import { useMyApprovalSlotRoles } from '@/hooks/useRoles'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
}

const STATUSES: { value: ReceivalStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

// ─── ReceivalRowActions ────────────────────────────────────────────────────────

function ReceivalRowActions({
  receival,
  isAdmin,
  lcLocked,
  onRequestEdit,
  onAdminApprove,
  onEditApproved,
}: {
  receival: Receival
  isAdmin: boolean
  lcLocked: boolean
  onRequestEdit: (r: Receival) => void
  onAdminApprove: (req: ReceivalEditRequest) => void
  onEditApproved: (target: { receival: Receival; request: ReceivalEditRequest }) => void
}) {
  const { data: editRequests = [] } = useReceivalEditRequests(receival.id)
  const active = editRequests.find(r => r.status === 'pending' || r.status === 'approved')

  if (active?.status === 'pending' && isAdmin) {
    return (
      <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50"
        onClick={(e) => { e.stopPropagation(); onAdminApprove(active) }}>
        Review Edit
      </Button>
    )
  }

  if (active?.status === 'pending') {
    return <Button size="sm" variant="outline" disabled>Edit Pending…</Button>
  }

  if (active?.status === 'approved') {
    return (
      <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50"
        onClick={(e) => { e.stopPropagation(); onEditApproved({ receival, request: active }) }}>
        Edit Now
      </Button>
    )
  }

  if (lcLocked) {
    return (
      <Button size="sm" variant="outline" disabled className="opacity-50" title="Landed Cost applied — edit not available">
        LC Applied
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline"
      onClick={(e) => { e.stopPropagation(); onRequestEdit(receival) }}>
      Request Edit
    </Button>
  )
}

// ─── RequestEditDialog ────────────────────────────────────────────────────────

function RequestEditDialog({
  receival, onClose,
}: { receival: Receival | null; onClose: () => void }) {
  const requestEdit = useRequestReceivalEdit()
  const [reason, setReason] = useState('')

  if (!receival) return null
  return (
    <Dialog open={!!receival} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Request Edit — {receival.receival_number}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Describe what needs to be corrected. An admin will review and approve your request.
        </p>
        <Textarea
          rows={3} placeholder="e.g. Qty for Item A should be 48, not 50"
          value={reason} onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!reason.trim() || requestEdit.isPending}
            onClick={() => requestEdit.mutate(
              { receival_id: receival.id, reason },
              {
                onSuccess: () => { toast.success('Edit request sent to admin'); onClose() },
                onError: (e) => toast.error(e.message),
              }
            )}
          >
            {requestEdit.isPending ? 'Sending…' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── AdminEditApprovalDialog ──────────────────────────────────────────────────

function AdminEditApprovalDialog({
  request, onClose, isAdmin,
}: { request: ReceivalEditRequest | null; onClose: () => void; isAdmin: boolean }) {
  const approveEdit = useApproveReceivalEdit()
  const [rejectionNote, setRejectionNote] = useState('')

  if (!request || !isAdmin) return null
  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>Review Edit Request</DialogTitle></DialogHeader>
        <p className="text-sm"><strong>Reason:</strong> {request.reason}</p>
        <Textarea
          rows={2} placeholder="Rejection note (required only to reject)"
          value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive"
            disabled={!rejectionNote.trim() || approveEdit.isPending}
            onClick={() => approveEdit.mutate(
              { request_id: request.id, action: 'rejected', rejection_note: rejectionNote },
              {
                onSuccess: () => { toast.success('Edit request rejected'); onClose() },
                onError: (e) => toast.error(e.message),
              }
            )}
          >Reject</Button>
          <Button
            disabled={approveEdit.isPending}
            onClick={() => approveEdit.mutate(
              { request_id: request.id, action: 'approved' },
              {
                onSuccess: () => { toast.success('Edit approved — 48h window open'); onClose() },
                onError: (e) => toast.error(e.message),
              }
            )}
          >Approve Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── ReceivalEditDialog ───────────────────────────────────────────────────────

function ReceivalEditDialog({
  target, onClose,
}: { target: { receival: Receival; request: ReceivalEditRequest } | null; onClose: () => void }) {
  const saveEdit = useSaveReceivalEdit()
  const [items, setItems] = useState<{ receival_item_id: string; new_qty: number; new_unit_cost: number }[]>([])

  useEffect(() => {
    if (target) {
      setItems((target.receival.receival_items ?? []).map(ri => ({
        receival_item_id: ri.id,
        new_qty:          ri.qty_received,
        new_unit_cost:    ri.unit_cost,
      })))
    }
  }, [target])

  if (!target) return null

  const { receival, request } = target
  const expiresAt = request.expires_at ? new Date(request.expires_at) : null
  const expired = expiresAt ? expiresAt < new Date() : false
  const hoursLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000))
    : null

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Receival — {receival.receival_number}
            {expired
              ? <Badge variant="destructive">Window Expired</Badge>
              : <Badge className="bg-green-100 text-green-800">Approved — {hoursLeft}h left</Badge>}
          </DialogTitle>
        </DialogHeader>

        {expired && (
          <p className="text-sm text-destructive">
            Your edit window has expired. Please request a new edit.
          </p>
        )}

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {items.map((item, idx) => {
            const ri = (receival.receival_items ?? [])[idx]
            return (
              <div key={item.receival_item_id} className="grid grid-cols-12 gap-2 items-center border rounded p-2">
                <div className="col-span-4 text-sm font-medium">{ri?.item_name}</div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Qty</label>
                  <Input type="number" min={0} disabled={expired}
                    value={item.new_qty}
                    onChange={(e) => setItems(its => its.map((it, i) =>
                      i === idx ? { ...it, new_qty: parseInt(e.target.value) || 0 } : it))} />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Unit Cost</label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm tabular-nums">
                    {item.new_unit_cost.toLocaleString('en', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground pt-4">
                  {ri && ri.qty_received !== item.new_qty && (
                    <span className="text-amber-600">
                      orig: {ri.qty_received}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={expired || saveEdit.isPending}
            onClick={() => saveEdit.mutate(
              { edit_request_id: request.id, items },
              {
                onSuccess: () => { toast.success('Receival updated'); onClose() },
                onError: (e) => toast.error(e.message),
              }
            )}
          >
            {saveEdit.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReceivalsPage() {
  const [statusFilter, setStatusFilter] = useState<ReceivalStatus | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [requestEditTarget, setRequestEditTarget] = useState<Receival | null>(null)
  const [editTarget, setEditTarget] = useState<{ receival: Receival; request: ReceivalEditRequest } | null>(null)
  const [adminApproveTarget, setAdminApproveTarget] = useState<ReceivalEditRequest | null>(null)
  const [detailReceival, setDetailReceival] = useState<Receival | null>(null)

  const { data: receivals, isLoading } = useReceivals({ status: statusFilter })
  const { data: lcLockedIds } = useLcLockedReceivalIds()
  const { data: myRoles = [] } = useMyApprovalSlotRoles()
  const canApproveEdit = myRoles.some(
    (r) => (r.scopes === null || r.scopes.includes('receival_edit'))
  )

  const columns = useMemo<ColumnDef<Receival>[]>(() => [
    {
      accessorKey: 'receival_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Receival #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('receival_number')}</span>,
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => row.original.po_number ?? '—',
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => `${row.original.receival_items?.length ?? 0} lines`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('status') as string
        const cfg = STATUS_CONFIG[s] ?? { label: s ?? 'Unknown', className: 'bg-gray-100 text-gray-700' }
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <ReceivalRowActions
          receival={row.original}
          isAdmin={canApproveEdit}
          lcLocked={lcLockedIds?.has(row.original.id) ?? false}
          onRequestEdit={setRequestEditTarget}
          onAdminApprove={setAdminApproveTarget}
          onEditApproved={setEditTarget}
        />
      ),
    },
  ], [canApproveEdit])

  return (
    <PageWrapper>
      <PageHeader
        title="Receivals"
        description="Goods received from Purchase Orders"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Receival
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={receivals ?? []}
        isLoading={isLoading}
        onRowClick={(row) => setDetailReceival(row)}
      />

      <ReceivalFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <RequestEditDialog
        receival={requestEditTarget}
        onClose={() => setRequestEditTarget(null)}
      />

      <AdminEditApprovalDialog
        request={adminApproveTarget}
        onClose={() => setAdminApproveTarget(null)}
        isAdmin={canApproveEdit}
      />

      <ReceivalEditDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ReceivalDetailDialog
        receival={detailReceival}
        onClose={() => setDetailReceival(null)}
      />
    </PageWrapper>
  )
}
