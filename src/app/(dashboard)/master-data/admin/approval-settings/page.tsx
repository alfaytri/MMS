'use client'

import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'

export default function ApprovalSettingsPage() {
  return (
    <PageWrapper>
      <div>
        <h2 className="text-lg font-semibold">Approval Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure the approval chain for purchase orders by amount band.
        </p>
      </div>
      <ApprovalChainsTab />
    </PageWrapper>
  )
}
