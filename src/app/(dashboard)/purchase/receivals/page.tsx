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
import {
  useReceivals,
  useReceivalEditRequests,
  useRequestReceivalEdit,
  useApproveReceivalEdit,
  useSaveReceivalEdit,
  type Receival,
  type ReceivalEditRequest,
} from '@/hooks/useReceivals'
import { useIsAdmin } from '@/hooks/useProfiles'
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

const STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

// ─── ReceivalRowActions ────────────────────────────────────────────────────────

function ReceivalRowActions({
  receival,
  onRequestEdit,
}: {
  receival: Receival
  onRequestEdit: (r: Receival) => void
}) {
  const { data: editRequests = [] } = useReceivalEditRequests(receival.id)
  const active = editRequests.find(r => r.status === 'pending' || r.status === 'approved')
  return (
    <Button
      size="sm" variant="outline"
      disabled={!!active}
      onClick={() => onRequestEdit(receival)}
    >
      {active?.status === 'pending' ? 'Edit Pending…' :
       active?.status === 'approved' ? 'Edit Approved' :
       'Request Edit'}
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
                  <Input type="number" min={0} step="0.0001" disabled={expired}
                    value={item.new_unit_cost}
                    onChange={(e) => setItems(its => its.map((it, i) =>
                      i === idx ? { ...it, new_unit_cost: parseFloat(e.target.value) || 0 } : it))} />
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
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [requestEditTarget, setRequestEditTarget] = useState<Receival | null>(null)
  const [editTarget, setEditTarget] = useState<{ receival: Receival; request: ReceivalEditRequest } | null>(null)
  const [adminApproveTarget, setAdminApproveTarget] = useState<ReceivalEditRequest | null>(null)

  const { data: receivals, isLoading } = useReceivals({ status: statusFilter as any })
  const { data: isAdmin } = useIsAdmin()

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
          onRequestEdit={setRequestEditTarget}
        />
      ),
    },
  ], [])

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

      <DataTable columns={columns} data={receivals ?? []} isLoading={isLoading} />

      <ReceivalFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      <RequestEditDialog
        receival={requestEditTarget}
        onClose={() => setRequestEditTarget(null)}
      />

      <AdminEditApprovalDialog
        request={adminApproveTarget}
        onClose={() => setAdminApproveTarget(null)}
        isAdmin={!!isAdmin}
      />

      <ReceivalEditDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />
    </PageWrapper>
  )
}
