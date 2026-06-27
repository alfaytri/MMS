'use client'

import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainManagement } from '@/components/master-data/ApprovalChainConfig'

export default function ApprovalWorkflowsPage() {
  return (
    <PageWrapper>
      <div>
        <h2 className="text-lg font-semibold">Approval Workflows</h2>
        <p className="text-sm text-muted-foreground">
          Configure which roles act on each step of every approval workflow — purchase orders,
          inventory checks, stock adjustments, and sales (margin &amp; credit).
        </p>
      </div>
      <ApprovalChainManagement />
    </PageWrapper>
  )
}
