'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Filter, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { useContractQuotations } from '@/hooks/useContractQuotations'
import { ContractQuotationCard } from '@/components/contracts/ContractQuotationCard'
import { STATUS_CONFIG, QUOTATION_STATUSES } from '@/types/contracts'
import type { ContractQuotationStatus, QuotationFilters } from '@/types/contracts'
import { cn } from '@/lib/utils'

export default function ViewQuotationsPage() {
  const router = useRouter()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<QuotationFilters>({})
  const [statusFilter, setStatusFilter] = useState<ContractQuotationStatus[]>([])

  const activeFilters: QuotationFilters = {
    ...filters,
    status: statusFilter.length > 0 ? statusFilter : undefined,
  }

  const { data, isLoading } = useContractQuotations(activeFilters)
  const quotations = data?.data || []
  const pipelineValue = data?.pipelineValue || 0
  const statusCounts = data?.statusCounts || {}

  function toggleStatus(status: ContractQuotationStatus) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
  }

  function clearFilters() {
    setFilters({})
    setStatusFilter([])
  }

  const hasActiveFilters = statusFilter.length > 0 ||
    Object.values(filters).some((v) => v !== undefined && v !== '')

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      <PageHeader
        title="Contract Quotations"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              Pipeline: {pipelineValue.toLocaleString()} QAR
            </Badge>
            <Button onClick={() => router.push('/contracts/create-quotation')}>
              <Plus className="h-4 w-4 mr-1" />
              New Quotation
            </Button>
          </div>
        }
      />

      {/* Status counter chips */}
      <div className="flex flex-wrap gap-2">
        {QUOTATION_STATUSES.map((status) => {
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
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
            placeholder="Quotation number..."
            value={filters.contractNumber || ''}
            onChange={(e) => setFilters((f) => ({ ...f, contractNumber: e.target.value || undefined }))}
          />
          <Input
            placeholder="Customer name..."
            value={filters.customer || ''}
            onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value || undefined }))}
          />
          <Input
            placeholder="Phone..."
            value={filters.phone || ''}
            onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value || undefined }))}
          />
          <Input
            placeholder="Site name..."
            value={filters.siteName || ''}
            onChange={(e) => setFilters((f) => ({ ...f, siteName: e.target.value || undefined }))}
          />
        </div>
      )}

      {/* Quotation list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No quotations found</p>
          <p className="text-xs mt-1">Create your first contract quotation to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => (
            <ContractQuotationCard key={q.id} quotation={q} />
          ))}
        </div>
      )}
    </div>
  )
}
