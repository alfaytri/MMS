'use client'

import { PageWrapper } from '@/components/shared/PageWrapper'
import { CreditGroupApprovalsContent } from '@/components/master-data/CreditGroupApprovalsContent'

export default function CreditGroupApprovalsAdminPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Credit Group Approvals</h2>
          <p className="text-sm text-muted-foreground">
            Review pending customer credit-group assignments. Default chain: Purchase Manager → Accountant → Owner.
          </p>
        </div>
        <CreditGroupApprovalsContent />
      </div>
    </PageWrapper>
  )
}
