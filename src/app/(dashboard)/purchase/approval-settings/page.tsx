// src/app/(dashboard)/purchase/approval-settings/page.tsx
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'
import { ApprovalRoleAssignmentsTab } from '@/components/purchase/ApprovalRoleAssignmentsTab'
import { useIsAdmin } from '@/hooks/useProfiles'

export default function ApprovalSettingsPage() {
  const [activeTab, setActiveTab] = useState<'chains' | 'assignments'>('chains')
  const { data: isAdmin } = useIsAdmin()

  if (isAdmin === false) {
    return (
      <PageWrapper>
        <PageHeader title="Approval Settings" description="Configure approval chains and role assignments" />
        <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
          You do not have permission to manage approval settings.
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader title="Approval Settings" description="Configure approval chains and role assignments" />
      <div className="flex gap-1 border-b mb-6">
        {([['chains', 'Approval Chains'], ['assignments', 'Role Assignments']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'chains' ? <ApprovalChainsTab /> : <ApprovalRoleAssignmentsTab />}
    </PageWrapper>
  )
}
