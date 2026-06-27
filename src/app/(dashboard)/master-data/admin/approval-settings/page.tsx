'use client'

import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'

export default function ApprovalSettingsPage() {
  return (
    <PageWrapper>
      <div>
        <h2 className="text-lg font-semibold">PO Approval Chains</h2>
        <p className="text-sm text-muted-foreground">
          Configure amount-tiered approval chains for purchase orders (e.g. &gt; 10k requires
          Purchase Manager, &gt; 50k also requires Owner).
        </p>
      </div>
      <ApprovalChainsTab />
    </PageWrapper>
  )
}
