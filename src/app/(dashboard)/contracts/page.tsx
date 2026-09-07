'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Loader2, FileStack, Wallet, AlertTriangle, ListFilter, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useContracts } from '@/hooks/useContracts'
import { useContractQuotations } from '@/hooks/useContractQuotations'
import { useHasPermission } from '@/hooks/usePermissions'
import { ContractListCard } from '@/components/contracts/ContractListCard'
import { STATUS_CONFIG, QUOTATION_STATUSES, LIVE_STATUSES } from '@/types/contracts'
import type { ContractListRow, ContractStatus } from '@/types/contracts'
import { cn } from '@/lib/utils'

const STATUS_PRIORITY: Record<string, number> = {
  overdue_payment: 0, expiring_soon: 1, manager_review: 2, customer_pending: 3,
  active: 4, approved: 5, draft: 6, rejected: 7, completed: 8, expired: 9, cancelled: 10,
}

type Phase = 'all' | 'pipeline' | 'live'

export default function ContractsPage() {
  const router = useRouter()
  const canCreate = useHasPermission('contracts.quotations.manage')

  const live = useContracts()
  const quotes = useContractQuotations()

  const [phase, setPhase] = useState<Phase>('all')
  const [statusFilter, setStatusFilter] = useState<Set<ContractStatus>>(new Set())
  const [search, setSearch] = useState('')

  const isLoading = live.isLoading || quotes.isLoading

  const allRows: ContractListRow[] = useMemo(() => {
    const liveRows: ContractListRow[] = (live.data?.items ?? []).map((c) => ({
      id: c.id, number: c.contract_id, status: c.status, phase: 'live',
      customer_name: c.customer_name, site_name: c.site_name, divisions: c.divisions,
      total_value: c.total_value, monthly_value: c.monthly_value, end_date: c.end_date,
      total_visits: c.total_visits, completed_visits: c.completed_visits,
      total_payments: c.total_payments, paid_amount: c.paid_amount,
    }))
    const quoteRows: ContractListRow[] = (quotes.data?.data ?? []).map((q) => ({
      id: q.id, number: q.quotation_number, status: q.status, phase: 'quotation',
      customer_name: q.customer_name, site_name: q.site_name, divisions: q.divisions,
      total_value: q.total_value, monthly_value: q.monthly_value, created_at: q.created_at,
    }))
    return [...liveRows, ...quoteRows]
  }, [live.data, quotes.data])

  const pipelineCount = useMemo(() => allRows.filter((r) => r.phase === 'quotation').length, [allRows])
  const liveCount = useMemo(() => allRows.filter((r) => r.phase === 'live').length, [allRows])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of allRows) counts[r.status] = (counts[r.status] || 0) + 1
    return counts
  }, [allRows])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows
      .filter((r) => (phase === 'all' ? true : phase === 'pipeline' ? r.phase === 'quotation' : r.phase === 'live'))
      .filter((r) => (statusFilter.size ? statusFilter.has(r.status) : true))
      .filter((r) =>
        q
          ? r.number.toLowerCase().includes(q) ||
            r.customer_name.toLowerCase().includes(q) ||
            r.site_name.toLowerCase().includes(q)
          : true,
      )
      .sort(
        (a, b) =>
          (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99) ||
          b.total_value - a.total_value,
      )
  }, [allRows, phase, statusFilter, search])

  const pipelineValue = quotes.data?.pipelineValue ?? 0
  const outstandingTotal = live.data?.outstandingTotal ?? 0

  function changePhase(p: Phase) {
    setPhase(p)
    setStatusFilter(new Set()) // status choices are phase-scoped; reset on switch
  }
  function toggleStatus(s: ContractStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const showPipelineStatuses = phase === 'all' || phase === 'pipeline'
  const showLiveStatuses = phase === 'all' || phase === 'live'
  const hasFilters = statusFilter.size > 0 || search.length > 0 || phase !== 'all'

  const segments: { key: Phase; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allRows.length },
    { key: 'pipeline', label: 'Pipeline', count: pipelineCount },
    { key: 'live', label: 'Live', count: liveCount },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      <PageHeader
        title="Contracts"
        description="Quotations pipeline and live contracts in one place."
        actions={
          canCreate ? (
            <Button onClick={() => router.push('/contracts/create-quotation')} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Contract
            </Button>
          ) : undefined
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile icon={<FileStack className="h-5 w-5" />} label="Total" value={allRows.length.toLocaleString('en-QA')} tone="muted" />
        <StatTile icon={<Wallet className="h-5 w-5" />} label="Pipeline (quotations)" value={`${pipelineValue.toLocaleString('en-QA')} QAR`} tone="primary" />
        <StatTile icon={<AlertTriangle className="h-5 w-5" />} label="Outstanding (live)" value={`${outstandingTotal.toLocaleString('en-QA')} QAR`} tone={outstandingTotal > 0 ? 'danger' : 'muted'} />
      </div>

      {/* Toolbar: phase toggle · status dropdown · search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {segments.map((s) => (
            <button
              key={s.key}
              onClick={() => changePhase(s.key)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm transition-colors',
                phase === s.key
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
              <span className={cn('ml-1.5', phase === s.key ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                {s.count}
              </span>
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground sm:w-44">
            <span className="inline-flex items-center gap-2">
              <ListFilter className="h-4 w-4" />
              Status
            </span>
            <span className="inline-flex items-center gap-1.5">
              {statusFilter.size > 0 && (
                <Badge variant="secondary" className="px-1.5 text-xs">{statusFilter.size}</Badge>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {showPipelineStatuses && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Pipeline</DropdownMenuLabel>
                {QUOTATION_STATUSES.map((s) => (
                  <StatusCheckItem key={s} status={s} count={statusCounts[s] || 0} checked={statusFilter.has(s)} onToggle={() => toggleStatus(s)} />
                ))}
              </DropdownMenuGroup>
            )}
            {showPipelineStatuses && showLiveStatuses && <DropdownMenuSeparator />}
            {showLiveStatuses && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Live</DropdownMenuLabel>
                {LIVE_STATUSES.map((s) => (
                  <StatusCheckItem key={s} status={s} count={statusCounts[s] || 0} checked={statusFilter.has(s)} onToggle={() => toggleStatus(s)} />
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search number, customer, site…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Active status filters */}
      {(statusFilter.size > 0 || (hasFilters && phase !== 'all')) && (
        <div className="flex flex-wrap items-center gap-2">
          {phase !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize">
              {phase}
              <button onClick={() => changePhase('all')} aria-label="Clear phase">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {[...statusFilter].map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
            >
              {STATUS_CONFIG[s]?.label || s}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => { setStatusFilter(new Set()); setPhase('all'); setSearch('') }}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No contracts found</p>
          {canCreate && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/contracts/create-quotation')}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create your first contract
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <ContractListCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatusCheckItem({ status, count, checked, onToggle }: {
  status: ContractStatus; count: number; checked: boolean; onToggle: () => void
}) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={onToggle}
      onSelect={(e) => e.preventDefault()}
      className="justify-between gap-3"
    >
      <span>{STATUS_CONFIG[status]?.label || status}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </DropdownMenuCheckboxItem>
  )
}

function StatTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone: 'primary' | 'danger' | 'muted'
}) {
  const toneCls =
    tone === 'primary' ? 'bg-primary/10 text-primary'
    : tone === 'danger' ? 'bg-destructive/10 text-destructive'
    : 'bg-muted text-muted-foreground'
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneCls)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold truncate">{value}</div>
      </div>
    </div>
  )
}
