'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePendingSalesApprovals, type SalesApprovalSlip } from '@/hooks/useSalesApprovals'
import { SalesApprovalDetailDialog } from '@/components/sales/SalesApprovalDetailDialog'

export default function SalesApprovalsPage() {
  const { data: slips = [], isLoading } = usePendingSalesApprovals()
  const [selected, setSelected] = useState<SalesApprovalSlip | null>(null)

  return (
    <PageWrapper>
      <PageHeader
        title="Sales Approvals"
        description="Margin and credit approvals waiting on you"
      />

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SO #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead className="hidden md:table-cell">Iteration</TableHead>
              <TableHead className="hidden md:table-cell">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : slips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState title="No sales approvals pending for your roles" />
                </TableCell>
              </TableRow>
            ) : (
              slips.map((slip) => {
                const currentRow = slip.rows.find((r) => r.is_active && r.status === 'pending')
                return (
                  <TableRow
                    key={`${slip.source_id}-${slip.approval_type}-${slip.iteration}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(slip)}
                  >
                    <TableCell className="font-medium">{slip.so.so_number}</TableCell>
                    <TableCell>{slip.so.customer_name}</TableCell>
                    <TableCell>
                      <Badge variant={slip.approval_type === 'margin' ? 'secondary' : 'destructive'}>
                        {slip.approval_type === 'margin' ? 'Below Cost' : 'Over Credit Limit'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">#{slip.iteration}</TableCell>
                    <TableCell className="hidden md:table-cell">{slip.so.total.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Waiting on {currentRow?.step_role ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <SalesApprovalDetailDialog
        slip={selected}
        onClose={() => setSelected(null)}
      />
    </PageWrapper>
  )
}
