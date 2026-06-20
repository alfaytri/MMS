// src/app/(dashboard)/purchase/approval-settings/page.tsx
'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'

export default function ApprovalSettingsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Approval Settings"
        description="Configure the approval chain for purchase orders by amount band."
      />
      <ApprovalChainsTab />
    </PageWrapper>
  )
}
