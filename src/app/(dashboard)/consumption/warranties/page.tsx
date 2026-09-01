'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  ShieldCheck, AlertCircle, RefreshCw, Wrench, Package, Hash,
  Layers, Building2, FileText, Calendar, Globe, Tag, ClipboardList, Clock,
  FilePlus2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useWarrantyRecords, type WarrantyRecordRow } from '@/hooks/useWarrantyRecords'
import { useSkuCategoryPaths } from '@/hooks/useSkuCategoryPaths'
import {
  useWarrantyClaims, type WarrantyClaimRow, type WarrantyClaimStatus, type WarrantyClaimResolutionType,
} from '@/hooks/useWarrantyClaims'
import { useDivisions } from '@/hooks/useDivisions'
import { COVERAGE_TYPE_LABELS, type CoverageType } from '@/hooks/useWarrantyPolicies'
import { useHasPermission } from '@/hooks/usePermissions'
import { FileWarrantyClaimDialog } from '@/components/sales/FileWarrantyClaimDialog'
import { WarrantyClaimDetailDialog } from '@/components/sales/WarrantyClaimDetailDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate, formatDateTime } from '@/lib/utils/formatters'
import { humanizeDbError } from '@/lib/dbErrors'
import { cn } from '@/lib/utils'

// This page is scoped to consumption-sourced warranties (source_type='consumption'),
// which are issued automatically when an item is consumed into a team/project
// custody (a "sale"). They carry no customer — the invoice/order/project ref lives
// in the consumption's notes — so this mirror of the Sales Warranties page shows
// Division where Sales shows Customer, and drops the always-"Consumption" Source
// column as redundant.

function coverageLabel(value: string | null): string {
  if (!value) return '—'
  return COVERAGE_TYPE_LABELS[value as CoverageType] ?? value
}

// ── Claim label / color helpers ─────────────────────────────────────────
const RESOLUTION_TYPE_LABELS: Record<string, string> = {
  replacement: 'Replacement',
  credit:      'Credit',
  refund:      'Refund',
  repair:      'Repair',
}

function resolutionTypeLabel(value: WarrantyClaimResolutionType): string {
  if (!value) return '—'
  return RESOLUTION_TYPE_LABELS[value] ?? value
}

function decisionLabel(value: string | null): string {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const CLAIM_STATUS_CONFIG: Record<WarrantyClaimStatus, { label: string; badgeClassName: string }> = {
  open:        { label: 'Open',        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300' },
  covered:     { label: 'Covered',     badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  rejected:    { label: 'Rejected',    badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' },
  in_progress: { label: 'In Progress', badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' },
  resolved:    { label: 'Resolved',    badgeClassName: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' },
  void:        { label: 'Void',        badgeClassName: 'border-border bg-muted text-muted-foreground' },
}

/** Pure id→name resolver — takes the map explicitly so it stays a stable,
 * module-scope reference. */
function lookupName(map: Map<string, string>, id: string | null | undefined, fallback: string): string {
  if (!id) return '—'
  return map.get(id) ?? fallback
}

// ── Detail dialog ────────────────────────────────────────────────────────
function MetaCard({ icon, label, value, above }: { icon: React.ReactNode; label: string; value: string; above?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        {above}
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

interface WarrantyDetailProps {
  record:        WarrantyRecordRow | null
  divisionName:  string
  onClose:       () => void
  onFileClaim:   () => void
  canFileClaim:  boolean
}

function WarrantyRecordDetailDialog({
  record, divisionName, onClose, onFileClaim, canFileClaim,
}: WarrantyDetailProps) {
  const skuTrees = useSkuCategoryPaths([record?.sku])
  if (!record) return null
  const itemPath = record.sku ? skuTrees.get(record.sku) : undefined

  return (
    <Dialog open={!!record} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-mono text-lg tracking-tight">{record.warranty_number}</DialogTitle>
                <p className="text-sm text-muted-foreground">Consumption Warranty</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">Consumption</Badge>
          </div>
        </DialogHeader>

        <Separator />

        {/* Body — single scroll region */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetaCard
              icon={<Package className="h-4 w-4 text-muted-foreground" />}
              label="Item"
              value={record.item_name}
              above={itemPath ? <p className="text-[10px] text-muted-foreground leading-tight break-words">{itemPath}</p> : null}
            />
            <MetaCard icon={<Hash className="h-4 w-4 text-muted-foreground" />} label="SKU" value={record.sku ?? '—'} />
            <MetaCard icon={<Layers className="h-4 w-4 text-muted-foreground" />} label="Qty" value={`${record.qty} unit${record.qty !== 1 ? 's' : ''}`} />
            <MetaCard icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} label="Warranty Left" value={`${record.remaining_qty} of ${record.qty}`} />
            <MetaCard icon={<Building2 className="h-4 w-4 text-muted-foreground" />} label="Division" value={divisionName} />
            <MetaCard icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Policy" value={record.policy_name_snapshot ?? '—'} />
            <MetaCard icon={<Tag className="h-4 w-4 text-muted-foreground" />} label="Coverage" value={coverageLabel(record.coverage_type_snapshot)} />
            <MetaCard icon={<Calendar className="h-4 w-4 text-muted-foreground" />} label="Start" value={formatDate(record.start_date)} />
            <MetaCard icon={<Calendar className="h-4 w-4 text-muted-foreground" />} label="End" value={formatDate(record.end_date)} />
            <MetaCard icon={<Globe className="h-4 w-4 text-muted-foreground" />} label="Origin" value={record.origin_name_snapshot ?? '—'} />
            <MetaCard icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />} label="Source" value="Consumption" />
            <MetaCard icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Created" value={formatDateTime(record.created_at)} />
          </div>
        </div>

        <Separator />

        {/* Footer — normal flow, never sticky */}
        <div className="px-6 py-3 flex items-center justify-end gap-2">
          {canFileClaim && (
            <Button
              variant="default"
              size="sm"
              className="min-h-11 md:min-h-0 gap-1.5"
              disabled={record.remaining_qty <= 0}
              onClick={onFileClaim}
            >
              <FilePlus2 className="h-4 w-4" />
              {record.remaining_qty > 0 ? 'File a claim' : 'Fully claimed'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function ConsumptionWarrantiesPage() {
  const [activeTab, setActiveTab] = useState('records')
  const [search, setSearch] = useState('')
  const [detailRecord, setDetailRecord] = useState<WarrantyRecordRow | null>(null)

  const [claimSearch, setClaimSearch] = useState('')
  const [claimStatusFilter, setClaimStatusFilter] = useState('')
  const [detailClaimId, setDetailClaimId] = useState<string | null>(null)
  const [fileClaimDialog, setFileClaimDialog] = useState<{ open: boolean; record: WarrantyRecordRow | null }>({
    open: false,
    record: null,
  })

  const canManageClaims = useHasPermission('consumption.warranty_claims.manage')

  const { data: records = [], isLoading, isFetching, error, refetch } =
    useWarrantyRecords({ search, source: 'consumption' }, { refreshOnFocus: true })
  const {
    data: claims = [],
    isLoading: claimsLoading,
    isFetching: claimsFetching,
    error: claimsError,
    refetch: refetchClaims,
  } = useWarrantyClaims(
    { search: claimSearch, status: claimStatusFilter || undefined, warrantyType: 'consumption' },
    { refreshOnFocus: true },
  )
  const { data: divisions = [] } = useDivisions()

  const divisionNameById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d.name] as const)),
    [divisions]
  )

  // Category breadcrumb above item names. Warranty records/claims carry only a
  // SKU (no brand_variant_id), so resolve SKU → category tree. One combined
  // pass covers both the records and claims tables + their mobile cards.
  const skuTrees = useSkuCategoryPaths([
    ...records.map((r) => r.sku),
    ...claims.map((c) => c.sku),
  ])

  const columns = useMemo<ColumnDef<WarrantyRecordRow>[]>(() => [
    {
      accessorKey: 'warranty_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Warranty #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-primary">{row.original.warranty_number}</span>
      ),
    },
    {
      accessorKey: 'item_name',
      header: 'Item',
      cell: ({ row }) => {
        const path = row.original.sku ? skuTrees.get(row.original.sku) : undefined
        return (
          <div className="min-w-0">
            {path ? <div className="text-[10px] text-muted-foreground leading-tight break-words max-w-[220px]">{path}</div> : null}
            <span className="text-sm font-medium truncate max-w-[220px] block">{row.original.item_name}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.sku ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'qty',
      header: () => <span className="text-right w-full block">Qty</span>,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">{row.original.qty}</span>
      ),
    },
    {
      id: 'remaining',
      header: () => <span className="text-right w-full block">Left</span>,
      cell: ({ row }) => (
        <span className={cn(
          'text-xs tabular-nums block text-right font-medium',
          row.original.remaining_qty > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
        )}>
          {row.original.remaining_qty}/{row.original.qty}
        </span>
      ),
    },
    {
      id: 'division',
      header: 'Division',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[160px] block">
          {lookupName(divisionNameById, row.original.division_id, 'Unknown division')}
        </span>
      ),
    },
    {
      accessorKey: 'coverage_type_snapshot',
      header: 'Coverage',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{coverageLabel(row.original.coverage_type_snapshot)}</span>
      ),
    },
    {
      accessorKey: 'start_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start" />,
      cell: ({ row }) => <span className="text-xs tabular-nums">{formatDate(row.original.start_date)}</span>,
    },
    {
      accessorKey: 'end_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="End" />,
      cell: ({ row }) => <span className="text-xs tabular-nums">{formatDate(row.original.end_date)}</span>,
    },
    {
      accessorKey: 'origin_name_snapshot',
      header: 'Origin',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.origin_name_snapshot ?? '—'}</span>
      ),
    },
  ], [divisionNameById, skuTrees])

  const claimColumns = useMemo<ColumnDef<WarrantyClaimRow>[]>(() => [
    {
      accessorKey: 'claim_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Claim #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-primary">{row.original.claim_number}</span>
      ),
    },
    {
      accessorKey: 'warranty_number',
      header: 'Warranty #',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.warranty_number}</span>
      ),
    },
    {
      accessorKey: 'item_name',
      header: 'Item',
      cell: ({ row }) => {
        const path = row.original.sku ? skuTrees.get(row.original.sku) : undefined
        return (
          <div className="min-w-0">
            {path ? <div className="text-[10px] text-muted-foreground leading-tight break-words max-w-[200px]">{path}</div> : null}
            <span className="text-sm font-medium truncate max-w-[200px] block">{row.original.item_name}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'claim_qty',
      header: () => <span className="text-right w-full block">Qty</span>,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">{row.original.claim_qty}</span>
      ),
    },
    {
      accessorKey: 'division_name',
      header: 'Division',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[160px] block">{row.original.division_name}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = CLAIM_STATUS_CONFIG[row.original.status]
        return <Badge className={cn('border text-xs', cfg.badgeClassName)}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'decision',
      header: 'Decision',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{decisionLabel(row.original.decision)}</span>
      ),
    },
    {
      accessorKey: 'resolution_type',
      header: 'Resolution',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{resolutionTypeLabel(row.original.resolution_type)}</span>
      ),
    },
    {
      accessorKey: 'reported_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reported" />,
      cell: ({ row }) => <span className="text-xs tabular-nums">{formatDate(row.original.reported_at)}</span>,
    },
  ], [skuTrees])

  return (
    <PageWrapper>
      <PageHeader
        title="Consumption Warranties"
        description="Warranties issued automatically when items are consumed into a team or project custody"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="h-10 min-h-11 md:min-h-0 w-fit max-w-full overflow-x-auto whitespace-nowrap bg-muted p-1 gap-1">
          <TabsTrigger
            value="records"
            className="gap-2 px-4 py-1.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            Records
            <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1.5 text-[10px] font-semibold text-gray-900 tabular-nums">
              {records.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="claims"
            className="gap-2 px-4 py-1.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
          >
            Claims
            <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1.5 text-[10px] font-semibold text-gray-900 tabular-nums">
              {claims.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ── Records tab ── */}
        <TabsContent value="records" className="space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search warranty #, item or SKU…" />

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center min-h-[200px]">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-destructive">Couldn&apos;t load warranty records</p>
              <p className="text-xs text-muted-foreground max-w-sm">{humanizeDbError(error, 'load warranty records')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 md:min-h-0"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} />
                {isFetching ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={records}
              isLoading={isLoading}
              onRowClick={(r) => setDetailRecord(r)}
              emptyState={{
                icon: <ShieldCheck className="h-6 w-6 text-muted-foreground" />,
                title: search ? 'No warranty records match your search' : 'No consumption warranties yet',
                description: search
                  ? 'Try a different warranty #, item name or SKU.'
                  : 'A warranty is created automatically when a policy-bearing item is consumed into a team or project custody.',
              }}
              mobileCardRender={(r: WarrantyRecordRow) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold truncate">{r.warranty_number}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Consumption</Badge>
                  </div>
                  {(() => {
                    const path = r.sku ? skuTrees.get(r.sku) : undefined
                    return path ? <p className="text-[10px] text-muted-foreground leading-tight break-words">{path}</p> : null
                  })()}
                  <p className="text-sm font-medium truncate">{r.item_name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {r.sku && <span className="font-mono">{r.sku}</span>}
                    <span className={cn(
                      'ml-auto tabular-nums font-medium',
                      r.remaining_qty > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                    )}>
                      {r.remaining_qty}/{r.qty} left
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{lookupName(divisionNameById, r.division_id, 'Unknown division')}</span>
                    <span className="tabular-nums shrink-0">{formatDate(r.start_date)} – {formatDate(r.end_date)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </TabsContent>

        {/* ── Claims tab ── */}
        <TabsContent value="claims" className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-1">
              <SearchInput value={claimSearch} onChange={setClaimSearch} placeholder="Search claim #, issue…" />
              <Select
                value={claimStatusFilter || 'all'}
                onValueChange={(v) => setClaimStatusFilter(!v || v === 'all' ? '' : v)}
              >
                <SelectTrigger className="h-9 min-h-11 md:min-h-0 w-full sm:w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canManageClaims && (
              <Button
                size="sm"
                className="min-h-11 md:min-h-0 gap-1.5 shrink-0"
                onClick={() => setFileClaimDialog({ open: true, record: null })}
              >
                <FilePlus2 className="h-4 w-4" />
                File a claim
              </Button>
            )}
          </div>

          {claimsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center min-h-[200px]">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-destructive">Couldn&apos;t load warranty claims</p>
              <p className="text-xs text-muted-foreground max-w-sm">{humanizeDbError(claimsError, 'load warranty claims')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 md:min-h-0"
                disabled={claimsFetching}
                onClick={() => refetchClaims()}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', claimsFetching && 'animate-spin')} />
                {claimsFetching ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          ) : (
            <DataTable
              columns={claimColumns}
              data={claims}
              isLoading={claimsLoading}
              onRowClick={(c) => setDetailClaimId(c.id)}
              emptyState={{
                icon: <Wrench className="h-6 w-6 text-muted-foreground" />,
                title: claimSearch || claimStatusFilter ? 'No warranty claims match your filters' : 'No warranty claims found',
                description: claimSearch || claimStatusFilter
                  ? 'Try a different claim #, issue keyword or status.'
                  : 'File a claim from a warranty record to start the coverage review.',
              }}
              mobileCardRender={(c: WarrantyClaimRow) => {
                const cfg = CLAIM_STATUS_CONFIG[c.status]
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold truncate">{c.claim_number}</span>
                      <Badge className={cn('border text-[10px] px-1.5 py-0 shrink-0', cfg.badgeClassName)}>
                        {cfg.label}
                      </Badge>
                    </div>
                    {(() => {
                      const path = c.sku ? skuTrees.get(c.sku) : undefined
                      return path ? <p className="text-[10px] text-muted-foreground leading-tight break-words">{path}</p> : null
                    })()}
                    <p className="text-sm font-medium truncate">{c.item_name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{c.warranty_number}</span>
                      <span className="tabular-nums shrink-0">· {c.claim_qty} unit{c.claim_qty !== 1 ? 's' : ''}</span>
                      <span className="ml-auto truncate">{c.division_name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{resolutionTypeLabel(c.resolution_type)}</span>
                      <span className="tabular-nums shrink-0">{formatDate(c.reported_at)}</span>
                    </div>
                  </div>
                )
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      <WarrantyRecordDetailDialog
        record={detailRecord}
        divisionName={lookupName(divisionNameById, detailRecord?.division_id, 'Unknown division')}
        onClose={() => setDetailRecord(null)}
        canFileClaim={canManageClaims}
        onFileClaim={() => {
          const record = detailRecord
          setDetailRecord(null)
          setFileClaimDialog({ open: true, record })
        }}
      />

      <FileWarrantyClaimDialog
        open={fileClaimDialog.open}
        record={fileClaimDialog.record}
        source="consumption"
        onOpenChange={(open) => setFileClaimDialog((prev) => ({ ...prev, open }))}
        onFiled={(claimId) => {
          setFileClaimDialog({ open: false, record: null })
          setActiveTab('claims')
          setDetailClaimId(claimId)
        }}
      />

      <WarrantyClaimDetailDialog
        claimId={detailClaimId}
        onClose={() => setDetailClaimId(null)}
      />
    </PageWrapper>
  )
}
