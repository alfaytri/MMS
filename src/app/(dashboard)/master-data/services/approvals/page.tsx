// src/app/(dashboard)/master-data/services/approvals/page.tsx
'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, XCircle, Clock, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useServiceChangeRequests,
  useApproveChangeRequest,
  useRejectChangeRequest,
  type ServiceChangeRequest,
} from '@/hooks/useServiceChangeRequests'
import { useHasPermission } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'

const STATUS_TABS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
] as const

const TYPE_COLORS: Record<string, string> = {
  add: 'bg-blue-100 text-blue-700 border-blue-200',
  edit: 'bg-orange-100 text-orange-700 border-orange-200',
  delete: 'bg-red-100 text-red-700 border-red-200',
}

const FIELD_LABELS: Record<string, string> = {
  name_en: 'Name (EN)', name_ar: 'Name (AR)', price: 'Price',
  emergency_price: 'Emergency Price', status: 'Status', duration: 'Duration',
  warranty: 'Warranty', discount: 'Discount',
}

function ChangeSummary({ req }: { req: ServiceChangeRequest }) {
  if (req.change_type === 'delete') return <span className="text-xs italic">Delete service</span>

  const lines = Object.entries(req.changes)
    .filter(([key]) => FIELD_LABELS[key])
    .map(([key, { old: o, new: n }]) => `${FIELD_LABELS[key]}: ${o ?? '—'} → ${n ?? '—'}`)

  if (lines.length === 0) return <span className="text-xs italic">Non-field changes</span>
  return <div className="text-xs space-y-0.5">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
}

export default function ServiceApprovalsPage() {
  const canApprove = useHasPermission('master_data.services.approve')
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const { data: requests = [], isLoading } = useServiceChangeRequests({ status: tab })
  const approveReq = useApproveChangeRequest()
  const rejectReq = useRejectChangeRequest()

  const [approveTarget, setApproveTarget] = useState<ServiceChangeRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ServiceChangeRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function handleApprove() {
    if (!approveTarget) return
    try {
      const result = await approveReq.mutateAsync(approveTarget.id)
      const supabase = createClient()
      await (supabase as any).from('notifications').insert({
        profile_id: approveTarget.requested_by,
        type: 'service_change_approved',
        title: 'Your service change has been approved',
        body: `Change to "${approveTarget.service?.name_en ?? 'New Service'}" was approved.`,
        related_id: result.service_id,
        related_type: 'service',
      })
      toast.success('Change approved')
      setApproveTarget(null)
    } catch (err: any) {
      toast.error(err?.message || String(err) || 'Failed to approve')
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return
    try {
      await rejectReq.mutateAsync({ requestId: rejectTarget.id, reason: rejectReason.trim() })
      const supabase = createClient()
      await (supabase as any).from('notifications').insert({
        profile_id: rejectTarget.requested_by,
        type: 'service_change_rejected',
        title: 'Your service change was rejected',
        body: `Change to "${rejectTarget.service?.name_en ?? 'New Service'}" was rejected: ${rejectReason.trim()}`,
        related_id: rejectTarget.service_id ?? rejectTarget.id,
        related_type: 'service',
      })
      toast.success('Change rejected')
      setRejectTarget(null)
      setRejectReason('')
    } catch (err: any) {
      toast.error(err?.message || String(err) || 'Failed to reject')
    }
  }

  if (!canApprove) {
    return <div className="p-8 text-center text-muted-foreground">You do not have permission to view this page.</div>
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Service Change Approvals</h1>

      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No {tab} requests.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Service</th>
                <th className="text-left px-3 py-2 font-medium w-[80px]">Type</th>
                <th className="text-left px-3 py-2 font-medium">Changes</th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">Requested By</th>
                <th className="text-left px-3 py-2 font-medium w-[100px]">When</th>
                {tab === 'pending' && <th className="text-right px-3 py-2 font-medium w-[200px]">Actions</th>}
                {tab === 'rejected' && <th className="text-left px-3 py-2 font-medium">Reason</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">
                    {req.change_type === 'add'
                      ? `New: ${req.changes.name_en?.new ?? 'Unnamed'}`
                      : req.service?.name_en ?? 'Unknown Service'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={TYPE_COLORS[req.change_type]}>
                      {req.change_type.charAt(0).toUpperCase() + req.change_type.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2"><ChangeSummary req={req} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs">{req.requester?.full_name ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                  </td>
                  {tab === 'pending' && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-7 w-20 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => setApproveTarget(req)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 w-20 text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => { setRejectTarget(req); setRejectReason('') }}>
                          Reject
                        </Button>
                      </div>
                    </td>
                  )}
                  {tab === 'rejected' && (
                    <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                      {req.rejection_reason}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Change</AlertDialogTitle>
            <AlertDialogDescription>
              Apply these changes to &ldquo;{approveTarget?.service?.name_en ?? 'New Service'}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {approveTarget && <ChangeSummary req={approveTarget} />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              disabled={approveReq.isPending}
              onClick={handleApprove}
            >
              {approveReq.isPending ? 'Approving…' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Change</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a reason for rejecting this change to &ldquo;{rejectTarget?.service?.name_en ?? 'New Service'}&rdquo;.
          </p>
          <Textarea
            placeholder="Rejection reason (required)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectReq.isPending}
              onClick={handleReject}
            >
              {rejectReq.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
