'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Filter, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { useContracts } from '@/hooks/useContracts'
import { useUpdateContract } from '@/hooks/useUpdateContract'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { ContractCard } from '@/components/contracts/ContractCard'
import { CancelContractDialog } from '@/components/contracts/CancelContractDialog'
import { STATUS_CONFIG, LIVE_STATUSES } from '@/types/contracts'
import type { ContractLiveStatus, ContractFilters } from '@/types/contracts'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function ViewLiveContractsPage() {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<ContractFilters>({})
  const [statusFilter, setStatusFilter] = useState<ContractLiveStatus[]>([])
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)

  const { data: profile } = useCurrentUserProfile()
  const updateContract = useUpdateContract()

  const activeFilters: ContractFilters = {
    ...filters,
    status: statusFilter.length > 0 ? statusFilter : undefined,
  }

  const contractsQuery = useContracts(activeFilters)
  const contracts = useMemo(
    () => contractsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [contractsQuery.data]
  )
  const outstandingTotal = contractsQuery.data?.pages[0]?.outstandingTotal ?? 0
  const statusCounts = contractsQuery.data?.pages[0]?.statusCounts ?? {}
  const isLoading = contractsQuery.isLoading

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && contractsQuery.hasNextPage && !contractsQuery.isFetchingNextPage) {
          contractsQuery.fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [contractsQuery.hasNextPage, contractsQuery.isFetchingNextPage, contractsQuery.fetchNextPage])

  function toggleStatus(status: ContractLiveStatus) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
  }

  function clearFilters() {
    setFilters({})
    setStatusFilter([])
  }

  async function handleCancel(reason: string) {
    if (!cancelTarget || !profile) return
    try {
      await updateContract.mutateAsync({
        contractId: cancelTarget,
        updates: {},
        newStatus: 'cancelled',
        context: {
          userId: (profile as any).id,
          userName: profile.full_name || '',
          reason,
        },
      })
      toast.success('Contract cancelled')
      setCancelTarget(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel contract')
    }
  }

  const hasActiveFilters = statusFilter.length > 0 ||
    Object.values(filters).some((v) => v !== undefined && v !== '')

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      <PageHeader
        title="Live Contracts"
        actions={
          outstandingTotal > 0 ? (
            <Badge variant="destructive" className="text-sm">
              Outstanding: {outstandingTotal.toLocaleString()} QAR
            </Badge>
          ) : undefined
        }
      />

      {/* Status counter chips */}
      <div className="flex flex-wrap gap-2">
        {LIVE_STATUSES.map((status) => {
          const config = STATUS_CONFIG[status]
          const count = statusCounts[status] || 0
          const isActive = statusFilter.includes(status)
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : config?.color || 'bg-gray-100 text-gray-700',
              )}
            >
              {config?.label || status}
              <span className="font-bold">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filter panel */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filters
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border p-4">
          <Input
            placeholder="Contract ID..."
            value={filters.contractNumber || ''}
            onChange={(e) => setFilters((f) => ({ ...f, contractNumber: e.target.value || undefined }))}
          />
          <Input
            placeholder="Customer..."
            value={filters.customer || ''}
            onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value || undefined }))}
          />
          <Input
            placeholder="Site..."
            value={filters.site || ''}
            onChange={(e) => setFilters((f) => ({ ...f, site: e.target.value || undefined }))}
          />
          <Input
            placeholder="Agent..."
            value={filters.agent || ''}
            onChange={(e) => setFilters((f) => ({ ...f, agent: e.target.value || undefined }))}
          />
        </div>
      )}

      {/* Contracts list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No contracts found</p>
          <p className="text-xs mt-1">Active contracts will appear here after quotation approval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              onCancel={(id) => setCancelTarget(id)}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {contractsQuery.isFetchingNextPage && (
            <p className="text-center text-xs text-muted-foreground py-4">Loading more...</p>
          )}
        </div>
      )}

      <CancelContractDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        contractId={cancelTarget || ''}
        onConfirm={handleCancel}
        isPending={updateContract.isPending}
      />
    </div>
  )
}
