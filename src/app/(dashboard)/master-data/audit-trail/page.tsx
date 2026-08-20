'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/audit-trail/FilterBar'
import { AuditTimeline } from '@/components/audit-trail/AuditTimeline'
import { useActivityLog, AUDIT_MODULES } from '@/hooks/useActivityLog'

export default function AuditTrailPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [module, setModule] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Any filter change resets to the first page so results start from the top.
  useEffect(() => { setPage(1) }, [debouncedSearch, module, dateFrom, dateTo])

  const { data, isLoading } = useActivityLog({
    search: debouncedSearch || undefined,
    module: module || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
  })

  const logs = data?.rows ?? []
  const total = data?.count ?? 0
  const pageSize = data?.pageSize ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

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

      <div className="w-full overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-background p-3 max-h-[calc(100vh-18rem)]">
        <AuditTimeline
          logs={logs}
          isLoading={isLoading}
          searchTerm={debouncedSearch}
        />
      </div>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between gap-3 px-1 pt-3 text-xs text-muted-foreground flex-wrap">
          <span className="tabular-nums">
            {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'} · showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 min-h-11 md:min-h-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
            </Button>
            <span className="tabular-nums min-w-[92px] text-center">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-8 min-h-11 md:min-h-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
