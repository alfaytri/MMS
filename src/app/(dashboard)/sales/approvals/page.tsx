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
import { ShieldAlert } from 'lucide-react'
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
            {(pending ?? []).map((slip) => {
              const pendingRoles = slip.rows
                .filter((r) => r.status === 'pending' && r.is_active)
                .map((r) => roleLabel(r.step_role))
              return (
                <div
                  key={`${slip.source_id}|${slip.approval_type}|${slip.iteration}`}
                  className="rounded-lg border p-4 space-y-3"
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
                    <Button size="sm" onClick={() => setSelected(slip)}>
                      Review {chainLabel(slip.approval_type)}
                    </Button>
                    {isOwner && pendingRoles.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={forceApprove.isPending}
                            className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EmptyState title="No completed approvals yet" />
                    </TableCell>
                  </TableRow>
                ) : (
                  (completed ?? []).map((slip) => {
                    const anyRejected = slip.rows.some((r) => r.status === 'rejected')
                    return (
                      <TableRow key={`${slip.source_id}|${slip.approval_type}|${slip.iteration}`}>
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
    </PageWrapper>
  )
}
