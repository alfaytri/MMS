'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, PackageCheck, Gift, ShoppingCart, Boxes, TrendingUp } from 'lucide-react'
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
      <Button size="sm" variant="outline" className="min-h-11 md:min-h-0 text-amber-600 border-amber-300 hover:bg-amber-50"
        onClick={(e) => { e.stopPropagation(); onAdminApprove(active) }}>
        Review Edit
      </Button>
    )
  }

  if (active?.status === 'pending') {
    return <Button size="sm" variant="outline" className="min-h-11 md:min-h-0" disabled>Edit Pending…</Button>
  }

  if (active?.status === 'approved') {
    return (
      <Button size="sm" variant="outline" className="min-h-11 md:min-h-0 text-green-600 border-green-300 hover:bg-green-50"
        onClick={(e) => { e.stopPropagation(); onEditApproved({ receival, request: active }) }}>
        Edit Now
      </Button>
    )
  }

  if (lcLocked) {
    return (
      <Button size="sm" variant="outline" disabled className="min-h-11 md:min-h-0 opacity-50" title="Landed Cost applied — edit not available">
        LC Applied
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline" className="min-h-11 md:min-h-0"
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
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<ReceivalStatus | ''>('')
  const [sourceFilter, setSourceFilter] = useState<'purchase' | 'inventory' | 'all'>(
    (searchParams.get('source') as 'purchase' | 'inventory') ?? 'all',
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [requestEditTarget, setRequestEditTarget] = useState<Receival | null>(null)
  const [editTarget, setEditTarget] = useState<{ receival: Receival; request: ReceivalEditRequest } | null>(null)
  const [adminApproveTarget, setAdminApproveTarget] = useState<ReceivalEditRequest | null>(null)
  const [detailReceival, setDetailReceival] = useState<Receival | null>(null)

  const { data: receivals, isLoading } = useReceivals({ status: statusFilter, source_type: sourceFilter })
  const { data: lcLockedIds } = useLcLockedReceivalIds()
  const { data: myRoles = [] } = useMyApprovalSlotRoles()
  const canApproveEdit = myRoles.some(
    (r) => (r.scopes === null || r.scopes.includes('receival_edit'))
  )

  const stats = useMemo(() => {
    const list = receivals ?? []
    let totalValue = 0
    let freeCount = 0
    let rejectedCount = 0
    for (const r of list) {
      const hasFree = (r.receival_items ?? []).some((it) => it.is_free)
      if (hasFree) freeCount++
      if (r.status === 'rejected') rejectedCount++
      for (const it of r.receival_items ?? []) {
        if (!it.is_free) totalValue += it.qty_received * it.unit_cost
      }
    }
    return { total: list.length, totalValue, freeCount, rejectedCount }
  }, [receivals])

  const columns = useMemo<ColumnDef<Receival>[]>(() => [
    {
      accessorKey: 'receival_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Receival #" />,
      cell: ({ row }) => {
        const num = row.getValue('receival_number') as string
        const isInventory = row.original.source_type === 'inventory'
        return (
          <span
            className={cn(
              'font-mono text-sm font-medium',
              isInventory && 'text-purple-700',
            )}
          >
            {num}
          </span>
        )
      },
    },
    {
      id: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const r = row.original
        if (r.source_type === 'inventory') {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700">
              <Boxes className="h-3 w-3" /> Inventory
            </span>
          )
        }
        return r.po_number ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{r.po_number}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[160px] block">
          {row.original.supplier_name ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="text-xs tabular-nums">{formatDate(row.getValue('date'))}</span>,
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.receival_items ?? []
        const paid = items.filter((i) => !i.is_free).length
        const free = items.filter((i) => i.is_free).length
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="tabular-nums font-medium">{paid}</span>
            <span className="text-muted-foreground">line{paid === 1 ? '' : 's'}</span>
            {free > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-success/10 text-success text-[10px] font-medium">
                <Gift className="h-2.5 w-2.5" /> +{free}
              </span>
            )}
          </span>
        )
      },
    },
    {
      id: 'value',
      header: () => <span className="text-right w-full block">Value</span>,
      cell: ({ row }) => {
        const total = (row.original.receival_items ?? [])
          .filter((i) => !i.is_free)
          .reduce((s, i) => s + i.qty_received * i.unit_cost, 0)
        return (
          <span className="text-xs tabular-nums block text-right font-medium">
            {total > 0 ? total.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </span>
        )
      },
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
  ], [canApproveEdit, lcLockedIds])

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

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <PackageCheck className="h-2.5 w-2.5" /> Total receivals
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" /> Total value
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {stats.totalValue.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Gift className="h-2.5 w-2.5" /> With free items
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.freeCount > 0 && 'text-success')}>
            {stats.freeCount}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Rejected</div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.rejectedCount > 0 && 'text-destructive')}>
            {stats.rejectedCount}
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors',
                statusFilter === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Source</span>
          {(['all', 'purchase', 'inventory'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setSourceFilter(v)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors capitalize',
                sourceFilter === v
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {v === 'purchase' && <ShoppingCart className="h-3 w-3" />}
              {v === 'inventory' && <Boxes className="h-3 w-3" />}
              {v === 'all' ? 'All' : v}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={receivals ?? []}
        isLoading={isLoading}
        onRowClick={(row) => setDetailReceival(row)}
        mobileCardRender={(r: Receival) => {
          const s = r.status as string
          const cfg = STATUS_CONFIG[s] ?? { label: s ?? 'Unknown', className: 'bg-gray-100 text-gray-700' }
          const items = r.receival_items ?? []
          const paid = items.filter((i) => !i.is_free).length
          const free = items.filter((i) => i.is_free).length
          const total = items.filter((i) => !i.is_free).reduce((sum, i) => sum + i.qty_received * i.unit_cost, 0)
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-mono text-sm font-semibold', r.source_type === 'inventory' && 'text-purple-700')}>
                  {r.receival_number}
                </span>
                <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {r.source_type === 'inventory'
                  ? <><Boxes className="h-3 w-3 text-purple-700" /><span className="text-purple-700 font-medium">Inventory</span></>
                  : <><ShoppingCart className="h-3 w-3" /><span className="font-mono">{r.po_number ?? '—'}</span></>}
                <span className="ml-auto tabular-nums">{formatDate(r.date)}</span>
              </div>
              <p className="text-sm truncate">{r.supplier_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="tabular-nums font-medium text-foreground">{paid}</span> line{paid === 1 ? '' : 's'}
                  {free > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-success/10 text-success text-[10px] font-medium">
                      <Gift className="h-2.5 w-2.5" /> +{free}
                    </span>
                  )}
                </span>
                {total > 0 && (
                  <span className="tabular-nums font-medium">
                    {total.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
            </div>
          )
        }}
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
