'use client'

/**
 * Sales Approvals — visual + structural twin of the PO Approvals page
 * (src/app/(dashboard)/purchase/approvals/page.tsx).
 *
 * - "Pending Approvals" renders one card per pending slip (margin or credit
 *   chain × iteration) with the chain visualised by SoApprovalChain.
 * - "Completed Approvals" lists the latest finalised slip per (SO, chain) in
 *   a compact table.
 *
 * Review action opens the existing `SalesApprovalDetailDialog`, which holds
 * the per-step approve / reject form already wired to the RPCs.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert, Eye } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { SoStatusBadge } from '@/components/sales/SoStatusBadge'
import type { SOStatus } from '@/hooks/useSaleOrders'
import { SoApprovalChain } from '@/components/sales/SoApprovalChain'
import { SalesApprovalDetailDialog } from '@/components/sales/SalesApprovalDetailDialog'
import {
  usePendingSalesApprovals, useCompletedSalesApprovals,
  useForceApproveSalesRequest, useIsOwner,
  type SalesApprovalSlip,
} from '@/hooks/useSalesApprovals'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant:       'Accountant',
  sales_manager:    'Sales Manager',
  finance_manager:  'Finance Manager',
  brand_manager:    'Brand Manager',
  owner:            'Owner',
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function chainLabel(type: SalesApprovalSlip['approval_type']): string {
  return type === 'margin' ? 'Margin' : 'Credit'
}

export default function SalesApprovalsPage() {
  const { data: pending, isLoading: pendingLoading }     = usePendingSalesApprovals()
  const { data: completed, isLoading: completedLoading } = useCompletedSalesApprovals()
  const { data: isOwner = false }                        = useIsOwner()
  const forceApprove                                     = useForceApproveSalesRequest()
  const [selected, setSelected] = useState<SalesApprovalSlip | null>(null)
  const [viewSlip, setViewSlip] = useState<SalesApprovalSlip | null>(null)

  function handleForceApprove(slip: SalesApprovalSlip) {
    forceApprove.mutate(
      { soId: slip.source_id, approvalType: slip.approval_type },
      {
        onSuccess: (count) => {
          toast.success(
            count > 1
              ? `Force-approved ${count} remaining steps`
              : 'Force-approved',
          )
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error'),
      },
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Sales Approvals"
        description="Review and action pending sale order approvals"
      />

      {/* ── Pending Approvals ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : (pending ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No sales approvals pending for your roles
          </div>
        ) : (
          <div className="space-y-3">
            {(pending ?? []).map((slip, i) => {
              const pendingRoles = slip.rows
                .filter((r) => r.status === 'pending' && r.is_active)
                .map((r) => roleLabel(r.step_role))
              return (
                <div
                  key={`${slip.source_id}|${slip.approval_type}|${slip.iteration}`}
                  className={cn('rounded-lg border p-4 space-y-3', STAGGER_IN)}
                  style={staggerDelay(i)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{slip.so.so_number}</span>
                      <SoStatusBadge status={slip.so.status as SOStatus} />
                      <Badge
                        variant={slip.approval_type === 'margin' ? 'secondary' : 'destructive'}
                      >
                        {slip.approval_type === 'margin' ? 'Below Cost' : 'Over Credit Limit'}
                      </Badge>
                      {slip.iteration > 1 && (
                        <Badge variant="outline" className="text-xs">
                          Attempt #{slip.iteration}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm font-semibold">
                      {formatCurrency(slip.so.total, 'QAR')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {slip.so.customer_name}
                      {slip.rows[0]?.created_at && (
                        <> · {formatDate(slip.rows[0].created_at)}</>
                      )}
                    </span>
                    <SoApprovalChain rows={slip.rows} />
                  </div>

                  {pendingRoles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for:{' '}
                      <span className="font-medium text-foreground">
                        {pendingRoles.join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => setSelected(slip)}>
                      Review {chainLabel(slip.approval_type)}
                    </Button>
                    {isOwner && pendingRoles.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={forceApprove.isPending}
                            className="gap-1 min-h-11 md:min-h-0 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" /> Force Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Force-approve {pendingRoles.length} remaining {pendingRoles.length === 1 ? 'step' : 'steps'}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will approve {pendingRoles.join(', ')} on the{' '}
                              <span className="font-medium">{chainLabel(slip.approval_type)}</span> chain of SO{' '}
                              <span className="font-mono font-medium">{slip.so.so_number}</span>. The activity log will mark each role as Force Approved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleForceApprove(slip)}
                              className="bg-amber-500 hover:bg-amber-600 text-white"
                            >
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Completed Approvals ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SO #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Approvals</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState title="No completed approvals yet" />
                    </TableCell>
                  </TableRow>
                ) : (
                  (completed ?? []).map((slip, i) => {
                    const anyRejected = slip.rows.some((r) => r.status === 'rejected')
                    return (
                      <TableRow key={`${slip.source_id}|${slip.approval_type}|${slip.iteration}`} className={STAGGER_IN} style={staggerDelay(i)}>
                        <TableCell className="font-mono text-sm font-medium">
                          {slip.so.so_number}
                        </TableCell>
                        <TableCell>{slip.so.customer_name}</TableCell>
                        <TableCell>
                          <Badge variant={slip.approval_type === 'margin' ? 'secondary' : 'destructive'}>
                            {chainLabel(slip.approval_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {anyRejected ? (
                            <Badge variant="outline" className="border-destructive text-destructive">
                              Rejected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-success text-success">
                              Approved
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(slip.so.total, 'QAR')}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <SoApprovalChain rows={slip.rows} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-8 min-h-11 md:min-h-0 gap-1 px-2" onClick={() => setViewSlip(slip)}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <SalesApprovalDetailDialog
        slip={selected}
        onClose={() => setSelected(null)}
      />

      {/* View completed approval details */}
      <Dialog open={!!viewSlip} onOpenChange={(o) => { if (!o) setViewSlip(null) }}>
        <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-lg sm:rounded-lg flex flex-col">
          {viewSlip && (() => {
            const anyRejected = viewSlip.rows.some((r) => r.status === 'rejected')
            const payload: { available?: number; overage?: number; lines?: Array<{ item_name?: string; unit_price?: number; avg_cost?: number }> } = (() => {
              const row = viewSlip.rows.find((r) => r.reason)
              try { return JSON.parse(row?.reason ?? '{}') } catch { return {} }
            })()
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Approval Details · {viewSlip.so.so_number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{viewSlip.so.customer_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chain</span>
                      <Badge variant={viewSlip.approval_type === 'margin' ? 'secondary' : 'destructive'}>
                        {chainLabel(viewSlip.approval_type)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold">{formatCurrency(viewSlip.so.total, 'QAR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {anyRejected ? (
                        <Badge variant="outline" className="border-destructive text-destructive">Rejected</Badge>
                      ) : (
                        <Badge variant="outline" className="border-success text-success">Approved</Badge>
                      )}
                    </div>
                  </div>

                  {(viewSlip.approval_type === 'credit' ? (payload.available != null || payload.overage != null) : Array.isArray(payload.lines) && payload.lines.length > 0) && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                      {viewSlip.approval_type === 'credit' ? (
                        <>
                          <div>Available credit: {Number(payload.available ?? 0).toLocaleString('en-QA')}</div>
                          <div className="font-medium text-amber-700">
                            Over limit by: {Number(payload.overage ?? 0).toLocaleString('en-QA')}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium">Below-cost lines:</div>
                          {(payload.lines ?? []).map((l, i) => (
                            <div key={i} className="text-amber-700">
                              {l.item_name}: unit {Number(l.unit_price).toLocaleString('en-QA')} &lt; avg cost {Number(l.avg_cost).toLocaleString('en-QA')}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-xs font-medium mb-2">Approval Chain</div>
                    {[...viewSlip.rows].sort((a, b) => a.step_order - b.step_order).map((row) => {
                      const wasActuallyDecided = !!row.decided_by_name
                      const isRejected = row.status === 'rejected' && wasActuallyDecided
                      const isApproved = row.status === 'approved'
                      const isNotReached = !isRejected && !isApproved
                      return (
                        <div key={row.id} className={`flex items-start gap-3 rounded-md border p-2.5 ${isNotReached ? 'opacity-60' : ''}`}>
                          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            isRejected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {isApproved ? '✓' : isRejected ? '✕' : '—'}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                Step {row.step_order} — {roleLabel(row.step_role)}
                              </span>
                              <Badge variant="outline" className={`text-[10px] ${
                                isApproved ? 'border-green-300 text-green-700 dark:text-green-400' :
                                isRejected ? 'border-red-300 text-red-700 dark:text-red-400' :
                                ''
                              }`}>
                                {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Not reached'}
                              </Badge>
                            </div>
                            {isRejected && row.decided_by_name && (
                              <p className="text-xs text-muted-foreground">
                                Rejected by {row.decided_by_name}
                                {row.decided_at && <> · {formatDate(row.decided_at)}</>}
                              </p>
                            )}
                            {isApproved && row.decided_by_name && (
                              <p className="text-xs text-muted-foreground">
                                Approved by {row.decided_by_name}
                                {row.decided_at && <> · {formatDate(row.decided_at)}</>}
                              </p>
                            )}
                            {isNotReached && (
                              <p className="text-xs text-muted-foreground">
                                Skipped — chain ended before this step
                              </p>
                            )}
                            {row.comment && wasActuallyDecided && (
                              <div className={`mt-1 rounded px-2 py-1 text-xs italic ${
                                isRejected
                                  ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                &ldquo;{row.comment}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setViewSlip(null)}>Close</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
