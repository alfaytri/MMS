'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useEmployees } from '@/hooks/useTeams'
import type { EmployeeStatus } from '@/hooks/useTeams'
import { STATUS_TABS, StatusTabItem } from './StatusTabs'
import type { StatusTabDef } from './StatusTabs'
import { EmployeeRow } from './EmployeeRow'

export function EmployeePool() {
  const [activeTab, setActiveTab] = useState<EmployeeStatus | 'all'>('unassigned')
  const [search, setSearch] = useState('')
  const { data: allEmployees = [] } = useEmployees()

  const pool = allEmployees.filter(e => {
    if (activeTab !== 'all' && e.status !== activeTab) return false
    if (activeTab === 'unassigned' && e.team_id) return false
    if (search) {
      const q = search.toLowerCase()
      return e.name?.toLowerCase().includes(q) || e.phone?.toLowerCase().includes(q)
    }
    return true
  })

  function countForTab(tab: StatusTabDef): number {
    if (tab.key === 'all') return allEmployees.filter(e => e.status !== 'active' || !e.team_id).length
    return allEmployees.filter(e => e.status === tab.key).length
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {STATUS_TABS.map(tab => (
          <StatusTabItem
            key={tab.key}
            tab={tab}
            isActive={activeTab === tab.key}
            count={countForTab(tab)}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-9 h-9 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-24rem)]">
        {pool.map(emp => <EmployeeRow key={emp.id} employee={emp} />)}
        {pool.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No employees</p>
        )}
      </div>
    </div>
  )
}
