'use client'

import { useState } from 'react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'
import { ApprovalRoleAssignmentsTab } from '@/components/purchase/ApprovalRoleAssignmentsTab'

export default function ApprovalSettingsPage() {
  const [activeTab, setActiveTab] = useState<'chains' | 'assignments'>('chains')

  return (
    <PageWrapper>
      <div>
        <h2 className="text-lg font-semibold">Approval Settings</h2>
        <p className="text-sm text-muted-foreground">Configure approval chains and role assignments</p>
      </div>
      <div className="flex gap-1 border-b">
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
