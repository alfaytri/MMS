'use client'

import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { CreditGroupApprovalsContent } from '@/components/master-data/CreditGroupApprovalsContent'

export default function CreditGroupApprovalsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Credit Group Approvals"
        description="Review pending customer credit-group assignments. Default chain: Purchase Manager → Accountant → Owner."
      />
      <CreditGroupApprovalsContent />
    </PageWrapper>
  )
}
