'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { FilterBar } from '@/components/audit-trail/FilterBar'
import { AuditTree } from '@/components/audit-trail/AuditTree'
import { useActivityLog, AUDIT_MODULES } from '@/hooks/useActivityLog'

export default function AuditTrailPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [module, setModule] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: logs, isLoading } = useActivityLog({
    search: debouncedSearch || undefined,
    module: module || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  return (
    <PageWrapper>
      <PageHeader title="Audit Trail" description="Activity log across all modules" />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        module={module}
        onModuleChange={(v) => setModule(v === 'all' ? '' : v)}
        allowedModules={AUDIT_MODULES as unknown as string[]}
      />

      <div className="w-full overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-background p-3 max-h-[calc(100vh-16rem)]">
        <AuditTree
          logs={logs ?? []}
          isLoading={isLoading}
          searchTerm={debouncedSearch}
        />
      </div>
    </PageWrapper>
  )
}
